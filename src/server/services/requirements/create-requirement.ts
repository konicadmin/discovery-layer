import { type Prisma, type PrismaClient, RequirementStatus } from "@prisma/client";
import { newId } from "@/lib/id";
import { logEvent } from "@/server/services/audit/log-event";

export type CreateRequirementInput = {
  buyerOrganizationId: string;
  title: string;
  serviceCategoryId: string;
  cityId: string;
  siteType?: string;
  headcountRequired?: number;
  shiftPattern?: string;
  reliefRequired?: boolean;
  contractTermMonths?: number;
  startDate?: Date;
  complianceRequirements?: Prisma.InputJsonValue;
  specialRequirements?: Prisma.InputJsonValue;
  createdByUserId: string;
};

export async function createRequirement(db: PrismaClient, input: CreateRequirementInput) {
  return db.$transaction(async (tx) => {
    const requirement = await tx.buyerRequirement.create({
      data: {
        id: newId(),
        buyerOrganizationId: input.buyerOrganizationId,
        title: input.title,
        serviceCategoryId: input.serviceCategoryId,
        cityId: input.cityId,
        siteType: input.siteType,
        headcountRequired: input.headcountRequired,
        shiftPattern: input.shiftPattern,
        reliefRequired: input.reliefRequired ?? false,
        contractTermMonths: input.contractTermMonths,
        startDate: input.startDate,
        complianceRequirementsJson: input.complianceRequirements,
        specialRequirementsJson: input.specialRequirements,
        status: RequirementStatus.draft,
        createdByUserId: input.createdByUserId,
      },
    });

    await logEvent(tx, {
      actorUserId: input.createdByUserId,
      actorOrganizationId: input.buyerOrganizationId,
      entityType: "buyer_requirement",
      entityId: requirement.id,
      action: "requirement.created",
      after: {
        title: requirement.title,
        cityId: requirement.cityId,
        serviceCategoryId: requirement.serviceCategoryId,
      },
    });

    return requirement;
  });
}
