import {
  ProfileStatus,
  type Prisma,
  type PrismaClient,
  QuoteSubmissionStatus,
  RfqStatus,
  VerificationStatus,
} from "@prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { logEvent } from "@/server/services/audit/log-event";

export type CreateQuoteInput = {
  rfqId: string;
  vendorProfileId: string;
  createdByUserId: string;
  currency?: string;
  billingUnit?: string;
  monthlySubtotal?: Prisma.Decimal | number | string;
  statutoryCostTotal?: Prisma.Decimal | number | string;
  serviceFeeTotal?: Prisma.Decimal | number | string;
  grandTotal?: Prisma.Decimal | number | string;
  assumptions?: Prisma.InputJsonValue;
  validUntil?: Date;
  lineItems?: Array<{
    lineType: import("@prisma/client").QuoteLineType;
    label: string;
    quantity?: Prisma.Decimal | number | string;
    unit?: string;
    unitPrice?: Prisma.Decimal | number | string;
    amount?: Prisma.Decimal | number | string;
    notes?: string;
  }>;
};

/**
 * Always creates a NEW draft version. Submitted quotes are immutable;
 * a vendor edits by adding a version, not by overwriting.
 */
export async function createQuote(db: PrismaClient, input: CreateQuoteInput) {
  return db.$transaction(async (tx) => {
    const recipient = await tx.rfqRecipient.findUnique({
      where: {
        rfqId_vendorProfileId: { rfqId: input.rfqId, vendorProfileId: input.vendorProfileId },
      },
      include: {
        rfq: true,
        vendorProfile: true,
      },
    });
    if (!recipient) {
      throw new ValidationError("vendor was not invited to this RFQ");
    }
    if (recipient.rfq.status !== RfqStatus.collecting_quotes) {
      throw new ValidationError(
        `cannot create a quote while RFQ is in state ${recipient.rfq.status}`,
      );
    }
    if (
      recipient.rfq.responseDeadline &&
      recipient.rfq.responseDeadline.getTime() <= Date.now()
    ) {
      throw new ValidationError("RFQ response deadline has passed");
    }
    if (recipient.recipientStatus === "declined" || recipient.recipientStatus === "expired") {
      throw new ValidationError("vendor can no longer respond to this RFQ");
    }
    if (recipient.vendorProfile.profileStatus !== ProfileStatus.active) {
      throw new ValidationError("inactive vendor cannot submit quotes");
    }
    if (recipient.vendorProfile.verificationStatus !== VerificationStatus.verified) {
      throw new ValidationError("unverified vendor cannot submit quotes");
    }

    const last = await tx.quote.findFirst({
      where: { rfqId: input.rfqId, vendorProfileId: input.vendorProfileId },
      orderBy: { versionNumber: "desc" },
    });
    const versionNumber = (last?.versionNumber ?? 0) + 1;

    const quote = await tx.quote.create({
      data: {
        id: newId(),
        rfqId: input.rfqId,
        vendorProfileId: input.vendorProfileId,
        versionNumber,
        currency: input.currency ?? "INR",
        billingUnit: input.billingUnit ?? "pgpm",
        monthlySubtotal: input.monthlySubtotal as Prisma.Decimal | undefined,
        statutoryCostTotal: input.statutoryCostTotal as Prisma.Decimal | undefined,
        serviceFeeTotal: input.serviceFeeTotal as Prisma.Decimal | undefined,
        grandTotal: input.grandTotal as Prisma.Decimal | undefined,
        assumptionsJson: input.assumptions,
        validUntil: input.validUntil,
        submissionStatus: QuoteSubmissionStatus.draft,
        createdByUserId: input.createdByUserId,
      },
    });

    if (input.lineItems?.length) {
      await tx.quoteLineItem.createMany({
        data: input.lineItems.map((li) => ({
          id: newId(),
          quoteId: quote.id,
          lineType: li.lineType,
          label: li.label,
          quantity: li.quantity as Prisma.Decimal | undefined,
          unit: li.unit,
          unitPrice: li.unitPrice as Prisma.Decimal | undefined,
          amount: li.amount as Prisma.Decimal | undefined,
          notes: li.notes,
        })),
      });
    }

    await logEvent(tx, {
      actorUserId: input.createdByUserId,
      entityType: "quote",
      entityId: quote.id,
      action: "quote.draft_created",
      after: { rfqId: quote.rfqId, vendorProfileId: quote.vendorProfileId, versionNumber },
    });

    return quote;
  });
}

export async function submitQuote(
  db: PrismaClient,
  args: { quoteId: string; actorUserId: string },
) {
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: args.quoteId },
      include: { rfq: true, vendorProfile: true },
    });
    if (!quote) throw new NotFoundError("quote", args.quoteId);
    if (quote.submissionStatus !== QuoteSubmissionStatus.draft) {
      throw new ValidationError(
        `cannot submit a quote in state ${quote.submissionStatus}; create a new version`,
      );
    }

    if (quote.rfq.status !== RfqStatus.collecting_quotes) {
      throw new ValidationError(
        `cannot submit a quote while RFQ is in state ${quote.rfq.status}`,
      );
    }
    if (quote.rfq.responseDeadline && quote.rfq.responseDeadline.getTime() <= Date.now()) {
      throw new ValidationError("RFQ response deadline has passed");
    }
    if (quote.vendorProfile.profileStatus !== ProfileStatus.active) {
      throw new ValidationError("inactive vendor cannot submit quotes");
    }
    if (quote.vendorProfile.verificationStatus !== VerificationStatus.verified) {
      throw new ValidationError("unverified vendor cannot submit quotes");
    }

    const recipient = await tx.rfqRecipient.findUnique({
      where: {
        rfqId_vendorProfileId: {
          rfqId: quote.rfqId,
          vendorProfileId: quote.vendorProfileId,
        },
      },
    });
    if (!recipient) {
      throw new ValidationError("vendor is no longer an RFQ recipient");
    }
    if (recipient.recipientStatus === "declined" || recipient.recipientStatus === "expired") {
      throw new ValidationError("vendor can no longer respond to this RFQ");
    }

    // Mark earlier submitted versions for the same (rfq, vendor) as superseded.
    await tx.quote.updateMany({
      where: {
        rfqId: quote.rfqId,
        vendorProfileId: quote.vendorProfileId,
        submissionStatus: QuoteSubmissionStatus.submitted,
        id: { not: quote.id },
      },
      data: { submissionStatus: QuoteSubmissionStatus.superseded },
    });

    const submitted = await tx.quote.update({
      where: { id: quote.id },
      data: {
        submissionStatus: QuoteSubmissionStatus.submitted,
        submittedAt: new Date(),
      },
    });

    await tx.rfqRecipient.update({
      where: {
        rfqId_vendorProfileId: {
          rfqId: quote.rfqId,
          vendorProfileId: quote.vendorProfileId,
        },
      },
      data: { recipientStatus: "responded", respondedAt: new Date() },
    });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "quote",
      entityId: submitted.id,
      action: "quote.submitted",
      after: { versionNumber: submitted.versionNumber, submittedAt: submitted.submittedAt },
    });

    return submitted;
  });
}
