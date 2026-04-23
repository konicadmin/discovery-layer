import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { createRequirement } from "@/server/services/requirements/create-requirement";
import { errorResponse } from "@/lib/api/handle-error";

const BodySchema = z.object({
  buyerOrganizationId: z.string(),
  title: z.string().min(3),
  serviceCategoryId: z.string(),
  cityId: z.string(),
  siteType: z.string().optional(),
  headcountRequired: z.number().int().positive().optional(),
  shiftPattern: z.string().optional(),
  reliefRequired: z.boolean().optional(),
  contractTermMonths: z.number().int().positive().optional(),
  startDate: z.string().datetime().optional(),
  complianceRequirements: z.any().optional(),
  specialRequirements: z.any().optional(),
  createdByUserId: z.string(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("buyerOrganizationId");
  const items = await prisma.buyerRequirement.findMany({
    where: orgId ? { buyerOrganizationId: orgId } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { city: true, serviceCategory: true },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const req = await createRequirement(prisma, {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
    });
    return NextResponse.json({ id: req.id, status: req.status }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
