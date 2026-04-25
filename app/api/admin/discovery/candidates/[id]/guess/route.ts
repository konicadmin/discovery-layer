import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/handle-error";
import { prisma } from "@/server/db/client";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";
import { runGuessForCandidate } from "@/server/services/discovery/run-guess";
import { HttpFetcher } from "@/server/services/ingestion/http-fetcher";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRequestSession(req, prisma);
    requireInternal(session);
    const { id } = await ctx.params;
    const fetcher = new HttpFetcher();
    const { result, candidate } = await runGuessForCandidate(prisma, {
      candidateId: id,
      fetcher,
      actorUserId: session.userId,
    });
    return NextResponse.json({ candidate, result });
  } catch (err) {
    return errorResponse(err);
  }
}
