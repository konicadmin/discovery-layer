import { type PrismaClient, RfqStatus, type RecipientStatus } from "@prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
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

export async function createRfq(db: PrismaClient, input: CreateRfqInput) {
  return db.$transaction(async (tx) => {
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
  db: PrismaClient,
  args: { rfqId: string; vendorProfileId: string; actorUserId: string },
) {
  return db.$transaction(async (tx) => {
    const rfq = await tx.rfq.findUnique({ where: { id: args.rfqId } });
    if (!rfq) throw new NotFoundError("rfq", args.rfqId);
    if (rfq.status !== RfqStatus.draft && rfq.status !== RfqStatus.ready_to_issue) {
      throw new ValidationError("recipients can only be added before issuance");
    }

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
  db: PrismaClient,
  args: { rfqId: string; actorUserId: string },
) {
  return db.$transaction(async (tx) => {
    const rfq = await tx.rfq.findUnique({
      where: { id: args.rfqId },
      include: { recipients: true },
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
