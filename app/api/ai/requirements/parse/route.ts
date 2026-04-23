import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { parseRequirement } from "@/server/services/ai/parse-requirement";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  rawText: z.string().min(5).max(4000),
  categoryCode: z.string().min(1),
  requestedByUserId: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await parseRequirement(prisma, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
