import { PublicStatus } from "@/generated/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const MIN_EVIDENCE_ITEMS = 2; // suppression threshold

/**
 * Public status is one of three bands (per Phase 5 plan):
 *   - unclaimed_public_record    → profile.createdBySource=scrape,
 *                                  claimedAt IS NULL
 *   - claimed_not_verified       → claimedAt IS NOT NULL AND
 *                                  verificationStatus != verified
 *   - verified_vendor            → verificationStatus = verified
 */
export function deriveTrustBand(profile: {
  createdBySource: string;
  claimedAt: Date | null;
  verificationStatus: string;
}): "unclaimed_public_record" | "claimed_not_verified" | "verified_vendor" {
  if (profile.verificationStatus === "verified") return "verified_vendor";
  if (profile.claimedAt) return "claimed_not_verified";
  return "unclaimed_public_record";
}

export async function publishSnapshot(
  db: Db,
  args: { vendorProfileId: string; actorUserId?: string },
) {
  return withTx(db, async (tx) => {
    const profile = await tx.vendorProfile.findUnique({
      where: { id: args.vendorProfileId },
      include: {
        organization: true,
        hqCity: true,
        serviceCategories: { include: { serviceCategory: true } },
        evidenceItems: true,
      },
    });
    if (!profile) throw new NotFoundError("vendor_profile", args.vendorProfileId);

    if (profile.evidenceItems.length < MIN_EVIDENCE_ITEMS) {
      throw new ValidationError(
        `insufficient evidence to publish (have ${profile.evidenceItems.length}, need ${MIN_EVIDENCE_ITEMS})`,
      );
    }

    const band = deriveTrustBand(profile);
    const cityPart = profile.hqCity?.name ?? "india";
    const slug = slugify(
      `${cityPart}-${profile.organization.displayName}-${profile.id.slice(-6)}`,
    );
    const primaryCategory =
      profile.serviceCategories.find((c) => c.primaryCategory)?.serviceCategory.label ??
      profile.serviceCategories[0]?.serviceCategory.label ??
      "vendor";
    const pageTitle = `${profile.organization.displayName} — ${primaryCategory} in ${cityPart}`;
    const metaDescription =
      profile.serviceSummary?.slice(0, 160) ??
      `${profile.organization.displayName} provides ${primaryCategory} in ${cityPart}. Verification: ${band}.`;
    const summary = {
      trustBand: band,
      cityName: profile.hqCity?.name ?? null,
      categoryLabels: profile.serviceCategories.map(
        (c) => c.serviceCategory.label,
      ),
      evidenceCount: profile.evidenceItems.length,
      serviceSummary: profile.serviceSummary ?? null,
    };

    const existing = await tx.vendorPublicSnapshot.findFirst({
      where: { vendorProfileId: profile.id },
    });
    const snapshot = existing
      ? await tx.vendorPublicSnapshot.update({
          where: { id: existing.id },
          data: {
            slug,
            pageTitle,
            metaDescription,
            summaryJson: summary,
            publicStatus: PublicStatus.published,
            lastPublishedAt: new Date(),
          },
        })
      : await tx.vendorPublicSnapshot.create({
          data: {
            id: newId(),
            vendorProfileId: profile.id,
            slug,
            pageTitle,
            metaDescription,
            summaryJson: summary,
            publicStatus: PublicStatus.published,
            lastPublishedAt: new Date(),
          },
        });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      actorOrganizationId: profile.organizationId,
      entityType: "vendor_public_snapshot",
      entityId: snapshot.id,
      action: "public_page.published",
      after: { slug, trustBand: band },
    });

    return snapshot;
  });
}

export async function suppressSnapshot(
  db: Db,
  args: { snapshotId: string; reason?: string; actorUserId?: string },
) {
  return withTx(db, async (tx) => {
    const updated = await tx.vendorPublicSnapshot.update({
      where: { id: args.snapshotId },
      data: { publicStatus: PublicStatus.suppressed },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "vendor_public_snapshot",
      entityId: updated.id,
      action: "public_page.suppressed",
      after: { reason: args.reason },
    });
    return updated;
  });
}
