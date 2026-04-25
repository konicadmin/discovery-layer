import {
  MembershipRole,
  MembershipStatus,
  type PrismaClient,
} from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";
import type { Session } from "./session";
import { getOptionalRequestSession } from "./request-session";
import { requireInternal } from "@/server/services/authz/guards";

type DbLike = Pick<PrismaClient, "user">;

const INTERNAL_ROLES = [MembershipRole.ops_admin, MembershipRole.ops_reviewer];

async function getDevOpsSession(db: DbLike): Promise<Session | null> {
  if (process.env.NODE_ENV === "production") return null;

  const user = await db.user.findFirst({
    where: {
      status: "active",
      memberships: {
        some: {
          status: MembershipStatus.active,
          role: { in: INTERNAL_ROLES },
        },
      },
    },
    include: {
      memberships: {
        where: {
          status: MembershipStatus.active,
          role: { in: INTERNAL_ROLES },
        },
        select: { organizationId: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    phone: user.phone,
    memberships: user.memberships.map((membership) => ({
      organizationId: membership.organizationId,
      role: membership.role,
    })),
  };
}

export async function requireInternalRequestSession(
  req: Request,
  db: DbLike,
): Promise<Session> {
  const session = (await getOptionalRequestSession(req, db)) ?? (await getDevOpsSession(db));
  if (!session) throw new AuthorizationError("authentication required");
  requireInternal(session);
  return session;
}
