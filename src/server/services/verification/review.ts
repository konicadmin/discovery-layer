import {
  ChecklistItemStatus,
  NotificationChannel,
  ProfileStatus,
  type Prisma,
  ReviewStatus,
  ReviewType,
  VerificationStatus,
} from "@prisma/client";
import { NotFoundError, StateTransitionError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";
import { dispatchNotification } from "@/server/services/notifications/dispatch";
import { transitionVendor } from "./transition";

/**
 * Open (or reuse) a verification review for the vendor's primary category.
 * Seeds review_items from the category's checklist definition so reviewers
 * have a concrete checklist to walk through.
 */
export async function openReview(
  db: Db,
  args: { vendorProfileId: string; reviewType?: ReviewType; actorUserId?: string },
) {
  return withTx(db, async (tx) => {
    const profile = await tx.vendorProfile.findUnique({
      where: { id: args.vendorProfileId },
      include: { serviceCategories: true },
    });
    if (!profile) throw new NotFoundError("vendor_profile", args.vendorProfileId);

    const open = await tx.verificationReview.findFirst({
      where: {
        vendorProfileId: profile.id,
        status: { in: [ReviewStatus.pending, ReviewStatus.in_review, ReviewStatus.needs_changes] },
      },
    });
    if (open) return open;

    const review = await tx.verificationReview.create({
      data: {
        id: newId(),
        vendorProfileId: profile.id,
        reviewType: args.reviewType ?? ReviewType.initial,
      },
    });

    const primaryCategory =
      profile.serviceCategories.find((c) => c.primaryCategory) ??
      profile.serviceCategories[0];
    if (primaryCategory) {
      const checklist = await tx.verificationChecklistItem.findMany({
        where: { serviceCategoryId: primaryCategory.serviceCategoryId, active: true },
      });
      if (checklist.length > 0) {
        await tx.verificationReviewItem.createMany({
          data: checklist.map((c) => ({
            id: newId(),
            verificationReviewId: review.id,
            checklistItemId: c.id,
          })),
        });
      }
    }

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "verification_review",
      entityId: review.id,
      action: "review.opened",
      after: { vendorProfileId: profile.id },
    });

    return review;
  });
}

export async function submitForReview(
  db: Db,
  args: { vendorProfileId: string; actorUserId?: string },
) {
  return withTx(db, async (tx) => {
    const profile = await tx.vendorProfile.findUnique({
      where: { id: args.vendorProfileId },
    });
    if (!profile) throw new NotFoundError("vendor_profile", args.vendorProfileId);

    const submittable: ProfileStatus[] = [
      ProfileStatus.draft,
      ProfileStatus.in_progress,
      ProfileStatus.changes_requested,
    ];
    if (!submittable.includes(profile.profileStatus)) {
      throw new StateTransitionError(
        `cannot submit a profile in state ${profile.profileStatus}`,
      );
    }

    await transitionVendor(tx, {
      vendorProfileId: profile.id,
      toProfileStatus: ProfileStatus.submitted,
      toVerificationStatus:
        profile.verificationStatus === VerificationStatus.unverified ||
        profile.verificationStatus === VerificationStatus.rejected
          ? VerificationStatus.pending
          : undefined,
      actorUserId: args.actorUserId,
    });

    const review = await openReview(tx, {
      vendorProfileId: profile.id,
      actorUserId: args.actorUserId,
    });

    await dispatchNotification(tx, {
      templateKey: "vendor_submission_received",
      channel: NotificationChannel.email,
      organizationId: profile.organizationId,
      payload: { reviewId: review.id },
    });

    return review;
  });
}

export async function assignReview(
  db: Db,
  args: { reviewId: string; assigneeUserId: string; actorUserId?: string },
) {
  return withTx(db, async (tx) => {
    const review = await tx.verificationReview.findUnique({
      where: { id: args.reviewId },
    });
    if (!review) throw new NotFoundError("verification_review", args.reviewId);
    const updated = await tx.verificationReview.update({
      where: { id: args.reviewId },
      data: {
        assignedToUserId: args.assigneeUserId,
        status: review.status === ReviewStatus.pending ? ReviewStatus.in_review : review.status,
      },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "verification_review",
      entityId: review.id,
      action: "review.assigned",
      after: { assignedToUserId: args.assigneeUserId },
    });
    return updated;
  });
}

export async function setChecklistItem(
  db: Db,
  args: {
    reviewId: string;
    checklistItemId: string;
    status: ChecklistItemStatus;
    notes?: string;
    actorUserId: string;
  },
) {
  return withTx(db, async (tx) => {
    const review = await tx.verificationReview.findUnique({
      where: { id: args.reviewId },
    });
    if (!review) throw new NotFoundError("verification_review", args.reviewId);
    if (
      review.status === ReviewStatus.approved ||
      review.status === ReviewStatus.rejected
    ) {
      throw new ValidationError(`cannot edit checklist on a ${review.status} review`);
    }

    const item = await tx.verificationReviewItem.findUnique({
      where: {
        verificationReviewId_checklistItemId: {
          verificationReviewId: args.reviewId,
          checklistItemId: args.checklistItemId,
        },
      },
    });
    if (!item) {
      throw new NotFoundError("verification_review_item", args.checklistItemId);
    }

    const updated = await tx.verificationReviewItem.update({
      where: { id: item.id },
      data: {
        status: args.status,
        notes: args.notes,
        reviewedByUserId: args.actorUserId,
        reviewedAt: new Date(),
      },
    });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "verification_review_item",
      entityId: updated.id,
      action: "review.item_set",
      before: { status: item.status },
      after: { status: updated.status, notes: updated.notes },
    });

    return updated;
  });
}

async function loadReviewWithItems(
  tx: Prisma.TransactionClient,
  reviewId: string,
) {
  const review = await tx.verificationReview.findUnique({
    where: { id: reviewId },
    include: {
      reviewItems: { include: { checklistItem: true } },
      vendorProfile: true,
    },
  });
  if (!review) throw new NotFoundError("verification_review", reviewId);
  return review;
}

/**
 * Approval rules (per Phase 2 plan):
 *   - all required checklist items must be `pass` or `not_applicable`
 *   - the vendor's profile_status must be `submitted` or `under_review`
 *
 * Approval transitions profile_status → active and verification_status → verified.
 */
export async function approveReview(
  db: Db,
  args: { reviewId: string; notes?: string; actorUserId: string },
) {
  return withTx(db, async (tx) => {
    const review = await loadReviewWithItems(tx, args.reviewId);
    if (review.status === ReviewStatus.approved) return review;
    if (review.status === ReviewStatus.rejected) {
      throw new ValidationError("cannot approve a rejected review; reopen first");
    }

    const failingRequired = review.reviewItems.filter(
      (it) =>
        it.checklistItem.required &&
        it.status !== ChecklistItemStatus.pass &&
        it.status !== ChecklistItemStatus.not_applicable,
    );
    if (failingRequired.length > 0) {
      throw new ValidationError(
        `approval blocked: ${failingRequired.length} required checklist item(s) not passing`,
      );
    }

    const updated = await tx.verificationReview.update({
      where: { id: review.id },
      data: {
        status: ReviewStatus.approved,
        decisionNotes: args.notes,
        completedByUserId: args.actorUserId,
        completedAt: new Date(),
      },
    });

    if (review.vendorProfile.profileStatus === ProfileStatus.submitted) {
      await tx.vendorProfile.update({
        where: { id: review.vendorProfileId },
        data: { profileStatus: ProfileStatus.under_review },
      });
    }

    await transitionVendor(tx, {
      vendorProfileId: review.vendorProfileId,
      toProfileStatus: ProfileStatus.active,
      toVerificationStatus: VerificationStatus.verified,
      actorUserId: args.actorUserId,
      notes: args.notes,
    });

    await dispatchNotification(tx, {
      templateKey: "vendor_verification_approved",
      channel: NotificationChannel.email,
      organizationId: review.vendorProfile.organizationId,
      payload: { reviewId: review.id },
    });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      actorOrganizationId: review.vendorProfile.organizationId,
      entityType: "verification_review",
      entityId: review.id,
      action: "review.approved",
      after: { decisionNotes: args.notes },
    });

    return updated;
  });
}

export async function rejectReview(
  db: Db,
  args: { reviewId: string; notes: string; actorUserId: string },
) {
  if (!args.notes?.trim()) {
    throw new ValidationError("rejection requires reviewer notes");
  }
  return withTx(db, async (tx) => {
    const review = await loadReviewWithItems(tx, args.reviewId);
    if (review.status === ReviewStatus.approved) {
      throw new ValidationError("cannot reject an already-approved review");
    }

    const updated = await tx.verificationReview.update({
      where: { id: review.id },
      data: {
        status: ReviewStatus.rejected,
        decisionNotes: args.notes,
        completedByUserId: args.actorUserId,
        completedAt: new Date(),
      },
    });

    await transitionVendor(tx, {
      vendorProfileId: review.vendorProfileId,
      toVerificationStatus: VerificationStatus.rejected,
      actorUserId: args.actorUserId,
      notes: args.notes,
    });

    await dispatchNotification(tx, {
      templateKey: "vendor_verification_rejected",
      channel: NotificationChannel.email,
      organizationId: review.vendorProfile.organizationId,
      payload: { reviewId: review.id, notes: args.notes },
    });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      actorOrganizationId: review.vendorProfile.organizationId,
      entityType: "verification_review",
      entityId: review.id,
      action: "review.rejected",
      after: { decisionNotes: args.notes },
    });

    return updated;
  });
}

export async function requestChanges(
  db: Db,
  args: { reviewId: string; notes: string; actorUserId: string },
) {
  if (!args.notes?.trim()) {
    throw new ValidationError("request_changes requires reviewer notes");
  }
  return withTx(db, async (tx) => {
    const review = await loadReviewWithItems(tx, args.reviewId);
    if (review.status === ReviewStatus.approved || review.status === ReviewStatus.rejected) {
      throw new ValidationError(`cannot request changes on a ${review.status} review`);
    }

    const updated = await tx.verificationReview.update({
      where: { id: review.id },
      data: { status: ReviewStatus.needs_changes, decisionNotes: args.notes },
    });

    await tx.vendorProfile.update({
      where: { id: review.vendorProfileId },
      data: { profileStatus: ProfileStatus.changes_requested },
    });

    await dispatchNotification(tx, {
      templateKey: "vendor_changes_requested",
      channel: NotificationChannel.email,
      organizationId: review.vendorProfile.organizationId,
      payload: { reviewId: review.id, notes: args.notes },
    });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      actorOrganizationId: review.vendorProfile.organizationId,
      entityType: "verification_review",
      entityId: review.id,
      action: "review.changes_requested",
      after: { notes: args.notes },
    });

    return updated;
  });
}

export async function reviewDocument(
  db: Db,
  args: {
    documentId: string;
    status: import("@prisma/client").DocumentStatus;
    notes?: string;
    actorUserId: string;
  },
) {
  return withTx(db, async (tx) => {
    const doc = await tx.vendorDocument.findUnique({ where: { id: args.documentId } });
    if (!doc) throw new NotFoundError("vendor_document", args.documentId);
    const updated = await tx.vendorDocument.update({
      where: { id: doc.id },
      data: {
        status: args.status,
        notes: args.notes,
        reviewedByUserId: args.actorUserId,
        reviewedAt: new Date(),
      },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "vendor_document",
      entityId: doc.id,
      action: "document.reviewed",
      before: { status: doc.status },
      after: { status: updated.status, notes: updated.notes },
    });
    return updated;
  });
}
