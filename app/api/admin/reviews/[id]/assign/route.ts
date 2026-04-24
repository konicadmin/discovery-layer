import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { assignReview } from "@/server/services/verification/review";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";

const BodySchema = z.object({
  assigneeUserId: z.string(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const session = await requireRequestSession(req, prisma);
    requireInternal(session);
    const updated = await assignReview(prisma, {
      reviewId: id,
      assigneeUserId: parsed.data.assigneeUserId,
      actorUserId: session.userId,
    });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return errorResponse(err);
  }
}
