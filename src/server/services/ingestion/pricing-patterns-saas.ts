import { PricingSignalType, PricingUnit } from "@/generated/prisma";
import { detectCurrency, parseLocalizedNumber } from "@/lib/region";
import type { PricingCandidate } from "./pricing-extractor";

/**
 * SaaS per-seat / per-month pattern family.
 *
 * Matches shapes like:
 *   - "$20 per user per month"
 *   - "$8/user/month"
 *   - "€12 per seat / month"
 *   - "£10 per member per mo"
 * and refuses to infer a rate from "Contact sales ... per seat per month" copy.
 *
 * Region-agnostic: the returned candidate has `region: null`; downstream
 * consumers bucket it by vendor / product context.
 */
const SEAT_MONTH_RE = new RegExp(
  [
    "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)",
    "\\s*(?:/|per)\\s*(?:user|seat|person|member|team\\s*member)",
    "\\s*(?:/|per)?\\s*(?:month|mo|monthly)",
  ].join(""),
  "gi",
);

// Look back ~80 chars before a match to catch tier-local "contact sales"
// suppression without leaking across later tiers on the same page. Truncate
// the window at the most recent sentence/line boundary so earlier tiers
// ("Enterprise: Contact sales. Starter: $10/user/mo") don't poison later ones.
const CONTACT_SALES_WINDOW_RE = /contact\s+(?:sales|us)/i;
const CONTACT_SALES_WINDOW = 80;
const TIER_BOUNDARY_RE = /[.!?\n\r]|(?:\s[-•·|]\s)/g;

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
};

/**
 * AI token pricing patterns (per-1M and per-1K tokens).
 *
 * Matches shapes like:
 *   - "$3.00 per million input tokens"
 *   - "$15 / 1M output tokens"
 *   - "$0.002 / 1K tokens"
 *   - "€2.50 per 1M tokens"
 *
 * The optional trailing `dir` group looks for "input"/"prompt"/"output"/
 * "completion" within ~40 chars AFTER the price+unit phrase, to classify
 * the signal. When the direction is ambiguous we assume input (the
 * convention for a single headline price on AI vendor pages).
 */
// The direction ("input" | "output" | "prompt" | "completion") may appear
// either BEFORE `tokens` ("per million input tokens") or AFTER it
// ("/ 1K tokens input"); both idioms are common on AI vendor pages. The
// `dirPre` and `dirPost` groups capture each form independently so the
// `g`-flag iterator doesn't swallow a neighboring price into one match.
const TOKENS_1M_RE = new RegExp(
  [
    "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)",
    "\\s*(?:/|per)\\s*(?:1\\s*m|1\\s*million|million|M)",
    "\\s*(?<dirPre>input|prompt|output|completion)?",
    "\\s*(?:tokens?|tok)",
    "(?<dirPost>[^\\n]{0,20}?(?:input|prompt|output|completion))?",
  ].join(""),
  "gi",
);

const TOKENS_1K_RE = new RegExp(
  [
    "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)",
    "\\s*(?:/|per)\\s*(?:1\\s*k|1\\s*thousand|thousand|K)",
    "\\s*(?<dirPre>input|prompt|output|completion)?",
    "\\s*(?:tokens?|tok)",
    "(?<dirPost>[^\\n]{0,20}?(?:input|prompt|output|completion))?",
  ].join(""),
  "gi",
);

function dirToUnit(dir: string | undefined, perK: boolean): PricingUnit {
  if (perK) return PricingUnit.per_1k_tokens;
  if (!dir) return PricingUnit.per_1m_input_tokens; // ambiguous → assume input
  const s = dir.toLowerCase();
  if (s.includes("output") || s.includes("completion")) {
    return PricingUnit.per_1m_output_tokens;
  }
  return PricingUnit.per_1m_input_tokens;
}

export function extractTokenPricing(text: string): PricingCandidate[] {
  const out: PricingCandidate[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(TOKENS_1M_RE)) {
    const symbol = m.groups?.symbol ?? "";
    const amount = parseLocalizedNumber(m.groups?.amount ?? "", "dot");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = CURRENCY_BY_SYMBOL[symbol] ?? "USD";
    const dir = m.groups?.dirPre ?? m.groups?.dirPost;
    const unit = dirToUnit(dir, false);
    const key = `${unit}:${currency}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      signalType: PricingSignalType.starting_price,
      priceValue: amount,
      currency,
      region: null,
      unit,
      extractedText: m[0],
      confidence: 0.85,
    });
  }
  for (const m of text.matchAll(TOKENS_1K_RE)) {
    const symbol = m.groups?.symbol ?? "";
    const amount = parseLocalizedNumber(m.groups?.amount ?? "", "dot");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = CURRENCY_BY_SYMBOL[symbol] ?? "USD";
    const dir = m.groups?.dirPre ?? m.groups?.dirPost;
    const unit = dirToUnit(dir, true);
    const key = `${unit}:${currency}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      signalType: PricingSignalType.starting_price,
      priceValue: amount,
      currency,
      region: null,
      unit,
      extractedText: m[0],
      confidence: 0.85,
    });
  }
  return out;
}

export function extractSaasSeatMonth(text: string): PricingCandidate[] {
  const out: PricingCandidate[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(SEAT_MONTH_RE)) {
    const matchIndex = m.index ?? 0;
    // Tier-local suppression: if a "contact sales"/"contact us" phrase appears
    // in the ~80 chars immediately preceding this match, treat it as belonging
    // to the same tier and skip. This avoids the old lookbehind's document-wide
    // leak across multi-tier pricing pages. We also clip the window at the
    // nearest sentence/tier boundary (., !, ?, newline, bullet) so an earlier
    // tier's "Contact sales" can't poison a later tier's real price.
    const windowStart = Math.max(0, matchIndex - CONTACT_SALES_WINDOW);
    const rawWindow = text.slice(windowStart, matchIndex);
    let lastBoundary = -1;
    for (const b of rawWindow.matchAll(TIER_BOUNDARY_RE)) {
      const bEnd = (b.index ?? 0) + b[0].length;
      if (bEnd > lastBoundary) lastBoundary = bEnd;
    }
    const precedingWindow =
      lastBoundary >= 0 ? rawWindow.slice(lastBoundary) : rawWindow;
    if (CONTACT_SALES_WINDOW_RE.test(precedingWindow)) continue;

    const symbol = m.groups?.symbol ?? "";
    const rawAmount = m.groups?.amount ?? "";
    // SaaS seat pricing on English-language pages is conventionally dot-decimal;
    // the patterns here target `$`, `€`, `£`, `₹` in that idiom.
    const amount = parseLocalizedNumber(rawAmount, "dot");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency =
      CURRENCY_BY_SYMBOL[symbol] ?? detectCurrency(text)?.currency ?? "USD";
    const key = `${currency}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      signalType: PricingSignalType.starting_price,
      priceValue: amount,
      currency,
      region: null,
      unit: PricingUnit.per_seat_per_month,
      extractedText: m[0],
      confidence: 0.9,
    });
  }
  return out;
}
