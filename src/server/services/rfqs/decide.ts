import { DecisionStatus, RfqStatus } from "@/generated/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";

export type DecideInput = {
  rfqId: string;
  decision: DecisionStatus;
  selectedVendorProfileId?: string;
  reasonCode?: string;
  notes?: string;
  actorUserId: string;
};

export async function decideRfq(db: Db, input: DecideInput) {
  return withTx(db, async (tx) => {
    const rfq = await tx.rfq.findUnique({
      where: { id: input.rfqId },
      include: { recipients: true },
    });
    if (!rfq) throw new NotFoundError("rfq", input.rfqId);

    if (input.decision === DecisionStatus.awarded) {
      if (!input.selectedVendorProfileId) {
        throw new ValidationError("awarded decision requires selectedVendorProfileId");
      }
      const invited = rfq.recipients.some(
        (r) => r.vendorProfileId === input.selectedVendorProfileId,
      );
      if (!invited) {
        throw new ValidationError("selected vendor was not invited to this RFQ");
      }
    }

    const decision = await tx.rfqDecision.create({
      data: {
        id: newId(),
        rfqId: rfq.id,
        selectedVendorProfileId: input.selectedVendorProfileId,
        decisionStatus: input.decision,
        reasonCode: input.reasonCode,
        decisionNotes: input.notes,
        decidedByUserId: input.actorUserId,
      },
    });

    const nextStatus =
      input.decision === DecisionStatus.awarded
        ? RfqStatus.awarded
        : input.decision === DecisionStatus.cancelled
          ? RfqStatus.cancelled
          : RfqStatus.closed_no_award;
    await tx.rfq.update({
      where: { id: rfq.id },
      data: { status: nextStatus },
    });

    await logEvent(tx, {
      actorUserId: input.actorUserId,
      actorOrganizationId: rfq.buyerOrganizationId,
      entityType: "rfq",
      entityId: rfq.id,
      action: `rfq.${input.decision}`,
      after: {
        selectedVendorProfileId: input.selectedVendorProfileId,
        reasonCode: input.reasonCode,
      },
    });

    return decision;
  });
}

export async function postRfqMessage(
  db: Db,
  args: {
    rfqId: string;
    body: string;
    senderUserId?: string;
    senderOrgId?: string;
    messageType?: import("@/generated/prisma").MessageType;
    visibility?: import("@/generated/prisma").MessageVisibility;
  },
) {
  if (!args.body?.trim()) throw new ValidationError("message body required");
  return withTx(db, async (tx) => {
    return tx.rfqMessage.create({
      data: {
        id: newId(),
        rfqId: args.rfqId,
        body: args.body.trim(),
        senderUserId: args.senderUserId,
        senderOrgId: args.senderOrgId,
        messageType: args.messageType ?? "comment",
        visibility: args.visibility ?? "internal",
      },
    });
  });
}
