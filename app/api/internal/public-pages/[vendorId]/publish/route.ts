import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { publishSnapshot } from "@/server/services/ingestion/publish";
import { errorResponse } from "@/lib/api/handle-error";

export async function POST(_req: Request, ctx: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await ctx.params;
  try {
    const snap = await publishSnapshot(prisma, { vendorProfileId: vendorId });
    return NextResponse.json(
      { id: snap.id, slug: snap.slug, status: snap.publicStatus },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
