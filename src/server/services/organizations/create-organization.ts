import type { OrganizationType, PrismaClient } from "@/generated/prisma";
import { newId } from "@/lib/id";
import { logEvent } from "@/server/services/audit/log-event";

export type CreateOrganizationInput = {
  type: OrganizationType;
  legalName: string;
  displayName?: string;
  gstin?: string | null;
  website?: string | null;
  primaryPhone?: string | null;
  actorUserId?: string;
};

export async function createOrganization(db: PrismaClient, input: CreateOrganizationInput) {
  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        id: newId(),
        type: input.type,
        legalName: input.legalName,
        displayName: input.displayName ?? input.legalName,
        gstin: input.gstin ?? null,
        website: input.website ?? null,
        primaryPhone: input.primaryPhone ?? null,
      },
    });
    await logEvent(tx, {
      actorUserId: input.actorUserId,
      actorOrganizationId: org.id,
      entityType: "organization",
      entityId: org.id,
      action: "organization.created",
      after: { id: org.id, type: org.type, legalName: org.legalName },
    });
    return org;
  });
}
