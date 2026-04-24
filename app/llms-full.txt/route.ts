import { prisma } from "@/server/db/client";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const [cats, snaps] = await Promise.all([
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
  ]);

  const lines: string[] = [];
  lines.push("# Discovery Layer — Full Agent Context");
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
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
