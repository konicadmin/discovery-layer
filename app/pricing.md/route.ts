import { prisma } from "@/server/db/client";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.publicPricingSignal.findMany({
    where: { status: "published" },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          publicSnapshots: { where: { publicStatus: "published" }, take: 1 },
          serviceCategories: { include: { serviceCategory: true } },
        },
      },
      product: true,
      plan: true,
    },
    orderBy: { observedAt: "desc" },
    take: 500,
  });
  const sourceIds = rows
    .map((row) => row.sourceUrlId)
    .filter((id): id is string => Boolean(id));
  const sources =
    sourceIds.length > 0
      ? await prisma.sourceUrl.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, url: true },
        })
      : [];
  const sourceById = new Map(sources.map((source) => [source.id, source.url]));

  const lines: string[] = [];
  lines.push("# Discovery Layer Global Pricing Index");
  lines.push("");
  lines.push("| Vendor | Product | Plan | Category | Price | Unit | Observed | Source |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const cat = r.vendorProfile.serviceCategories[0]?.serviceCategory.label ?? "";
    const slug = r.vendorProfile.publicSnapshots[0]?.slug;
    const vendorLink = slug
      ? `[${r.vendorProfile.organization.displayName}](${absoluteUrl(`/vendors/${slug}`)})`
      : r.vendorProfile.organization.displayName;
    const productLink = r.product
      ? slug
        ? `[${r.product.displayName}](${absoluteUrl(`/vendors/${slug}/${r.product.slug}`)})`
        : r.product.displayName
      : "";
    const sourceUrl = r.sourceUrlId ? sourceById.get(r.sourceUrlId) : null;
    const source = sourceUrl ? `[source](${sourceUrl})` : "";
    lines.push(
      `| ${vendorLink} | ${productLink} | ${r.plan?.displayName ?? ""} | ${cat} | ` +
        `${r.currency} ${Number(r.priceValue)} | ${r.unit} | ` +
        `${r.observedAt.toISOString().slice(0, 10)} | ${source} |`,
    );
  }
  if (rows.length === 0) {
    lines.push("");
    lines.push("_No published pricing signals yet._");
  }
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
