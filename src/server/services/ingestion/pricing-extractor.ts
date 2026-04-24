import { PricingSignalType, PricingUnit, Region } from "@/generated/prisma";
import {
  CURRENCY_SYMBOLS,
  detectCurrency,
  parseLocalizedNumber,
} from "@/lib/region";
import { extractSaasSeatMonth, extractTokenPricing } from "./pricing-patterns-saas";

export type PricingCandidate = {
  signalType: PricingSignalType;
  priceValue: number;
  currency: string;
  region: Region | null;
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
 * Deterministic pricing extractor. Recognizes common public pricing patterns
 * across B2B vendor sites in India, USA, and Europe.
 *
 * Detection order:
 *   1. Identify dominant currency symbol in the document (₹/Rs/INR, $/USD,
 *      €/EUR, £/GBP). Page without any currency marker → no signals.
 *   2. Apply explicit unit patterns first (per-hour, per-day, per-user/month,
 *      package/month), then low-confidence fallback patterns.
 *
 * Refuses to infer a rate from "contact us" / "rates on request" copy.
 */
export class DeterministicPricingExtractor implements PricingExtractor {
  async extract(input: { url: string; text: string }): Promise<PricingCandidate[]> {
    const normalized = normalizePageText(input.text);
    const lower = normalized.toLowerCase();

    // SaaS per-seat / per-month pattern family runs independently of the
    // security-staffing currency gate: a page with only `$X/user/month` is
    // a valid SaaS pricing signal even when no other rate shape appears.
    const saasSignals = extractSaasSeatMonth(normalized);
    // AI token pricing ($/1M tokens, $/1K tokens) likewise runs independently
    // of the security-staffing currency gate so token-only pages still emit.
    const tokenSignals = extractTokenPricing(normalized);

    const detected = detectCurrency(normalized);
    if (!detected) return [...saasSignals, ...tokenSignals];
    const { currency, region, decimalStyle } = detected;

    const results: PricingCandidate[] = [];

    const minQty = readMinQuantity(lower);
    const minTerm = readMinContract(lower);

    const money = moneyPatternFor(currency, decimalStyle);

    // Day + night pair: "day shift ₹25,000 / night shift ₹27,500".
    const dayNight = lower.match(
      new RegExp(
        `day\\s*(?:shift|rate)\\s*(?:is|:)?\\s*${money.core}[^${money.markers}]{0,60}night\\s*(?:shift|rate)\\s*(?:is|:)?\\s*${money.core}`,
        "i",
      ),
    );
    if (dayNight) {
      results.push({
        signalType: PricingSignalType.day_rate,
        priceValue: parseLocalizedNumber(dayNight[1]!, decimalStyle),
        currency,
        region,
        unit: inferMonthly(lower, "day"),
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, dayNight[0]),
        confidence: 0.8,
      });
      results.push({
        signalType: PricingSignalType.night_rate,
        priceValue: parseLocalizedNumber(dayNight[2]!, decimalStyle),
        currency,
        region,
        unit: inferMonthly(lower, "night"),
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, dayNight[0]),
        confidence: 0.8,
      });
    }

    // Per-guard-per-month (India + sometimes EU).
    const pgpm = lower.matchAll(
      new RegExp(
        `${money.rawPrefix}\\s*${money.number}\\s*(?:\\/\\s*|\\s+per\\s+)guard\\s*(?:\\/\\s*|\\s+per\\s+)month`,
        "gi",
      ),
    );
    for (const m of pgpm) {
      results.push({
        signalType: PricingSignalType.pgpm_rate,
        priceValue: parseLocalizedNumber(m[1]!, decimalStyle),
        currency,
        region,
        unit: PricingUnit.per_guard_per_month,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, m[0]),
        confidence: 0.9,
      });
    }

    // Supervisor.
    const sup = lower.match(
      new RegExp(
        `supervisor(?:'s)?\\s*(?:rate|charges?|is)?\\s*(?::|at)?\\s*${money.core}`,
        "i",
      ),
    );
    if (sup) {
      results.push({
        signalType: PricingSignalType.supervisor_rate,
        priceValue: parseLocalizedNumber(sup[1]!, decimalStyle),
        currency,
        region,
        unit: PricingUnit.per_guard_per_month,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, sup[0]),
        confidence: 0.75,
      });
    }

    // Per-hour — common in USA / EU.
    const perHour = lower.matchAll(
      new RegExp(
        `${money.rawPrefix}\\s*${money.number}\\s*(?:\\/\\s*(?:hr|h|hour)|\\s*per\\s*(?:hour|hr))`,
        "gi",
      ),
    );
    for (const m of perHour) {
      results.push({
        signalType: PricingSignalType.hourly_rate,
        priceValue: parseLocalizedNumber(m[1]!, decimalStyle),
        currency,
        region,
        unit: PricingUnit.per_hour,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, m[0]),
        confidence: 0.85,
      });
    }

    // Per-day / per-shift.
    const perDay = lower.matchAll(
      new RegExp(
        `${money.rawPrefix}\\s*${money.number}\\s*(?:\\/\\s*day|per\\s*day|per\\s*shift)`,
        "gi",
      ),
    );
    for (const m of perDay) {
      const isShift = /shift/.test(m[0]);
      results.push({
        signalType: isShift ? PricingSignalType.other : PricingSignalType.daily_rate,
        priceValue: parseLocalizedNumber(m[1]!, decimalStyle),
        currency,
        region,
        unit: isShift ? PricingUnit.per_shift : PricingUnit.per_day,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, m[0]),
        confidence: 0.75,
      });
    }

    // Note: per-user/per-seat/per-month phrases are handled canonically by
    // `extractSaasSeatMonth` above (emits `per_seat_per_month`). The earlier
    // `perUserMonth` block here emitted a duplicate `package_monthly` signal
    // and was retired once `per_seat_per_month` became a first-class unit.

    const perMonth = lower.matchAll(
      new RegExp(
        `${money.rawPrefix}\\s*${money.number}\\s*(?:\\/\\s*(?:month|mo)|\\s+per\\s+(?:month|mo))`,
        "gi",
      ),
    );
    for (const m of perMonth) {
      results.push({
        signalType: PricingSignalType.package_monthly,
        priceValue: parseLocalizedNumber(m[1]!, decimalStyle),
        currency,
        region,
        unit: PricingUnit.package_monthly,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, m[0]),
        confidence: 0.8,
      });
    }

    const perYear = lower.matchAll(
      new RegExp(
        `${money.rawPrefix}\\s*${money.number}\\s*(?:\\/\\s*(?:year|yr)|\\s+per\\s+(?:year|yr)|\\s+annually)`,
        "gi",
      ),
    );
    for (const m of perYear) {
      results.push({
        signalType: PricingSignalType.other,
        priceValue: parseLocalizedNumber(m[1]!, decimalStyle),
        currency,
        region,
        unit: PricingUnit.unspecified,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, m[0]),
        confidence: 0.7,
      });
    }

    const genericUsage = lower.matchAll(
      new RegExp(
        `${money.rawPrefix}\\s*${money.number}\\s*(?:\\/\\s*|\\s+per\\s+)(?:\\d+\\s*)?(?:k|m|million|thousand)?\\s*(?:tokens?|calls?|requests?|messages?|emails?|characters?|events?|gb|gib|mb|minutes?|mins?|hosts?)`,
        "gi",
      ),
    );
    for (const m of genericUsage) {
      results.push({
        signalType: PricingSignalType.other,
        priceValue: parseLocalizedNumber(m[1]!, decimalStyle),
        currency,
        region,
        unit: PricingUnit.unspecified,
        minQuantity: minQty,
        minContractMonths: minTerm,
        extractedText: firstSentenceAround(normalized, m[0]),
        confidence: 0.72,
      });
    }

    // Range "$X - $Y" / "€X à €Y" / "₹X - ₹Y".
    const range = lower.match(
      new RegExp(
        `${money.rawPrefix}\\s*${money.number}\\s*(?:-|to|à)\\s*${money.rawPrefix}?\\s*${money.number}`,
        "i",
      ),
    );
    if (range) {
      results.push({
        signalType: PricingSignalType.range_min,
        priceValue: parseLocalizedNumber(range[1]!, decimalStyle),
        currency,
        region,
        unit: PricingUnit.unspecified,
        minQuantity: minQty,
        extractedText: firstSentenceAround(normalized, range[0]),
        confidence: 0.5,
      });
      results.push({
        signalType: PricingSignalType.range_max,
        priceValue: parseLocalizedNumber(range[2]!, decimalStyle),
        currency,
        region,
        unit: PricingUnit.unspecified,
        minQuantity: minQty,
        extractedText: firstSentenceAround(normalized, range[0]),
        confidence: 0.5,
      });
    }

    // Starting at / from (fallback, low confidence).
    if (results.length === 0) {
      const starting = lower.match(
        new RegExp(
          `(?:starting\\s+(?:at|from)|from)\\s*${money.core}`,
          "i",
        ),
      );
      if (starting) {
        results.push({
          signalType: PricingSignalType.starting_price,
          priceValue: parseLocalizedNumber(starting[1]!, decimalStyle),
          currency,
          region,
          unit: PricingUnit.unspecified,
          minQuantity: minQty,
          minContractMonths: minTerm,
          extractedText: firstSentenceAround(normalized, starting[0]),
          confidence: 0.45,
        });
      }
    }

    results.push(...saasSignals);
    results.push(...tokenSignals);
    return dedupeByType(results);
  }
}

type MoneyPattern = {
  /** Prefix regex fragment matching the currency symbol (unanchored). */
  rawPrefix: string;
  /** Capturing group matching a localized number. */
  number: string;
  /** Combined prefix + number, with the number in a capture group. */
  core: string;
  /** Characters that mark the start of a price. */
  markers: string;
};

function moneyPatternFor(currency: string, decimalStyle: "dot" | "comma"): MoneyPattern {
  const prefix = CURRENCY_SYMBOLS.find((s) => s.currency === currency)!.pattern.source;
  const number =
    decimalStyle === "dot"
      ? "([\\d,]+(?:\\.\\d+)?)"
      : "([\\d. ]+(?:,\\d+)?)";
  const rawPrefix = `(?:${prefix})`;
  const core = `${rawPrefix}\\s*${number}`;
  const markers = "₹$€£";
  return { rawPrefix, number, core, markers };
}

function readMinQuantity(lower: string): number | undefined {
  const m = lower.match(/minimum\s+(?:of\s+)?(\d+)\s+(?:guards?|personnel|officers?)/);
  if (m?.[1]) return Number(m[1]);
  const n = lower.match(/\bmin\.?\s+(\d+)\s+(?:guards?|personnel|officers?)/);
  return n?.[1] ? Number(n[1]) : undefined;
}

function readMinContract(lower: string): number | undefined {
  const m = lower.match(/(\d+)\s*(?:-|\s)?\s*month(?:s)?\s*(?:contract|term|commitment)/);
  if (m?.[1]) return Number(m[1]);
  const y = lower.match(/(\d+)\s*-?\s*year(?:s)?\s*(?:contract|term|commitment)/);
  return y?.[1] ? Number(y[1]) * 12 : undefined;
}

function inferMonthly(lower: string, context: "day" | "night"): PricingUnit {
  if (new RegExp(`${context}.{0,40}(?:per guard per month|pgpm|/month|per month)`).test(lower)) {
    return PricingUnit.per_guard_per_month;
  }
  return PricingUnit.unspecified;
}

function normalizePageText(raw: string): string {
  return raw
    .replace(/\\u0024/g, "$")
    .replace(/\\u20ac/gi, "€")
    .replace(/\\u00a3/gi, "£")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;/g, "$")
    .replace(/&dollar;/gi, "$")
    .replace(/&euro;/gi, "€")
    .replace(/&pound;/gi, "£")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const key = (c: PricingCandidate) => `${c.signalType}:${c.priceValue}:${c.unit}`;
  const map = new Map<string, PricingCandidate>();
  for (const item of items) {
    const k = key(item);
    const prev = map.get(k);
    if (!prev || prev.confidence < item.confidence) map.set(k, item);
  }
  return Array.from(map.values());
}
