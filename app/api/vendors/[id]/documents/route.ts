import { NextResponse } from "next/server";
import { z } from "zod";
import { DocumentType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/lib/errors";
import { attachDocument } from "@/server/services/vendors/update-profile";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireVendorAccess } from "@/server/services/authz/guards";

const BodySchema = z.object({
  documentType: z.nativeEnum(DocumentType),
  storageKey: z.string().min(3),
  fileName: z.string().min(1).max(256),
  mimeType: z.string().min(3).max(128),
  fileSize: z.number().int().positive(),
});

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

    const result = await attachDocument(prisma, {
      vendorProfileId: id,
      ...parsed.data,
      uploadedByUserId: session.userId,
      actorUserId: session.userId,
    });
    return NextResponse.json(
      { documentId: result.document.id, fileId: result.file.id },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
