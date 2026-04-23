import { NextResponse } from "next/server";
import { z } from "zod";
import { PricingSignalStatus } from "@prisma/client";
import { prisma } from "@/server/db/client";

const QuerySchema = z.object({
  status: z.nativeEnum(PricingSignalStatus).optional(),
  vendorProfileId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(100),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const signals = await prisma.publicPricingSignal.findMany({
    where: {
      status: parsed.data.status,
      vendorProfileId: parsed.data.vendorProfileId,
    },
    take: parsed.data.limit,
    orderBy: { createdAt: "desc" },
    include: {
      vendorProfile: { include: { organization: true, hqCity: true } },
    },
  });
  return NextResponse.json({
    items: signals.map((s) => ({
      id: s.id,
      vendorProfileId: s.vendorProfileId,
      vendorName: s.vendorProfile.organization.displayName,
      city: s.vendorProfile.hqCity?.name ?? null,
      signalType: s.signalType,
      unit: s.unit,
      priceValue: Number(s.priceValue),
      currency: s.currency,
      normalizedPgpm: s.normalizedPgpm ? Number(s.normalizedPgpm) : null,
      normalizationNotes: s.normalizationNotes,
      minQuantity: s.minQuantity,
      minContractMonths: s.minContractMonths,
      confidence: Number(s.confidence),
      freshnessScore: s.freshnessScore ? Number(s.freshnessScore) : null,
      status: s.status,
      extractedText: s.extractedText,
      observedAt: s.observedAt,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
    })),
  });
}
