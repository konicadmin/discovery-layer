import { ProfileStatus, type PrismaClient, VerificationStatus } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { logEvent } from "@/server/services/audit/log-event";
import {
  assertProfileTransition,
  assertVerificationTransition,
} from "./state-machine";

export type TransitionInput = {
  vendorProfileId: string;
  toProfileStatus?: ProfileStatus;
  toVerificationStatus?: VerificationStatus;
  actorUserId?: string;
  notes?: string;
};

export async function transitionVendor(db: PrismaClient, input: TransitionInput) {
  return db.$transaction(async (tx) => {
    const profile = await tx.vendorProfile.findUnique({
      where: { id: input.vendorProfileId },
    });
    if (!profile) throw new NotFoundError("vendor_profile", input.vendorProfileId);

    const before = {
      profileStatus: profile.profileStatus,
      verificationStatus: profile.verificationStatus,
    };

    if (input.toProfileStatus) {
      assertProfileTransition(profile.profileStatus, input.toProfileStatus);
    }
    if (input.toVerificationStatus) {
      assertVerificationTransition(profile.verificationStatus, input.toVerificationStatus);
    }

    const updated = await tx.vendorProfile.update({
      where: { id: profile.id },
      data: {
        profileStatus: input.toProfileStatus ?? profile.profileStatus,
        verificationStatus: input.toVerificationStatus ?? profile.verificationStatus,
        verifiedAt:
          input.toVerificationStatus === VerificationStatus.verified
            ? new Date()
            : profile.verifiedAt,
      },
    });

    await logEvent(tx, {
      actorUserId: input.actorUserId,
      actorOrganizationId: profile.organizationId,
      entityType: "vendor_profile",
      entityId: profile.id,
      action: "vendor.transitioned",
      before,
      after: {
        profileStatus: updated.profileStatus,
        verificationStatus: updated.verificationStatus,
      },
      context: input.notes ? { notes: input.notes } : undefined,
    });

    return updated;
  });
}
