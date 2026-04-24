import { NextResponse } from "next/server";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const body = [
    `# ${SITE_NAME}`,
    "",
    SITE_DESCRIPTION,
    "",
    "## Canonical Entry Points",
    `- [Global Pricing Index](${absoluteUrl("/pricing.md")})`,
    `- [Full Agent Context](${absoluteUrl("/llms-full.txt")})`,
    `- [Sitemap](${absoluteUrl("/sitemap.xml")})`,
    "",
    "## Public Data Policy",
    "- Pricing signals are extracted only from publicly accessible source URLs.",
    "- Published pricing signals are reviewed before they appear on public pages.",
    "- Pages may report that no public pricing was found; that is an evidence state, not generated pricing.",
    "",
    "## Crawl Guidance",
    "- Prefer markdown endpoints when available.",
    "- Use public vendor pages and pricing indexes as canonical sources.",
    "- Do not treat pending internal review rows as public facts.",
    "",
  ].join("\n");

  return new NextResponse(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

