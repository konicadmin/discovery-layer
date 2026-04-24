import type { MetadataRoute } from "next";
import { prisma } from "@/server/db/client";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, snaps, products] = await Promise.all([
    prisma.serviceCategory.findMany({ select: { code: true } }),
    prisma.vendorPublicSnapshot.findMany({
      where: { publicStatus: "published" },
      select: { slug: true, lastPublishedAt: true },
    }),
    prisma.product.findMany({
      select: {
        slug: true,
        vendorProfile: {
          select: {
            publicSnapshots: {
              where: { publicStatus: "published" },
              select: { slug: true },
            },
          },
        },
      },
    }),
  ]);

  const now = new Date();
  const out: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, priority: 1 },
    { url: absoluteUrl("/pricing"), lastModified: now, priority: 0.9 },
  ];
  for (const c of categories) {
    out.push({ url: absoluteUrl(`/pricing/${c.code}`), lastModified: now, priority: 0.8 });
  }
  for (const s of snaps) {
    out.push({
      url: absoluteUrl(`/vendors/${s.slug}`),
      lastModified: s.lastPublishedAt ?? now,
      priority: 0.7,
    });
  }
  for (const p of products) {
    const slug = p.vendorProfile.publicSnapshots[0]?.slug;
    if (!slug) continue;
    out.push({
      url: absoluteUrl(`/vendors/${slug}/${p.slug}`),
      lastModified: now,
      priority: 0.6,
    });
  }
  return out;
}
