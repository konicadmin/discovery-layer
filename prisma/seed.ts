/**
 * Seed: multi-region reference data.
 *
 * Two seed lanes:
 *   1. Security staffing — region-scoped checklists, India/US/EU sample vendors.
 *   2. SaaS / public pricing — categories with public pricing pages,
 *      sample vendors with published PricingSignal + EvidenceItem rows so
 *      `/pricing`, `/vendors/[slug]`, and `/llms-full.txt` have visible data.
 *
 * Idempotent: re-running upserts reference data and skips duplicates.
 */
import {
  ComplianceStatus,
  ComplianceType,
  DiscoveryMethod,
  EvidenceType,
  MembershipRole,
  OrganizationType,
  PrismaClient,
  PricingSignalStatus,
  PricingSignalType,
  PricingUnit,
  ProfileStatus,
  PublicStatus,
  Region,
  ReviewStatus,
  ReviewType,
  SourceUrlStatus,
  SourceUrlType,
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

  // ─────────────────────────────────────────────────────────────────────────
  // SaaS / public-pricing seed lane.
  // Vendors with publicly discoverable pricing pages get unclaimed_public_record
  // VendorProfile + VendorPublicSnapshot + 2 EvidenceItem + 1+ PublicPricingSignal,
  // so /pricing, /vendors/[slug], and /llms-full.txt have visible data on
  // a fresh DB.
  // ─────────────────────────────────────────────────────────────────────────
  const SAAS_CATEGORIES: Array<{ code: string; label: string }> = [
    { code: "cloud_hosting", label: "Cloud hosting" },
    { code: "payments_processor", label: "Payments processor" },
    { code: "email_api", label: "Transactional email API" },
    { code: "observability", label: "Observability" },
    { code: "ai_inference", label: "AI inference API" },
    { code: "auth_identity", label: "Auth & identity" },
    { code: "crm_saas", label: "CRM" },
    { code: "dev_tools_ci", label: "Developer tools" },
  ];
  const saasCategoryByCode = new Map<string, { id: string; label: string }>();
  for (const c of SAAS_CATEGORIES) {
    const row = await prisma.serviceCategory.upsert({
      where: { code: c.code },
      create: { id: newId(), code: c.code, label: c.label },
      update: { label: c.label },
    });
    saasCategoryByCode.set(c.code, { id: row.id, label: row.label });
  }

  type SaasSignal = {
    signalType: PricingSignalType;
    unit: PricingUnit;
    priceValue: string;
    currency: string;
    extractedText: string;
  };
  type SaasVendor = {
    legalName: string;
    displayName: string;
    website: string;
    domain: string;
    categoryCode: string;
    cityName: string;
    pricingPath: string;
    summary: string;
    signals: SaasSignal[];
  };

  // All real, publicly knowable starting prices — observable on each
  // vendor's pricing page. Prefer `package_monthly` unit for monthly
  // subscriptions; `unspecified` for transactional / per-token pricing.
  const SAAS_VENDORS: SaasVendor[] = [
    {
      legalName: "Stripe, Inc.",
      displayName: "Stripe",
      website: "https://stripe.com",
      domain: "stripe.com",
      categoryCode: "payments_processor",
      cityName: "San Francisco",
      pricingPath: "/pricing",
      summary:
        "Online payments processor. Public pricing for US card transactions is 2.9% + $0.30 per successful charge.",
      signals: [
        {
          signalType: PricingSignalType.starting_price,
          unit: PricingUnit.unspecified,
          priceValue: "0.30",
          currency: "USD",
          extractedText:
            "2.9% + $0.30 per successful card charge — Stripe standard US pricing.",
        },
      ],
    },
    {
      legalName: "Vercel Inc.",
      displayName: "Vercel",
      website: "https://vercel.com",
      domain: "vercel.com",
      categoryCode: "cloud_hosting",
      cityName: "San Francisco",
      pricingPath: "/pricing",
      summary:
        "Frontend cloud hosting. Pro plan starts at $20 per user per month.",
      signals: [
        {
          signalType: PricingSignalType.package_monthly,
          unit: PricingUnit.package_monthly,
          priceValue: "20",
          currency: "USD",
          extractedText:
            "Vercel Pro — $20 per user per month, billed monthly.",
        },
      ],
    },
    {
      legalName: "Cloudflare, Inc.",
      displayName: "Cloudflare",
      website: "https://www.cloudflare.com",
      domain: "cloudflare.com",
      categoryCode: "cloud_hosting",
      cityName: "San Francisco",
      pricingPath: "/plans/",
      summary:
        "Global edge network and CDN. Pro plan starts at $20 per month per domain.",
      signals: [
        {
          signalType: PricingSignalType.package_monthly,
          unit: PricingUnit.package_monthly,
          priceValue: "20",
          currency: "USD",
          extractedText:
            "Cloudflare Pro — $20 per month per domain, billed monthly.",
        },
      ],
    },
    {
      legalName: "Resend Inc.",
      displayName: "Resend",
      website: "https://resend.com",
      domain: "resend.com",
      categoryCode: "email_api",
      cityName: "San Francisco",
      pricingPath: "/pricing",
      summary:
        "Transactional email API for developers. Pro tier starts at $20/month for 50,000 emails.",
      signals: [
        {
          signalType: PricingSignalType.package_monthly,
          unit: PricingUnit.package_monthly,
          priceValue: "20",
          currency: "USD",
          extractedText:
            "Resend Pro — $20 per month, includes 50,000 emails.",
        },
      ],
    },
    {
      legalName: "Datadog, Inc.",
      displayName: "Datadog",
      website: "https://www.datadoghq.com",
      domain: "datadoghq.com",
      categoryCode: "observability",
      cityName: "New York",
      pricingPath: "/pricing/",
      summary:
        "Observability platform for cloud-scale infrastructure. Pro plan starts at $15 per host per month, billed annually.",
      signals: [
        {
          signalType: PricingSignalType.package_monthly,
          unit: PricingUnit.package_monthly,
          priceValue: "15",
          currency: "USD",
          extractedText:
            "Datadog Pro — $15 per host per month, billed annually.",
        },
      ],
    },
    {
      legalName: "Functional Software, Inc.",
      displayName: "Sentry",
      website: "https://sentry.io",
      domain: "sentry.io",
      categoryCode: "observability",
      cityName: "San Francisco",
      pricingPath: "/pricing/",
      summary:
        "Error monitoring and performance tracing. Team plan starts at $26 per month.",
      signals: [
        {
          signalType: PricingSignalType.package_monthly,
          unit: PricingUnit.package_monthly,
          priceValue: "26",
          currency: "USD",
          extractedText:
            "Sentry Team — $26 per month, billed monthly.",
        },
      ],
    },
    {
      legalName: "Clerk, Inc.",
      displayName: "Clerk",
      website: "https://clerk.com",
      domain: "clerk.com",
      categoryCode: "auth_identity",
      cityName: "San Francisco",
      pricingPath: "/pricing",
      summary:
        "Drop-in authentication and user management. Pro plan starts at $25 per month.",
      signals: [
        {
          signalType: PricingSignalType.package_monthly,
          unit: PricingUnit.package_monthly,
          priceValue: "25",
          currency: "USD",
          extractedText: "Clerk Pro — $25 per month, billed monthly.",
        },
      ],
    },
    {
      legalName: "HubSpot, Inc.",
      displayName: "HubSpot",
      website: "https://www.hubspot.com",
      domain: "hubspot.com",
      categoryCode: "crm_saas",
      cityName: "Boston",
      pricingPath: "/pricing/sales",
      summary:
        "CRM and sales platform. Sales Hub Starter begins at $20 per seat per month.",
      signals: [
        {
          signalType: PricingSignalType.package_monthly,
          unit: PricingUnit.package_monthly,
          priceValue: "20",
          currency: "USD",
          extractedText:
            "HubSpot Sales Hub Starter — $20 per seat per month.",
        },
      ],
    },
    {
      legalName: "Linear Orbit, Inc.",
      displayName: "Linear",
      website: "https://linear.app",
      domain: "linear.app",
      categoryCode: "dev_tools_ci",
      cityName: "San Francisco",
      pricingPath: "/pricing",
      summary:
        "Issue tracker and project management for software teams. Standard plan is $8 per user per month.",
      signals: [
        {
          signalType: PricingSignalType.package_monthly,
          unit: PricingUnit.package_monthly,
          priceValue: "8",
          currency: "USD",
          extractedText:
            "Linear Standard — $8 per user per month, billed monthly.",
        },
      ],
    },
    {
      legalName: "Anthropic PBC",
      displayName: "Anthropic",
      website: "https://www.anthropic.com",
      domain: "anthropic.com",
      categoryCode: "ai_inference",
      cityName: "San Francisco",
      pricingPath: "/api",
      summary:
        "Claude AI inference API. Sonnet input is $3 per million tokens.",
      signals: [
        {
          signalType: PricingSignalType.starting_price,
          unit: PricingUnit.unspecified,
          priceValue: "3",
          currency: "USD",
          extractedText:
            "Claude Sonnet — $3 per million input tokens, $15 per million output tokens (Anthropic API).",
        },
      ],
    },
  ];

  const cityByName = new Map<string, { id: string }>();
  const allCityRows = await prisma.city.findMany();
  for (const row of allCityRows) cityByName.set(row.name, { id: row.id });

  const now = new Date();
  for (const v of SAAS_VENDORS) {
    const category = saasCategoryByCode.get(v.categoryCode);
    if (!category) continue;
    const hqCity = cityByName.get(v.cityName);

    const existingOrg = await prisma.organization.findFirst({
      where: { legalName: v.legalName },
      include: { vendorProfile: true },
    });

    if (existingOrg?.vendorProfile) {
      // Idempotent: vendor already seeded.
      continue;
    }

    const org =
      existingOrg ??
      (await prisma.organization.create({
        data: {
          id: newId(),
          type: OrganizationType.vendor,
          legalName: v.legalName,
          displayName: v.displayName,
          region: Region.US,
          defaultCurrency: REGION_DEFAULT_CURRENCY[Region.US],
          website: v.website,
        },
      }));

    const slug = v.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const profile = await prisma.vendorProfile.create({
      data: {
        id: newId(),
        organizationId: org.id,
        hqCityId: hqCity?.id,
        serviceSummary: v.summary,
        profileStatus: ProfileStatus.active,
        verificationStatus: VerificationStatus.unverified,
        createdBySource: VendorSource.scrape,
      },
    });

    await prisma.vendorServiceCategory.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        serviceCategoryId: category.id,
        primaryCategory: true,
      },
    });

    await prisma.vendorPublicSnapshot.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        slug,
        pageTitle: `${v.displayName} pricing — ${category.label}`,
        metaDescription: v.summary,
        summaryJson: {
          displayName: v.displayName,
          website: v.website,
          category: category.label,
          summary: v.summary,
        },
        publicStatus: PublicStatus.published,
        lastPublishedAt: now,
      },
    });

    const sourceUrl = `${v.website}${v.pricingPath}`;
    const source = await prisma.sourceUrl.upsert({
      where: { url: sourceUrl },
      create: {
        id: newId(),
        url: sourceUrl,
        domain: v.domain,
        sourceType: SourceUrlType.vendor_site,
        discoveryMethod: DiscoveryMethod.manual,
        status: SourceUrlStatus.active,
        lastCrawledAt: now,
      },
      update: { lastCrawledAt: now, status: SourceUrlStatus.active },
    });

    await prisma.evidenceItem.createMany({
      data: [
        {
          id: newId(),
          vendorProfileId: profile.id,
          sourceUrlId: source.id,
          fieldName: "website",
          rawValue: v.website,
          normalizedValue: v.website,
          evidenceType: EvidenceType.explicit,
          confidenceScore: "0.95",
          freshnessScore: "1.000",
          observedAt: now,
        },
        {
          id: newId(),
          vendorProfileId: profile.id,
          sourceUrlId: source.id,
          fieldName: "category",
          rawValue: category.label,
          normalizedValue: v.categoryCode,
          evidenceType: EvidenceType.explicit,
          confidenceScore: "0.90",
          freshnessScore: "1.000",
          observedAt: now,
        },
      ],
    });

    for (const s of v.signals) {
      await prisma.publicPricingSignal.create({
        data: {
          id: newId(),
          vendorProfileId: profile.id,
          sourceUrlId: source.id,
          signalType: s.signalType,
          priceValue: s.priceValue,
          currency: s.currency,
          unit: s.unit,
          extractedText: s.extractedText,
          confidence: "0.900",
          freshnessScore: "1.000",
          observedAt: now,
          status: PricingSignalStatus.published,
          reviewedAt: now,
        },
      });
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
    publishedSnapshots: await prisma.vendorPublicSnapshot.count({
      where: { publicStatus: PublicStatus.published },
    }),
    publishedPricingSignals: await prisma.publicPricingSignal.count({
      where: { status: PricingSignalStatus.published },
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
