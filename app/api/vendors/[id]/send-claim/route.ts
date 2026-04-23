import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { sendClaim } from "@/server/services/claims/send-claim";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  actorUserId: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const claim = await sendClaim(prisma, { vendorProfileId: id, ...parsed.data });
    return NextResponse.json(
      { id: claim.id, expiresAt: claim.expiresAt },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
