import type { MetadataRoute } from "next";
import { PublicStatus, PricingSignalStatus } from "@/generated/prisma";
import { absoluteUrl } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

const COMPARISON_PAGE_LIMIT = 30;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [
    snapshots,
    pricedCategories,
    categoriesWithSignals,
    categoryVendorRows,
  ] = await Promise.all([
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
    prisma.serviceCategory.findMany({
      where: {
        vendorCategories: {
          some: {
            vendorProfile: {
              pricingSignals: { some: { status: PricingSignalStatus.published } },
            },
          },
        },
      },
      select: { code: true, id: true },
    }),
    prisma.vendorServiceCategory.findMany({
      where: {
        vendorProfile: {
          pricingSignals: { some: { status: PricingSignalStatus.published } },
          publicSnapshots: {
            some: { publicStatus: PublicStatus.published },
          },
        },
      },
      select: {
        serviceCategoryId: true,
        serviceCategory: { select: { code: true } },
        vendorProfile: {
          select: {
            id: true,
            publicSnapshots: {
              where: { publicStatus: PublicStatus.published },
              select: { slug: true, lastPublishedAt: true },
              orderBy: { lastPublishedAt: "desc" },
              take: 1,
            },
            pricingSignals: {
              where: { status: PricingSignalStatus.published },
              select: { observedAt: true },
              orderBy: { observedAt: "desc" },
              take: 1,
            },
          },
        },
      },
      take: 5000,
    }),
  ]);

  const categoryPaths = new Set(
    pricedCategories.map(
      (item) =>
        `/pricing/${item.vendorProfile.organization.region.toLowerCase()}/${item.serviceCategory.code}`,
    ),
  );

  // Per-category last observed signal time (max of any published signal in that category).
  const categoryLastObserved = new Map<string, Date>();
  for (const row of categoryVendorRows) {
    const code = row.serviceCategory.code;
    const observedAt = row.vendorProfile.pricingSignals[0]?.observedAt;
    if (!observedAt) continue;
    const current = categoryLastObserved.get(code);
    if (!current || observedAt > current) {
      categoryLastObserved.set(code, observedAt);
    }
  }

  // Group vendors by category for comparison pair generation.
  type VendorEntry = {
    slug: string;
    lastObservedAt: Date | null;
  };
  const vendorsByCategory = new Map<string, VendorEntry[]>();
  const seenVendorPerCategory = new Set<string>();
  for (const row of categoryVendorRows) {
    const code = row.serviceCategory.code;
    const slug = row.vendorProfile.publicSnapshots[0]?.slug;
    if (!slug) continue;
    const dedupeKey = `${code}::${row.vendorProfile.id}`;
    if (seenVendorPerCategory.has(dedupeKey)) continue;
    seenVendorPerCategory.add(dedupeKey);
    const list = vendorsByCategory.get(code) ?? [];
    list.push({
      slug,
      lastObservedAt: row.vendorProfile.pricingSignals[0]?.observedAt ?? null,
    });
    vendorsByCategory.set(code, list);
  }

  // Build deterministic comparison pairs, capped at COMPARISON_PAGE_LIMIT.
  const comparisonEntries: Array<{ url: string; lastModified: Date }> = [];
  const seenPairs = new Set<string>();
  const sortedCategoryCodes = Array.from(vendorsByCategory.keys()).sort();
  outer: for (const code of sortedCategoryCodes) {
    const vendors = vendorsByCategory.get(code) ?? [];
    if (vendors.length < 2) continue;
    const sortedSlugs = vendors
      .map((v) => v.slug)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const slugToEntry = new Map(vendors.map((v) => [v.slug, v]));
    for (let i = 0; i < sortedSlugs.length; i++) {
      for (let j = i + 1; j < sortedSlugs.length; j++) {
        const slugA = sortedSlugs[i];
        const slugB = sortedSlugs[j];
        if (!slugA || !slugB) continue;
        const pairKey = `${slugA}::${slugB}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const entryA = slugToEntry.get(slugA);
        const entryB = slugToEntry.get(slugB);
        const candidates = [
          entryA?.lastObservedAt,
          entryB?.lastObservedAt,
        ].filter((d): d is Date => d instanceof Date);
        const lastModified =
          candidates.length > 0
            ? new Date(Math.max(...candidates.map((d) => d.getTime())))
            : now;
        comparisonEntries.push({
          url: absoluteUrl(`/compare/${slugA}-vs-${slugB}`),
          lastModified,
        });
        if (comparisonEntries.length >= COMPARISON_PAGE_LIMIT) break outer;
      }
    }
  }

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
    ...categoriesWithSignals.map((cat) => ({
      url: absoluteUrl(`/categories/${cat.code}`),
      lastModified: categoryLastObserved.get(cat.code) ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...comparisonEntries.map((entry) => ({
      url: entry.url,
      lastModified: entry.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...snapshots.map((snap) => ({
      url: absoluteUrl(`/vendors/${snap.slug}`),
      lastModified: snap.lastPublishedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
