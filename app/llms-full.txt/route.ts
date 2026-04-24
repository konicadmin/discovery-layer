import { NextResponse } from "next/server";
import { PublicStatus, PricingSignalStatus } from "@prisma/client";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const [snapshots, signals] = await Promise.all([
    prisma.vendorPublicSnapshot.findMany({
      where: { publicStatus: PublicStatus.published },
      include: {
        vendorProfile: {
          include: {
            organization: true,
            hqCity: true,
            serviceCategories: { include: { serviceCategory: true } },
          },
        },
      },
      orderBy: { lastPublishedAt: "desc" },
      take: 100,
    }),
    prisma.publicPricingSignal.findMany({
      where: { status: PricingSignalStatus.published },
      include: {
        vendorProfile: {
          include: {
            organization: true,
            serviceCategories: { include: { serviceCategory: true } },
          },
        },
      },
      orderBy: { observedAt: "desc" },
      take: 100,
    }),
  ]);

  const categories = new Map<string, { label: string; regions: Set<string>; count: number }>();
  for (const signal of signals) {
    for (const vc of signal.vendorProfile.serviceCategories) {
      const existing =
        categories.get(vc.serviceCategory.code) ??
        {
          label: vc.serviceCategory.label,
          regions: new Set<string>(),
          count: 0,
        };
      existing.regions.add(signal.vendorProfile.organization.region);
      existing.count += 1;
      categories.set(vc.serviceCategory.code, existing);
    }
  }

  const lines = [
    `# ${SITE_NAME}`,
    "",
    SITE_DESCRIPTION,
    "",
    "Discovery Layer tracks public pricing evidence across vendors, categories, and regions. The site is designed for humans, search engines, and AI agents that need source-linked pricing context.",
    "",
    "## Important URLs",
    `- Global pricing index: ${absoluteUrl("/pricing")}`,
    `- Markdown pricing index: ${absoluteUrl("/pricing.md")}`,
    `- Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    `- Robots policy: ${absoluteUrl("/robots.txt")}`,
    "",
    "## Current Published Categories",
    ...(
      categories.size > 0
        ? Array.from(categories.entries()).map(
            ([code, item]) =>
              `- ${item.label} (${code}): ${item.count} published signal(s), regions ${Array.from(item.regions).join(", ")}`,
          )
        : ["- No published pricing categories yet."]
    ),
    "",
    "## Recent Published Vendor Pages",
    ...(
      snapshots.length > 0
        ? snapshots.map((snap) => {
            const profile = snap.vendorProfile;
            const cats = profile.serviceCategories
              .map((c) => c.serviceCategory.label)
              .join(", ");
            return `- [${profile.organization.displayName}](${absoluteUrl(`/vendors/${snap.slug}`)}): ${cats || "uncategorized"}; region ${profile.organization.region}; city ${profile.hqCity?.name ?? "unknown"}`;
          })
        : ["- No published vendor pages yet."]
    ),
    "",
    "## Recent Published Pricing Signals",
    ...(
      signals.length > 0
        ? signals.map(
            (signal) =>
              `- ${signal.vendorProfile.organization.displayName}: ${signal.currency} ${Number(signal.priceValue)} (${signal.signalType}, ${signal.unit}), observed ${signal.observedAt.toISOString().slice(0, 10)}`,
          )
        : ["- No published pricing signals yet."]
    ),
    "",
  ];

  return new NextResponse(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

