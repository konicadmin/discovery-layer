import { ProfileStatus, VerificationStatus } from "@prisma/client";
import { StateTransitionError } from "@/lib/errors";

/**
 * Profile lifecycle (vendor onboarding completion).
 * draft → in_progress → submitted → under_review → (active | changes_requested)
 * changes_requested → in_progress → submitted → ...
 */
const PROFILE_TRANSITIONS: Record<ProfileStatus, ProfileStatus[]> = {
  [ProfileStatus.draft]: [ProfileStatus.in_progress, ProfileStatus.submitted],
  [ProfileStatus.in_progress]: [ProfileStatus.submitted],
  [ProfileStatus.submitted]: [ProfileStatus.under_review, ProfileStatus.changes_requested],
  [ProfileStatus.under_review]: [
    ProfileStatus.active,
    ProfileStatus.changes_requested,
  ],
  [ProfileStatus.changes_requested]: [ProfileStatus.in_progress, ProfileStatus.submitted],
  [ProfileStatus.active]: [ProfileStatus.changes_requested],
};

/**
 * Verification lifecycle (trust). Deliberately separate from onboarding.
 * unverified → pending → (verified | rejected)
 * verified → suspended → unverified (re-review)
 */
const VERIFICATION_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  [VerificationStatus.unverified]: [VerificationStatus.pending],
  [VerificationStatus.pending]: [
    VerificationStatus.verified,
    VerificationStatus.rejected,
  ],
  [VerificationStatus.verified]: [VerificationStatus.suspended],
  [VerificationStatus.rejected]: [VerificationStatus.pending],
  [VerificationStatus.suspended]: [VerificationStatus.unverified, VerificationStatus.pending],
};

export function assertProfileTransition(from: ProfileStatus, to: ProfileStatus): void {
  if (from === to) return;
  if (!PROFILE_TRANSITIONS[from]?.includes(to)) {
    throw new StateTransitionError(`profile_status: ${from} → ${to} not allowed`);
  }
}

export function assertVerificationTransition(
  from: VerificationStatus,
  to: VerificationStatus,
): void {
  if (from === to) return;
  if (!VERIFICATION_TRANSITIONS[from]?.includes(to)) {
    throw new StateTransitionError(`verification_status: ${from} → ${to} not allowed`);
  }
}

export function allowedNextProfileStatuses(from: ProfileStatus): ProfileStatus[] {
  return PROFILE_TRANSITIONS[from] ?? [];
}

export function allowedNextVerificationStatuses(
  from: VerificationStatus,
): VerificationStatus[] {
  return VERIFICATION_TRANSITIONS[from] ?? [];
}
