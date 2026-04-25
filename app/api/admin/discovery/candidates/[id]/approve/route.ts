import { NextResponse } from "next/server";
import { z } from "zod";
import { SourceUrlType } from "@/generated/prisma";
import { errorResponse } from "@/lib/api/handle-error";
import { prisma } from "@/server/db/client";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";
import { approveDiscoveryCandidate } from "@/server/services/discovery/approve-candidate";

const BodySchema = z.object({
  pricingUrl: z.string().url().optional(),
  sourceType: z
    .enum(Object.values(SourceUrlType) as [string, ...string[]])
    .optional(),
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
    const { candidate, source } = await approveDiscoveryCandidate(prisma, {
      candidateId: id,
      pricingUrl: parsed.data.pricingUrl,
      sourceType: parsed.data.sourceType as SourceUrlType | undefined,
      actorUserId: session.userId,
    });
    return NextResponse.json({
      candidate: { id: candidate.id, status: candidate.status },
      source: { id: source.id, url: source.url, status: source.status },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
