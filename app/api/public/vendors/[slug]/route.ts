import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { deriveTrustBand } from "@/server/services/ingestion/publish";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const snap = await prisma.vendorPublicSnapshot.findUnique({
    where: { slug },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          evidenceItems: true,
          serviceCategories: { include: { serviceCategory: true } },
        },
      },
    },
  });
  if (!snap || snap.publicStatus !== "published") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const profile = snap.vendorProfile;
  const trustBand = deriveTrustBand(profile);
  return NextResponse.json({
    slug: snap.slug,
    trustBand,
    pageTitle: snap.pageTitle,
    metaDescription: snap.metaDescription,
    vendor: {
      displayName: profile.organization.displayName,
      website: profile.organization.website,
      city: profile.hqCity?.name,
      categories: profile.serviceCategories.map((c) => c.serviceCategory.label),
      serviceSummary: profile.serviceSummary,
    },
    evidence: profile.evidenceItems.map((e) => ({
      fieldName: e.fieldName,
      value: e.normalizedValue ?? e.rawValue,
      evidenceType: e.evidenceType,
      confidence: e.confidenceScore ? Number(e.confidenceScore) : null,
      freshness: e.freshnessScore ? Number(e.freshnessScore) : null,
      observedAt: e.observedAt,
    })),
    publishedAt: snap.lastPublishedAt,
  });
}
