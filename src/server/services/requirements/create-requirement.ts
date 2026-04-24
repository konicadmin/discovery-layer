import { type Prisma, Region, RequirementStatus } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";

export type CreateRequirementInput = {
  buyerOrganizationId: string;
  region?: Region;
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
  status?: RequirementStatus;
  createdByUserId: string;
};

export async function createRequirement(db: Db, input: CreateRequirementInput) {
  return withTx(db, async (tx) => {
    // Default the region to the buyer organization's region unless overridden.
    let region = input.region;
    if (!region) {
      const buyer = await tx.organization.findUnique({
        where: { id: input.buyerOrganizationId },
      });
      if (!buyer) throw new NotFoundError("organization", input.buyerOrganizationId);
      region = buyer.region;
    }

    const requirement = await tx.buyerRequirement.create({
      data: {
        id: newId(),
        buyerOrganizationId: input.buyerOrganizationId,
        region,
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
        status: input.status ?? RequirementStatus.draft,
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

export async function activateRequirement(
  db: Db,
  args: { requirementId: string; actorUserId: string },
) {
  return withTx(db, async (tx) => {
    const req = await tx.buyerRequirement.update({
      where: { id: args.requirementId },
      data: { status: RequirementStatus.active },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "buyer_requirement",
      entityId: req.id,
      action: "requirement.activated",
      after: { status: req.status },
    });
    return req;
  });
}
