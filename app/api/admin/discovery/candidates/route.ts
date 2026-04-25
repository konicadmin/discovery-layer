import { NextResponse } from "next/server";
import { z } from "zod";
import { DiscoveryCandidateStatus } from "@/generated/prisma";
import { errorResponse } from "@/lib/api/handle-error";
import { prisma } from "@/server/db/client";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";
import { createDiscoveryCandidate } from "@/server/services/discovery/create-candidate";

const CreateBodySchema = z.object({
  serviceCategoryId: z.string().min(1).optional(),
  vendorName: z.string().min(1).max(200).optional(),
  homepageUrl: z.string().url().optional(),
  searchTerm: z.string().min(1).max(500).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireRequestSession(req, prisma);
    requireInternal(session);
    const body = await req.json().catch(() => ({}));
    const parsed = CreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const created = await createDiscoveryCandidate(prisma, {
      ...parsed.data,
      actorUserId: session.userId,
    });
    return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const session = await requireRequestSession(req, prisma);
    requireInternal(session);

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam &&
      (Object.values(DiscoveryCandidateStatus) as string[]).includes(statusParam)
        ? (statusParam as DiscoveryCandidateStatus)
        : undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

    const candidates = await prisma.discoveryCandidate.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        serviceCategory: { select: { id: true, code: true, label: true } },
        approvedSource: { select: { id: true, url: true, status: true } },
      },
    });

    return NextResponse.json({ candidates });
  } catch (err) {
    return errorResponse(err);
  }
}
