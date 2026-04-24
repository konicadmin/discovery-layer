import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/lib/errors";
import { submitForReview } from "@/server/services/verification/review";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireVendorAccess } from "@/server/services/authz/guards";

const BodySchema = z.object({});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const session = await requireRequestSession(req, prisma);
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!vendor) throw new NotFoundError("vendor_profile", id);
    requireVendorAccess(session, vendor.organizationId);

    const review = await submitForReview(prisma, {
      vendorProfileId: id,
      actorUserId: session.userId,
    });
    return NextResponse.json(
      { reviewId: review.id, status: review.status },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
