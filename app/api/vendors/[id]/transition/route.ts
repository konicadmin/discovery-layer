import { NextResponse } from "next/server";
import { z } from "zod";
import { ProfileStatus, VerificationStatus } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { transitionVendor } from "@/server/services/verification/transition";
import { DomainError } from "@/lib/errors";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";

const BodySchema = z
  .object({
    toProfileStatus: z.nativeEnum(ProfileStatus).optional(),
    toVerificationStatus: z.nativeEnum(VerificationStatus).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => v.toProfileStatus || v.toVerificationStatus, {
    message: "must specify at least one target status",
  });

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const session = await requireRequestSession(req, prisma);
    requireInternal(session);
    const updated = await transitionVendor(prisma, {
      vendorProfileId: id,
      ...parsed.data,
      actorUserId: session.userId,
    });
    return NextResponse.json({
      id: updated.id,
      profileStatus: updated.profileStatus,
      verificationStatus: updated.verificationStatus,
      verifiedAt: updated.verifiedAt,
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    throw err;
  }
}
