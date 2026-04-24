import {
  type Prisma,
  PricingSignalStatus,
  PricingSignalType,
  PricingUnit,
} from "@/generated/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";
import {
  DeterministicPricingExtractor,
  type PricingCandidate,
  type PricingExtractor,
} from "./pricing-extractor";

/**
 * Indicative hours used to normalize per-hour/per-day signals into an
 * equivalent per-guard-per-month figure. These are conservative
 * single-shift assumptions. Always flagged as `indicative` in the
 * normalizationNotes so buyers know the conversion is lossy.
 */
const HOURS_PER_SHIFT = 8;
const SHIFTS_PER_MONTH = 30;
const DAYS_PER_MONTH = 30;

export type Observation = { at?: Date; expiresInDays?: number };

export function normalizeToPGPM(
  candidate: Pick<PricingCandidate, "priceValue" | "unit" | "signalType">,
): { normalized: number | null; notes: string | null } {
  switch (candidate.unit) {
    case PricingUnit.per_guard_per_month:
      return { normalized: candidate.priceValue, notes: null };
    case PricingUnit.per_hour:
      return {
        normalized: Math.round(candidate.priceValue * HOURS_PER_SHIFT * SHIFTS_PER_MONTH),
        notes: `indicative: hourly × ${HOURS_PER_SHIFT}h × ${SHIFTS_PER_MONTH} shifts`,
      };
    case PricingUnit.per_day:
      return {
        normalized: Math.round(candidate.priceValue * DAYS_PER_MONTH),
        notes: `indicative: daily × ${DAYS_PER_MONTH} days`,
      };
    case PricingUnit.per_shift:
      return {
        normalized: Math.round(candidate.priceValue * SHIFTS_PER_MONTH),
        notes: `indicative: per-shift × ${SHIFTS_PER_MONTH} shifts`,
      };
    case PricingUnit.package_monthly:
      // Requires headcount context to normalize; leave blank for buyer to fill.
      return { normalized: null, notes: "package without headcount basis" };
    case PricingUnit.unspecified:
    default:
      return {
        normalized: null,
        notes:
          candidate.signalType === PricingSignalType.starting_price ||
          candidate.signalType === PricingSignalType.range_min ||
          candidate.signalType === PricingSignalType.range_max
            ? "range/starting signal; unit not stated"
            : "unit unspecified on source page",
      };
  }
}

export type CapturePricingInput = {
  vendorProfileId: string;
  sourceUrlId?: string;
  crawlRunId?: string;
  pageText: string;
  pageUrl: string;
  extractor?: PricingExtractor;
  observation?: Observation;
  actorUserId?: string;
};

/**
 * Run the extractor over fetched text and persist candidates as
 * `public_pricing_signals` rows with `status = pending`. Rows never
 * appear on the public page until `publishPricingSignal` flips them.
 */
export async function capturePricingSignals(db: Db, input: CapturePricingInput) {
  const extractor = input.extractor ?? new DeterministicPricingExtractor();
  const candidates = await extractor.extract({ url: input.pageUrl, text: input.pageText });
  if (candidates.length === 0) return { created: [], totalCandidates: 0 };

  return withTx(db, async (tx) => {
    const observedAt = input.observation?.at ?? new Date();
    const expiresAt = input.observation?.expiresInDays
      ? new Date(observedAt.getTime() + input.observation.expiresInDays * 24 * 3600 * 1000)
      : null;

    const created: Array<{
      id: string;
      signalType: PricingSignalType;
      priceValue: number;
      unit: PricingUnit;
      currency: string;
    }> = [];

    for (const cand of candidates) {
      const norm = normalizeToPGPM(cand);
      const existing = await tx.publicPricingSignal.findFirst({
        where: {
          vendorProfileId: input.vendorProfileId,
          sourceUrlId: input.sourceUrlId ?? null,
          signalType: cand.signalType,
          priceValue: cand.priceValue.toString(),
          currency: cand.currency,
          unit: cand.unit,
        },
      });
      if (existing) continue;
      const row = await tx.publicPricingSignal.create({
        data: {
          id: newId(),
          vendorProfileId: input.vendorProfileId,
          sourceUrlId: input.sourceUrlId ?? null,
          crawlRunId: input.crawlRunId ?? null,
          signalType: cand.signalType,
          priceValue: cand.priceValue.toString(),
          currency: cand.currency,
          unit: cand.unit,
          minQuantity: cand.minQuantity,
          minContractMonths: cand.minContractMonths,
          extractedText: cand.extractedText,
          normalizedPgpm: norm.normalized != null ? norm.normalized.toString() : null,
          normalizationNotes: norm.notes,
          confidence: cand.confidence.toFixed(3),
          freshnessScore: "1.000",
          observedAt,
          expiresAt,
          status: PricingSignalStatus.pending,
        } satisfies Prisma.PublicPricingSignalUncheckedCreateInput,
      });
      created.push({
        id: row.id,
        signalType: row.signalType,
        priceValue: cand.priceValue,
        unit: row.unit,
        currency: row.currency,
      });
    }

    if (created.length > 0) {
      await logEvent(tx, {
        actorUserId: input.actorUserId,
        entityType: "vendor_profile",
        entityId: input.vendorProfileId,
        action: "pricing.captured",
        after: { count: created.length, sourceUrlId: input.sourceUrlId ?? null },
      });
    }

    return { created, totalCandidates: candidates.length };
  });
}

export async function publishPricingSignal(
  db: Db,
  args: { signalId: string; actorUserId: string; notes?: string },
) {
  return withTx(db, async (tx) => {
    const signal = await tx.publicPricingSignal.findUnique({
      where: { id: args.signalId },
    });
    if (!signal) throw new NotFoundError("public_pricing_signal", args.signalId);
    if (signal.status === PricingSignalStatus.published) return signal;
    if (signal.status === PricingSignalStatus.rejected) {
      throw new ValidationError("cannot publish a rejected signal");
    }

    const updated = await tx.publicPricingSignal.update({
      where: { id: signal.id },
      data: {
        status: PricingSignalStatus.published,
        reviewedByUserId: args.actorUserId,
        reviewedAt: new Date(),
        reviewNotes: args.notes,
      },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "public_pricing_signal",
      entityId: signal.id,
      action: "pricing.published",
      before: { status: signal.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

export async function rejectPricingSignal(
  db: Db,
  args: { signalId: string; actorUserId: string; notes: string },
) {
  if (!args.notes?.trim()) {
    throw new ValidationError("rejection requires reviewer notes");
  }
  return withTx(db, async (tx) => {
    const signal = await tx.publicPricingSignal.findUnique({
      where: { id: args.signalId },
    });
    if (!signal) throw new NotFoundError("public_pricing_signal", args.signalId);

    const updated = await tx.publicPricingSignal.update({
      where: { id: signal.id },
      data: {
        status: PricingSignalStatus.rejected,
        reviewedByUserId: args.actorUserId,
        reviewedAt: new Date(),
        reviewNotes: args.notes,
      },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "public_pricing_signal",
      entityId: signal.id,
      action: "pricing.rejected",
      before: { status: signal.status },
      after: { status: updated.status, notes: args.notes },
    });
    return updated;
  });
}

/**
 * Background-safe marker for stale signals. Called from a cron/worker.
 * Keeps the row (for historical analysis) but hides it from the public page.
 */
export async function expireStaleSignals(db: Db, now: Date = new Date()) {
  return withTx(db, async (tx) => {
    const result = await tx.publicPricingSignal.updateMany({
      where: {
        status: PricingSignalStatus.published,
        expiresAt: { lte: now },
      },
      data: { status: PricingSignalStatus.expired },
    });
    return { expired: result.count };
  });
}
