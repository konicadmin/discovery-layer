import { describe, it, expect } from "vitest";
import {
  AiTaskStatus,
  AiTaskType,
  OrganizationType,
  ProfileStatus,
  VerificationStatus,
} from "@/generated/prisma";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { parseRequirement } from "@/server/services/ai/parse-requirement";
import { explainShortlist } from "@/server/services/ai/explain-shortlist";
import { explainCompare } from "@/server/services/ai/explain-compare";
import { createVendor } from "@/server/services/vendors/create-vendor";
import { createRequirement } from "@/server/services/requirements/create-requirement";
import { generateShortlist } from "@/server/services/shortlisting/shortlist";
import {
  addRfqRecipient,
  createRfq,
  issueRfq,
} from "@/server/services/rfqs/create-rfq";
import { createQuote, submitQuote } from "@/server/services/quotes/create-quote";

describe("AI requirement parsing", () => {
  it("extracts structured fields + records an AI task", async () => {
    const prisma = getPrisma();
    const city = await prisma.city.create({
      data: { id: newId(), name: "Bengaluru", state: "KA" },
    });
    await prisma.city.create({
      data: { id: newId(), name: "Hyderabad", state: "TG" },
    });

    const result = await parseRequirement(prisma, {
      rawText:
        "Need 20 guards for a warehouse in Bengaluru, 24x7, relief included, 12 months contract starting next month",
      categoryCode: "security_staffing",
    });

    expect(result.data.cityId).toBe(city.id);
    expect(result.data.headcountRequired).toBe(20);
    expect(result.data.shiftPattern).toBe("24x7");
    expect(result.data.siteType).toBe("warehouse");
    expect(result.data.reliefRequired).toBe(true);
    expect(result.data.contractTermMonths).toBe(12);
    expect(result.data.startDate).not.toBeNull();
    expect(result.missingFields).not.toContain("headcountRequired");

    const task = await prisma.aiTask.findUniqueOrThrow({ where: { id: result.taskId } });
    expect(task.status).toBe(AiTaskStatus.completed);
    expect(task.taskType).toBe(AiTaskType.requirement_parse);
  });

  it("flags missing fields when brief is thin", async () => {
    const prisma = getPrisma();
    await prisma.city.create({
      data: { id: newId(), name: "Bengaluru", state: "KA" },
    });
    const result = await parseRequirement(prisma, {
      rawText: "Looking for vendors",
      categoryCode: "security_staffing",
    });
    expect(result.missingFields).toContain("headcountRequired");
    expect(result.missingFields).toContain("cityId");
    expect(result.missingFields).toContain("shiftPattern");
  });
});

describe("AI shortlist rationale", () => {
  it("grounds rationale in stored shortlist snapshots only", async () => {
    const prisma = getPrisma();
    const city = await prisma.city.create({
      data: { id: newId(), name: "Test", state: "KA" },
    });
    const cat = await prisma.serviceCategory.create({
      data: { id: newId(), code: `c-${newId()}`, label: "security_staffing" },
    });
    const buyerOrg = await prisma.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.buyer,
        legalName: "B",
        displayName: "B",
      },
    });
    const user = await prisma.user.create({
      data: { id: newId(), name: "U", email: `u-${newId()}@x.test` },
    });
    const { profile } = await createVendor(prisma, {
      legalName: "V",
      serviceCategoryIds: [cat.id],
      hqCityId: city.id,
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

    const requirement = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "Guards",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: user.id,
    });
    await generateShortlist(prisma, requirement.id);

    const explanation = await explainShortlist(prisma, { requirementId: requirement.id });
    expect(explanation.summary).toContain("1 vendors");
    expect(explanation.watchouts).toContain("thin_supply");
    expect(explanation.bullets).toHaveLength(1);

    const citations = await prisma.aiTaskCitation.findMany({
      where: { aiTaskId: explanation.taskId },
    });
    expect(citations).toHaveLength(1);
    expect(citations[0]?.sourceType).toBe("shortlist_snapshot");
  });
});

describe("AI compare explanation", () => {
  it("summarizes a compare set with anomaly flags and citations", async () => {
    const prisma = getPrisma();
    const city = await prisma.city.create({
      data: { id: newId(), name: "Test", state: "KA" },
    });
    const cat = await prisma.serviceCategory.create({
      data: { id: newId(), code: `c-${newId()}`, label: "security_staffing" },
    });
    const buyerOrg = await prisma.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.buyer,
        legalName: "B",
        displayName: "B",
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
    const req = await createRequirement(prisma, {
      buyerOrganizationId: buyerOrg.id,
      title: "Guards",
      serviceCategoryId: cat.id,
      cityId: city.id,
      createdByUserId: buyerUser.id,
    });
    const rfq = await createRfq(prisma, {
      buyerRequirementId: req.id,
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
      lineItems: [{ lineType: "guard_wage", label: "g", amount: 400000 }],
    });
    await submitQuote(prisma, { quoteId: q1.id, actorUserId: vendorUser.id });
    const q2 = await createQuote(prisma, {
      rfqId: rfq.id,
      vendorProfileId: v2.id,
      createdByUserId: vendorUser.id,
      grandTotal: 600000,
      lineItems: [{ lineType: "guard_wage", label: "g", amount: 500000 }],
    });
    await submitQuote(prisma, { quoteId: q2.id, actorUserId: vendorUser.id });

    const explanation = await explainCompare(prisma, { rfqId: rfq.id });
    expect(explanation.summary).toContain("Comparing 2");
    expect(explanation.bullets.some((b) => b.includes("spread"))).toBe(true);
    expect(explanation.watchouts).toContain("assumptions_missing");

    const task = await prisma.aiTask.findUniqueOrThrow({
      where: { id: explanation.taskId },
    });
    expect(task.taskType).toBe(AiTaskType.quote_explanation);
    expect(task.status).toBe(AiTaskStatus.completed);
  });
});
