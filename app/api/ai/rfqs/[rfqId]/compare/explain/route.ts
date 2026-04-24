import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { explainCompare } from "@/server/services/ai/explain-compare";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({ requestedByUserId: z.string().optional() });

export async function POST(req: Request, ctx: { params: Promise<{ rfqId: string }> }) {
  const { rfqId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await explainCompare(prisma, { rfqId, ...parsed.data });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
