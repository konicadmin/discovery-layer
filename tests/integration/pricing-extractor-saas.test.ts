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
});
