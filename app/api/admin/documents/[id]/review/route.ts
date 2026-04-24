import { NextResponse } from "next/server";
import { z } from "zod";
import { DocumentStatus } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { reviewDocument } from "@/server/services/verification/review";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";

const BodySchema = z.object({
  status: z.nativeEnum(DocumentStatus),
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
    const updated = await reviewDocument(prisma, {
      documentId: id,
      status: parsed.data.status,
      notes: parsed.data.notes,
      actorUserId: session.userId,
    });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return errorResponse(err);
  }
}
