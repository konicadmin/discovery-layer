import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { capturePricingSignals } from "@/server/services/ingestion/pricing";
import { registerSource } from "@/server/services/ingestion/sources";
import { crawlAndCapturePricing } from "@/server/services/ingestion/crawl";
import { HttpFetcher } from "@/server/services/ingestion/http-fetcher";
import { errorResponse } from "@/lib/api/handle-error";
import { requireRequestSession } from "@/server/auth/request-session";
import { requireInternal } from "@/server/services/authz/guards";

/**
 * Capture pricing signals for a known vendor.
 *
 * Three shapes supported:
 *   - { pageText, pageUrl } — extract from supplied text and store
 *     signals bound to a (maybe new) SourceUrl record
 *   - { pageText } — text-only capture when the URL is unknown
 *   - { pageUrl } — fetch the live URL, create a CrawlRun, then extract
 */
const BodySchema = z.object({
  pageText: z.string().min(20).optional(),
  pageUrl: z.string().url().optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
}).refine((body) => body.pageText || body.pageUrl, {
  message: "pageText or pageUrl is required",
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
    requireInternal(session);
    let sourceUrlId: string | undefined;
    if (parsed.data.pageUrl) {
      const src = await registerSource(prisma, { url: parsed.data.pageUrl });
      sourceUrlId = src.id;
    }
    if (!parsed.data.pageText && sourceUrlId) {
      const capture = await crawlAndCapturePricing(prisma, {
        vendorProfileId: id,
        sourceUrlId,
        fetcher: new HttpFetcher(),
        actorUserId: session.userId,
        expiresInDays: parsed.data.expiresInDays ?? 90,
      });
      return NextResponse.json(capture, { status: 201 });
    }
    const capture = await capturePricingSignals(prisma, {
      vendorProfileId: id,
      pageText: parsed.data.pageText!,
      pageUrl: parsed.data.pageUrl ?? "inline://",
      sourceUrlId,
      actorUserId: session.userId,
      observation: { expiresInDays: parsed.data.expiresInDays ?? 90 },
    });
    return NextResponse.json(capture, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
