import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { submitForReview } from "@/server/services/verification/review";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({ actorUserId: z.string().optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const review = await submitForReview(prisma, {
      vendorProfileId: id,
      ...parsed.data,
    });
    return NextResponse.json(
      { reviewId: review.id, status: review.status },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
