import { ValidationError } from "@/lib/errors";
import type { Fetcher } from "./crawl";

export type HttpFetcherOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_USER_AGENT =
  "DiscoveryLayerBot/1.0 (+https://example.com; public pricing discovery)";

const TEXT_CONTENT_TYPES = [
  "text/",
  "application/json",
  "application/xhtml+xml",
  "application/xml",
  "application/rss+xml",
  "application/ld+json",
];

export class HttpFetcher implements Fetcher {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly userAgent: string;

  constructor(options: HttpFetcherOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  async fetch(url: string): Promise<{ httpStatus: number; text: string }> {
    const parsed = parseHttpUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await globalThis.fetch(parsed.toString(), {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "user-agent": this.userAgent,
        },
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`fetch timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !TEXT_CONTENT_TYPES.some((prefix) => contentType.includes(prefix))) {
      throw new ValidationError(`unsupported content type: ${contentType}`);
    }

    return {
      httpStatus: response.status,
      text: await readLimitedText(response, this.maxBytes),
    };
  }
}

function parseHttpUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError("invalid url");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ValidationError("only http(s) URLs are supported");
  }
  return parsed;
}

async function readLimitedText(response: Response, maxBytes: number) {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ValidationError(`response exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
