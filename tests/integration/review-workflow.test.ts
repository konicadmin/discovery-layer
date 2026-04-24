import { describe, it, expect } from "vitest";
import {
  ChecklistItemStatus,
  DocumentStatus,
  DocumentType,
  ProfileStatus,
  ReviewStatus,
  VerificationStatus,
} from "@/generated/prisma";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { createVendor } from "@/server/services/vendors/create-vendor";
import {
  approveReview,
  assignReview,
  rejectReview,
  requestChanges,
  reviewDocument,
  setChecklistItem,
  submitForReview,
} from "@/server/services/verification/review";
import { attachDocument } from "@/server/services/vendors/update-profile";
import { ValidationError } from "@/lib/errors";

async function bootstrap() {
  const prisma = getPrisma();
  const cat = await prisma.serviceCategory.create({
    data: { id: newId(), code: `c-${newId()}`, label: "test" },
  });
  // Two checklist items; one required, one optional.
  await prisma.verificationChecklistItem.createMany({
    data: [
      {
        id: newId(),
        serviceCategoryId: cat.id,
        code: "psara_provided",
        label: "PSARA provided",
        required: true,
        sortOrder: 0,
      },
      {
        id: newId(),
        serviceCategoryId: cat.id,
        code: "iso_optional",
        label: "ISO certified (optional)",
        required: false,
        sortOrder: 1,
      },
    ],
  });
  const reviewer = await prisma.user.create({
    data: { id: newId(), email: `r-${newId()}@x.test`, name: "Reviewer" },
  });
  const { profile } = await createVendor(prisma, {
    legalName: "ReviewableCo",
    serviceCategoryIds: [cat.id],
  });
  return { prisma, cat, reviewer, profile };
}

describe("verification review workflow", () => {
  it("submitting a draft profile opens a review with seeded checklist items", async () => {
    const { prisma, profile } = await bootstrap();
    const review = await submitForReview(prisma, { vendorProfileId: profile.id });
    expect(review.status).toBe(ReviewStatus.pending);

    const items = await prisma.verificationReviewItem.findMany({
      where: { verificationReviewId: review.id },
    });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === ChecklistItemStatus.pending)).toBe(true);

    const refreshed = await prisma.vendorProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(refreshed.profileStatus).toBe(ProfileStatus.submitted);
    expect(refreshed.verificationStatus).toBe(VerificationStatus.pending);

    const note = await prisma.notification.findFirst({
      where: { templateKey: "vendor_submission_received" },
    });
    expect(note?.status).toBe("sent");
  });

  it("approve is blocked while a required checklist item is not pass/not_applicable", async () => {
    const { prisma, reviewer, profile } = await bootstrap();
    const review = await submitForReview(prisma, { vendorProfileId: profile.id });
    await assignReview(prisma, {
      reviewId: review.id,
      assigneeUserId: reviewer.id,
      actorUserId: reviewer.id,
    });

    await expect(
      approveReview(prisma, { reviewId: review.id, actorUserId: reviewer.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("approve succeeds when required items pass; vendor → active + verified", async () => {
    const { prisma, reviewer, profile } = await bootstrap();
    const review = await submitForReview(prisma, { vendorProfileId: profile.id });
    const items = await prisma.verificationReviewItem.findMany({
      where: { verificationReviewId: review.id },
      include: { checklistItem: true },
    });
    const required = items.find((i) => i.checklistItem.required);
    expect(required).toBeDefined();

    await setChecklistItem(prisma, {
      reviewId: review.id,
      checklistItemId: required!.checklistItemId,
      status: ChecklistItemStatus.pass,
      notes: "license sighted",
      actorUserId: reviewer.id,
    });

    const updated = await approveReview(prisma, {
      reviewId: review.id,
      notes: "OK",
      actorUserId: reviewer.id,
    });
    expect(updated.status).toBe(ReviewStatus.approved);
    expect(updated.completedByUserId).toBe(reviewer.id);

    const v = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(v.profileStatus).toBe(ProfileStatus.active);
    expect(v.verificationStatus).toBe(VerificationStatus.verified);
    expect(v.verifiedAt).not.toBeNull();
  });

  it("not_applicable counts as resolved for approval", async () => {
    const { prisma, reviewer, profile } = await bootstrap();
    const review = await submitForReview(prisma, { vendorProfileId: profile.id });
    const items = await prisma.verificationReviewItem.findMany({
      where: { verificationReviewId: review.id },
      include: { checklistItem: true },
    });
    const required = items.find((i) => i.checklistItem.required)!;

    await setChecklistItem(prisma, {
      reviewId: review.id,
      checklistItemId: required.checklistItemId,
      status: ChecklistItemStatus.not_applicable,
      notes: "exempt",
      actorUserId: reviewer.id,
    });

    const updated = await approveReview(prisma, {
      reviewId: review.id,
      actorUserId: reviewer.id,
    });
    expect(updated.status).toBe(ReviewStatus.approved);
  });

  it("reject requires notes and moves verification → rejected", async () => {
    const { prisma, reviewer, profile } = await bootstrap();
    const review = await submitForReview(prisma, { vendorProfileId: profile.id });

    await expect(
      rejectReview(prisma, { reviewId: review.id, notes: "  ", actorUserId: reviewer.id }),
    ).rejects.toThrow(/notes/);

    const updated = await rejectReview(prisma, {
      reviewId: review.id,
      notes: "incomplete docs",
      actorUserId: reviewer.id,
    });
    expect(updated.status).toBe(ReviewStatus.rejected);

    const v = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(v.verificationStatus).toBe(VerificationStatus.rejected);

    const note = await prisma.notification.findFirst({
      where: { templateKey: "vendor_verification_rejected" },
    });
    expect(note).not.toBeNull();
  });

  it("request_changes flips profile to changes_requested and notifies", async () => {
    const { prisma, reviewer, profile } = await bootstrap();
    const review = await submitForReview(prisma, { vendorProfileId: profile.id });

    const updated = await requestChanges(prisma, {
      reviewId: review.id,
      notes: "please re-upload PSARA",
      actorUserId: reviewer.id,
    });
    expect(updated.status).toBe(ReviewStatus.needs_changes);

    const v = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(v.profileStatus).toBe(ProfileStatus.changes_requested);
  });

  it("re-submitting after changes reopens the review path without duplication", async () => {
    const { prisma, reviewer, profile } = await bootstrap();
    const first = await submitForReview(prisma, { vendorProfileId: profile.id });
    await requestChanges(prisma, {
      reviewId: first.id,
      notes: "fix it",
      actorUserId: reviewer.id,
    });

    const second = await submitForReview(prisma, { vendorProfileId: profile.id });
    // Review with `needs_changes` is reused, not duplicated.
    expect(second.id).toBe(first.id);

    const reviews = await prisma.verificationReview.findMany({
      where: { vendorProfileId: profile.id },
    });
    expect(reviews).toHaveLength(1);
  });

  it("reviewDocument records reviewer + status and audits", async () => {
    const { prisma, reviewer, profile } = await bootstrap();
    const { document } = await attachDocument(prisma, {
      vendorProfileId: profile.id,
      documentType: DocumentType.psara_license,
      storageKey: "s3://bucket/file",
      fileName: "psara.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
    });
    const updated = await reviewDocument(prisma, {
      documentId: document.id,
      status: DocumentStatus.verified,
      notes: "matches profile",
      actorUserId: reviewer.id,
    });
    expect(updated.status).toBe(DocumentStatus.verified);
    expect(updated.reviewedByUserId).toBe(reviewer.id);

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: "vendor_document", entityId: document.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.action).toBe("document.reviewed");
  });
});
