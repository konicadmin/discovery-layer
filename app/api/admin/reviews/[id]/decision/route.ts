import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import {
  approveReview,
  rejectReview,
  requestChanges,
} from "@/server/services/verification/review";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";

const BodySchema = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
  notes: z.string().max(2000).optional(),
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
    const { decision, notes } = parsed.data;
    if (decision === "approve") {
      const updated = await approveReview(prisma, {
        reviewId: id,
        notes,
        actorUserId: session.userId,
      });
      return NextResponse.json({ id: updated.id, status: updated.status });
    }
    if (decision === "reject") {
      if (!notes) {
        return NextResponse.json(
          { error: "notes required for reject" },
          { status: 400 },
        );
      }
      const updated = await rejectReview(prisma, {
        reviewId: id,
        notes,
        actorUserId: session.userId,
      });
      return NextResponse.json({ id: updated.id, status: updated.status });
    }
    if (!notes) {
      return NextResponse.json(
        { error: "notes required for request_changes" },
        { status: 400 },
      );
    }
    const updated = await requestChanges(prisma, {
      reviewId: id,
      notes,
      actorUserId: session.userId,
    });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return errorResponse(err);
  }
}
