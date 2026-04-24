import { describe, it, expect } from "vitest";
import { MembershipRole } from "@/generated/prisma";
import {
  isInternal,
  requireBuyerAccess,
  requireOpsAdmin,
  requireOrgAccess,
  requireVendorAccess,
} from "@/server/services/authz/guards";
import { AuthorizationError } from "@/lib/errors";
import type { Session } from "@/server/auth/session";

const buyerSession: Session = {
  userId: "u1",
  memberships: [{ organizationId: "buyer1", role: MembershipRole.buyer_admin }],
};

const vendorSession: Session = {
  userId: "u2",
  memberships: [{ organizationId: "vendor1", role: MembershipRole.vendor_member }],
};

const opsSession: Session = {
  userId: "u3",
  memberships: [{ organizationId: "internal", role: MembershipRole.ops_admin }],
};

describe("authz guards", () => {
  it("identifies internal sessions", () => {
    expect(isInternal(opsSession)).toBe(true);
    expect(isInternal(buyerSession)).toBe(false);
  });

  it("buyer cannot access vendor org", () => {
    expect(() => requireBuyerAccess(buyerSession, "vendor1")).toThrow(AuthorizationError);
  });

  it("buyer accesses own org", () => {
    expect(requireBuyerAccess(buyerSession, "buyer1")).toBe(MembershipRole.buyer_admin);
  });

  it("vendor accesses own org", () => {
    expect(requireVendorAccess(vendorSession, "vendor1")).toBe(MembershipRole.vendor_member);
  });

  it("ops_admin crosses tenant boundaries", () => {
    expect(requireBuyerAccess(opsSession, "buyer1")).toBe(MembershipRole.ops_admin);
    expect(requireVendorAccess(opsSession, "vendor1")).toBe(MembershipRole.ops_admin);
    expect(requireOpsAdmin(opsSession)).toBeUndefined();
  });

  it("requireOrgAccess allows role-list filtering", () => {
    expect(() =>
      requireOrgAccess(vendorSession, "vendor1", [MembershipRole.vendor_admin]),
    ).toThrow(AuthorizationError);
  });
});
