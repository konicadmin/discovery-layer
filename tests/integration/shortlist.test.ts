import { describe, it, expect } from "vitest";
import {
  ComplianceStatus,
  ComplianceType,
  OrganizationType,
  ProfileStatus,
  VerificationStatus,
} from "@/generated/prisma";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { createVendor } from "@/server/services/vendors/create-vendor";
import { createRequirement } from "@/server/services/requirements/create-requirement";
import {
  generateShortlist,
  readShortlist,
} from "@/server/services/shortlisting/shortlist";

async function seedWorld() {
  const prisma = getPrisma();
  const city = await prisma.city.create({
    data: { id: newId(), name: `City-${newId()}`, state: "KA" },
  });
  const otherCity = await prisma.city.create({
    data: { id: newId(), name: `Other-${newId()}`, state: "KA" },
  });
  const cat = await prisma.serviceCategory.create({
    data: { id: newId(), code: `c-${newId()}`, label: "security_staffing" },
  });
  const buyerOrg = await prisma.organization.create({
    data: {
      id: newId(),
      type: OrganizationType.buyer,
      legalName: "BuyerCo",
      displayName: "BuyerCo",
    },
  });
  const user = await prisma.user.create({
    data: { id: newId(), name: "U", email: `u-${newId()}@x.test` },
  });
  return { prisma, city, otherCity, cat, buyerOrg, user };
}

async function createVerifiedVendor(
  labelSuffix: string,
  opts: {
    cityId: string;
    categoryId: string;
    gst?: boolean;
    psara?: boolean;
    serviceSummary?: string;
    verifiedAt?: Date;
  },
) {
  const prisma = getPrisma();
  const { profile } = await createVendor(prisma, {
    legalName: `V-${labelSuffix}`,
    serviceCategoryIds: [opts.categoryId],
    hqCityId: opts.cityId,
  });
  await prisma.vendorProfile.update({
    where: { id: profile.id },
    data: {
      profileStatus: ProfileStatus.active,
      verificationStatus: VerificationStatus.verified,
      verifiedAt: opts.verifiedAt ?? new Date(),
      serviceSummary: opts.serviceSummary ?? null,
    },
  });
  await prisma.vendorServiceArea.create({
    data: { id: newId(), vendorProfileId: profile.id, cityId: opts.cityId },
  });
  if (opts.gst) {
    await prisma.vendorComplianceRecord.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        complianceType: ComplianceType.gst,
        status: ComplianceStatus.active,
      },
    });
  }
  if (opts.psara) {
    await prisma.vendorComplianceRecord.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        complianceType: ComplianceType.psara,
        status: ComplianceStatus.active,
      },
    });
  }
  return profile;
}

describe("shortlist engine", () => {
  it("excludes unverified vendors, vendors in other cities, and vendors in other categories", async () => {
    const { prisma, city, otherCity, cat, buyerOrg, user } = await seedWorld();

    const fullMatch = await createVerifiedVendor("A", {
      cityId: city.id,
      categoryId: cat.id,
      gst: true,
      psara: true,
      serviceSummary: "full profile",
    });

    // Wrong city
    await createVerifiedVendor("B", {
      cityId: otherCity.id,
      categoryId: cat.id,
      gst: true,
      psara: true,
    });
    // Wrong category
    const cat2 = await prisma.serviceCategory.create({
      data: { id: newId(), code: `c-${newId()}`, label: "housekeeping" },
    });
    await createVerifiedVendor("C", {
      cityId: city.id,
      categoryId: cat2.id,
      gst: true,
      psara: true,
    });
    // Not verified
    const { profile: unverifiedProfile } = await createVendor(prisma, {
      legalName: "UnverifiedCo",
      serviceCategoryIds: [cat.id],
      hqCityId: city.id,
    });
    await prisma.vendorServiceArea.create({
      data: { id: newId(), vendorProfileId: unverifiedProfile.id, cityId: city.id },
    });

    const requirement = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "T",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: user.id,
    });

    const result = await generateShortlist(prisma, requirement.id);
    expect(result.items.map((i) => i.vendorProfileId)).toEqual([fullMatch.id]);
    expect(result.candidatePoolSize).toBe(1);
  });

  it("orders by composite score and persists snapshots", async () => {
    const { prisma, city, cat, buyerOrg, user } = await seedWorld();

    const fullCompliance = await createVerifiedVendor("full", {
      cityId: city.id,
      categoryId: cat.id,
      gst: true,
      psara: true,
      serviceSummary: "full",
    });
    const partialCompliance = await createVerifiedVendor("partial", {
      cityId: city.id,
      categoryId: cat.id,
      gst: true,
      psara: false,
    });
    const none = await createVerifiedVendor("none", {
      cityId: city.id,
      categoryId: cat.id,
    });

    const req = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "T",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: user.id,
    });
    const result = await generateShortlist(prisma, req.id);
    const order = result.items.map((i) => i.vendorProfileId);
    expect(order[0]).toBe(fullCompliance.id);
    expect(order[order.length - 1]).toBe(none.id);
    expect(order).toContain(partialCompliance.id);

    const persisted = await readShortlist(prisma, req.id);
    expect(persisted).toHaveLength(3);
    expect(persisted[0]?.vendorProfileId).toBe(fullCompliance.id);
  });

  it("regeneration replaces the prior snapshot set", async () => {
    const { prisma, city, cat, buyerOrg, user } = await seedWorld();
    const v = await createVerifiedVendor("x", {
      cityId: city.id,
      categoryId: cat.id,
      gst: true,
      psara: true,
    });
    const req = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "T",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: user.id,
    });
    await generateShortlist(prisma, req.id);
    const before = await prisma.vendorShortlistSnapshot.findMany({
      where: { buyerRequirementId: req.id },
    });
    expect(before).toHaveLength(1);

    await generateShortlist(prisma, req.id);
    const after = await prisma.vendorShortlistSnapshot.findMany({
      where: { buyerRequirementId: req.id },
    });
    expect(after).toHaveLength(1);
    // The row is replaced, not duplicated.
    expect(after[0]?.vendorProfileId).toBe(v.id);
  });
});
