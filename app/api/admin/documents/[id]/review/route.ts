import { NextResponse } from "next/server";
import { z } from "zod";
import { DocumentStatus } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { reviewDocument } from "@/server/services/verification/review";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  status: z.nativeEnum(DocumentStatus),
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
  try {
    const updated = await reviewDocument(prisma, { documentId: id, ...parsed.data });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return errorResponse(err);
  }
}
