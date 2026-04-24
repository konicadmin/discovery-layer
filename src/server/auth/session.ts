import type { MembershipRole } from "@/generated/prisma";

export type SessionMembership = {
  organizationId: string;
  role: MembershipRole;
};

export type Session = {
  userId: string;
  email?: string | null;
  phone?: string | null;
  memberships: SessionMembership[];
};
