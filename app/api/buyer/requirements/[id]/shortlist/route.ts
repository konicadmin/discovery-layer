import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import {
  generateShortlist,
  readShortlist,
} from "@/server/services/shortlisting/shortlist";
import { errorResponse } from "@/lib/api/handle-error";
import { NotFoundError } from "@/lib/errors";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireBuyerAccess } from "@/server/services/authz/guards";

const PostBodySchema = z.object({
  topN: z.number().int().min(1).max(50).optional(),
  weights: z
    .object({
      category: z.number().min(0).max(1).optional(),
      city: z.number().min(0).max(1).optional(),
      compliance: z.number().min(0).max(1).optional(),
      completeness: z.number().min(0).max(1).optional(),
      responseBehavior: z.number().min(0).max(1).optional(),
      recency: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PostBodySchema.safeParse(body);
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

    const result = await generateShortlist(prisma, id, {
      ...parsed.data,
      actorUserId: session.userId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const session = await requireRequestSession(req, prisma);
    const requirement = await prisma.buyerRequirement.findUnique({
      where: { id },
      select: { buyerOrganizationId: true },
    });
    if (!requirement) throw new NotFoundError("buyer_requirement", id);
    requireBuyerAccess(session, requirement.buyerOrganizationId);

    const snapshots = await readShortlist(prisma, id);
    return NextResponse.json({
      items: snapshots.map((s) => ({
        vendorProfileId: s.vendorProfileId,
        displayName: s.vendorProfile.organization.displayName,
        hqCity: s.vendorProfile.hqCity?.name ?? null,
        verificationStatus: s.vendorProfile.verificationStatus,
        matchScore: s.matchScore ? Number(s.matchScore) : null,
        reasons: s.matchReasonsJson,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
