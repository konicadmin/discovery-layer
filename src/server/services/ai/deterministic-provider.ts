import type {
  AiProvider,
  ExplanationResult,
  ExtractionResult,
  RequirementExtraction,
} from "./provider";

/**
 * A deterministic implementation of AiProvider using regex extraction and
 * grounded templating. No network calls. Useful for:
 *   - deterministic tests and CI
 *   - environments without API keys
 *   - a "safe fallback" when a real provider fails and we want the UI to
 *     keep rendering structured output without fabrication risk
 */
export class DeterministicAiProvider implements AiProvider {
  readonly modelName = "deterministic-v1";

  async extractRequirement(input: {
    rawText: string;
    categoryCode: string;
    knownCities: Array<{ id: string; name: string }>;
  }): Promise<ExtractionResult<RequirementExtraction>> {
    const text = input.rawText;
    const lower = text.toLowerCase();

    const extracted: Partial<RequirementExtraction> = {};
    const confidence: Record<string, number> = {};
    const missing: string[] = [];
    const ambiguous: string[] = [];

    // Headcount: first integer followed by "guard(s)" or "people".
    const hcMatch = lower.match(
      /(\d+)\s*(?:guards?|personnel|people|staff)/,
    );
    if (hcMatch?.[1]) {
      extracted.headcountRequired = Number(hcMatch[1]);
      confidence.headcountRequired = 0.9;
    } else {
      extracted.headcountRequired = null;
      missing.push("headcountRequired");
    }

    // Shift: 24x7 / 24/7 / day / night.
    if (/24\s*[x/]\s*7/.test(lower) || /round[-\s]the[-\s]clock/.test(lower)) {
      extracted.shiftPattern = "24x7";
      confidence.shiftPattern = 0.95;
    } else if (/\b12\s*(?:hr|hour)/.test(lower)) {
      extracted.shiftPattern = "12h";
      confidence.shiftPattern = 0.8;
    } else if (/\b8\s*(?:hr|hour)/.test(lower) || /\bday\s+shift\b/.test(lower)) {
      extracted.shiftPattern = "8h";
      confidence.shiftPattern = 0.7;
    } else {
      extracted.shiftPattern = null;
      missing.push("shiftPattern");
    }

    // Site type.
    const siteMatch = lower.match(/\b(office|warehouse|industrial|residential|retail)\b/);
    if (siteMatch?.[1]) {
      extracted.siteType = siteMatch[1];
      confidence.siteType = 0.85;
    } else {
      extracted.siteType = null;
      missing.push("siteType");
    }

    // City — match against knownCities.
    const cityHit = input.knownCities.find((c) =>
      lower.includes(c.name.toLowerCase()),
    );
    if (cityHit) {
      extracted.cityId = cityHit.id;
      confidence.cityId = 0.9;
    } else {
      extracted.cityId = null;
      missing.push("cityId");
    }

    // Relief.
    if (/relief|backup/.test(lower)) {
      extracted.reliefRequired = true;
      confidence.reliefRequired = 0.8;
    } else {
      extracted.reliefRequired = null;
      missing.push("reliefRequired");
    }

    // Contract term.
    const termMatch = lower.match(/(\d+)\s*(?:month|year)s?\s*(?:contract|term)?/);
    if (termMatch?.[1]) {
      const n = Number(termMatch[1]);
      extracted.contractTermMonths = lower.includes("year") ? n * 12 : n;
      confidence.contractTermMonths = 0.7;
    } else {
      extracted.contractTermMonths = null;
      missing.push("contractTermMonths");
    }

    // Start date.
    const startMatch = lower.match(/start(?:ing)?\s+(next\s+month|today|tomorrow)/);
    if (startMatch?.[1]) {
      const now = new Date();
      if (startMatch[1] === "next month") {
        now.setMonth(now.getMonth() + 1);
        now.setDate(1);
      } else if (startMatch[1] === "tomorrow") {
        now.setDate(now.getDate() + 1);
      }
      extracted.startDate = now.toISOString().slice(0, 10);
      confidence.startDate = 0.6;
    } else {
      extracted.startDate = null;
      missing.push("startDate");
    }

    // Title: first 8 words, or fallback.
    const title = text.split(/\s+/).slice(0, 8).join(" ").trim();
    extracted.title = title || `${input.categoryCode} sourcing`;
    confidence.title = 0.5;

    const summary = [
      `Sourcing for ${input.categoryCode}`,
      extracted.headcountRequired ? `${extracted.headcountRequired} guards` : null,
      extracted.shiftPattern ? `${extracted.shiftPattern} shift pattern` : null,
      extracted.siteType ? `${extracted.siteType}` : null,
      cityHit ? `in ${cityHit.name}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      data: extracted,
      missingFields: missing,
      ambiguousFields: ambiguous,
      confidenceByField: confidence,
      normalizedSummary: summary,
    };
  }

  async explainShortlist(input: {
    requirement: {
      title: string;
      cityName: string;
      headcount?: number;
      shiftPattern?: string;
    };
    rows: Array<{
      vendorProfileId: string;
      vendorName: string;
      score: number;
      reasons: Array<{ component: string; score: number; weight: number; detail: string }>;
    }>;
  }): Promise<ExplanationResult> {
    if (input.rows.length === 0) {
      return {
        summary:
          "No verified vendors matched the hard filters (category + city). Consider broadening the city or waiting for more onboarded suppliers.",
        bullets: [],
        watchouts: ["supply_gap"],
        citations: [],
      };
    }

    const bullets = input.rows.map((row) => {
      const top = [...row.reasons]
        .sort((a, b) => b.score * b.weight - a.score * a.weight)
        .slice(0, 3)
        .map((r) => r.detail)
        .join("; ");
      return `${row.vendorName} (score ${row.score.toFixed(3)}): ${top}`;
    });

    const watchouts: string[] = [];
    if (input.rows.length < 3) watchouts.push("thin_supply");
    const weakCompliance = input.rows.some((r) =>
      r.reasons.some((x) => x.component === "compliance" && x.score < 0.5),
    );
    if (weakCompliance) watchouts.push("partial_compliance_in_shortlist");

    return {
      summary: `${input.rows.length} vendors match ${input.requirement.title} in ${input.requirement.cityName}, ranked by the standard 6-component score.`,
      bullets,
      watchouts,
      citations: input.rows.map((r) => ({
        sourceType: "shortlist_snapshot" as const,
        sourceId: r.vendorProfileId,
      })),
    };
  }

  async explainCompare(input: {
    rfqCode: string;
    rows: Array<{
      vendorProfileId: string;
      vendorName: string;
      grandTotal: number | null;
      monthlySubtotal: number | null;
      statutoryCostTotal: number | null;
      serviceFeeTotal: number | null;
      flags: string[];
      assumptions: Record<string, unknown> | null;
    }>;
    missingResponses: string[];
  }): Promise<ExplanationResult> {
    if (input.rows.length === 0) {
      return {
        summary: `No submitted quotes yet for ${input.rfqCode}.`,
        bullets: [],
        watchouts:
          input.missingResponses.length > 0 ? ["awaiting_responses"] : [],
        citations: [],
      };
    }

    const sorted = [...input.rows].sort(
      (a, b) => (a.grandTotal ?? Infinity) - (b.grandTotal ?? Infinity),
    );
    const lowest = sorted[0]!;
    const highest = sorted[sorted.length - 1]!;
    const spread =
      lowest.grandTotal != null && highest.grandTotal != null
        ? highest.grandTotal - lowest.grandTotal
        : null;

    const bullets: string[] = [];
    if (spread != null && lowest.grandTotal) {
      const pct = Math.round((spread / lowest.grandTotal) * 100);
      bullets.push(
        `Grand-total spread: ₹${spread.toLocaleString("en-IN")} (${pct}% over the lowest).`,
      );
    }
    for (const row of sorted) {
      const parts: string[] = [];
      if (row.grandTotal != null) parts.push(`₹${row.grandTotal.toLocaleString("en-IN")}`);
      if (row.statutoryCostTotal != null)
        parts.push(`statutory ₹${row.statutoryCostTotal.toLocaleString("en-IN")}`);
      if (row.serviceFeeTotal != null)
        parts.push(`fee ₹${row.serviceFeeTotal.toLocaleString("en-IN")}`);
      if (row.flags.length > 0) parts.push(`flags: ${row.flags.join(", ")}`);
      bullets.push(`${row.vendorName}: ${parts.join(" · ")}`);
    }

    const watchouts: string[] = [];
    if (input.missingResponses.length > 0) watchouts.push("awaiting_responses");
    const anyMissingAssumptions = input.rows.some((r) =>
      r.flags.includes("assumptions_missing"),
    );
    if (anyMissingAssumptions) watchouts.push("assumptions_missing");
    const anyExpired = input.rows.some((r) => r.flags.includes("quote_expired"));
    if (anyExpired) watchouts.push("expired_quotes");

    return {
      summary: `Comparing ${input.rows.length} submitted quote(s) for ${input.rfqCode}.`,
      bullets,
      watchouts,
      citations: input.rows.map((r) => ({
        sourceType: "quote" as const,
        sourceId: r.vendorProfileId,
      })),
    };
  }
}
