import { NextResponse } from "next/server";
import { z } from "zod";
import { VendorSource } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { createVendor } from "@/server/services/vendors/create-vendor";
import { DomainError } from "@/lib/errors";

const ListQuerySchema = z.object({
  status: z.enum(["unverified", "pending", "verified", "rejected", "suspended"]).optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = ListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const vendors = await prisma.vendorProfile.findMany({
    where: parsed.data.status ? { verificationStatus: parsed.data.status } : undefined,
    take: parsed.data.limit,
    orderBy: { updatedAt: "desc" },
    include: { organization: true, hqCity: true },
  });
  return NextResponse.json({
    items: vendors.map((v) => ({
      id: v.id,
      organizationId: v.organizationId,
      displayName: v.organization.displayName,
      legalName: v.organization.legalName,
      hqCity: v.hqCity?.name ?? null,
      profileStatus: v.profileStatus,
      verificationStatus: v.verificationStatus,
      createdBySource: v.createdBySource,
      updatedAt: v.updatedAt,
    })),
  });
}

const CreateBodySchema = z.object({
  legalName: z.string().min(2),
  displayName: z.string().min(2).optional(),
  gstin: z.string().optional(),
  website: z.string().url().optional(),
  primaryPhone: z.string().optional(),
  hqCityId: z.string().optional(),
  serviceCategoryIds: z.array(z.string()).min(1),
  createdBySource: z.nativeEnum(VendorSource).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await createVendor(prisma, parsed.data);
    return NextResponse.json(
      { organizationId: result.organization.id, vendorProfileId: result.profile.id },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    throw err;
  }
}
