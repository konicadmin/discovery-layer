import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import {
  approveReview,
  rejectReview,
  requestChanges,
} from "@/server/services/verification/review";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
  notes: z.string().max(2000).optional(),
  actorUserId: z.string(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { decision, notes, actorUserId } = parsed.data;
  try {
    if (decision === "approve") {
      const updated = await approveReview(prisma, { reviewId: id, notes, actorUserId });
      return NextResponse.json({ id: updated.id, status: updated.status });
    }
    if (decision === "reject") {
      if (!notes) {
        return NextResponse.json(
          { error: "notes required for reject" },
          { status: 400 },
        );
      }
      const updated = await rejectReview(prisma, { reviewId: id, notes, actorUserId });
      return NextResponse.json({ id: updated.id, status: updated.status });
    }
    if (!notes) {
      return NextResponse.json(
        { error: "notes required for request_changes" },
        { status: 400 },
      );
    }
    const updated = await requestChanges(prisma, { reviewId: id, notes, actorUserId });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return errorResponse(err);
  }
}
