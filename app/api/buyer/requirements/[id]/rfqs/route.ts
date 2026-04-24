import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { addRfqRecipient, createRfq, issueRfq } from "@/server/services/rfqs/create-rfq";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  responseDeadline: z.string().datetime().optional(),
  notes: z.string().optional(),
  recipientVendorProfileIds: z.array(z.string()).min(1).max(50),
  issueNow: z.boolean().optional(),
  createdByUserId: z.string(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const rfq = await createRfq(prisma, {
      buyerRequirementId: id,
      responseDeadline: parsed.data.responseDeadline
        ? new Date(parsed.data.responseDeadline)
        : undefined,
      notes: parsed.data.notes,
      createdByUserId: parsed.data.createdByUserId,
    });
    for (const vendorProfileId of parsed.data.recipientVendorProfileIds) {
      await addRfqRecipient(prisma, {
        rfqId: rfq.id,
        vendorProfileId,
        actorUserId: parsed.data.createdByUserId,
      });
    }
    let issued = rfq;
    if (parsed.data.issueNow) {
      issued = await issueRfq(prisma, {
        rfqId: rfq.id,
        actorUserId: parsed.data.createdByUserId,
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
