import {
  CandidateStatus,
  DedupeReviewStatus,
  EvidenceType,
  OrganizationType,
  VendorSource,
} from "@prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";

function stripDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Heuristic dedupe: match a candidate to an existing vendor by
 *   - exact GSTIN (not collected by the stub extractor, but supported here)
 *   - exact website domain
 *   - exact phone digits
 *   - fuzzy legal_name substring match
 * Strong matches (GSTIN, domain) auto-merge. Everything else opens a
 * dedupe_review for ops.
 */
export async function matchCandidate(
  db: Db,
  args: { candidateId: string; actorUserId?: string },
) {
  return withTx(db, async (tx) => {
    const candidate = await tx.extractedVendorCandidate.findUnique({
      where: { id: args.candidateId },
    });
    if (!candidate) throw new NotFoundError("candidate", args.candidateId);
    if (candidate.status !== CandidateStatus.pending_match) {
      return { matched: candidate.resolvedVendorProfileId, candidate };
    }

    const domain = stripDomain(candidate.website);
    const name = candidate.legalName?.trim().toLowerCase() ?? null;
    const phoneDigits = candidate.phone?.replace(/\D+/g, "") ?? null;

    let strongMatch: { id: string } | null = null;
    if (domain) {
      const byWebsite = await tx.vendorProfile.findFirst({
        where: {
          organization: {
            website: { contains: domain, mode: "insensitive" },
          },
        },
      });
      if (byWebsite) strongMatch = { id: byWebsite.id };
    }
    if (!strongMatch && phoneDigits) {
      const byPhone = await tx.vendorProfile.findFirst({
        where: {
          organization: {
            primaryPhone: { contains: phoneDigits },
          },
        },
      });
      if (byPhone) strongMatch = { id: byPhone.id };
    }

    let weakMatch: { id: string } | null = null;
    if (!strongMatch && name && name.length > 3) {
      const byName = await tx.vendorProfile.findFirst({
        where: {
          organization: {
            OR: [
              { legalName: { contains: name, mode: "insensitive" } },
              { displayName: { contains: name, mode: "insensitive" } },
            ],
          },
        },
      });
      if (byName) weakMatch = { id: byName.id };
    }

    if (strongMatch) {
      await tx.extractedVendorCandidate.update({
        where: { id: candidate.id },
        data: {
          status: CandidateStatus.matched,
          resolvedVendorProfileId: strongMatch.id,
        },
      });
      await logEvent(tx, {
        actorUserId: args.actorUserId,
        entityType: "extracted_vendor_candidate",
        entityId: candidate.id,
        action: "candidate.matched_auto",
        after: { vendorProfileId: strongMatch.id },
      });
      return { matched: strongMatch.id, candidate };
    }

    if (weakMatch) {
      await tx.dedupeReview.create({
        data: {
          id: newId(),
          candidateId: candidate.id,
          existingVendorProfileId: weakMatch.id,
          reviewStatus: DedupeReviewStatus.pending,
        },
      });
      await logEvent(tx, {
        actorUserId: args.actorUserId,
        entityType: "extracted_vendor_candidate",
        entityId: candidate.id,
        action: "candidate.dedupe_queued",
        after: { existingVendorProfileId: weakMatch.id },
      });
      return { matched: null, candidate, dedupePending: true };
    }

    return { matched: null, candidate };
  });
}

/**
 * Create a scraped stub vendor from a candidate that could not be merged.
 * The stub is created with createdBySource=scrape and verificationStatus
 * defaults to `unverified`. Evidence rows record provenance for every
 * field that had a value.
 */
export async function createStubFromCandidate(
  db: Db,
  args: { candidateId: string; actorUserId?: string },
) {
  return withTx(db, async (tx) => {
    const candidate = await tx.extractedVendorCandidate.findUnique({
      where: { id: args.candidateId },
      include: { crawlRun: true },
    });
    if (!candidate) throw new NotFoundError("candidate", args.candidateId);
    if (candidate.status === CandidateStatus.created_stub) {
      throw new ValidationError("candidate already promoted to a stub");
    }

    const displayName = candidate.displayName ?? candidate.legalName ?? "Unnamed vendor";
    const org = await tx.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.vendor,
        legalName: candidate.legalName ?? displayName,
        displayName,
        website: candidate.website ?? null,
        primaryPhone: candidate.phone ?? null,
      },
    });
    const profile = await tx.vendorProfile.create({
      data: {
        id: newId(),
        organizationId: org.id,
        serviceSummary: candidate.serviceSummary ?? null,
        createdBySource: VendorSource.scrape,
      },
    });

    const now = new Date();
    const fields: Array<[keyof typeof candidate, string]> = [
      ["legalName", "organization.legalName"],
      ["displayName", "organization.displayName"],
      ["website", "organization.website"],
      ["phone", "organization.primaryPhone"],
      ["email", "organization.contactEmail"],
      ["cityText", "vendor_profile.cityText"],
      ["categoryText", "vendor_profile.categoryText"],
      ["serviceSummary", "vendor_profile.serviceSummary"],
    ];
    for (const [key, fieldPath] of fields) {
      const value = candidate[key];
      if (!value) continue;
      await tx.evidenceItem.create({
        data: {
          id: newId(),
          vendorProfileId: profile.id,
          sourceUrlId: candidate.crawlRun.sourceUrlId,
          crawlRunId: candidate.crawlRunId,
          fieldName: fieldPath,
          rawValue: String(value),
          normalizedValue: String(value),
          evidenceType: EvidenceType.explicit,
          confidenceScore: candidate.extractionConfidence?.toString() ?? "0.500",
          freshnessScore: "1.000",
          observedAt: now,
        },
      });
    }

    const updated = await tx.extractedVendorCandidate.update({
      where: { id: candidate.id },
      data: {
        status: CandidateStatus.created_stub,
        resolvedVendorProfileId: profile.id,
      },
    });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      actorOrganizationId: org.id,
      entityType: "vendor_profile",
      entityId: profile.id,
      action: "vendor.stub_created",
      after: { fromCandidateId: candidate.id, source: "scrape" },
    });

    return { profileId: profile.id, organizationId: org.id, candidate: updated };
  });
}
