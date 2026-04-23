/**
 * Seed: Bengaluru, security_staffing category, one ops org, one buyer org,
 * five sample vendors at varying lifecycle stages, plus checklist items.
 *
 * Idempotent: re-running upserts reference data and skips duplicates.
 */
import {
  ComplianceStatus,
  ComplianceType,
  MembershipRole,
  OrganizationType,
  PrismaClient,
  ProfileStatus,
  ReviewStatus,
  ReviewType,
  VendorSource,
  VerificationStatus,
} from "@prisma/client";
import { newId } from "../src/lib/id";

const prisma = new PrismaClient();

const SECURITY_CATEGORY_CODE = "security_staffing";

async function main() {
  // Cities
  const blr = await prisma.city.upsert({
    where: { name_state: { name: "Bengaluru", state: "KA" } },
    create: { id: newId(), name: "Bengaluru", state: "KA" },
    update: {},
  });

  // Service categories
  const security = await prisma.serviceCategory.upsert({
    where: { code: SECURITY_CATEGORY_CODE },
    create: { id: newId(), code: SECURITY_CATEGORY_CODE, label: "Security staffing" },
    update: {},
  });

  // Verification checklist (security_staffing)
  const checklist = [
    { code: "gst_verified", label: "GST verified" },
    { code: "psara_provided", label: "PSARA license provided" },
    { code: "epf_registration", label: "EPF registration provided" },
    { code: "esi_registration", label: "ESI registration provided" },
    { code: "serviceability_confirmed", label: "Serviceability city confirmed" },
    { code: "escalation_contact", label: "Escalation contact present" },
    { code: "replacement_sla_stated", label: "Replacement SLA stated" },
  ];
  for (const [idx, item] of checklist.entries()) {
    await prisma.verificationChecklistItem.upsert({
      where: { serviceCategoryId_code: { serviceCategoryId: security.id, code: item.code } },
      create: {
        id: newId(),
        serviceCategoryId: security.id,
        code: item.code,
        label: item.label,
        sortOrder: idx,
      },
      update: { label: item.label, sortOrder: idx },
    });
  }

  // Internal ops org + admin user
  const opsOrg = await prisma.organization.upsert({
    where: { id: "00000000000000000000000001" },
    create: {
      id: "00000000000000000000000001",
      type: OrganizationType.internal,
      legalName: "Discovery Layer Ops",
      displayName: "Discovery Layer Ops",
    },
    update: {},
  });
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@konic.net";
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    create: { id: newId(), email: adminEmail, name: "Ops Admin" },
    update: {},
  });
  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId_role: {
        organizationId: opsOrg.id,
        userId: adminUser.id,
        role: MembershipRole.ops_admin,
      },
    },
    create: {
      id: newId(),
      organizationId: opsOrg.id,
      userId: adminUser.id,
      role: MembershipRole.ops_admin,
    },
    update: {},
  });

  // Sample buyer
  const buyerOrg = await prisma.organization.upsert({
    where: { id: "00000000000000000000000002" },
    create: {
      id: "00000000000000000000000002",
      type: OrganizationType.buyer,
      legalName: "Acme Logistics Pvt Ltd",
      displayName: "Acme Logistics",
    },
    update: {},
  });
  const buyerUser = await prisma.user.upsert({
    where: { email: "priya@acme.test" },
    create: { id: newId(), email: "priya@acme.test", name: "Priya Sharma" },
    update: {},
  });
  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId_role: {
        organizationId: buyerOrg.id,
        userId: buyerUser.id,
        role: MembershipRole.buyer_admin,
      },
    },
    create: {
      id: newId(),
      organizationId: buyerOrg.id,
      userId: buyerUser.id,
      role: MembershipRole.buyer_admin,
    },
    update: {},
  });

  // Five sample vendors at different lifecycle stages
  const vendors = [
    { name: "Karnataka Watch & Ward", profile: ProfileStatus.active, verification: VerificationStatus.verified, source: VendorSource.ops },
    { name: "Bengaluru Secure Solutions", profile: ProfileStatus.active, verification: VerificationStatus.verified, source: VendorSource.vendor_signup },
    { name: "Whitefield Guard Services", profile: ProfileStatus.under_review, verification: VerificationStatus.pending, source: VendorSource.vendor_signup },
    { name: "Electronic City Sentries", profile: ProfileStatus.in_progress, verification: VerificationStatus.unverified, source: VendorSource.ops },
    { name: "Hosur Road Security Co", profile: ProfileStatus.draft, verification: VerificationStatus.unverified, source: VendorSource.scrape },
  ];

  for (const v of vendors) {
    const existing = await prisma.organization.findFirst({
      where: { legalName: v.name },
      include: { vendorProfile: true },
    });
    if (existing?.vendorProfile) continue;

    const org = existing ?? (await prisma.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.vendor,
        legalName: v.name,
        displayName: v.name,
      },
    }));

    const profile = await prisma.vendorProfile.create({
      data: {
        id: newId(),
        organizationId: org.id,
        hqCityId: blr.id,
        profileStatus: v.profile,
        verificationStatus: v.verification,
        createdBySource: v.source,
        verifiedAt: v.verification === VerificationStatus.verified ? new Date() : null,
      },
    });

    await prisma.vendorServiceCategory.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        serviceCategoryId: security.id,
        primaryCategory: true,
      },
    });

    await prisma.vendorServiceArea.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        cityId: blr.id,
      },
    });

    if (v.verification === VerificationStatus.verified) {
      await prisma.vendorComplianceRecord.createMany({
        data: [
          {
            id: newId(),
            vendorProfileId: profile.id,
            complianceType: ComplianceType.gst,
            status: ComplianceStatus.active,
          },
          {
            id: newId(),
            vendorProfileId: profile.id,
            complianceType: ComplianceType.psara,
            status: ComplianceStatus.active,
          },
        ],
      });
    }
  }

  // Open a review for any vendor in submitted/under_review without one.
  const inFlight = await prisma.vendorProfile.findMany({
    where: { profileStatus: { in: [ProfileStatus.submitted, ProfileStatus.under_review] } },
    include: {
      reviews: { where: { status: { in: [ReviewStatus.pending, ReviewStatus.in_review] } } },
      serviceCategories: true,
    },
  });
  for (const v of inFlight) {
    if (v.reviews.length > 0) continue;
    const review = await prisma.verificationReview.create({
      data: { id: newId(), vendorProfileId: v.id, reviewType: ReviewType.initial },
    });
    const primary = v.serviceCategories.find((c) => c.primaryCategory) ?? v.serviceCategories[0];
    if (primary) {
      const items = await prisma.verificationChecklistItem.findMany({
        where: { serviceCategoryId: primary.serviceCategoryId, active: true },
      });
      if (items.length > 0) {
        await prisma.verificationReviewItem.createMany({
          data: items.map((c) => ({
            id: newId(),
            verificationReviewId: review.id,
            checklistItemId: c.id,
          })),
        });
      }
    }
  }

  const stats = {
    cities: await prisma.city.count(),
    categories: await prisma.serviceCategory.count(),
    checklistItems: await prisma.verificationChecklistItem.count(),
    organizations: await prisma.organization.count(),
    vendorProfiles: await prisma.vendorProfile.count(),
    users: await prisma.user.count(),
    openReviews: await prisma.verificationReview.count({
      where: { status: { in: [ReviewStatus.pending, ReviewStatus.in_review] } },
    }),
  };
  console.log("seed complete:", stats);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
