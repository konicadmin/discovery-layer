import {
  ProfileStatus,
  RfqStatus,
  type RecipientStatus,
  VerificationStatus,
} from "@/generated/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";

function rfqCode(): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = newId().slice(-6);
  return `RFQ-${yyyymmdd}-${suffix}`;
}

export type CreateRfqInput = {
  buyerRequirementId: string;
  responseDeadline?: Date;
  notes?: string;
  createdByUserId: string;
};

function assertRecipientEligibility(args: {
  rfqId: string;
  vendorProfileId: string;
  region: string;
  serviceCategoryId: string;
  cityId: string;
  profileStatus: ProfileStatus;
  verificationStatus: VerificationStatus;
  vendorRegion: string;
  categoryMatch: boolean;
  cityMatch: boolean;
}) {
  if (args.profileStatus !== ProfileStatus.active) {
    throw new ValidationError(
      `vendor ${args.vendorProfileId} is not active and cannot receive RFQs`,
    );
  }
  if (args.verificationStatus !== VerificationStatus.verified) {
    throw new ValidationError(
      `vendor ${args.vendorProfileId} must be verified before receiving RFQs`,
    );
  }
  if (args.vendorRegion !== args.region) {
    throw new ValidationError(
      `vendor ${args.vendorProfileId} is in a different region and cannot receive RFQ ${args.rfqId}`,
    );
  }
  if (!args.categoryMatch) {
    throw new ValidationError(
      `vendor ${args.vendorProfileId} does not serve the RFQ category`,
    );
  }
  if (!args.cityMatch) {
    throw new ValidationError(
      `vendor ${args.vendorProfileId} does not serve the RFQ city`,
    );
  }
}

export async function createRfq(db: Db, input: CreateRfqInput) {
  return withTx(db, async (tx) => {
    const requirement = await tx.buyerRequirement.findUnique({
      where: { id: input.buyerRequirementId },
    });
    if (!requirement) {
      throw new NotFoundError("buyer_requirement", input.buyerRequirementId);
    }

    const rfq = await tx.rfq.create({
      data: {
        id: newId(),
        buyerRequirementId: requirement.id,
        buyerOrganizationId: requirement.buyerOrganizationId,
        rfqCode: rfqCode(),
        responseDeadline: input.responseDeadline,
        status: RfqStatus.draft,
        notes: input.notes,
        createdByUserId: input.createdByUserId,
      },
    });

    await logEvent(tx, {
      actorUserId: input.createdByUserId,
      actorOrganizationId: requirement.buyerOrganizationId,
      entityType: "rfq",
      entityId: rfq.id,
      action: "rfq.draft_created",
      after: { rfqCode: rfq.rfqCode, requirementId: requirement.id },
    });

    return rfq;
  });
}

export async function addRfqRecipient(
  db: Db,
  args: { rfqId: string; vendorProfileId: string; actorUserId: string },
) {
  return withTx(db, async (tx) => {
    const rfq = await tx.rfq.findUnique({
      where: { id: args.rfqId },
      include: { requirement: true },
    });
    if (!rfq) throw new NotFoundError("rfq", args.rfqId);
    if (rfq.status !== RfqStatus.draft && rfq.status !== RfqStatus.ready_to_issue) {
      throw new ValidationError("recipients can only be added before issuance");
    }

    const vendor = await tx.vendorProfile.findUnique({
      where: { id: args.vendorProfileId },
      include: {
        organization: true,
        serviceCategories: true,
        serviceAreas: true,
      },
    });
    if (!vendor) throw new NotFoundError("vendor_profile", args.vendorProfileId);

    assertRecipientEligibility({
      rfqId: rfq.id,
      vendorProfileId: vendor.id,
      region: rfq.requirement.region,
      serviceCategoryId: rfq.requirement.serviceCategoryId,
      cityId: rfq.requirement.cityId,
      profileStatus: vendor.profileStatus,
      verificationStatus: vendor.verificationStatus,
      vendorRegion: vendor.organization.region,
      categoryMatch: vendor.serviceCategories.some(
        (c) => c.serviceCategoryId === rfq.requirement.serviceCategoryId && c.active,
      ),
      cityMatch: vendor.serviceAreas.some(
        (a) => a.cityId === rfq.requirement.cityId && a.serviceable,
      ),
    });

    const recipient = await tx.rfqRecipient.create({
      data: {
        id: newId(),
        rfqId: rfq.id,
        vendorProfileId: args.vendorProfileId,
      },
    });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      actorOrganizationId: rfq.buyerOrganizationId,
      entityType: "rfq",
      entityId: rfq.id,
      action: "rfq.recipient_added",
      after: { vendorProfileId: args.vendorProfileId },
    });

    return recipient;
  });
}

export async function issueRfq(
  db: Db,
  args: { rfqId: string; actorUserId: string },
) {
  return withTx(db, async (tx) => {
    const rfq = await tx.rfq.findUnique({
      where: { id: args.rfqId },
      include: {
        requirement: true,
        recipients: {
          include: {
            vendorProfile: {
              include: {
                organization: true,
                serviceCategories: true,
                serviceAreas: true,
              },
            },
          },
        },
      },
    });
    if (!rfq) throw new NotFoundError("rfq", args.rfqId);
    if (rfq.recipients.length === 0) {
      throw new ValidationError("RFQ must have at least one recipient before issuance");
    }
    if (rfq.responseDeadline && rfq.responseDeadline.getTime() <= Date.now()) {
      throw new ValidationError("response deadline must be in the future");
    }
    if (rfq.status !== RfqStatus.draft && rfq.status !== RfqStatus.ready_to_issue) {
      throw new ValidationError(`cannot issue an RFQ in state ${rfq.status}`);
    }

    for (const recipient of rfq.recipients) {
      const vendor = recipient.vendorProfile;
      assertRecipientEligibility({
        rfqId: rfq.id,
        vendorProfileId: vendor.id,
        region: rfq.requirement.region,
        serviceCategoryId: rfq.requirement.serviceCategoryId,
        cityId: rfq.requirement.cityId,
        profileStatus: vendor.profileStatus,
        verificationStatus: vendor.verificationStatus,
        vendorRegion: vendor.organization.region,
        categoryMatch: vendor.serviceCategories.some(
          (c) => c.serviceCategoryId === rfq.requirement.serviceCategoryId && c.active,
        ),
        cityMatch: vendor.serviceAreas.some(
          (a) => a.cityId === rfq.requirement.cityId && a.serviceable,
        ),
      });
    }

    const now = new Date();
    const updated = await tx.rfq.update({
      where: { id: rfq.id },
      data: { status: RfqStatus.collecting_quotes, issueDate: now },
    });

    await tx.rfqRecipient.updateMany({
      where: { rfqId: rfq.id },
      data: { recipientStatus: "sent" satisfies RecipientStatus, sentAt: now },
    });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      actorOrganizationId: rfq.buyerOrganizationId,
      entityType: "rfq",
      entityId: rfq.id,
      action: "rfq.issued",
      after: { issuedAt: now, recipientCount: rfq.recipients.length },
    });

    return updated;
  });
}
