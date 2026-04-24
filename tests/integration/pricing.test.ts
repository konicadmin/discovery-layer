import { describe, it, expect } from "vitest";
import {
  OrganizationType,
  PricingSignalStatus,
  PricingSignalType,
  PricingUnit,
  VendorSource,
} from "@/generated/prisma";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { DeterministicPricingExtractor } from "@/server/services/ingestion/pricing-extractor";
import {
  capturePricingSignals,
  expireStaleSignals,
  normalizeToPGPM,
  publishPricingSignal,
  rejectPricingSignal,
} from "@/server/services/ingestion/pricing";
import { crawlAndCapturePricing } from "@/server/services/ingestion/crawl";
import { registerSource } from "@/server/services/ingestion/sources";

function stubFetcher(text: string, httpStatus = 200) {
  return { fetch: async () => ({ httpStatus, text }) };
}

async function makeVendor(label: string) {
  const prisma = getPrisma();
  const org = await prisma.organization.create({
    data: {
      id: newId(),
      type: OrganizationType.vendor,
      legalName: label,
      displayName: label,
    },
  });
  const profile = await prisma.vendorProfile.create({
    data: {
      id: newId(),
      organizationId: org.id,
      createdBySource: VendorSource.scrape,
    },
  });
  return { org, profile };
}

async function makeReviewer(name = "Reviewer") {
  const prisma = getPrisma();
  return prisma.user.create({
    data: { id: newId(), name, email: `r-${newId()}@x.test` },
  });
}

describe("DeterministicPricingExtractor", () => {
  const extractor = new DeterministicPricingExtractor();

  it("extracts PGPM rate with min-quantity and contract term", async () => {
    const text =
      "We charge ₹25,000 per guard per month. Minimum 10 guards. 12-month contract.";
    const out = await extractor.extract({ url: "https://x.test", text });
    const pgpm = out.find((c) => c.signalType === PricingSignalType.pgpm_rate);
    expect(pgpm).toBeDefined();
    expect(pgpm?.priceValue).toBe(25000);
    expect(pgpm?.unit).toBe(PricingUnit.per_guard_per_month);
    expect(pgpm?.minQuantity).toBe(10);
    expect(pgpm?.minContractMonths).toBe(12);
  });

  it("extracts day-rate and night-rate pair", async () => {
    const text =
      "Our rates: day shift is ₹25,000 and night shift is ₹27,500. Unarmed guards only.";
    const out = await extractor.extract({ url: "https://x.test", text });
    const day = out.find((c) => c.signalType === PricingSignalType.day_rate);
    const night = out.find((c) => c.signalType === PricingSignalType.night_rate);
    expect(day?.priceValue).toBe(25000);
    expect(night?.priceValue).toBe(27500);
  });

  it("extracts supervisor rate", async () => {
    const text = "Supervisor charges: ₹30,000";
    const out = await extractor.extract({ url: "https://x.test", text });
    const sup = out.find((c) => c.signalType === PricingSignalType.supervisor_rate);
    expect(sup?.priceValue).toBe(30000);
  });

  it("extracts per-hour rates", async () => {
    const text = "Rates start at ₹120/hr for event security.";
    const out = await extractor.extract({ url: "https://x.test", text });
    const h = out.find((c) => c.signalType === PricingSignalType.hourly_rate);
    expect(h?.priceValue).toBe(120);
    expect(h?.unit).toBe(PricingUnit.per_hour);
  });

  it("extracts SaaS per-user monthly pricing", async () => {
    const text = "Pro plan is $29 per user per month, billed monthly.";
    const out = await extractor.extract({ url: "https://x.test/pricing", text });
    const plan = out.find((c) => c.unit === PricingUnit.per_seat_per_month);
    expect(plan?.priceValue).toBe(29);
    expect(plan?.currency).toBe("USD");
    expect(plan?.unit).toBe(PricingUnit.per_seat_per_month);
    expect(plan?.signalType).toBe(PricingSignalType.package_monthly);
  });

  it("extracts EU package monthly pricing", async () => {
    const text = "Business support starts at €99/month for small teams.";
    const out = await extractor.extract({ url: "https://x.test/pricing", text });
    const plan = out.find((c) => c.signalType === PricingSignalType.package_monthly);
    expect(plan?.priceValue).toBe(99);
    expect(plan?.currency).toBe("EUR");
    expect(plan?.unit).toBe(PricingUnit.package_monthly);
  });

  it("extracts usage-based API pricing", async () => {
    const text = "Input tokens cost $5.00 / 1M tokens and output tokens cost $30.00 / 1M tokens.";
    const out = await extractor.extract({ url: "https://x.test/pricing", text });
    expect(out.some((c) => c.priceValue === 5 && c.signalType === PricingSignalType.other)).toBe(
      true,
    );
    expect(out.some((c) => c.priceValue === 30 && c.signalType === PricingSignalType.other)).toBe(
      true,
    );
  });

  it("extracts a range", async () => {
    const text = "Our rates range from ₹20,000 to ₹25,000 depending on deployment.";
    const out = await extractor.extract({ url: "https://x.test", text });
    expect(
      out.find((c) => c.signalType === PricingSignalType.range_min)?.priceValue,
    ).toBe(20000);
    expect(
      out.find((c) => c.signalType === PricingSignalType.range_max)?.priceValue,
    ).toBe(25000);
  });

  it("refuses to infer a rate from 'contact us' pages", async () => {
    const text =
      "Every engagement is different. Contact us for a custom quote — competitive pricing guaranteed.";
    const out = await extractor.extract({ url: "https://x.test", text });
    expect(out).toEqual([]);
  });

  it("still extracts explicit pricing when a page also says contact sales", async () => {
    const text = "Free $0/mo. Pro $15 per month. Enterprise contact sales.";
    const out = await extractor.extract({ url: "https://x.test/pricing", text });
    expect(out.some((c) => c.priceValue === 15)).toBe(true);
  });

  it("normalizes common HTML pricing markup before extraction", async () => {
    const text =
      '<span class="dollar">$</span><span>29</span><span>per user/month</span>';
    const out = await extractor.extract({ url: "https://x.test/pricing", text });
    expect(out.some((c) => c.priceValue === 29)).toBe(true);
  });

  it("returns starting_price at low confidence when that's the only signal", async () => {
    const text = "Protecting Bengaluru since 2012. Services starting at ₹18,000.";
    const out = await extractor.extract({ url: "https://x.test", text });
    expect(out).toHaveLength(1);
    expect(out[0]?.signalType).toBe(PricingSignalType.starting_price);
    expect(out[0]?.priceValue).toBe(18000);
    expect(out[0]?.confidence).toBeLessThan(0.6);
  });
});

describe("normalizeToPGPM", () => {
  it("passes through per_guard_per_month unchanged", () => {
    const out = normalizeToPGPM({
      priceValue: 25000,
      unit: PricingUnit.per_guard_per_month,
      signalType: PricingSignalType.pgpm_rate,
    });
    expect(out.normalized).toBe(25000);
    expect(out.notes).toBeNull();
  });

  it("converts per-hour to PGPM with a documented indicative note", () => {
    const out = normalizeToPGPM({
      priceValue: 120,
      unit: PricingUnit.per_hour,
      signalType: PricingSignalType.hourly_rate,
    });
    expect(out.normalized).toBe(120 * 8 * 30);
    expect(out.notes).toMatch(/indicative/);
  });

  it("refuses to normalize starting-price / unspecified unit", () => {
    const out = normalizeToPGPM({
      priceValue: 18000,
      unit: PricingUnit.unspecified,
      signalType: PricingSignalType.starting_price,
    });
    expect(out.normalized).toBeNull();
  });
});

describe("capturePricingSignals + workflow", () => {
  it("captures signals as pending, publishes them, exposes on public page query", async () => {
    const prisma = getPrisma();
    const { profile } = await makeVendor("Alpha Security");
    const reviewer = await makeReviewer();

    const capture = await capturePricingSignals(prisma, {
      vendorProfileId: profile.id,
      pageText:
        "Our day shift is ₹25,000 and night shift is ₹27,500 per guard per month. Minimum 10 guards.",
      pageUrl: "https://alpha.test/pricing",
    });
    expect(capture.created.length).toBeGreaterThanOrEqual(2);

    const rows = await prisma.publicPricingSignal.findMany({
      where: { vendorProfileId: profile.id },
    });
    expect(rows).toHaveLength(capture.created.length);
    expect(rows.every((r) => r.status === PricingSignalStatus.pending)).toBe(true);

    const published = await publishPricingSignal(prisma, {
      signalId: rows[0]!.id,
      actorUserId: reviewer.id,
      notes: "matches source text",
    });
    expect(published.status).toBe(PricingSignalStatus.published);
    expect(published.reviewedByUserId).toBe(reviewer.id);

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: "public_pricing_signal", entityId: published.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.action).toBe("pricing.published");
  });

  it("does not create duplicate signals for the same source text", async () => {
    const prisma = getPrisma();
    const { profile } = await makeVendor("No Duplicate Security");
    const input = {
      vendorProfileId: profile.id,
      sourceUrlId: "source-1",
      pageText: "Plan starts at $29 per user per month.",
      pageUrl: "https://nodupe.test/pricing",
    };

    const first = await capturePricingSignals(prisma, input);
    const second = await capturePricingSignals(prisma, input);

    expect(first.created).toHaveLength(1);
    expect(second.created).toHaveLength(0);
    await expect(
      prisma.publicPricingSignal.count({ where: { vendorProfileId: profile.id } }),
    ).resolves.toBe(1);
  });

  it("reject requires notes", async () => {
    const prisma = getPrisma();
    const { profile } = await makeVendor("Beta Security");
    const reviewer = await makeReviewer();
    const capture = await capturePricingSignals(prisma, {
      vendorProfileId: profile.id,
      pageText: "Rates start at ₹18,000 per guard per month.",
      pageUrl: "https://beta.test",
    });
    const signalId = capture.created[0]!.id;
    await expect(
      rejectPricingSignal(prisma, { signalId, actorUserId: reviewer.id, notes: "  " }),
    ).rejects.toThrow(/notes/);
    const done = await rejectPricingSignal(prisma, {
      signalId,
      actorUserId: reviewer.id,
      notes: "stale ad copy, source page last updated 2019",
    });
    expect(done.status).toBe(PricingSignalStatus.rejected);
  });

  it("expireStaleSignals flips expired published signals", async () => {
    const prisma = getPrisma();
    const { profile } = await makeVendor("Gamma Security");
    const reviewer = await makeReviewer();
    const capture = await capturePricingSignals(prisma, {
      vendorProfileId: profile.id,
      pageText: "₹22,000 per guard per month.",
      pageUrl: "https://gamma.test",
    });
    const id = capture.created[0]!.id;
    await publishPricingSignal(prisma, { signalId: id, actorUserId: reviewer.id });
    await prisma.publicPricingSignal.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await expireStaleSignals(prisma);
    expect(res.expired).toBe(1);
    const reloaded = await prisma.publicPricingSignal.findUniqueOrThrow({
      where: { id },
    });
    expect(reloaded.status).toBe(PricingSignalStatus.expired);
  });
});

describe("crawlAndCapturePricing integration", () => {
  it("crawls a bound URL, captures pricing, returns summary", async () => {
    const prisma = getPrisma();
    const { profile } = await makeVendor("Delta Security");
    const source = await registerSource(prisma, {
      url: "https://delta.test/pricing",
    });

    const result = await crawlAndCapturePricing(prisma, {
      sourceUrlId: source.id,
      vendorProfileId: profile.id,
      fetcher: stubFetcher(
        "Delta offers security staffing at ₹24,000 per guard per month. Minimum 8 guards. 12 month contract.",
      ),
    });

    expect(result.created.length).toBeGreaterThan(0);
    const rows = await prisma.publicPricingSignal.findMany({
      where: { vendorProfileId: profile.id },
    });
    expect(rows[0]?.priceValue.toString()).toBe("24000");
    expect(rows[0]?.unit).toBe(PricingUnit.per_guard_per_month);
    expect(rows[0]?.minQuantity).toBe(8);
    expect(rows[0]?.minContractMonths).toBe(12);
    expect(rows[0]?.status).toBe(PricingSignalStatus.pending);
    expect(rows[0]?.sourceUrlId).toBe(source.id);
  });

  it("writes nothing when the page says 'contact us for rates'", async () => {
    const prisma = getPrisma();
    const { profile } = await makeVendor("Echo Security");
    const source = await registerSource(prisma, {
      url: "https://echo.test/pricing",
    });

    await crawlAndCapturePricing(prisma, {
      sourceUrlId: source.id,
      vendorProfileId: profile.id,
      fetcher: stubFetcher(
        "Every engagement is unique. Contact us for a custom quote tailored to your site.",
      ),
    });
    const rows = await prisma.publicPricingSignal.findMany({
      where: { vendorProfileId: profile.id },
    });
    expect(rows).toHaveLength(0);
  });
});
