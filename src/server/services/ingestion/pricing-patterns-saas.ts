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
    "(?<!contact\\s*(?:sales|us)[^$€£₹]*)",
    "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)",
    "\\s*(?:/|per)\\s*(?:user|seat|person|member|team\\s*member)",
    "\\s*(?:/|per)?\\s*(?:month|mo|monthly)",
  ].join(""),
  "gi",
);

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
};

export function extractSaasSeatMonth(text: string): PricingCandidate[] {
  const out: PricingCandidate[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(SEAT_MONTH_RE)) {
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
      signalType: PricingSignalType.package_monthly,
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
