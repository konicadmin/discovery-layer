import {
  ComplianceType,
  type Prisma,
  ProfileStatus,
  Region,
  VerificationStatus,
} from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";

/**
 * Region-specific required compliance records for a security-staffing
 * vendor. Used by the shortlist scorer to gauge "compliance completeness"
 * without forcing India-only assumptions on US / EU vendors.
 */
function expectedComplianceFor(region: Region): ComplianceType[] {
  switch (region) {
    case Region.IN:
      return [ComplianceType.gst, ComplianceType.psara];
    case Region.US:
      return [
        ComplianceType.ein,
        ComplianceType.us_state_security_license,
        ComplianceType.workers_comp,
      ];
    case Region.EU:
      return [ComplianceType.vat, ComplianceType.eu_security_license];
  }
}

/**
 * Rules-based shortlist for Phase 3. Deterministic; AI rationale (Phase 4)
 * reads snapshots produced here.
 *
 * Hard filters:
 *   - verificationStatus = verified
 *   - profileStatus = active
 *   - vendor serves requirement's serviceCategoryId
 *   - vendor serves requirement's cityId (as a VendorServiceArea)
 *
 * Weighted score (all in [0, 1], default weights):
 *   - category match           0.20   (exact)
 *   - city match               0.20   (exact)
 *   - compliance completeness  0.20   (GST + PSARA both active)
 *   - profile completeness     0.15   (filled optional fields)
 *   - response behavior        0.15   (recent response rate; default 0.5)
 *   - recency                  0.10   (verifiedAt within last 180 days)
 */

export type Weights = {
  category: number;
  city: number;
  compliance: number;
  completeness: number;
  responseBehavior: number;
  recency: number;
};

const DEFAULT_WEIGHTS: Weights = {
  category: 0.2,
  city: 0.2,
  compliance: 0.2,
  completeness: 0.15,
  responseBehavior: 0.15,
  recency: 0.1,
};

export type MatchReason = {
  component: keyof Weights;
  score: number;
  weight: number;
  detail: string;
};

export type ShortlistOptions = {
  topN?: number;
  weights?: Partial<Weights>;
  actorUserId?: string;
};

export async function generateShortlist(
  db: Db,
  requirementId: string,
  options: ShortlistOptions = {},
) {
  const topN = options.topN ?? 10;
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

  return withTx(db, async (tx) => {
    const requirement = await tx.buyerRequirement.findUnique({
      where: { id: requirementId },
    });
    if (!requirement) throw new NotFoundError("buyer_requirement", requirementId);

    // Hard filter: vendor must match the requirement's region (via org.region).
    const pool = await tx.vendorProfile.findMany({
      where: {
        verificationStatus: VerificationStatus.verified,
        profileStatus: ProfileStatus.active,
        organization: { region: requirement.region },
        serviceCategories: {
          some: { serviceCategoryId: requirement.serviceCategoryId, active: true },
        },
        serviceAreas: {
          some: { cityId: requirement.cityId, serviceable: true },
        },
      },
      include: {
        organization: true,
        hqCity: true,
        complianceRecords: true,
        serviceAreas: true,
        serviceCategories: true,
      },
    });

    const totalVerifiedInCategory = await tx.vendorProfile.count({
      where: {
        verificationStatus: VerificationStatus.verified,
        organization: { region: requirement.region },
        serviceCategories: {
          some: { serviceCategoryId: requirement.serviceCategoryId, active: true },
        },
      },
    });

    const scored = pool
      .map((v) => {
        const reasons: MatchReason[] = [];
        reasons.push({
          component: "category",
          score: 1,
          weight: weights.category,
          detail: "exact category match",
        });
        reasons.push({
          component: "city",
          score: 1,
          weight: weights.city,
          detail: `serves ${requirement.cityId}`,
        });

        const complianceExpected = expectedComplianceFor(requirement.region);
        const complianceActive = complianceExpected.filter((ct) =>
          v.complianceRecords.some(
            (c) => c.complianceType === ct && c.status === "active",
          ),
        );
        const complianceScore =
          complianceExpected.length === 0
            ? 1
            : complianceActive.length / complianceExpected.length;
        reasons.push({
          component: "compliance",
          score: complianceScore,
          weight: weights.compliance,
          detail: complianceExpected
            .map((ct) => `${ct}=${complianceActive.includes(ct) ? "active" : "missing"}`)
            .join(", "),
        });

        const filled = [
          v.serviceSummary,
          v.yearEstablished,
          v.employeeBand,
          v.hqCityId,
        ].filter(Boolean).length;
        const completeness = filled / 4;
        reasons.push({
          component: "completeness",
          score: completeness,
          weight: weights.completeness,
          detail: `${filled}/4 profile fields set`,
        });

        // Response behavior is a placeholder in Phase 3 (no rollup table yet).
        // Default to neutral 0.5 so nobody is penalized without data.
        reasons.push({
          component: "responseBehavior",
          score: 0.5,
          weight: weights.responseBehavior,
          detail: "no 30-day rollup available",
        });

        const ageDays = v.verifiedAt
          ? (Date.now() - v.verifiedAt.getTime()) / (24 * 3600 * 1000)
          : 9999;
        const recency = ageDays <= 180 ? 1 : ageDays <= 365 ? 0.5 : 0.1;
        reasons.push({
          component: "recency",
          score: recency,
          weight: weights.recency,
          detail: v.verifiedAt
            ? `verified ${Math.round(ageDays)}d ago`
            : "never verified",
        });

        const total = reasons.reduce((acc, r) => acc + r.score * r.weight, 0);
        return {
          vendor: v,
          score: Math.round(total * 10000) / 10000,
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    // Persist snapshots (replace older rows for this requirement).
    await tx.vendorShortlistSnapshot.deleteMany({
      where: { buyerRequirementId: requirement.id },
    });
    if (scored.length > 0) {
      await tx.vendorShortlistSnapshot.createMany({
        data: scored.map((s) => ({
          id: newId(),
          buyerRequirementId: requirement.id,
          vendorProfileId: s.vendor.id,
          matchScore: s.score.toString(),
          matchReasonsJson: s.reasons as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await logEvent(tx, {
      actorUserId: options.actorUserId,
      actorOrganizationId: requirement.buyerOrganizationId,
      entityType: "buyer_requirement",
      entityId: requirement.id,
      action: "shortlist.generated",
      after: {
        candidatePoolSize: pool.length,
        totalVerifiedInCategory,
        returned: scored.length,
      },
    });

    return {
      requirementId: requirement.id,
      candidatePoolSize: pool.length,
      totalVerifiedInCategory,
      items: scored.map((s) => ({
        vendorProfileId: s.vendor.id,
        displayName: s.vendor.organization.displayName,
        verificationStatus: s.vendor.verificationStatus,
        score: s.score,
        reasons: s.reasons,
      })),
    };
  });
}

export async function readShortlist(db: Db, requirementId: string) {
  return withTx(db, async (tx) => {
    return tx.vendorShortlistSnapshot.findMany({
      where: { buyerRequirementId: requirementId },
      include: {
        vendorProfile: {
          include: { organization: true, hqCity: true },
        },
      },
      orderBy: { matchScore: "desc" },
    });
  });
}
