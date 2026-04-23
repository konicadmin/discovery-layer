import { PricingSignalType, PricingUnit } from "@prisma/client";

export type PricingCandidate = {
  signalType: PricingSignalType;
  priceValue: number;
  currency: string;
  unit: PricingUnit;
  minQuantity?: number;
  minContractMonths?: number;
  extractedText: string;
  confidence: number;
};

export interface PricingExtractor {
  /** Extract zero or more pricing candidates from fetched page text. */
  extract(input: { url: string; text: string }): Promise<PricingCandidate[]>;
}

/**
 * Deterministic pricing extractor. Recognizes common INR rate patterns in
 * security-staffing vendor sites. No network. Safe for CI and seed data.
 *
 * Patterns recognized (in order of precedence):
 *   - "₹25,000 per guard per month"           → pgpm_rate
 *   - "Rs 25000 / guard / month"              → pgpm_rate
 *   - "starting at ₹X", "from ₹X"             → starting_price (low confidence)
 *   - "₹120/hr", "Rs. 120 per hour"           → hourly_rate
 *   - "₹2000 per day" / "₹2000 per shift"     → daily_rate / per_shift
 *   - "day shift ₹25000 / night shift ₹27000" → day_rate + night_rate
 *   - "supervisor ₹30000"                     → supervisor_rate
 *   - "₹20,000 - ₹25,000"                     → range_min + range_max
 *   - "minimum 10 guards"                     → attaches minQuantity
 *   - "12 month contract"                     → attaches minContractMonths
 *
 * We deliberately refuse to infer a rate from "contact us" or "competitive
 * pricing" — per the plan, missing pricing stays missing.
 */
export class DeterministicPricingExtractor implements PricingExtractor {
  async extract(input: { url: string; text: string }): Promise<PricingCandidate[]> {
    const raw = input.text;
    const normalized = raw.replace(/\s+/g, " ").trim();
    const lower = normalized.toLowerCase();

    if (/\b(contact us|call us|request (?:a )?quote|rates? on request)\b/.test(lower)) {
      // Explicit signal that the site does not publish rates — return nothing.
      return [];
    }

    const results: PricingCandidate[] = [];

    const minQty = readMinQuantity(lower);
    const minTerm = readMinContract(lower);

    // Pattern: day shift + night shift pair
    const dayNight = lower.match(
      /day\s*(?:shift|rate)\s*(?:is|:)?\s*(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)[^₹]{0,60}night\s*(?:shift|rate)\s*(?:is|:)?\s*(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/,
    );
    if (dayNight) {
      const dayText = dayNight[0];
      results.push({
        signalType: PricingSignalType.day_rate,
        priceValue: parseAmount(dayNight[1]!),
        currency: "INR",
        unit: inferPgpmUnit(lower, "day"),
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, dayText),
        confidence: 0.8,
      });
      results.push({
        signalType: PricingSignalType.night_rate,
        priceValue: parseAmount(dayNight[2]!),
        currency: "INR",
        unit: inferPgpmUnit(lower, "night"),
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, dayText),
        confidence: 0.8,
      });
    }

    // Pattern: per guard per month
    const pgpm = lower.matchAll(
      /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)(?:\s*\/\s*|\s+per\s+)guard(?:\s*\/\s*|\s+per\s+)month/g,
    );
    for (const m of pgpm) {
      results.push({
        signalType: PricingSignalType.pgpm_rate,
        priceValue: parseAmount(m[1]!),
        currency: "INR",
        unit: PricingUnit.per_guard_per_month,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, m[0]),
        confidence: 0.9,
      });
    }

    // Pattern: supervisor rate
    const sup = lower.match(
      /supervisor(?:'s)?\s*(?:rate|charges?|is)?\s*(?::|at)?\s*(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/,
    );
    if (sup) {
      results.push({
        signalType: PricingSignalType.supervisor_rate,
        priceValue: parseAmount(sup[1]!),
        currency: "INR",
        unit: PricingUnit.per_guard_per_month,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, sup[0]),
        confidence: 0.75,
      });
    }

    // Pattern: per hour
    const perHour = lower.matchAll(
      /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*hr|\/\s*hour|\s*per\s*hour)/g,
    );
    for (const m of perHour) {
      results.push({
        signalType: PricingSignalType.hourly_rate,
        priceValue: parseAmount(m[1]!),
        currency: "INR",
        unit: PricingUnit.per_hour,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, m[0]),
        confidence: 0.8,
      });
    }

    // Pattern: per day / per shift
    const perDay = lower.matchAll(
      /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*day|per\s*day|per\s*shift)/g,
    );
    for (const m of perDay) {
      const isShift = /shift/.test(m[0]);
      results.push({
        signalType: isShift ? PricingSignalType.other : PricingSignalType.daily_rate,
        priceValue: parseAmount(m[1]!),
        currency: "INR",
        unit: isShift ? PricingUnit.per_shift : PricingUnit.per_day,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, m[0]),
        confidence: 0.75,
      });
    }

    // Pattern: range "₹20,000 - ₹25,000"
    const range = lower.match(
      /(?:₹|rs\.?|inr)\s*([\d,]+)\s*(?:-|to)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/,
    );
    if (range) {
      results.push({
        signalType: PricingSignalType.range_min,
        priceValue: parseAmount(range[1]!),
        currency: "INR",
        unit: PricingUnit.unspecified,
        minQuantity: minQty,
        extractedText: firstSentenceAround(normalized, range[0]),
        confidence: 0.5,
      });
      results.push({
        signalType: PricingSignalType.range_max,
        priceValue: parseAmount(range[2]!),
        currency: "INR",
        unit: PricingUnit.unspecified,
        minQuantity: minQty,
        extractedText: firstSentenceAround(normalized, range[0]),
        confidence: 0.5,
      });
    }

    // Pattern: starting at / from
    if (results.length === 0) {
      const starting = lower.match(
        /(?:starting\s+(?:at|from)|from)\s*(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/,
      );
      if (starting) {
        results.push({
          signalType: PricingSignalType.starting_price,
          priceValue: parseAmount(starting[1]!),
          currency: "INR",
          unit: PricingUnit.unspecified,
          minQuantity: minQty,
          minContractMonths: minTerm,
          extractedText: firstSentenceAround(normalized, starting[0]),
          confidence: 0.45,
        });
      }
    }

    return dedupeByType(results);
  }
}

function parseAmount(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function readMinQuantity(lower: string): number | undefined {
  const m = lower.match(/minimum\s+(?:of\s+)?(\d+)\s+(?:guards?|personnel)/);
  if (m?.[1]) return Number(m[1]);
  const n = lower.match(/\bmin\.?\s+(\d+)\s+(?:guards?|personnel)/);
  return n?.[1] ? Number(n[1]) : undefined;
}

function readMinContract(lower: string): number | undefined {
  const m = lower.match(/(\d+)\s*(?:-|\s)?\s*month(?:s)?\s*(?:contract|term|commitment)/);
  if (m?.[1]) return Number(m[1]);
  const y = lower.match(/(\d+)\s*-?\s*year(?:s)?\s*(?:contract|term|commitment)/);
  return y?.[1] ? Number(y[1]) * 12 : undefined;
}

function inferPgpmUnit(lower: string, context: "day" | "night"): PricingUnit {
  if (new RegExp(`${context}.{0,40}(?:per guard per month|pgpm|/month|per month)`).test(lower)) {
    return PricingUnit.per_guard_per_month;
  }
  return PricingUnit.unspecified;
}

function firstSentenceAround(text: string, match: string): string {
  const idx = text.toLowerCase().indexOf(match.toLowerCase());
  if (idx < 0) return match;
  const start = Math.max(0, text.lastIndexOf(".", idx) + 1);
  const end = text.indexOf(".", idx + match.length);
  const excerpt = text.slice(start, end > 0 ? end : idx + match.length + 60).trim();
  return excerpt.slice(0, 300);
}

function dedupeByType(items: PricingCandidate[]): PricingCandidate[] {
  // Keep the highest-confidence item per (type, value) pair.
  const key = (c: PricingCandidate) => `${c.signalType}:${c.priceValue}:${c.unit}`;
  const map = new Map<string, PricingCandidate>();
  for (const item of items) {
    const k = key(item);
    const prev = map.get(k);
    if (!prev || prev.confidence < item.confidence) map.set(k, item);
  }
  return Array.from(map.values());
}
