import { NextResponse } from "next/server";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    transport: "streamable-http",
    endpoint: absoluteUrl("/api/mcp"),
    auth: { type: "none" },
    tools: [
      "discovery.list_markets",
      "discovery.search_pricing",
      "discovery.get_vendor",
    ],
    publicDataPolicy:
      "Only published, reviewed public pricing signals are exposed through this endpoint.",
  });
}
