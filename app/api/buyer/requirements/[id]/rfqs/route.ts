import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/lib/errors";
import { addRfqRecipient, createRfq, issueRfq } from "@/server/services/rfqs/create-rfq";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireBuyerAccess } from "@/server/services/authz/guards";

const BodySchema = z.object({
  responseDeadline: z.string().datetime().optional(),
  notes: z.string().optional(),
  recipientVendorProfileIds: z.array(z.string()).min(1).max(50),
  issueNow: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const session = await requireRequestSession(req, prisma);
    const requirement = await prisma.buyerRequirement.findUnique({
      where: { id },
      select: { buyerOrganizationId: true },
    });
    if (!requirement) throw new NotFoundError("buyer_requirement", id);
    requireBuyerAccess(session, requirement.buyerOrganizationId);

    const rfq = await createRfq(prisma, {
      buyerRequirementId: id,
      responseDeadline: parsed.data.responseDeadline
        ? new Date(parsed.data.responseDeadline)
        : undefined,
      notes: parsed.data.notes,
      createdByUserId: session.userId,
    });
    for (const vendorProfileId of parsed.data.recipientVendorProfileIds) {
      await addRfqRecipient(prisma, {
        rfqId: rfq.id,
        vendorProfileId,
        actorUserId: session.userId,
      });
    }
    let issued = rfq;
    if (parsed.data.issueNow) {
      issued = await issueRfq(prisma, {
        rfqId: rfq.id,
        actorUserId: session.userId,
      });
    }
    return NextResponse.json(
      { id: issued.id, status: issued.status, rfqCode: issued.rfqCode },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
