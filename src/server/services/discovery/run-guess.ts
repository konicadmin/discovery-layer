import { DiscoveryCandidateStatus } from "@/generated/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";
import type { Fetcher } from "@/server/services/ingestion/crawl";
import {
  guessPricingPaths,
  type PricingGuessResult,
} from "./guess-pricing-paths";

/**
 * Run the pricing-page guesser against a candidate's homepage and persist the
 * top result back onto the candidate. Returns the full ranked list so the UI
 * can show alternates.
 */
export async function runGuessForCandidate(
  db: Db,
  args: { candidateId: string; fetcher: Fetcher; actorUserId?: string },
): Promise<{ result: PricingGuessResult; candidate: { id: string; guessedPricingUrl: string | null; guessConfidence: string | null } }> {
  const candidate = await db.discoveryCandidate.findUnique({
    where: { id: args.candidateId },
  });
  if (!candidate) throw new NotFoundError("discovery_candidate", args.candidateId);
  if (!candidate.homepageUrl) {
    throw new ValidationError("candidate has no homepage url to guess from");
  }

  const result = await guessPricingPaths(args.fetcher, candidate.homepageUrl);

  const updated = await withTx(db, async (tx) => {
    const next = await tx.discoveryCandidate.update({
      where: { id: candidate.id },
      data: {
        guessedPricingUrl: result.best?.url ?? null,
        guessConfidence: result.best
          ? result.best.confidence.toFixed(3)
          : null,
        guessedAt: new Date(),
        status:
          candidate.status === DiscoveryCandidateStatus.new
            ? DiscoveryCandidateStatus.reviewed
            : candidate.status,
      },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "discovery_candidate",
      entityId: next.id,
      action: "discovery_candidate.guessed",
      after: {
        bestUrl: result.best?.url ?? null,
        bestConfidence: result.best?.confidence ?? null,
        candidatesTried: result.candidates.length,
      },
    });
    return next;
  });

  return {
    result,
    candidate: {
      id: updated.id,
      guessedPricingUrl: updated.guessedPricingUrl,
      guessConfidence:
        updated.guessConfidence != null
          ? updated.guessConfidence.toString()
          : null,
    },
  };
}
