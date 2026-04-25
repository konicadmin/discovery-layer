import {
  DiscoveryCandidateStatus,
  OrganizationType,
  VendorSource,
  type Prisma,
} from "@/generated/prisma";
import { newId } from "@/lib/id";
import { REGION_DEFAULT_CURRENCY } from "@/lib/region";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";
import {
  crawlAndCapturePricing,
  type Fetcher,
} from "@/server/services/ingestion/crawl";

export type CrawlBatchOptions = {
  limit?: number;
  expiresInDays?: number;
  actorUserId?: string;
};

export type CrawlBatchItem = {
  candidateId: string;
  vendorProfileId: string | null;
  sourceUrlId: string | null;
  vendorName: string | null;
  pricingUrl: string | null;
  pricingSignalsCreated?: number;
  totalCandidates?: number;
  httpStatus?: number | null;
  status: "crawled" | "skipped" | "failed";
  error?: string;
};

export type CrawlBatchResult = {
  approvedCount: number;
  processed: number;
  crawled: number;
  skipped: number;
  failed: number;
  items: CrawlBatchItem[];
};

function deriveVendorName(homepageUrl: string | null): string | null {
  if (!homepageUrl) return null;
  try {
    const host = new URL(homepageUrl).hostname.replace(/^www\./, "");
    const root = host.split(".")[0];
    if (!root) return null;
    return root.charAt(0).toUpperCase() + root.slice(1);
  } catch {
    return null;
  }
}

/**
 * Resolve (or create) a `VendorProfile` for an approved candidate so the
 * crawl pipeline has a vendor to attach pricing signals to. Idempotent —
 * if an Organization with the same legal name already exists, reuse its
 * profile (creating one if missing).
 */
async function ensureVendorProfileForCandidate(
  tx: Prisma.TransactionClient,
  candidate: {
    id: string;
    vendorName: string | null;
    homepageUrl: string | null;
    serviceCategoryId: string | null;
  },
): Promise<{ vendorProfileId: string; vendorName: string }> {
  const legalName = candidate.vendorName ?? deriveVendorName(candidate.homepageUrl);
  if (!legalName) {
    throw new Error(
      "candidate has neither vendor name nor homepage url to derive one from",
    );
  }

  let org = await tx.organization.findFirst({
    where: { type: OrganizationType.vendor, legalName },
    include: { vendorProfile: true },
  });

  if (!org) {
    org = await tx.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.vendor,
        legalName,
        displayName: legalName,
        website: candidate.homepageUrl ?? undefined,
        region: "US",
        defaultCurrency: REGION_DEFAULT_CURRENCY.US,
        vendorProfile: {
          create: {
            id: newId(),
            createdBySource: VendorSource.scrape,
            serviceSummary: `${legalName} discovered via /admin/discovery candidate ${candidate.id}.`,
          },
        },
      },
      include: { vendorProfile: true },
    });
  } else if (!org.vendorProfile) {
    const profile = await tx.vendorProfile.create({
      data: {
        id: newId(),
        organizationId: org.id,
        createdBySource: VendorSource.scrape,
        serviceSummary: `${legalName} discovered via /admin/discovery candidate ${candidate.id}.`,
      },
    });
    org = { ...org, vendorProfile: profile };
  }

  if (candidate.serviceCategoryId && org.vendorProfile) {
    await tx.vendorServiceCategory
      .upsert({
        where: {
          vendorProfileId_serviceCategoryId: {
            vendorProfileId: org.vendorProfile.id,
            serviceCategoryId: candidate.serviceCategoryId,
          },
        },
        create: {
          id: newId(),
          vendorProfileId: org.vendorProfile.id,
          serviceCategoryId: candidate.serviceCategoryId,
          primaryCategory: false,
        },
        update: {},
      })
      .catch(() => null);
  }

  return {
    vendorProfileId: org.vendorProfile!.id,
    vendorName: legalName,
  };
}

/**
 * Crawl every approved discovery candidate. Resolves a vendor profile per
 * candidate (creating one from the candidate's vendor name + homepage if
 * needed), runs the existing pricing crawl, and flips the candidate to
 * `crawled` on success. On failure the candidate stays `approved` so the
 * batch can be retried.
 */
export async function crawlApprovedCandidates(
  db: Db,
  fetcher: Fetcher,
  options: CrawlBatchOptions = {},
): Promise<CrawlBatchResult> {
  const limit = options.limit ?? 25;
  const expiresInDays = options.expiresInDays ?? 90;

  const candidates = await db.discoveryCandidate.findMany({
    where: { status: DiscoveryCandidateStatus.approved },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { approvedSource: true },
  });

  const result: CrawlBatchResult = {
    approvedCount: candidates.length,
    processed: 0,
    crawled: 0,
    skipped: 0,
    failed: 0,
    items: [],
  };

  for (const candidate of candidates) {
    result.processed += 1;
    const item: CrawlBatchItem = {
      candidateId: candidate.id,
      vendorProfileId: null,
      sourceUrlId: candidate.approvedSourceUrlId,
      vendorName: candidate.vendorName,
      pricingUrl: candidate.approvedSource?.url ?? null,
      status: "skipped",
    };

    if (!candidate.approvedSourceUrlId || !candidate.approvedSource) {
      item.error = "candidate has no approved source url";
      result.skipped += 1;
      result.items.push(item);
      continue;
    }

    try {
      const { vendorProfileId, vendorName } = await withTx(db, (tx) =>
        ensureVendorProfileForCandidate(tx, candidate),
      );
      item.vendorProfileId = vendorProfileId;
      item.vendorName = vendorName;

      const crawl = await crawlAndCapturePricing(db, {
        vendorProfileId,
        sourceUrlId: candidate.approvedSourceUrlId,
        fetcher,
        expiresInDays,
        actorUserId: options.actorUserId,
      });

      await withTx(db, async (tx) => {
        await tx.discoveryCandidate.update({
          where: { id: candidate.id },
          data: { status: DiscoveryCandidateStatus.crawled },
        });
        await logEvent(tx, {
          actorUserId: options.actorUserId,
          entityType: "discovery_candidate",
          entityId: candidate.id,
          action: "discovery_candidate.crawled",
          after: {
            vendorProfileId,
            sourceUrlId: candidate.approvedSourceUrlId,
            crawlRunId: crawl.run.id,
            pricingSignalsCreated: crawl.created.length,
          },
        });
      });

      item.status = "crawled";
      item.pricingSignalsCreated = crawl.created.length;
      item.totalCandidates = crawl.totalCandidates;
      item.httpStatus = crawl.run.httpStatus;
      result.crawled += 1;
    } catch (err) {
      item.status = "failed";
      item.error = err instanceof Error ? err.message : String(err);
      result.failed += 1;
    }

    result.items.push(item);
  }

  return result;
}
