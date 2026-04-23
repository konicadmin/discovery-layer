/**
 * AiProvider is the contract the rest of the codebase depends on.
 *
 * V1 ships a deterministic "grounded-template" provider (see
 * `./deterministic-provider.ts`) so no external API keys are required.
 * Swap it in production with an Anthropic-backed implementation that
 * uses prompt caching, structured outputs, and tool use.
 *
 * Principles (matches Phase 4 plan):
 *   - the model never invents entities not present in grounding
 *   - outputs are schema-validated before writeback
 *   - confidence and unresolved fields must be surfaced
 */

export type Citation = {
  sourceType:
    | "requirement"
    | "vendor_profile"
    | "compliance_record"
    | "quote"
    | "quote_line_item"
    | "shortlist_snapshot";
  sourceId: string;
  fieldPath?: string;
  excerptText?: string;
};

export interface ExtractionResult<T> {
  data: Partial<T>;
  missingFields: string[];
  ambiguousFields: string[];
  confidenceByField: Record<string, number>;
  normalizedSummary: string;
}

export interface ExplanationResult {
  summary: string;
  bullets: string[];
  watchouts: string[];
  citations: Citation[];
}

export interface AiProvider {
  readonly modelName: string;

  /**
   * Extract a free-text brief into a typed shape. The allowed values are a
   * JSON-schema-ish object describing which enum values are permitted for
   * each field.
   */
  extractRequirement(
    input: {
      rawText: string;
      categoryCode: string;
      knownCities: Array<{ id: string; name: string }>;
    },
  ): Promise<ExtractionResult<RequirementExtraction>>;

  /**
   * Explain why a shortlist contains what it does. Given the requirement
   * and deterministic shortlist rows, produce a summary and per-row bullets.
   */
  explainShortlist(input: {
    requirement: { title: string; cityName: string; headcount?: number; shiftPattern?: string };
    rows: Array<{
      vendorProfileId: string;
      vendorName: string;
      score: number;
      reasons: Array<{ component: string; score: number; weight: number; detail: string }>;
    }>;
  }): Promise<ExplanationResult>;

  /**
   * Explain a normalized compare view for an RFQ. Must only reference the
   * supplied rows; hallucination is forbidden.
   */
  explainCompare(input: {
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
  }): Promise<ExplanationResult>;
}

export type RequirementExtraction = {
  title: string;
  cityId: string | null;
  siteType: string | null;
  headcountRequired: number | null;
  shiftPattern: "8h" | "12h" | "24x7" | null;
  reliefRequired: boolean | null;
  contractTermMonths: number | null;
  startDate: string | null; // ISO date, caller parses
};
