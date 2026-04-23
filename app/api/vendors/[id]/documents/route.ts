import { NextResponse } from "next/server";
import { z } from "zod";
import { DocumentType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { attachDocument } from "@/server/services/vendors/update-profile";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  documentType: z.nativeEnum(DocumentType),
  storageKey: z.string().min(3),
  fileName: z.string().min(1).max(256),
  mimeType: z.string().min(3).max(128),
  fileSize: z.number().int().positive(),
  uploadedByUserId: z.string().optional(),
  actorUserId: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await attachDocument(prisma, { vendorProfileId: id, ...parsed.data });
    return NextResponse.json(
      { documentId: result.document.id, fileId: result.file.id },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
