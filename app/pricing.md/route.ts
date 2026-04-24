import { NextResponse } from "next/server";
import { PricingSignalStatus } from "@prisma/client";
import { absoluteUrl, SITE_NAME } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const signals = await prisma.publicPricingSignal.findMany({
    where: { status: PricingSignalStatus.published },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          serviceCategories: { include: { serviceCategory: true } },
          publicSnapshots: { where: { publicStatus: "published" }, take: 1 },
        },
      },
    },
    orderBy: { observedAt: "desc" },
    take: 250,
  });
  const sourceIds = signals
    .map((signal) => signal.sourceUrlId)
    .filter((id): id is string => Boolean(id));
  const sources =
    sourceIds.length > 0
      ? await prisma.sourceUrl.findMany({ where: { id: { in: sourceIds } } })
      : [];
  const sourceById = new Map(sources.map((source) => [source.id, source.url]));

  const lines = [
    `# ${SITE_NAME} Global Pricing Index`,
    "",
    "This markdown endpoint lists reviewed public pricing signals extracted from source URLs. It is intended for AI agents, search systems, and researchers.",
    "",
    "## Published Pricing Signals",
    "",
    ...(signals.length > 0
      ? signals.map((signal) => {
          const profile = signal.vendorProfile;
          const slug = profile.publicSnapshots[0]?.slug;
          const categories = profile.serviceCategories
            .map((c) => c.serviceCategory.label)
            .join(", ");
          return [
            `### ${profile.organization.displayName}`,
            `- Region: ${profile.organization.region}`,
            `- City: ${profile.hqCity?.name ?? "unknown"}`,
            `- Category: ${categories || "uncategorized"}`,
            `- Price: ${signal.currency} ${Number(signal.priceValue)} (${signal.signalType}, ${signal.unit})`,
            `- Observed: ${signal.observedAt.toISOString().slice(0, 10)}`,
            `- Source URL: ${signal.sourceUrlId ? sourceById.get(signal.sourceUrlId) ?? "unknown" : "unknown"}`,
            `- Excerpt: ${signal.extractedText}`,
            slug ? `- Public page: ${absoluteUrl(`/vendors/${slug}`)}` : "- Public page: not published",
            "",
          ].join("\n");
        })
      : [
          "No reviewed public pricing signals are published yet. Use the ingestion tools to fetch real public pages, review extracted signals, and publish them.",
        ]),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
