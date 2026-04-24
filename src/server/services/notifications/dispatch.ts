import {
  type Prisma,
  type PrismaClient,
  NotificationChannel,
  NotificationStatus,
} from "@/generated/prisma";
import { newId } from "@/lib/id";

export type NotificationTemplateKey =
  | "vendor_claim_invite"
  | "vendor_submission_received"
  | "vendor_changes_requested"
  | "vendor_verification_approved"
  | "vendor_verification_rejected";

export type DispatchInput = {
  templateKey: NotificationTemplateKey;
  channel: NotificationChannel;
  organizationId?: string | null;
  userId?: string | null;
  payload?: Prisma.InputJsonValue;
};

/**
 * V1 dispatcher: writes a record to `notifications` and immediately marks it
 * sent. A real provider integration (transactional email, SMS) replaces the
 * inner `deliver` call without touching callers.
 */
export async function dispatchNotification(
  db: PrismaClient | Prisma.TransactionClient,
  input: DispatchInput,
) {
  const created = await db.notification.create({
    data: {
      id: newId(),
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      channel: input.channel,
      templateKey: input.templateKey,
      payloadJson: input.payload,
      status: NotificationStatus.queued,
    },
  });

  try {
    await deliver(input);
    return await db.notification.update({
      where: { id: created.id },
      data: { status: NotificationStatus.sent, sentAt: new Date() },
    });
  } catch (err) {
    return await db.notification.update({
      where: { id: created.id },
      data: {
        status: NotificationStatus.failed,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

async function deliver(input: DispatchInput): Promise<void> {
  // V1: stdout. Replace with provider integration in production.
  if (process.env.NODE_ENV !== "test") {
    console.log(
      `[notify:${input.channel}] template=${input.templateKey}`,
      input.payload ?? {},
    );
  }
}
