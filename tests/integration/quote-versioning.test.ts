import { describe, it, expect } from "vitest";
import {
  OrganizationType,
  ProfileStatus,
  QuoteSubmissionStatus,
  RequirementStatus,
  RfqStatus,
  VerificationStatus,
} from "@/generated/prisma";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { createVendor } from "@/server/services/vendors/create-vendor";
import { createRequirement } from "@/server/services/requirements/create-requirement";
import { addRfqRecipient, createRfq, issueRfq } from "@/server/services/rfqs/create-rfq";
import { createQuote, submitQuote } from "@/server/services/quotes/create-quote";

async function bootstrapWorld() {
  const prisma = getPrisma();
  const city = await prisma.city.create({
    data: { id: newId(), name: "Bengaluru", state: "KA" },
  });
  const cat = await prisma.serviceCategory.create({
    data: { id: newId(), code: "security_staffing", label: "Security staffing" },
  });
  const buyerOrg = await prisma.organization.create({
    data: {
      id: newId(),
      type: OrganizationType.buyer,
      legalName: "BuyerCo",
      displayName: "BuyerCo",
    },
  });
  const buyerUser = await prisma.user.create({
    data: { id: newId(), email: `b-${newId()}@x.test`, name: "B" },
  });
  const vendorUser = await prisma.user.create({
    data: { id: newId(), email: `v-${newId()}@x.test`, name: "V" },
  });
  const { profile } = await createVendor(prisma, {
    legalName: "VendorCo",
    serviceCategoryIds: [cat.id],
    hqCityId: city.id,
  });
  await prisma.vendorProfile.update({
    where: { id: profile.id },
    data: {
      profileStatus: ProfileStatus.active,
      verificationStatus: VerificationStatus.verified,
    },
  });
  await prisma.vendorServiceArea.create({
    data: { id: newId(), vendorProfileId: profile.id, cityId: city.id },
  });
  return { city, cat, buyerOrg, buyerUser, vendorUser, profile };
}

describe("quote versioning + RFQ flow", () => {
  it("end-to-end: requirement → RFQ → recipient → issued → quote v1 → v2", async () => {
    const prisma = getPrisma();
    const { city, cat, buyerOrg, buyerUser, vendorUser, profile } = await bootstrapWorld();

    const requirement = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "20 guards Whitefield",
      serviceCategoryId: cat.id,
      cityId: city.id,
      headcountRequired: 20,
      shiftPattern: "24x7",
      createdByUserId: buyerUser.id,
    });
    expect(requirement.status).toBe(RequirementStatus.draft);

    const rfq = await createRfq(prisma, {
      buyerRequirementId: requirement.id,
      responseDeadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      createdByUserId: buyerUser.id,
    });
    expect(rfq.status).toBe(RfqStatus.draft);

    await addRfqRecipient(prisma, {
      rfqId: rfq.id,
      vendorProfileId: profile.id,
      actorUserId: buyerUser.id,
    });
    const issued = await issueRfq(prisma, { rfqId: rfq.id, actorUserId: buyerUser.id });
    expect(issued.status).toBe(RfqStatus.collecting_quotes);
    expect(issued.issueDate).not.toBeNull();

    const v1 = await createQuote(prisma, {
      rfqId: rfq.id,
      vendorProfileId: profile.id,
      createdByUserId: vendorUser.id,
      grandTotal: 480000,
      assumptions: { reliefIncluded: true },
      lineItems: [
        { lineType: "guard_wage", label: "20 guards × ₹20k", amount: 400000 },
        { lineType: "statutory", label: "PF/ESI", amount: 60000 },
        { lineType: "admin_fee", label: "Admin fee", amount: 20000 },
      ],
    });
    expect(v1.versionNumber).toBe(1);

    const submittedV1 = await submitQuote(prisma, {
      quoteId: v1.id,
      actorUserId: vendorUser.id,
    });
    expect(submittedV1.submissionStatus).toBe(QuoteSubmissionStatus.submitted);

    // Vendor revises — must create v2, v1 stays immutable as a record.
    const v2 = await createQuote(prisma, {
      rfqId: rfq.id,
      vendorProfileId: profile.id,
      createdByUserId: vendorUser.id,
      grandTotal: 462000,
      assumptions: { reliefIncluded: true, holidayRule: "1.5x" },
      lineItems: [
        { lineType: "guard_wage", label: "20 guards × ₹19k", amount: 380000 },
        { lineType: "statutory", label: "PF/ESI", amount: 62000 },
        { lineType: "admin_fee", label: "Admin fee", amount: 20000 },
      ],
    });
    expect(v2.versionNumber).toBe(2);

    const submittedV2 = await submitQuote(prisma, {
      quoteId: v2.id,
      actorUserId: vendorUser.id,
    });
    expect(submittedV2.submissionStatus).toBe(QuoteSubmissionStatus.submitted);

    const refreshedV1 = await prisma.quote.findUniqueOrThrow({ where: { id: v1.id } });
    expect(refreshedV1.submissionStatus).toBe(QuoteSubmissionStatus.superseded);

    // Submitted quotes are immutable — re-submitting a non-draft must fail.
    await expect(
      submitQuote(prisma, { quoteId: v1.id, actorUserId: vendorUser.id }),
    ).rejects.toThrow(/cannot submit/);

    const recipient = await prisma.rfqRecipient.findUniqueOrThrow({
      where: { rfqId_vendorProfileId: { rfqId: rfq.id, vendorProfileId: profile.id } },
    });
    expect(recipient.recipientStatus).toBe("responded");
  });

  it("rejects RFQ issuance with no recipients", async () => {
    const prisma = getPrisma();
    const { city, cat, buyerOrg, buyerUser } = await bootstrapWorld();
    const req = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "x",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: buyerUser.id,
    });
    const rfq = await createRfq(prisma, {
      buyerRequirementId: req.id,
      responseDeadline: new Date(Date.now() + 1000 * 60 * 60),
      createdByUserId: buyerUser.id,
    });
    await expect(
      issueRfq(prisma, { rfqId: rfq.id, actorUserId: buyerUser.id }),
    ).rejects.toThrow(/at least one recipient/);
  });

  it("rejects quote from uninvited vendor", async () => {
    const prisma = getPrisma();
    const { city, cat, buyerOrg, buyerUser, vendorUser, profile } = await bootstrapWorld();
    const req = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "x",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: buyerUser.id,
    });
    const rfq = await createRfq(prisma, {
      buyerRequirementId: req.id,
      createdByUserId: buyerUser.id,
    });
    await expect(
      createQuote(prisma, {
        rfqId: rfq.id,
        vendorProfileId: profile.id,
        createdByUserId: vendorUser.id,
      }),
    ).rejects.toThrow(/not invited/);
  });
});
