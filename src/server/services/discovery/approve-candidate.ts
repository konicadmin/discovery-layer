import {
  DiscoveryCandidateStatus,
  DiscoveryMethod,
  SourceUrlType,
} from "@/generated/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";
import { registerSource } from "@/server/services/ingestion/sources";

export type ApproveCandidateInput = {
  candidateId: string;
  pricingUrl?: string; // overrides the guessed pricing url if provided
  sourceType?: SourceUrlType;
  actorUserId?: string;
};

/**
 * Approve a discovery candidate: register the chosen pricing URL into
 * `source_urls` (queued for crawl), link it back on the candidate, and flip
 * the candidate to `approved`. The actual crawl is run asynchronously by the
 * existing crawl pipeline.
 */
export async function approveDiscoveryCandidate(
  db: Db,
  input: ApproveCandidateInput,
) {
  return withTx(db, async (tx) => {
    const candidate = await tx.discoveryCandidate.findUnique({
      where: { id: input.candidateId },
    });
    if (!candidate) throw new NotFoundError("discovery_candidate", input.candidateId);
    if (candidate.status === DiscoveryCandidateStatus.approved ||
        candidate.status === DiscoveryCandidateStatus.crawled) {
      throw new ValidationError("candidate already approved");
    }

    const url = input.pricingUrl ?? candidate.guessedPricingUrl;
    if (!url) {
      throw new ValidationError(
        "no pricing url to approve — provide one or run the guesser first",
      );
    }

    const source = await registerSource(tx, {
      url,
      sourceType: input.sourceType ?? SourceUrlType.vendor_site,
      discoveryMethod: DiscoveryMethod.manual,
    });

    const updated = await tx.discoveryCandidate.update({
      where: { id: candidate.id },
      data: {
        status: DiscoveryCandidateStatus.approved,
        approvedSourceUrlId: source.id,
        guessedPricingUrl: url,
      },
    });

    await logEvent(tx, {
      actorUserId: input.actorUserId,
      entityType: "discovery_candidate",
      entityId: updated.id,
      action: "discovery_candidate.approved",
      after: { sourceUrlId: source.id, url },
    });

    return { candidate: updated, source };
  });
}

export async function markCandidateCrawled(
  db: Db,
  args: { candidateId: string; actorUserId?: string },
) {
  return withTx(db, async (tx) => {
    const updated = await tx.discoveryCandidate.update({
      where: { id: args.candidateId },
      data: { status: DiscoveryCandidateStatus.crawled },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "discovery_candidate",
      entityId: updated.id,
      action: "discovery_candidate.crawled",
    });
    return updated;
  });
}
