import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { acceptClaim } from "@/server/services/claims/send-claim";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  claimToken: z.string().min(10),
  user: z.union([
    z.object({ existingUserId: z.string() }),
    z.object({
      name: z.string().min(2),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    }),
  ]),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await acceptClaim(prisma, parsed.data);
    return NextResponse.json({ userId: result.userId, claimStatus: result.claim.status });
  } catch (err) {
    return errorResponse(err);
  }
}
