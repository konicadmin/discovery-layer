import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { sendClaim } from "@/server/services/claims/send-claim";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const snap = await prisma.vendorPublicSnapshot.findUnique({
    where: { slug },
  });
  if (!snap) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const claim = await sendClaim(prisma, {
      vendorProfileId: snap.vendorProfileId,
      email: parsed.data.email,
      phone: parsed.data.phone,
    });
    // Increment claim_starts counter for the current day.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.vendorPageMetric.upsert({
      where: { snapshotId_metricDate: { snapshotId: snap.id, metricDate: today } },
      create: {
        id: crypto.randomUUID(),
        snapshotId: snap.id,
        vendorProfileId: snap.vendorProfileId,
        metricDate: today,
        claimStarts: 1,
      },
      update: { claimStarts: { increment: 1 } },
    });
    return NextResponse.json(
      { claimId: claim.id, expiresAt: claim.expiresAt },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
