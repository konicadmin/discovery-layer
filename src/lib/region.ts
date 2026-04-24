import { Region } from "@/generated/prisma";

/** Default ISO-4217 currency per region. Individual records may override. */
export const REGION_DEFAULT_CURRENCY: Record<Region, string> = {
  [Region.IN]: "INR",
  [Region.US]: "USD",
  [Region.EU]: "EUR",
};

/** Region → ISO 3166-1 alpha-2 country codes known to belong to the region. */
export const REGION_COUNTRIES: Record<Region, string[]> = {
  [Region.IN]: ["IN"],
  [Region.US]: ["US"],
  [Region.EU]: [
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
    "NL", "PL", "PT", "RO", "SE", "SI", "SK",
    // Non-EU but included in our single "EU" regulatory bucket for V1:
    "GB", "CH", "NO",
  ],
};

export function regionForCountry(country: string): Region | null {
  const up = country.toUpperCase();
  for (const [region, countries] of Object.entries(REGION_COUNTRIES) as Array<
    [Region, string[]]
  >) {
    if (countries.includes(up)) return region;
  }
  return null;
}

/**
 * Symbol → (currency, region).
 *
 * INR's "Rs" pattern uses a leading word boundary + digit lookahead so it
 * doesn't fire on words like "officers" / "servers" / "sparse". EUR defaults
 * to `dot` (B2B English convention on EU sites); German/French comma-decimal
 * handling is a future enhancement.
 */
export const CURRENCY_SYMBOLS: Array<{
  pattern: RegExp;
  currency: string;
  region: Region;
  decimalStyle: "dot" | "comma";
}> = [
  {
    pattern: /₹|\bRs\.?(?=\s*\d)|\bINR\b/i,
    currency: "INR",
    region: Region.IN,
    decimalStyle: "dot",
  },
  { pattern: /\$|\bUSD\b/i, currency: "USD", region: Region.US, decimalStyle: "dot" },
  { pattern: /€|\bEUR\b/i, currency: "EUR", region: Region.EU, decimalStyle: "dot" },
  { pattern: /£|\bGBP\b/i, currency: "GBP", region: Region.EU, decimalStyle: "dot" },
];

export function detectCurrency(
  text: string,
): { currency: string; region: Region; decimalStyle: "dot" | "comma" } | null {
  for (const s of CURRENCY_SYMBOLS) {
    if (s.pattern.test(text)) return s;
  }
  return null;
}

/**
 * Parse a locale-varying number string ("25,000", "25.000", "25 000").
 *
 * Rules:
 *   - "dot" style: thousands = comma, decimal = dot   → "25,000.50"
 *   - "comma" style: thousands = dot or space, decimal = comma → "25.000,50"
 * When ambiguous (only one separator), we infer by position: more than 3
 * digits after the last separator means it's likely the thousands
 * separator; otherwise it's the decimal separator.
 */
export function parseLocalizedNumber(raw: string, decimalStyle: "dot" | "comma"): number {
  const cleaned = raw.trim();
  if (decimalStyle === "dot") {
    // Thousand separators are commas, decimal is dot.
    return Number(cleaned.replace(/,/g, ""));
  }
  // Comma style: "25.000,50" or "25 000,50" or "25,00"
  // Strip dots and spaces as thousand separators, swap comma for dot.
  return Number(cleaned.replace(/[.\s]/g, "").replace(",", "."));
}
