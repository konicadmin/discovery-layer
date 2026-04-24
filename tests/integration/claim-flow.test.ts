import { describe, it, expect } from "vitest";
import { ClaimStatus, MembershipRole, OrganizationType } from "@/generated/prisma";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { createVendor } from "@/server/services/vendors/create-vendor";
import { acceptClaim, sendClaim } from "@/server/services/claims/send-claim";

async function setupVendor() {
  const prisma = getPrisma();
  const cat = await prisma.serviceCategory.create({
    data: { id: newId(), code: `c-${newId()}`, label: "test" },
  });
  const { profile, organization } = await createVendor(prisma, {
    legalName: "ScrapedCo",
    serviceCategoryIds: [cat.id],
  });
  return { profile, organization };
}

describe("vendor claim flow", () => {
  it("sends a claim, dispatches a notification, accepts it, attaches vendor_admin", async () => {
    const prisma = getPrisma();
    const { profile, organization } = await setupVendor();

    const claim = await sendClaim(prisma, {
      vendorProfileId: profile.id,
      email: "owner@vendor.test",
    });
    expect(claim.status).toBe(ClaimStatus.pending);

    const notes = await prisma.notification.findMany({
      where: { templateKey: "vendor_claim_invite" },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.status).toBe("sent");

    const result = await acceptClaim(prisma, {
      claimToken: claim.claimToken,
      user: { name: "Owner", email: "owner@vendor.test" },
    });
    expect(result.claim.status).toBe(ClaimStatus.claimed);

    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId: organization.id, userId: result.userId },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe(MembershipRole.vendor_admin);

    const reloaded = await prisma.vendorProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(reloaded.claimedAt).not.toBeNull();
  });

  it("supersedes an earlier pending claim when a new one is sent", async () => {
    const prisma = getPrisma();
    const { profile } = await setupVendor();
    const first = await sendClaim(prisma, {
      vendorProfileId: profile.id,
      email: "a@x.test",
    });
    const second = await sendClaim(prisma, {
      vendorProfileId: profile.id,
      email: "b@x.test",
    });
    const refreshed = await prisma.vendorClaim.findUniqueOrThrow({ where: { id: first.id } });
    expect(refreshed.status).toBe(ClaimStatus.cancelled);
    expect(second.status).toBe(ClaimStatus.pending);
  });

  it("rejects accepting an expired claim", async () => {
    const prisma = getPrisma();
    const { profile } = await setupVendor();
    const claim = await sendClaim(prisma, {
      vendorProfileId: profile.id,
      email: "c@x.test",
    });
    await prisma.vendorClaim.update({
      where: { id: claim.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      acceptClaim(prisma, {
        claimToken: claim.claimToken,
        user: { name: "Late" },
      }),
    ).rejects.toThrow(/expired/);
    const refreshed = await prisma.vendorClaim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(refreshed.status).toBe(ClaimStatus.expired);
  });

  it("rejects a claim send with no email or phone", async () => {
    const prisma = getPrisma();
    const { profile } = await setupVendor();
    await expect(
      sendClaim(prisma, { vendorProfileId: profile.id }),
    ).rejects.toThrow(/email or phone/);
  });

  it("supports binding a claim to an existing user (e.g., signed-in OTP user)", async () => {
    const prisma = getPrisma();
    const { profile, organization } = await setupVendor();
    const existing = await prisma.user.create({
      data: { id: newId(), name: "Existing", email: `e-${newId()}@x.test` },
    });
    const claim = await sendClaim(prisma, {
      vendorProfileId: profile.id,
      email: "anything@x.test",
    });
    const result = await acceptClaim(prisma, {
      claimToken: claim.claimToken,
      user: { existingUserId: existing.id },
    });
    expect(result.userId).toBe(existing.id);
    const m = await prisma.organizationMembership.findFirst({
      where: { userId: existing.id, organizationId: organization.id },
    });
    expect(m?.role).toBe(MembershipRole.vendor_admin);
  });
});

describe("organization shape after vendor creation", () => {
  it("creates a vendor-typed organization", async () => {
    const { organization } = await setupVendor();
    expect(organization.type).toBe(OrganizationType.vendor);
  });
});
