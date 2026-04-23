import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import {
  publishPricingSignal,
  rejectPricingSignal,
} from "@/server/services/ingestion/pricing";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  decision: z.enum(["publish", "reject"]),
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
    if (parsed.data.decision === "publish") {
      const updated = await publishPricingSignal(prisma, {
        signalId: id,
        actorUserId: parsed.data.actorUserId,
        notes: parsed.data.notes,
      });
      return NextResponse.json({ id: updated.id, status: updated.status });
    }
    if (!parsed.data.notes) {
      return NextResponse.json(
        { error: "notes required for reject" },
        { status: 400 },
      );
    }
    const updated = await rejectPricingSignal(prisma, {
      signalId: id,
      actorUserId: parsed.data.actorUserId,
      notes: parsed.data.notes,
    });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return errorResponse(err);
  }
}
