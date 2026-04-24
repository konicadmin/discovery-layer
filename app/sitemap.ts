import type { MetadataRoute } from "next";
import { PublicStatus, PricingSignalStatus } from "@/generated/prisma";
import { absoluteUrl } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [snapshots, pricedCategories] = await Promise.all([
    prisma.vendorPublicSnapshot.findMany({
      where: { publicStatus: PublicStatus.published },
      select: { slug: true, lastPublishedAt: true },
      orderBy: { lastPublishedAt: "desc" },
      take: 5000,
    }),
    prisma.vendorServiceCategory.findMany({
      where: {
        vendorProfile: {
          pricingSignals: { some: { status: PricingSignalStatus.published } },
        },
      },
      select: {
        serviceCategory: { select: { code: true } },
        vendorProfile: { select: { organization: { select: { region: true } } } },
      },
      distinct: ["serviceCategoryId", "vendorProfileId"],
      take: 5000,
    }),
  ]);

  const categoryPaths = new Set(
    pricedCategories.map(
      (item) =>
        `/pricing/${item.vendorProfile.organization.region.toLowerCase()}/${item.serviceCategory.code}`,
    ),
  );

  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/pricing"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...Array.from(categoryPaths).map((path) => ({
      url: absoluteUrl(path),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...snapshots.map((snap) => ({
      url: absoluteUrl(`/vendors/${snap.slug}`),
      lastModified: snap.lastPublishedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}

