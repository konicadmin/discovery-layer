import type { Prisma, PrismaClient } from "@prisma/client";
import { newId } from "@/lib/id";

export type LogEventInput = {
  actorUserId?: string | null;
  actorOrganizationId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  context?: Prisma.InputJsonValue;
};

export async function logEvent(
  db: PrismaClient | Prisma.TransactionClient,
  input: LogEventInput,
): Promise<void> {
  await db.auditEvent.create({
    data: {
      id: newId(),
      actorUserId: input.actorUserId ?? null,
      actorOrganizationId: input.actorOrganizationId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeJson: input.before,
      afterJson: input.after,
      contextJson: input.context,
    },
  });
}
