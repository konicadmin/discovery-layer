import { NextResponse } from "next/server";
import { z } from "zod";
import { DiscoveryMethod, SourceUrlStatus, SourceUrlType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { listSources, registerSource } from "@/server/services/ingestion/sources";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  url: z.string().url(),
  sourceType: z.nativeEnum(SourceUrlType).optional(),
  discoveryMethod: z.nativeEnum(DiscoveryMethod).optional(),
});

const QuerySchema = z.object({
  status: z.nativeEnum(SourceUrlStatus).optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const items = await listSources(prisma, parsed.data);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const source = await registerSource(prisma, parsed.data);
    return NextResponse.json({ id: source.id, url: source.url }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
