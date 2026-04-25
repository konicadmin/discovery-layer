import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/handle-error";
import { prisma } from "@/server/db/client";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";
import { rejectDiscoveryCandidate } from "@/server/services/discovery/create-candidate";

const BodySchema = z.object({
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRequestSession(req, prisma);
    requireInternal(session);
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const updated = await rejectDiscoveryCandidate(prisma, {
      candidateId: id,
      notes: parsed.data.notes,
      actorUserId: session.userId,
    });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return errorResponse(err);
  }
}
