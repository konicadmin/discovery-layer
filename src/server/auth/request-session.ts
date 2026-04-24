import { MembershipStatus, type PrismaClient } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";
import type { Session } from "./session";

type DbLike = Pick<PrismaClient, "user">;

async function loadSessionForUserId(db: DbLike, userId: string): Promise<Session> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { status: MembershipStatus.active },
        select: { organizationId: true, role: true },
      },
    },
  });
  if (!user || user.status !== "active") {
    throw new AuthorizationError("invalid session");
  }

  return {
    userId: user.id,
    email: user.email,
    phone: user.phone,
    memberships: user.memberships.map((m) => ({
      organizationId: m.organizationId,
      role: m.role,
    })),
  };
}

export async function getOptionalRequestSession(
  req: Request,
  db: DbLike,
): Promise<Session | null> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return null;
  return loadSessionForUserId(db, userId);
}

export async function requireRequestSession(
  req: Request,
  db: DbLike,
): Promise<Session> {
  const session = await getOptionalRequestSession(req, db);
  if (!session) {
    throw new AuthorizationError("authentication required");
  }
  return session;
}
