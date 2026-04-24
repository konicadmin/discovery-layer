import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpFetcher } from "./http-fetcher";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("HttpFetcher", () => {
  it("fetches real text through global fetch", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("<html>Rates start at ₹25,000 per guard per month.</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const out = await new HttpFetcher().fetch("https://vendor.example/pricing");

    expect(out.httpStatus).toBe(200);
    expect(out.text).toContain("₹25,000");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://vendor.example/pricing",
      expect.objectContaining({
        redirect: "follow",
        headers: expect.objectContaining({
          accept: expect.stringContaining("text/html"),
          "user-agent": expect.stringContaining("DiscoveryLayerBot"),
        }),
      }),
    );
  });

  it("rejects non-http URLs before fetching", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(new HttpFetcher().fetch("file:///etc/passwd")).rejects.toThrow(
      /only http\(s\)/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-text responses", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as typeof fetch;

    await expect(new HttpFetcher().fetch("https://vendor.example/logo.png")).rejects.toThrow(
      /unsupported content type/,
    );
  });

  it("enforces a response size limit", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("0123456789", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }) as typeof fetch;

    await expect(
      new HttpFetcher({ maxBytes: 5 }).fetch("https://vendor.example/pricing"),
    ).rejects.toThrow(/exceeded 5 bytes/);
  });
});
