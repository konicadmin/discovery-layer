import { describe, it, expect } from "vitest";
import {
  ComplianceStatus,
  ComplianceType,
  OrganizationType,
  PricingSignalType,
  PricingUnit,
  ProfileStatus,
  Region,
  VerificationStatus,
} from "@/generated/prisma";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import {
  detectCurrency,
  parseLocalizedNumber,
  regionForCountry,
} from "@/lib/region";
import { DeterministicPricingExtractor } from "@/server/services/ingestion/pricing-extractor";
import { createVendor } from "@/server/services/vendors/create-vendor";
import { createRequirement } from "@/server/services/requirements/create-requirement";
import { generateShortlist } from "@/server/services/shortlisting/shortlist";
import { submitForReview } from "@/server/services/verification/review";

describe("region helpers", () => {
  it("regionForCountry", () => {
    expect(regionForCountry("IN")).toBe(Region.IN);
    expect(regionForCountry("us")).toBe(Region.US);
    expect(regionForCountry("DE")).toBe(Region.EU);
    expect(regionForCountry("GB")).toBe(Region.EU);
    expect(regionForCountry("ZZ")).toBeNull();
  });

  it("detectCurrency picks the first matching symbol", () => {
    expect(detectCurrency("charges $25/hr")?.currency).toBe("USD");
    expect(detectCurrency("€20 per hour")?.currency).toBe("EUR");
    expect(detectCurrency("£15 per hour")?.currency).toBe("GBP");
    expect(detectCurrency("₹25000 per guard per month")?.currency).toBe("INR");
    expect(detectCurrency("no currency marker here")).toBeNull();
  });

  it("INR regex does NOT fire on English words containing 'rs'", () => {
    // This is what broke the first draft: 'officers' / 'servers' / 'sparse'
    // all contain `rs`. The pattern now requires \bRs\.? with a digit lookahead.
    expect(detectCurrency("Gotham Protective Services minimum 4 officers")).toBeNull();
  });

  it("parseLocalizedNumber handles dot and comma styles", () => {
    expect(parseLocalizedNumber("25,000.50", "dot")).toBe(25000.5);
    expect(parseLocalizedNumber("25.000,50", "comma")).toBe(25000.5);
    expect(parseLocalizedNumber("25 000,50", "comma")).toBe(25000.5);
    expect(parseLocalizedNumber("25,50", "comma")).toBe(25.5);
  });
});

describe("DeterministicPricingExtractor — multi-currency", () => {
  const ext = new DeterministicPricingExtractor();

  it("extracts USD per-hour from a USA-style page", async () => {
    const out = await ext.extract({
      url: "https://us.test",
      text: "Gotham Protective Services charges $25/hr for unarmed officers, minimum 4 officers per site.",
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.currency).toBe("USD");
    expect(out[0]?.region).toBe(Region.US);
    expect(out[0]?.signalType).toBe(PricingSignalType.hourly_rate);
    expect(out[0]?.unit).toBe(PricingUnit.per_hour);
    expect(out[0]?.priceValue).toBe(25);
    expect(out[0]?.minQuantity).toBe(4);
  });

  it("extracts EUR per-hour with dot-decimal (B2B English)", async () => {
    const out = await ext.extract({
      url: "https://eu.test",
      text: "Rates: €22.50 per hour for licensed guards. Minimum 6 personnel.",
    });
    const hourly = out.find((c) => c.signalType === PricingSignalType.hourly_rate);
    expect(hourly).toBeDefined();
    expect(hourly?.currency).toBe("EUR");
    expect(hourly?.priceValue).toBeCloseTo(22.5, 2);
    expect(hourly?.region).toBe(Region.EU);
  });

  it("extracts GBP per-hour and tags it EU", async () => {
    const out = await ext.extract({
      url: "https://uk.test",
      text: "Thames Valley Security Ltd: £18/hour for licensed guards.",
    });
    expect(out[0]?.currency).toBe("GBP");
    expect(out[0]?.region).toBe(Region.EU);
    expect(out[0]?.priceValue).toBe(18);
  });

  it("still extracts INR PGPM", async () => {
    const out = await ext.extract({
      url: "https://in.test",
      text: "We charge ₹25,000 per guard per month. Minimum 10 guards. 12 month contract.",
    });
    const pgpm = out.find((c) => c.signalType === PricingSignalType.pgpm_rate);
    expect(pgpm?.currency).toBe("INR");
    expect(pgpm?.region).toBe(Region.IN);
    expect(pgpm?.priceValue).toBe(25000);
    expect(pgpm?.minQuantity).toBe(10);
    expect(pgpm?.minContractMonths).toBe(12);
  });

  it("handles per-guard-per-month EUR (English)", async () => {
    const out = await ext.extract({
      url: "https://eu.test",
      text:
        "Our rate card: €4,500 per guard per month. Minimum 5 guards, 12 month contract.",
    });
    const pgpm = out.find((c) => c.signalType === PricingSignalType.pgpm_rate);
    expect(pgpm).toBeDefined();
    expect(pgpm?.currency).toBe("EUR");
    expect(pgpm?.priceValue).toBe(4500);
  });

  it("refuses to infer from 'contact us' pages regardless of currency", async () => {
    const out = await ext.extract({
      url: "https://x.test",
      text: "Rates on request — please contact us for a custom quote.",
    });
    expect(out).toEqual([]);
  });
});

describe("shortlist region filter", () => {
  async function seedRegions() {
    const prisma = getPrisma();
    const cat = await prisma.serviceCategory.create({
      data: { id: newId(), code: `c-${newId()}`, label: "security_staffing" },
    });
    const inCity = await prisma.city.create({
      data: { id: newId(), name: `IN-${newId()}`, state: "KA", country: "IN" },
    });
    const usCity = await prisma.city.create({
      data: { id: newId(), name: `US-${newId()}`, state: "NY", country: "US" },
    });
    const euCity = await prisma.city.create({
      data: { id: newId(), name: `EU-${newId()}`, state: "BE", country: "DE" },
    });

    async function mkVendor(region: Region, city: { id: string }, label: string) {
      const { profile, organization } = await createVendor(prisma, {
        legalName: `${label}-${newId()}`,
        serviceCategoryIds: [cat.id],
        hqCityId: city.id,
      });
      await prisma.organization.update({
        where: { id: organization.id },
        data: { region },
      });
      await prisma.vendorProfile.update({
        where: { id: profile.id },
        data: {
          profileStatus: ProfileStatus.active,
          verificationStatus: VerificationStatus.verified,
          verifiedAt: new Date(),
        },
      });
      await prisma.vendorServiceArea.create({
        data: { id: newId(), vendorProfileId: profile.id, cityId: city.id },
      });
      // Region-appropriate compliance records.
      const types: ComplianceType[] =
        region === Region.IN
          ? [ComplianceType.gst, ComplianceType.psara]
          : region === Region.US
            ? [
                ComplianceType.ein,
                ComplianceType.us_state_security_license,
                ComplianceType.workers_comp,
              ]
            : [ComplianceType.vat, ComplianceType.eu_security_license];
      await prisma.vendorComplianceRecord.createMany({
        data: types.map((ct) => ({
          id: newId(),
          vendorProfileId: profile.id,
          complianceType: ct,
          status: ComplianceStatus.active,
        })),
      });
      return profile;
    }

    const inVendor = await mkVendor(Region.IN, inCity, "IN-vendor");
    const usVendor = await mkVendor(Region.US, usCity, "US-vendor");
    const euVendor = await mkVendor(Region.EU, euCity, "EU-vendor");

    const buyerOrg = await prisma.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.buyer,
        legalName: "B",
        displayName: "B",
        region: Region.US,
      },
    });
    const buyerUser = await prisma.user.create({
      data: { id: newId(), name: "B", email: `b-${newId()}@x.test` },
    });

    return {
      cat,
      cities: { IN: inCity, US: usCity, EU: euCity },
      vendors: { IN: inVendor, US: usVendor, EU: euVendor },
      buyerOrg,
      buyerUser,
    };
  }

  it("shortlist returns only same-region vendors", async () => {
    const prisma = getPrisma();
    const { cat, cities, vendors, buyerOrg, buyerUser } = await seedRegions();

    const usRequirement = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      region: Region.US,
      title: "Guards NYC",
      serviceCategoryId: cat.id,
      cityId: cities.US.id,
      createdByUserId: buyerUser.id,
    });
    const usResult = await generateShortlist(prisma, usRequirement.id);
    expect(usResult.items.map((i) => i.vendorProfileId)).toEqual([vendors.US.id]);

    const euRequirement = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      region: Region.EU,
      title: "Guards Berlin",
      serviceCategoryId: cat.id,
      cityId: cities.EU.id,
      createdByUserId: buyerUser.id,
    });
    const euResult = await generateShortlist(prisma, euRequirement.id);
    expect(euResult.items.map((i) => i.vendorProfileId)).toEqual([vendors.EU.id]);
  });

  it("compliance scoring uses region-expected types", async () => {
    const prisma = getPrisma();
    const { cat, cities, buyerOrg, buyerUser } = await seedRegions();

    const usResult = await generateShortlist(prisma, (await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      region: Region.US,
      title: "X",
      serviceCategoryId: cat.id,
      cityId: cities.US.id,
      createdByUserId: buyerUser.id,
    })).id);
    const complianceReason = usResult.items[0]?.reasons.find(
      (r) => r.component === "compliance",
    );
    expect(complianceReason?.detail).toContain("ein=active");
    expect(complianceReason?.detail).toContain("workers_comp=active");
    expect(complianceReason?.detail).not.toContain("psara");
  });
});

describe("verification review — region-scoped checklist", () => {
  it("seeds only global + vendor-region checklist items", async () => {
    const prisma = getPrisma();
    const cat = await prisma.serviceCategory.create({
      data: { id: newId(), code: `c-${newId()}`, label: "s" },
    });
    // Global + IN + US + EU items.
    await prisma.verificationChecklistItem.createMany({
      data: [
        {
          id: newId(),
          serviceCategoryId: cat.id,
          code: "global",
          label: "global item",
          region: null,
        },
        {
          id: newId(),
          serviceCategoryId: cat.id,
          code: "in_only",
          label: "IN only",
          region: Region.IN,
        },
        {
          id: newId(),
          serviceCategoryId: cat.id,
          code: "us_only",
          label: "US only",
          region: Region.US,
        },
        {
          id: newId(),
          serviceCategoryId: cat.id,
          code: "eu_only",
          label: "EU only",
          region: Region.EU,
        },
      ],
    });

    const org = await prisma.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.vendor,
        legalName: "US vendor",
        displayName: "US vendor",
        region: Region.US,
      },
    });
    const profile = await prisma.vendorProfile.create({
      data: { id: newId(), organizationId: org.id },
    });
    await prisma.vendorServiceCategory.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        serviceCategoryId: cat.id,
        primaryCategory: true,
      },
    });

    const review = await submitForReview(prisma, { vendorProfileId: profile.id });
    const items = await prisma.verificationReviewItem.findMany({
      where: { verificationReviewId: review.id },
      include: { checklistItem: true },
    });
    const codes = items.map((i) => i.checklistItem.code).sort();
    expect(codes).toEqual(["global", "us_only"]);
  });
});
