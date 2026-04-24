/**
 * Seed: multi-region reference data for security staffing.
 * India + United States + Europe, with region-scoped verification
 * checklists and sample vendors.
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
  Region,
  ReviewStatus,
  ReviewType,
  VendorSource,
  VerificationStatus,
} from "../src/generated/prisma";
import { newId } from "../src/lib/id";
import { REGION_DEFAULT_CURRENCY } from "../src/lib/region";

const prisma = new PrismaClient();

const SECURITY_CATEGORY_CODE = "security_staffing";

type CitySpec = { name: string; state: string; country: string };

const CITIES: Record<Region, CitySpec[]> = {
  IN: [
    { name: "Bengaluru", state: "KA", country: "IN" },
    { name: "Hyderabad", state: "TG", country: "IN" },
    { name: "Mumbai", state: "MH", country: "IN" },
  ],
  US: [
    { name: "New York", state: "NY", country: "US" },
    { name: "San Francisco", state: "CA", country: "US" },
    { name: "Los Angeles", state: "CA", country: "US" },
    { name: "Chicago", state: "IL", country: "US" },
    { name: "Boston", state: "MA", country: "US" },
  ],
  EU: [
    { name: "London", state: "ENG", country: "GB" },
    { name: "Berlin", state: "BE", country: "DE" },
    { name: "Paris", state: "IDF", country: "FR" },
    { name: "Amsterdam", state: "NH", country: "NL" },
    { name: "Madrid", state: "MD", country: "ES" },
  ],
};

type ChecklistItem = {
  code: string;
  label: string;
  region: Region | null;
  required?: boolean;
};

const CHECKLIST: ChecklistItem[] = [
  // Global
  { code: "serviceability_confirmed", label: "Serviceability city confirmed", region: null },
  { code: "escalation_contact", label: "Escalation contact present", region: null },
  { code: "replacement_sla_stated", label: "Replacement SLA stated", region: null },
  // India
  { code: "gst_verified", label: "GST verified", region: Region.IN },
  { code: "psara_provided", label: "PSARA license provided", region: Region.IN },
  { code: "epf_registration", label: "EPF registration provided", region: Region.IN },
  { code: "esi_registration", label: "ESI registration provided", region: Region.IN },
  // United States
  { code: "ein_verified", label: "EIN verified", region: Region.US },
  { code: "state_security_license", label: "State security company license on file", region: Region.US },
  { code: "workers_comp", label: "Workers' compensation insurance active", region: Region.US },
  // Europe
  { code: "vat_registered", label: "VAT registration verified", region: Region.EU },
  { code: "local_security_license", label: "Local (country-level) security license on file", region: Region.EU },
  { code: "gdpr_register", label: "GDPR data-processing register in place", region: Region.EU },
];

type VendorSeed = {
  name: string;
  region: Region;
  cityIndex?: number;
  profile: ProfileStatus;
  verification: VerificationStatus;
  source: VendorSource;
};

const VENDORS: VendorSeed[] = [
  // India
  { name: "Karnataka Watch & Ward", region: Region.IN, cityIndex: 0, profile: ProfileStatus.active, verification: VerificationStatus.verified, source: VendorSource.ops },
  { name: "Bengaluru Secure Solutions", region: Region.IN, cityIndex: 0, profile: ProfileStatus.active, verification: VerificationStatus.verified, source: VendorSource.vendor_signup },
  { name: "Whitefield Guard Services", region: Region.IN, cityIndex: 0, profile: ProfileStatus.under_review, verification: VerificationStatus.pending, source: VendorSource.vendor_signup },
  { name: "Electronic City Sentries", region: Region.IN, cityIndex: 0, profile: ProfileStatus.in_progress, verification: VerificationStatus.unverified, source: VendorSource.ops },
  { name: "Hosur Road Security Co", region: Region.IN, cityIndex: 0, profile: ProfileStatus.draft, verification: VerificationStatus.unverified, source: VendorSource.scrape },
  // United States
  { name: "Gotham Protective Services", region: Region.US, cityIndex: 0, profile: ProfileStatus.active, verification: VerificationStatus.verified, source: VendorSource.ops },
  { name: "Bay Area Security Group", region: Region.US, cityIndex: 1, profile: ProfileStatus.active, verification: VerificationStatus.verified, source: VendorSource.vendor_signup },
  { name: "Chicago Guardian Inc", region: Region.US, cityIndex: 3, profile: ProfileStatus.under_review, verification: VerificationStatus.pending, source: VendorSource.vendor_signup },
  // Europe
  { name: "Thames Valley Security Ltd", region: Region.EU, cityIndex: 0, profile: ProfileStatus.active, verification: VerificationStatus.verified, source: VendorSource.ops },
  { name: "Berlin Wachdienst GmbH", region: Region.EU, cityIndex: 1, profile: ProfileStatus.active, verification: VerificationStatus.verified, source: VendorSource.vendor_signup },
  { name: "Paris Gardiennage SAS", region: Region.EU, cityIndex: 2, profile: ProfileStatus.under_review, verification: VerificationStatus.pending, source: VendorSource.vendor_signup },
];

async function main() {
  // Cities
  const citiesByRegion: Record<Region, Array<{ id: string }>> = {
    IN: [],
    US: [],
    EU: [],
  };
  for (const region of Object.keys(CITIES) as Region[]) {
    for (const spec of CITIES[region]) {
      const city = await prisma.city.upsert({
        where: { name_state: { name: spec.name, state: spec.state } },
        create: {
          id: newId(),
          name: spec.name,
          state: spec.state,
          country: spec.country,
        },
        update: {},
      });
      citiesByRegion[region].push({ id: city.id });
    }
  }

  // Service category
  const security = await prisma.serviceCategory.upsert({
    where: { code: SECURITY_CATEGORY_CODE },
    create: { id: newId(), code: SECURITY_CATEGORY_CODE, label: "Security staffing" },
    update: {},
  });

  // Region-scoped verification checklist
  for (const [idx, item] of CHECKLIST.entries()) {
    await prisma.verificationChecklistItem.upsert({
      where: {
        serviceCategoryId_code: { serviceCategoryId: security.id, code: item.code },
      },
      create: {
        id: newId(),
        serviceCategoryId: security.id,
        code: item.code,
        label: item.label,
        region: item.region,
        required: item.required ?? true,
        sortOrder: idx,
      },
      update: {
        label: item.label,
        region: item.region,
        sortOrder: idx,
      },
    });
  }

  // Internal ops + admin user
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

  // One sample buyer per region
  const buyers: Array<{
    id: string;
    legalName: string;
    displayName: string;
    region: Region;
    buyerEmail: string;
    buyerName: string;
  }> = [
    {
      id: "00000000000000000000000002",
      legalName: "Acme Logistics Pvt Ltd",
      displayName: "Acme Logistics",
      region: Region.IN,
      buyerEmail: "priya@acme.test",
      buyerName: "Priya Sharma",
    },
    {
      id: "00000000000000000000000003",
      legalName: "Northstar Retail Inc",
      displayName: "Northstar Retail",
      region: Region.US,
      buyerEmail: "rachel@northstar.test",
      buyerName: "Rachel Chen",
    },
    {
      id: "00000000000000000000000004",
      legalName: "Meridian Offices BV",
      displayName: "Meridian Offices",
      region: Region.EU,
      buyerEmail: "lukas@meridian.test",
      buyerName: "Lukas Vermeer",
    },
  ];
  for (const b of buyers) {
    const org = await prisma.organization.upsert({
      where: { id: b.id },
      create: {
        id: b.id,
        type: OrganizationType.buyer,
        legalName: b.legalName,
        displayName: b.displayName,
        region: b.region,
        defaultCurrency: REGION_DEFAULT_CURRENCY[b.region],
      },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { email: b.buyerEmail },
      create: { id: newId(), email: b.buyerEmail, name: b.buyerName },
      update: {},
    });
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId_role: {
          organizationId: org.id,
          userId: user.id,
          role: MembershipRole.buyer_admin,
        },
      },
      create: {
        id: newId(),
        organizationId: org.id,
        userId: user.id,
        role: MembershipRole.buyer_admin,
      },
      update: {},
    });
  }

  // Seed vendors
  for (const v of VENDORS) {
    const existing = await prisma.organization.findFirst({
      where: { legalName: v.name },
      include: { vendorProfile: true },
    });
    if (existing?.vendorProfile) continue;

    const org =
      existing ??
      (await prisma.organization.create({
        data: {
          id: newId(),
          type: OrganizationType.vendor,
          legalName: v.name,
          displayName: v.name,
          region: v.region,
          defaultCurrency: REGION_DEFAULT_CURRENCY[v.region],
        },
      }));

    const hqCity = citiesByRegion[v.region][v.cityIndex ?? 0];
    const profile = await prisma.vendorProfile.create({
      data: {
        id: newId(),
        organizationId: org.id,
        hqCityId: hqCity?.id,
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
    if (hqCity) {
      await prisma.vendorServiceArea.create({
        data: { id: newId(), vendorProfileId: profile.id, cityId: hqCity.id },
      });
    }

    if (v.verification === VerificationStatus.verified) {
      const complianceTypes: ComplianceType[] =
        v.region === Region.IN
          ? [ComplianceType.gst, ComplianceType.psara]
          : v.region === Region.US
            ? [
                ComplianceType.ein,
                ComplianceType.us_state_security_license,
                ComplianceType.workers_comp,
              ]
            : [ComplianceType.vat, ComplianceType.eu_security_license];
      await prisma.vendorComplianceRecord.createMany({
        data: complianceTypes.map((ct) => ({
          id: newId(),
          vendorProfileId: profile.id,
          complianceType: ct,
          status: ComplianceStatus.active,
        })),
      });
    }
  }

  // Open a region-aware review for any vendor in submitted/under_review without one.
  const inFlight = await prisma.vendorProfile.findMany({
    where: {
      profileStatus: {
        in: [ProfileStatus.submitted, ProfileStatus.under_review],
      },
    },
    include: {
      reviews: {
        where: { status: { in: [ReviewStatus.pending, ReviewStatus.in_review] } },
      },
      serviceCategories: true,
      organization: true,
    },
  });
  for (const v of inFlight) {
    if (v.reviews.length > 0) continue;
    const review = await prisma.verificationReview.create({
      data: { id: newId(), vendorProfileId: v.id, reviewType: ReviewType.initial },
    });
    const primary =
      v.serviceCategories.find((c) => c.primaryCategory) ?? v.serviceCategories[0];
    if (primary) {
      const items = await prisma.verificationChecklistItem.findMany({
        where: {
          serviceCategoryId: primary.serviceCategoryId,
          active: true,
          OR: [{ region: v.organization.region }, { region: null }],
        },
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
    vendorProfilesByRegion: {
      IN: await prisma.vendorProfile.count({
        where: { organization: { region: Region.IN } },
      }),
      US: await prisma.vendorProfile.count({
        where: { organization: { region: Region.US } },
      }),
      EU: await prisma.vendorProfile.count({
        where: { organization: { region: Region.EU } },
      }),
    },
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
