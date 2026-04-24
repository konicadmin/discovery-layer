import { randomBytes } from "node:crypto";
import {
  ClaimStatus,
  MembershipRole,
  NotificationChannel,
} from "@prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";
import { dispatchNotification } from "@/server/services/notifications/dispatch";

const CLAIM_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SendClaimInput = {
  vendorProfileId: string;
  email?: string;
  phone?: string;
  actorUserId?: string;
};

export async function sendClaim(db: Db, input: SendClaimInput) {
  if (!input.email && !input.phone) {
    throw new ValidationError("email or phone required for claim");
  }

  return withTx(db, async (tx) => {
    const profile = await tx.vendorProfile.findUnique({
      where: { id: input.vendorProfileId },
      include: { organization: true },
    });
    if (!profile) throw new NotFoundError("vendor_profile", input.vendorProfileId);

    await tx.vendorClaim.updateMany({
      where: { vendorProfileId: profile.id, status: ClaimStatus.pending },
      data: { status: ClaimStatus.cancelled },
    });

    const claim = await tx.vendorClaim.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        claimEmail: input.email ?? null,
        claimPhone: input.phone ?? null,
        claimToken: randomBytes(24).toString("base64url"),
        expiresAt: new Date(Date.now() + CLAIM_TTL_MS),
      },
    });

    await dispatchNotification(tx, {
      templateKey: "vendor_claim_invite",
      channel: input.email ? NotificationChannel.email : NotificationChannel.sms,
      organizationId: profile.organizationId,
      payload: {
        vendorName: profile.organization.displayName,
        claimToken: claim.claimToken,
        expiresAt: claim.expiresAt.toISOString(),
        target: input.email ?? input.phone,
      },
    });

    await logEvent(tx, {
      actorUserId: input.actorUserId,
      actorOrganizationId: profile.organizationId,
      entityType: "vendor_profile",
      entityId: profile.id,
      action: "vendor.claim_sent",
      after: { claimId: claim.id, target: input.email ?? input.phone },
    });

    return claim;
  });
}

export type AcceptClaimInput = {
  claimToken: string;
  user:
    | { existingUserId: string }
    | { name: string; email?: string; phone?: string };
};

/**
 * Accepts a claim. If `existingUserId` is provided, that user becomes the
 * vendor_admin. Otherwise a new user is created from the supplied identity.
 *
 * Expired-claim detection runs in its own transaction before the accept
 * transaction so that the `expired` state update survives even when the
 * accept attempt throws.
 */
export async function acceptClaim(db: Db, input: AcceptClaimInput) {
  // Pre-check: expiry state transition must persist independently.
  await withTx(db, async (tx) => {
    const claim = await tx.vendorClaim.findUnique({
      where: { claimToken: input.claimToken },
    });
    if (!claim) return;
    if (claim.status === ClaimStatus.pending && claim.expiresAt.getTime() < Date.now()) {
      await tx.vendorClaim.update({
        where: { id: claim.id },
        data: { status: ClaimStatus.expired },
      });
    }
  });

  return withTx(db, async (tx) => {
    const claim = await tx.vendorClaim.findUnique({
      where: { claimToken: input.claimToken },
      include: { vendorProfile: true },
    });
    if (!claim) throw new NotFoundError("vendor_claim", input.claimToken);
    if (claim.status === ClaimStatus.expired) {
      throw new ValidationError("claim has expired");
    }
    if (claim.status !== ClaimStatus.pending) {
      throw new ValidationError(`claim is in state ${claim.status}`);
    }

    let userId: string;
    if ("existingUserId" in input.user) {
      userId = input.user.existingUserId;
    } else {
      const user = await tx.user.create({
        data: {
          id: newId(),
          name: input.user.name,
          email: input.user.email ?? null,
          phone: input.user.phone ?? null,
        },
      });
      userId = user.id;
    }

    await tx.organizationMembership.upsert({
      where: {
        organizationId_userId_role: {
          organizationId: claim.vendorProfile.organizationId,
          userId,
          role: MembershipRole.vendor_admin,
        },
      },
      create: {
        id: newId(),
        organizationId: claim.vendorProfile.organizationId,
        userId,
        role: MembershipRole.vendor_admin,
      },
      update: {},
    });

    const updatedClaim = await tx.vendorClaim.update({
      where: { id: claim.id },
      data: {
        status: ClaimStatus.claimed,
        claimedByUserId: userId,
      },
    });

    await tx.vendorProfile.update({
      where: { id: claim.vendorProfileId },
      data: { claimedAt: new Date() },
    });

    await logEvent(tx, {
      actorUserId: userId,
      actorOrganizationId: claim.vendorProfile.organizationId,
      entityType: "vendor_profile",
      entityId: claim.vendorProfileId,
      action: "vendor.claim_accepted",
      after: { claimId: claim.id, userId },
    });

    return { claim: updatedClaim, userId };
  });
}
