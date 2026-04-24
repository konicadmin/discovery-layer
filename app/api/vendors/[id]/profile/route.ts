import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/lib/errors";
import { updateProfile } from "@/server/services/vendors/update-profile";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireVendorAccess } from "@/server/services/authz/guards";

const BodySchema = z.object({
  serviceSummary: z.string().max(2000).optional(),
  yearEstablished: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  employeeBand: z.string().max(64).optional(),
  hqCityId: z.string().nullable().optional(),
  operatingCitiesCount: z.number().int().min(0).max(2000).optional(),
  organization: z
    .object({
      legalName: z.string().min(2).optional(),
      displayName: z.string().min(2).optional(),
      gstin: z.string().optional(),
      website: z.string().url().optional(),
      primaryPhone: z.string().optional(),
    })
    .optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

    const updated = await updateProfile(prisma, {
      vendorProfileId: id,
      ...parsed.data,
      actorUserId: session.userId,
    });
    return NextResponse.json({ id: updated.id, profileStatus: updated.profileStatus });
  } catch (err) {
    return errorResponse(err);
  }
}
