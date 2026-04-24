import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { capturePricingSignals } from "@/server/services/ingestion/pricing";
import { registerSource } from "@/server/services/ingestion/sources";
import { errorResponse } from "@/lib/api/handle-error";

/**
 * Capture pricing signals for a known vendor from inline text.
 *
 * Two shapes supported:
 *   - { pageText, pageUrl } — extract from supplied text and store
 *     signals bound to a (maybe new) SourceUrl record
 *   - { pageText } — text-only capture when the URL is unknown
 */
const BodySchema = z.object({
  pageText: z.string().min(20),
  pageUrl: z.string().url().optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
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
    let sourceUrlId: string | undefined;
    if (parsed.data.pageUrl) {
      const src = await registerSource(prisma, { url: parsed.data.pageUrl });
      sourceUrlId = src.id;
    }
    const capture = await capturePricingSignals(prisma, {
      vendorProfileId: id,
      pageText: parsed.data.pageText,
      pageUrl: parsed.data.pageUrl ?? "inline://",
      sourceUrlId,
      actorUserId: parsed.data.actorUserId,
      observation: { expiresInDays: parsed.data.expiresInDays ?? 90 },
    });
    return NextResponse.json(capture, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
