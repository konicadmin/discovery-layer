import { describe, it, expect } from "vitest";
import { ProfileStatus, VerificationStatus } from "@prisma/client";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { createVendor } from "@/server/services/vendors/create-vendor";
import { transitionVendor } from "@/server/services/verification/transition";
import { allowedNextProfileStatuses } from "@/server/services/verification/state-machine";
import { StateTransitionError } from "@/lib/errors";

async function seedCategory(name: string) {
  const prisma = getPrisma();
  return prisma.serviceCategory.create({
    data: { id: newId(), code: name, label: name },
  });
}

describe("vendor lifecycle", () => {
  it("creates a vendor with org + profile + categories + audit", async () => {
    const prisma = getPrisma();
    const cat = await seedCategory("security_staffing");
    const { organization, profile } = await createVendor(prisma, {
      legalName: "Acme Security Pvt Ltd",
      serviceCategoryIds: [cat.id],
    });

    expect(organization.type).toBe("vendor");
    expect(profile.profileStatus).toBe(ProfileStatus.draft);
    expect(profile.verificationStatus).toBe(VerificationStatus.unverified);

    const cats = await prisma.vendorServiceCategory.findMany({
      where: { vendorProfileId: profile.id },
    });
    expect(cats).toHaveLength(1);
    expect(cats[0]?.primaryCategory).toBe(true);

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: "vendor_profile", entityId: profile.id },
    });
    expect(audit?.action).toBe("vendor.created");
  });

  it("rejects creation without categories", async () => {
    const prisma = getPrisma();
    await expect(
      createVendor(prisma, { legalName: "X", serviceCategoryIds: [] }),
    ).rejects.toThrow(/service category/);
  });

  it("walks through onboarding → verified", async () => {
    const prisma = getPrisma();
    const cat = await seedCategory("security_staffing_2");
    const { profile } = await createVendor(prisma, {
      legalName: "Beta Security",
      serviceCategoryIds: [cat.id],
    });

    await transitionVendor(prisma, {
      vendorProfileId: profile.id,
      toProfileStatus: ProfileStatus.submitted,
    });
    await transitionVendor(prisma, {
      vendorProfileId: profile.id,
      toProfileStatus: ProfileStatus.under_review,
      toVerificationStatus: VerificationStatus.pending,
    });
    const final = await transitionVendor(prisma, {
      vendorProfileId: profile.id,
      toProfileStatus: ProfileStatus.active,
      toVerificationStatus: VerificationStatus.verified,
    });

    expect(final.profileStatus).toBe(ProfileStatus.active);
    expect(final.verificationStatus).toBe(VerificationStatus.verified);
    expect(final.verifiedAt).not.toBeNull();
  });

  it("blocks invalid profile transitions", async () => {
    const prisma = getPrisma();
    const cat = await seedCategory("security_staffing_3");
    const { profile } = await createVendor(prisma, {
      legalName: "Gamma Security",
      serviceCategoryIds: [cat.id],
    });

    // draft → active is not allowed
    await expect(
      transitionVendor(prisma, {
        vendorProfileId: profile.id,
        toProfileStatus: ProfileStatus.active,
      }),
    ).rejects.toBeInstanceOf(StateTransitionError);
  });

  it("exposes allowed transitions for each state", () => {
    expect(allowedNextProfileStatuses(ProfileStatus.draft)).toContain(
      ProfileStatus.submitted,
    );
    expect(allowedNextProfileStatuses(ProfileStatus.active)).not.toContain(
      ProfileStatus.draft,
    );
  });
});
