import { prisma } from "@/server/db/client";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const [cats, snaps, signals] = await Promise.all([
    prisma.serviceCategory.findMany({ orderBy: { label: "asc" } }),
    prisma.vendorPublicSnapshot.findMany({
      where: { publicStatus: "published" },
      include: {
        vendorProfile: {
          include: { organization: true, products: true },
        },
      },
      orderBy: { lastPublishedAt: "desc" },
    }),
    prisma.publicPricingSignal.findMany({
      where: { status: "published" },
      include: {
        vendorProfile: { include: { organization: true } },
        product: true,
        plan: true,
      },
      orderBy: { observedAt: "desc" },
      take: 100,
    }),
  ]);

  const lines: string[] = [];
  lines.push("# Discovery Layer — Full Agent Context");
  lines.push("");
  lines.push("Discovery Layer publishes reviewed, source-linked public pricing signals for AI agents, search systems, and researchers.");
  lines.push("");
  lines.push("## Important URLs");
  lines.push(`- MCP endpoint: ${absoluteUrl("/api/mcp")}`);
  lines.push(`- MCP discovery metadata: ${absoluteUrl("/.well-known/mcp.json")}`);
  lines.push(`- Legacy plugin manifest: ${absoluteUrl("/.well-known/ai-plugin.json")}`);
  lines.push(`- Global pricing index: ${absoluteUrl("/pricing")}`);
  lines.push(`- Markdown pricing index: ${absoluteUrl("/pricing.md")}`);
  lines.push(`- Sitemap: ${absoluteUrl("/sitemap.xml")}`);
  lines.push(`- Robots policy: ${absoluteUrl("/robots.txt")}`);
  lines.push("");
  lines.push("## Categories");
  for (const c of cats) {
    lines.push(`- [${c.label}](${absoluteUrl(`/pricing/${c.code}`)})`);
  }
  lines.push("");
  lines.push("## Vendors and Products");
  for (const s of snaps) {
    const org = s.vendorProfile.organization;
    lines.push(`- ${org.displayName} — ${absoluteUrl(`/vendors/${s.slug}`)}`);
    for (const p of s.vendorProfile.products) {
      lines.push(`  - ${p.displayName} — ${absoluteUrl(`/vendors/${s.slug}/${p.slug}`)}`);
    }
  }
  if (snaps.length === 0) {
    lines.push("- No published vendor pages yet.");
  }
  lines.push("");
  lines.push("## Recent Published Pricing Signals");
  if (signals.length > 0) {
    for (const signal of signals) {
      const product = signal.product ? ` / ${signal.product.displayName}` : "";
      const plan = signal.plan ? ` / ${signal.plan.displayName}` : "";
      lines.push(
        `- ${signal.vendorProfile.organization.displayName}${product}${plan}: ` +
          `${signal.currency} ${Number(signal.priceValue)} (${signal.unit}), observed ` +
          signal.observedAt.toISOString().slice(0, 10),
      );
    }
  } else {
    lines.push("- No published pricing signals yet.");
  }
  lines.push("");
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
