import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { compareRfq } from "@/server/services/quotes/compare";
import { errorResponse } from "@/lib/api/handle-error";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const compare = await compareRfq(prisma, id);
    return NextResponse.json(compare);
  } catch (err) {
    return errorResponse(err);
  }
}
