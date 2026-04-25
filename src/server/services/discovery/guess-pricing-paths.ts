import { detectCurrency } from "@/lib/region";
import type { Fetcher } from "@/server/services/ingestion/crawl";

const COMMON_PATHS = [
  "/pricing",
  "/pricing/",
  "/plans",
  "/plans/",
  "/pricing/enterprise",
  "/pricing/business",
  "/billing",
  "/signup",
  "/api/pricing",
  "/api",
  "/cost",
  "/buy",
];

const PRICING_HINT_TERMS = [
  "per month",
  "per user",
  "per seat",
  "monthly",
  "billed annually",
  "free trial",
  "starts at",
  "starting at",
  "pricing",
  "plan",
];

export type PricingGuessCandidate = {
  url: string;
  status: "ok" | "missing" | "error";
  httpStatus?: number;
  bytes?: number;
  hasCurrency: boolean;
  hintTermCount: number;
  confidence: number;
  errorMessage?: string;
};

export type PricingGuessResult = {
  homepageUrl: string;
  best?: PricingGuessCandidate;
  candidates: PricingGuessCandidate[];
};

function originOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function scoreCandidate(input: {
  hasCurrency: boolean;
  hintTermCount: number;
  pathRank: number;
}): number {
  // 0..1 — currency presence is the strongest signal, hint terms add weight,
  // path rank breaks ties (earlier paths slightly preferred).
  let score = 0;
  if (input.hasCurrency) score += 0.6;
  score += Math.min(input.hintTermCount, 5) * 0.06;
  score += Math.max(0, 0.1 - input.pathRank * 0.005);
  return Math.min(score, 0.99);
}

function countHintTerms(lower: string): number {
  let count = 0;
  for (const term of PRICING_HINT_TERMS) {
    if (lower.includes(term)) count += 1;
  }
  return count;
}

/**
 * Try a list of common pricing paths against the vendor's homepage origin.
 * Returns ranked candidates with a confidence score per URL. The system caller
 * decides whether to auto-approve the top candidate or hand to a human.
 */
export async function guessPricingPaths(
  fetcher: Fetcher,
  homepageUrl: string,
  options: { paths?: string[] } = {},
): Promise<PricingGuessResult> {
  const origin = originOf(homepageUrl);
  const paths = options.paths ?? COMMON_PATHS;

  const candidates: PricingGuessCandidate[] = [];

  for (const [index, path] of paths.entries()) {
    const candidateUrl = origin + path;
    try {
      const result = await fetcher.fetch(candidateUrl);
      if (result.httpStatus >= 400) {
        candidates.push({
          url: candidateUrl,
          status: "missing",
          httpStatus: result.httpStatus,
          hasCurrency: false,
          hintTermCount: 0,
          confidence: 0,
        });
        continue;
      }
      const text = result.text;
      const lower = text.toLowerCase();
      const hasCurrency = Boolean(detectCurrency(text));
      const hintTermCount = countHintTerms(lower);
      candidates.push({
        url: candidateUrl,
        status: "ok",
        httpStatus: result.httpStatus,
        bytes: text.length,
        hasCurrency,
        hintTermCount,
        confidence: scoreCandidate({ hasCurrency, hintTermCount, pathRank: index }),
      });
    } catch (err) {
      candidates.push({
        url: candidateUrl,
        status: "error",
        hasCurrency: false,
        hintTermCount: 0,
        confidence: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ranked = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0]?.confidence && ranked[0].confidence > 0 ? ranked[0] : undefined;

  return {
    homepageUrl,
    best,
    candidates,
  };
}
