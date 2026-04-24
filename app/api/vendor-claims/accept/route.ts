import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { AuthorizationError } from "@/lib/errors";
import { acceptClaim } from "@/server/services/claims/send-claim";
import { errorResponse } from "@/lib/api/handle-error";
import { getOptionalRequestSession } from "@/server/auth/request-session";

const BodySchema = z.object({
  claimToken: z.string().min(10),
  user: z
    .object({
      name: z.string().min(2),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const session = await getOptionalRequestSession(req, prisma);
    if (!session && !parsed.data.user) {
      throw new AuthorizationError(
        "authentication required to bind an existing user; provide user details to create a new account",
      );
    }
    const result = await acceptClaim(prisma, {
      claimToken: parsed.data.claimToken,
      user: session ? { existingUserId: session.userId } : parsed.data.user!,
    });
    return NextResponse.json({ userId: result.userId, claimStatus: result.claim.status });
  } catch (err) {
    return errorResponse(err);
  }
}
