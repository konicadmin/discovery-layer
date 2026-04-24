import { describe, it, expect } from "vitest";
import {
  DecisionStatus,
  OrganizationType,
  ProfileStatus,
  RfqStatus,
  VerificationStatus,
} from "@prisma/client";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { createVendor } from "@/server/services/vendors/create-vendor";
import { createRequirement } from "@/server/services/requirements/create-requirement";
import {
  addRfqRecipient,
  createRfq,
  issueRfq,
} from "@/server/services/rfqs/create-rfq";
import { createQuote, submitQuote } from "@/server/services/quotes/create-quote";
import { decideRfq } from "@/server/services/rfqs/decide";
import { compareRfq } from "@/server/services/quotes/compare";
import { ValidationError } from "@/lib/errors";

async function world() {
  const prisma = getPrisma();
  const city = await prisma.city.create({
    data: { id: newId(), name: `C-${newId()}`, state: "KA" },
  });
  const cat = await prisma.serviceCategory.create({
    data: { id: newId(), code: `c-${newId()}`, label: "security" },
  });
  const buyerOrg = await prisma.organization.create({
    data: {
      id: newId(),
      type: OrganizationType.buyer,
      legalName: "Buyer",
      displayName: "Buyer",
    },
  });
  const buyerUser = await prisma.user.create({
    data: { id: newId(), name: "B", email: `b-${newId()}@x.test` },
  });
  const vendorUser = await prisma.user.create({
    data: { id: newId(), name: "V", email: `v-${newId()}@x.test` },
  });
  const { profile: v1 } = await createVendor(prisma, {
    legalName: "V1",
    serviceCategoryIds: [cat.id],
    hqCityId: city.id,
  });
  const { profile: v2 } = await createVendor(prisma, {
    legalName: "V2",
    serviceCategoryIds: [cat.id],
    hqCityId: city.id,
  });
  for (const p of [v1, v2]) {
    await prisma.vendorProfile.update({
      where: { id: p.id },
      data: {
        profileStatus: ProfileStatus.active,
        verificationStatus: VerificationStatus.verified,
      },
    });
    await prisma.vendorServiceArea.create({
      data: { id: newId(), vendorProfileId: p.id, cityId: city.id },
    });
  }
  return { prisma, city, cat, buyerOrg, buyerUser, vendorUser, v1, v2 };
}

describe("decision + compare", () => {
  it("compare returns latest submitted per vendor, sorted by grand total", async () => {
    const { prisma, city, cat, buyerOrg, buyerUser, vendorUser, v1, v2 } = await world();
    const req = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "T",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: buyerUser.id,
    });
    const rfq = await createRfq(prisma, {
      buyerRequirementId: req.id,
      responseDeadline: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      createdByUserId: buyerUser.id,
    });
    for (const v of [v1, v2]) {
      await addRfqRecipient(prisma, {
        rfqId: rfq.id,
        vendorProfileId: v.id,
        actorUserId: buyerUser.id,
      });
    }
    await issueRfq(prisma, { rfqId: rfq.id, actorUserId: buyerUser.id });

    const q1 = await createQuote(prisma, {
      rfqId: rfq.id,
      vendorProfileId: v1.id,
      createdByUserId: vendorUser.id,
      grandTotal: 500000,
      assumptions: { reliefIncluded: true },
      lineItems: [{ lineType: "guard_wage", label: "g", amount: 400000 }],
    });
    await submitQuote(prisma, { quoteId: q1.id, actorUserId: vendorUser.id });

    const q2v1 = await createQuote(prisma, {
      rfqId: rfq.id,
      vendorProfileId: v2.id,
      createdByUserId: vendorUser.id,
      grandTotal: 520000,
      lineItems: [{ lineType: "guard_wage", label: "g", amount: 420000 }],
    });
    await submitQuote(prisma, { quoteId: q2v1.id, actorUserId: vendorUser.id });
    const q2v2 = await createQuote(prisma, {
      rfqId: rfq.id,
      vendorProfileId: v2.id,
      createdByUserId: vendorUser.id,
      grandTotal: 480000,
      lineItems: [{ lineType: "guard_wage", label: "g", amount: 400000 }],
    });
    await submitQuote(prisma, { quoteId: q2v2.id, actorUserId: vendorUser.id });

    const result = await compareRfq(prisma, rfq.id);
    expect(result.rows).toHaveLength(2);
    // Sorted by grand total ascending → v2 (480k, v2) before v1 (500k).
    expect(result.rows[0]?.vendorProfileId).toBe(v2.id);
    expect(result.rows[0]?.versionNumber).toBe(2);
    expect(result.rows[1]?.vendorProfileId).toBe(v1.id);
    // v1 has assumptions flag cleared but no line_items flag
    expect(result.rows[1]?.flags).not.toContain("line_items_missing");
  });

  it("awarding requires an invited vendor and flips RFQ to awarded", async () => {
    const { prisma, city, cat, buyerOrg, buyerUser, v1, v2 } = await world();
    const req = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "T",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: buyerUser.id,
    });
    const rfq = await createRfq(prisma, {
      buyerRequirementId: req.id,
      createdByUserId: buyerUser.id,
    });
    await addRfqRecipient(prisma, {
      rfqId: rfq.id,
      vendorProfileId: v1.id,
      actorUserId: buyerUser.id,
    });

    await expect(
      decideRfq(prisma, {
        rfqId: rfq.id,
        decision: DecisionStatus.awarded,
        selectedVendorProfileId: v2.id,
        actorUserId: buyerUser.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await decideRfq(prisma, {
      rfqId: rfq.id,
      decision: DecisionStatus.awarded,
      selectedVendorProfileId: v1.id,
      reasonCode: "best_price",
      notes: "lowest fully-loaded rate",
      actorUserId: buyerUser.id,
    });

    const refreshed = await prisma.rfq.findUniqueOrThrow({ where: { id: rfq.id } });
    expect(refreshed.status).toBe(RfqStatus.awarded);
  });

  it("close_no_award transitions RFQ to closed_no_award", async () => {
    const { prisma, city, cat, buyerOrg, buyerUser, v1 } = await world();
    const req = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "T",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: buyerUser.id,
    });
    const rfq = await createRfq(prisma, {
      buyerRequirementId: req.id,
      createdByUserId: buyerUser.id,
    });
    await addRfqRecipient(prisma, {
      rfqId: rfq.id,
      vendorProfileId: v1.id,
      actorUserId: buyerUser.id,
    });

    await decideRfq(prisma, {
      rfqId: rfq.id,
      decision: DecisionStatus.closed_no_award,
      reasonCode: "budget",
      notes: "out of budget",
      actorUserId: buyerUser.id,
    });
    const refreshed = await prisma.rfq.findUniqueOrThrow({ where: { id: rfq.id } });
    expect(refreshed.status).toBe(RfqStatus.closed_no_award);
  });
});
