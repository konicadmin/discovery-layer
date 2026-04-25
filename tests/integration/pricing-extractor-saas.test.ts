import { describe, it, expect } from "vitest";
import { DeterministicPricingExtractor }
  from "@/server/services/ingestion/pricing-extractor";

describe("SaaS per-seat/month extractor", () => {
  const extractor = new DeterministicPricingExtractor();

  it("extracts '$20 per user per month' as per_seat_per_month", async () => {
    const result = await extractor.extract({
      url: "https://cursor.com/pricing",
      text: "Pro — $20 per user per month. Unlimited completions.",
    });
    const seat = result.find((r) => r.unit === "per_seat_per_month");
    expect(seat).toBeDefined();
    expect(seat!.priceValue).toBe(20);
    expect(seat!.currency).toBe("USD");
  });

  it("extracts '$8/user/month' abbreviated form", async () => {
    const result = await extractor.extract({
      url: "https://linear.app/pricing",
      text: "Linear Standard: $8/user/month billed annually.",
    });
    const seat = result.find((r) => r.unit === "per_seat_per_month");
    expect(seat).toBeDefined();
    expect(seat!.priceValue).toBe(8);
  });

  it("extracts euro per seat", async () => {
    const result = await extractor.extract({
      url: "https://example.eu/pricing",
      text: "Team plan: €12 per seat / month",
    });
    const seat = result.find((r) => r.unit === "per_seat_per_month");
    expect(seat).toBeDefined();
    expect(seat!.priceValue).toBe(12);
    expect(seat!.currency).toBe("EUR");
  });

  it("does not extract when text says 'Contact sales'", async () => {
    const result = await extractor.extract({
      url: "https://example.com/enterprise",
      text: "Enterprise: Contact sales for custom pricing per seat per month.",
    });
    expect(result.find((r) => r.unit === "per_seat_per_month")).toBeUndefined();
  });

  it("does not suppress later-tier prices after an earlier 'Contact sales' line", async () => {
    const result = await extractor.extract({
      url: "https://example.com/pricing",
      text:
        "Enterprise: Contact sales for custom pricing. " +
        "Starter: $10 per user per month. " +
        "Team: $20 per user per month.",
    });
    const seats = result.filter((r) => r.unit === "per_seat_per_month");
    const amounts = seats.map((s) => s.priceValue).sort((a, b) => a - b);
    expect(amounts).toEqual([10, 20]);
  });
});

describe("AI token pricing extractor", () => {
  const extractor = new DeterministicPricingExtractor();

  it("extracts '$3.00 per million input tokens' as per_1m_input_tokens", async () => {
    const result = await extractor.extract({
      url: "https://docs.anthropic.com/pricing",
      text: "Claude Sonnet 4.6: $3.00 per million input tokens, $15.00 per million output tokens.",
    });
    const inTok = result.find((r) => r.unit === "per_1m_input_tokens");
    const outTok = result.find((r) => r.unit === "per_1m_output_tokens");
    expect(inTok?.priceValue).toBe(3.0);
    expect(outTok?.priceValue).toBe(15.0);
  });

  it("extracts '$0.002 / 1K tokens' as per_1k_tokens", async () => {
    const result = await extractor.extract({
      url: "https://openai.com/api/pricing/",
      text: "gpt-4o-mini: $0.002 / 1K tokens input, $0.008 / 1K tokens output.",
    });
    const inTok = result.find((r) => r.unit === "per_1k_tokens");
    expect(inTok).toBeDefined();
    expect(inTok!.priceValue).toBe(0.002);
  });
});

describe("metered API pricing extractor", () => {
  const extractor = new DeterministicPricingExtractor();

  it("extracts '$0.0042 per API call'", async () => {
    const result = await extractor.extract({
      url: "https://example.com",
      text: "Vision API billed at $0.0042 per API call.",
    });
    const api = result.find((r) => r.unit === "per_api_call");
    expect(api?.priceValue).toBeCloseTo(0.0042);
  });

  it("extracts '$0.005 per request'", async () => {
    const result = await extractor.extract({
      url: "https://example.com",
      text: "Pricing: $0.005 per request, no minimum.",
    });
    const req = result.find((r) => r.unit === "per_request");
    expect(req?.priceValue).toBeCloseTo(0.005);
  });

  it("extracts '$0.40 per 1K requests'", async () => {
    const result = await extractor.extract({
      url: "https://example.com",
      text: "Standard tier: $0.40 per 1K requests.",
    });
    const bulk = result.find((r) => r.unit === "per_1k_requests");
    expect(bulk?.priceValue).toBeCloseTo(0.4);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", "pricing-pages", name), "utf8");

describe("real-page fixtures", () => {
  const extractor = new DeterministicPricingExtractor();

  it("cursor.txt yields at least one per_seat_per_month signal", async () => {
    const r = await extractor.extract({ url: "x", text: fixture("cursor.txt") });
    expect(r.some((s) => s.unit === "per_seat_per_month")).toBe(true);
  });

  it("openai.txt yields token signals in both directions", async () => {
    const r = await extractor.extract({ url: "x", text: fixture("openai.txt") });
    expect(r.some((s) => s.unit === "per_1m_input_tokens")).toBe(true);
    expect(r.some((s) => s.unit === "per_1m_output_tokens")).toBe(true);
  });

  it("notion.txt yields at least two seat-month signals", async () => {
    const r = await extractor.extract({ url: "x", text: fixture("notion.txt") });
    const seats = r.filter((s) => s.unit === "per_seat_per_month");
    expect(seats.length).toBeGreaterThanOrEqual(2);
  });
});
