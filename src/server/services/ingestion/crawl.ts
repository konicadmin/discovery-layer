import { createHash } from "node:crypto";
import {
  CandidateStatus,
  CrawlStatus,
  SourceUrlStatus,
} from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";

/**
 * The Fetcher interface is how this phase's crawl pipeline talks to the
 * network. V1 ships only the interface; integration tests use a stub. A
 * production implementation might use Exa, ScrapingBee, or headless
 * Chromium. Keep the DB write path separate from the fetcher so tests
 * exercise extraction without network flakiness.
 */
export interface Fetcher {
  fetch(url: string): Promise<{
    httpStatus: number;
    text: string;
  }>;
}

export type Extracted = {
  legalName?: string;
  displayName?: string;
  website?: string;
  phone?: string;
  email?: string;
  cityText?: string;
  categoryText?: string;
  serviceSummary?: string;
  extractionConfidence?: number;
};

export interface Extractor {
  extract(input: { url: string; text: string }): Promise<Extracted>;
}

export async function runCrawl(
  db: Db,
  args: { sourceUrlId: string; fetcher: Fetcher; extractor: Extractor; actorUserId?: string },
) {
  return withTx(db, async (tx) => {
    const source = await tx.sourceUrl.findUnique({ where: { id: args.sourceUrlId } });
    if (!source) throw new NotFoundError("source_url", args.sourceUrlId);

    const run = await tx.crawlRun.create({
      data: {
        id: newId(),
        sourceUrlId: source.id,
        status: CrawlStatus.running,
      },
    });

    let fetchResult: { httpStatus: number; text: string };
    try {
      fetchResult = await args.fetcher.fetch(source.url);
    } catch (err) {
      await tx.crawlRun.update({
        where: { id: run.id },
        data: {
          status: CrawlStatus.failed,
          errorMessage: err instanceof Error ? err.message : String(err),
          fetchedAt: new Date(),
        },
      });
      await tx.sourceUrl.update({
        where: { id: source.id },
        data: { status: SourceUrlStatus.failed, lastCrawledAt: new Date() },
      });
      throw err;
    }

    const contentHash = createHash("sha256").update(fetchResult.text).digest("hex");
    const extracted = await args.extractor.extract({ url: source.url, text: fetchResult.text });

    await tx.crawlRun.update({
      where: { id: run.id },
      data: {
        status: CrawlStatus.completed,
        httpStatus: fetchResult.httpStatus,
        contentHash,
        fetchedAt: new Date(),
      },
    });

    await tx.sourceUrl.update({
      where: { id: source.id },
      data: { status: SourceUrlStatus.active, lastCrawledAt: new Date() },
    });

    if (Object.keys(extracted).length === 0) {
      return { run, candidateId: null };
    }

    const candidate = await tx.extractedVendorCandidate.create({
      data: {
        id: newId(),
        crawlRunId: run.id,
        legalName: extracted.legalName,
        displayName: extracted.displayName ?? extracted.legalName,
        website: extracted.website ?? source.url,
        phone: extracted.phone,
        email: extracted.email,
        cityText: extracted.cityText,
        categoryText: extracted.categoryText,
        serviceSummary: extracted.serviceSummary,
        extractionConfidence: extracted.extractionConfidence?.toString(),
        status: CandidateStatus.pending_match,
      },
    });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "extracted_vendor_candidate",
      entityId: candidate.id,
      action: "candidate.extracted",
      after: { sourceUrlId: source.id, runId: run.id },
    });

    return { run, candidateId: candidate.id };
  });
}
