import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/handle-error";
import { prisma } from "@/server/db/client";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";
import { crawlApprovedCandidates } from "@/server/services/discovery/crawl-batch";
import { HttpFetcher } from "@/server/services/ingestion/http-fetcher";

const BodySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireRequestSession(req, prisma);
    requireInternal(session);
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const result = await crawlApprovedCandidates(
      prisma,
      new HttpFetcher({ maxBytes: 5_000_000 }),
      {
        limit: parsed.data.limit,
        expiresInDays: parsed.data.expiresInDays,
        actorUserId: session.userId,
      },
    );
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
