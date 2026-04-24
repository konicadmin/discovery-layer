import { OrganizationType, type PrismaClient, VendorSource } from "@/generated/prisma";
import { newId } from "@/lib/id";
import { ValidationError } from "@/lib/errors";
import { logEvent } from "@/server/services/audit/log-event";

export type CreateVendorInput = {
  legalName: string;
  displayName?: string;
  gstin?: string | null;
  website?: string | null;
  primaryPhone?: string | null;
  hqCityId?: string | null;
  serviceCategoryIds: string[];
  createdBySource?: VendorSource;
  actorUserId?: string;
};

export async function createVendor(db: PrismaClient, input: CreateVendorInput) {
  if (input.serviceCategoryIds.length === 0) {
    throw new ValidationError("at least one service category required");
  }

  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.vendor,
        legalName: input.legalName,
        displayName: input.displayName ?? input.legalName,
        gstin: input.gstin ?? null,
        website: input.website ?? null,
        primaryPhone: input.primaryPhone ?? null,
      },
    });

    const profile = await tx.vendorProfile.create({
      data: {
        id: newId(),
        organizationId: org.id,
        hqCityId: input.hqCityId ?? null,
        createdBySource: input.createdBySource ?? VendorSource.ops,
      },
    });

    for (const [idx, categoryId] of input.serviceCategoryIds.entries()) {
      await tx.vendorServiceCategory.create({
        data: {
          id: newId(),
          vendorProfileId: profile.id,
          serviceCategoryId: categoryId,
          primaryCategory: idx === 0,
        },
      });
    }

    await logEvent(tx, {
      actorUserId: input.actorUserId,
      actorOrganizationId: org.id,
      entityType: "vendor_profile",
      entityId: profile.id,
      action: "vendor.created",
      after: {
        organizationId: org.id,
        vendorProfileId: profile.id,
        createdBySource: profile.createdBySource,
      },
    });

    return { organization: org, profile };
  });
}
