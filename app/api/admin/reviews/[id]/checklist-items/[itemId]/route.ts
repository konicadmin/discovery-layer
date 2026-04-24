import { NextResponse } from "next/server";
import { z } from "zod";
import { ChecklistItemStatus } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { setChecklistItem } from "@/server/services/verification/review";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";

const BodySchema = z.object({
  status: z.nativeEnum(ChecklistItemStatus),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const session = await requireRequestSession(req, prisma);
    requireInternal(session);
    const updated = await setChecklistItem(prisma, {
      reviewId: id,
      checklistItemId: itemId,
      status: parsed.data.status,
      notes: parsed.data.notes,
      actorUserId: session.userId,
    });
    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      notes: updated.notes,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
