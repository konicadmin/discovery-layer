import { NextResponse } from "next/server";
import { z } from "zod";
import { DecisionStatus } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/lib/errors";
import { decideRfq } from "@/server/services/rfqs/decide";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireBuyerAccess } from "@/server/services/authz/guards";

const BodySchema = z.object({
  decision: z.nativeEnum(DecisionStatus),
  selectedVendorProfileId: z.string().optional(),
  reasonCode: z.string().max(64).optional(),
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
    const rfq = await prisma.rfq.findUnique({
      where: { id },
      select: { buyerOrganizationId: true },
    });
    if (!rfq) throw new NotFoundError("rfq", id);
    requireBuyerAccess(session, rfq.buyerOrganizationId);

    const decision = await decideRfq(prisma, {
      rfqId: id,
      ...parsed.data,
      actorUserId: session.userId,
    });
    return NextResponse.json(
      {
        id: decision.id,
        decisionStatus: decision.decisionStatus,
        selectedVendorProfileId: decision.selectedVendorProfileId,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
