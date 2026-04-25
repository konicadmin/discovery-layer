import {
  DiscoveryCandidateStatus,
  type Prisma,
} from "@/generated/prisma";
import { ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";

export type CreateDiscoveryCandidateInput = {
  serviceCategoryId?: string;
  vendorName?: string;
  homepageUrl?: string;
  searchTerm?: string;
  notes?: string;
  actorUserId?: string;
};

function normalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError("invalid homepage url");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ValidationError("only http(s) urls are supported");
  }
  return parsed.toString();
}

export async function createDiscoveryCandidate(
  db: Db,
  input: CreateDiscoveryCandidateInput,
) {
  const hasContent = Boolean(
    input.vendorName ||
      input.homepageUrl ||
      input.searchTerm ||
      input.notes,
  );
  if (!hasContent) {
    throw new ValidationError(
      "candidate needs at least one of vendor name, homepage, search term, or notes",
    );
  }

  const homepageUrl = input.homepageUrl
    ? normalizeUrl(input.homepageUrl)
    : null;

  return withTx(db, async (tx) => {
    const data: Prisma.DiscoveryCandidateUncheckedCreateInput = {
      id: newId(),
      serviceCategoryId: input.serviceCategoryId ?? null,
      vendorName: input.vendorName ?? null,
      homepageUrl,
      searchTerm: input.searchTerm ?? null,
      notes: input.notes ?? null,
      status: DiscoveryCandidateStatus.new,
      createdByUserId: input.actorUserId ?? null,
    };
    const created = await tx.discoveryCandidate.create({ data });

    await logEvent(tx, {
      actorUserId: input.actorUserId,
      entityType: "discovery_candidate",
      entityId: created.id,
      action: "discovery_candidate.created",
      after: {
        serviceCategoryId: created.serviceCategoryId,
        vendorName: created.vendorName,
        homepageUrl: created.homepageUrl,
        searchTerm: created.searchTerm,
      },
    });

    return created;
  });
}

export async function rejectDiscoveryCandidate(
  db: Db,
  args: { candidateId: string; actorUserId?: string; notes?: string },
) {
  return withTx(db, async (tx) => {
    const updated = await tx.discoveryCandidate.update({
      where: { id: args.candidateId },
      data: {
        status: DiscoveryCandidateStatus.rejected,
        notes: args.notes ?? undefined,
      },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "discovery_candidate",
      entityId: updated.id,
      action: "discovery_candidate.rejected",
    });
    return updated;
  });
}
