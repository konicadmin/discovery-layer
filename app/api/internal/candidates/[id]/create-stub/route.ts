import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { createStubFromCandidate } from "@/server/services/ingestion/dedupe";
import { errorResponse } from "@/lib/api/handle-error";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const result = await createStubFromCandidate(prisma, { candidateId: id });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
