import { describe, it, expect } from "vitest";
import {
  CandidateStatus,
  ClaimStatus,
  OrganizationType,
  PublicStatus,
  SourceUrlStatus,
  VendorSource,
} from "@/generated/prisma";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { registerSource } from "@/server/services/ingestion/sources";
import {
  type Extractor,
  type Fetcher,
  runCrawl,
} from "@/server/services/ingestion/crawl";
import {
  createStubFromCandidate,
  matchCandidate,
} from "@/server/services/ingestion/dedupe";
import {
  publishSnapshot,
  deriveTrustBand,
} from "@/server/services/ingestion/publish";
import { acceptClaim, sendClaim } from "@/server/services/claims/send-claim";

const stubFetcher = (text: string, httpStatus = 200): Fetcher => ({
  fetch: async () => ({ httpStatus, text }),
});

const stubExtractor = (result: Parameters<Extractor["extract"]>[0] extends unknown
  ? Awaited<ReturnType<Extractor["extract"]>>
  : never): Extractor => ({
  extract: async () => result,
});

describe("Phase 5 ingestion pipeline", () => {
  it("register → crawl → extract → candidate → stub → publish → claim", async () => {
    const prisma = getPrisma();
    const city = await prisma.city.create({
      data: { id: newId(), name: "Bengaluru", state: "KA" },
    });
    const cat = await prisma.serviceCategory.create({
      data: { id: newId(), code: `c-${newId()}`, label: "security_staffing" },
    });

    const source = await registerSource(prisma, {
      url: "https://example.test/vendor-a",
    });
    expect(source.status).toBe(SourceUrlStatus.queued);

    const { candidateId } = await runCrawl(prisma, {
      sourceUrlId: source.id,
      fetcher: stubFetcher("<html>vendor page</html>"),
      extractor: stubExtractor({
        legalName: "Alpha Watch & Ward",
        displayName: "Alpha Watch & Ward",
        website: "https://alphawatch.test",
        phone: "+919876500001",
        cityText: "Bengaluru",
        categoryText: "security staffing",
        serviceSummary: "Security services for offices and warehouses.",
        extractionConfidence: 0.82,
      }),
    });
    expect(candidateId).not.toBeNull();

    const matchResult = await matchCandidate(prisma, { candidateId: candidateId! });
    expect(matchResult.matched).toBeNull();

    const stub = await createStubFromCandidate(prisma, { candidateId: candidateId! });

    const profile = await prisma.vendorProfile.findUniqueOrThrow({
      where: { id: stub.profileId },
      include: { evidenceItems: true, organization: true, serviceCategories: true },
    });
    expect(profile.createdBySource).toBe(VendorSource.scrape);
    expect(profile.evidenceItems.length).toBeGreaterThanOrEqual(4);
    expect(deriveTrustBand(profile)).toBe("unclaimed_public_record");

    // Publishing requires a category — seed one.
    await prisma.vendorServiceCategory.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        serviceCategoryId: cat.id,
        primaryCategory: true,
      },
    });
    await prisma.vendorProfile.update({
      where: { id: profile.id },
      data: { hqCityId: city.id },
    });

    const snap = await publishSnapshot(prisma, { vendorProfileId: profile.id });
    expect(snap.publicStatus).toBe(PublicStatus.published);
    expect(snap.slug).toMatch(/bengaluru/);

    // A public visitor claims the listing.
    const claim = await sendClaim(prisma, {
      vendorProfileId: profile.id,
      email: "owner@alphawatch.test",
    });
    const accepted = await acceptClaim(prisma, {
      claimToken: claim.claimToken,
      user: { name: "Alpha Owner", email: "owner@alphawatch.test" },
    });
    expect(accepted.claim.status).toBe(ClaimStatus.claimed);

    const reloaded = await prisma.vendorProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(reloaded.claimedAt).not.toBeNull();
    expect(deriveTrustBand(reloaded)).toBe("claimed_not_verified");
  });

  it("auto-matches a candidate to an existing vendor by exact domain", async () => {
    const prisma = getPrisma();
    const existingOrg = await prisma.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.vendor,
        legalName: "Beta",
        displayName: "Beta",
        website: "https://beta-security.test",
      },
    });
    const existingProfile = await prisma.vendorProfile.create({
      data: { id: newId(), organizationId: existingOrg.id },
    });

    const source = await registerSource(prisma, {
      url: "https://beta-security.test/services",
    });
    const { candidateId } = await runCrawl(prisma, {
      sourceUrlId: source.id,
      fetcher: stubFetcher("page"),
      extractor: stubExtractor({
        legalName: "Beta Security Services",
        website: "https://beta-security.test/services",
      }),
    });

    const match = await matchCandidate(prisma, { candidateId: candidateId! });
    expect(match.matched).toBe(existingProfile.id);

    const reloaded = await prisma.extractedVendorCandidate.findUniqueOrThrow({
      where: { id: candidateId! },
    });
    expect(reloaded.status).toBe(CandidateStatus.matched);
  });

  it("queues a dedupe_review when only name fuzz matches", async () => {
    const prisma = getPrisma();
    const existingOrg = await prisma.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.vendor,
        legalName: "Gamma Security Pvt Ltd",
        displayName: "Gamma Security Pvt Ltd",
      },
    });
    await prisma.vendorProfile.create({
      data: { id: newId(), organizationId: existingOrg.id },
    });

    const source = await registerSource(prisma, {
      url: "https://gamma-security-example.test",
    });
    const { candidateId } = await runCrawl(prisma, {
      sourceUrlId: source.id,
      fetcher: stubFetcher("page"),
      extractor: stubExtractor({
        legalName: "Gamma Security",
        website: "https://gamma-security-example.test",
      }),
    });

    const match = await matchCandidate(prisma, { candidateId: candidateId! });
    expect(match.matched).toBeNull();
    expect((match as { dedupePending?: boolean }).dedupePending).toBe(true);

    const reviews = await prisma.dedupeReview.findMany();
    expect(reviews).toHaveLength(1);
  });

  it("refuses to publish a snapshot with too little evidence", async () => {
    const prisma = getPrisma();
    const cat = await prisma.serviceCategory.create({
      data: { id: newId(), code: `c-${newId()}`, label: "s" },
    });
    const org = await prisma.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.vendor,
        legalName: "Weak",
        displayName: "Weak",
      },
    });
    const profile = await prisma.vendorProfile.create({
      data: {
        id: newId(),
        organizationId: org.id,
        createdBySource: VendorSource.scrape,
      },
    });
    await prisma.vendorServiceCategory.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        serviceCategoryId: cat.id,
        primaryCategory: true,
      },
    });

    await expect(
      publishSnapshot(prisma, { vendorProfileId: profile.id }),
    ).rejects.toThrow(/insufficient evidence/);
  });
});
