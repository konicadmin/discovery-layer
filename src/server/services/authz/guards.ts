import { MembershipRole } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";
import type { Session } from "@/server/auth/session";

const INTERNAL_ROLES: MembershipRole[] = [
  MembershipRole.ops_admin,
  MembershipRole.ops_reviewer,
];

const BUYER_ROLES: MembershipRole[] = [
  MembershipRole.buyer_admin,
  MembershipRole.buyer_member,
];

const VENDOR_ROLES: MembershipRole[] = [
  MembershipRole.vendor_admin,
  MembershipRole.vendor_member,
];

export function isInternal(session: Session): boolean {
  return session.memberships.some((m) => INTERNAL_ROLES.includes(m.role));
}

export function requireInternal(session: Session): void {
  if (!isInternal(session)) throw new AuthorizationError("internal role required");
}

export function requireOpsAdmin(session: Session): void {
  if (!session.memberships.some((m) => m.role === MembershipRole.ops_admin)) {
    throw new AuthorizationError("ops_admin role required");
  }
}

export function requireOrgAccess(
  session: Session,
  organizationId: string,
  allowedRoles?: MembershipRole[],
): MembershipRole {
  // Internal users may cross tenant boundaries.
  const internalMembership = session.memberships.find((m) =>
    INTERNAL_ROLES.includes(m.role),
  );
  if (internalMembership) return internalMembership.role;

  const membership = session.memberships.find((m) => m.organizationId === organizationId);
  if (!membership) throw new AuthorizationError("no membership in target organization");
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new AuthorizationError(`role ${membership.role} not permitted here`);
  }
  return membership.role;
}

export function requireBuyerAccess(session: Session, organizationId: string): MembershipRole {
  return requireOrgAccess(session, organizationId, [...BUYER_ROLES, ...INTERNAL_ROLES]);
}

export function requireVendorAccess(session: Session, organizationId: string): MembershipRole {
  return requireOrgAccess(session, organizationId, [...VENDOR_ROLES, ...INTERNAL_ROLES]);
}
