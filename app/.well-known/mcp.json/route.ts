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
      {
        name: "list_products",
        description: "List products for a vendor by slug.",
      },
      {
        name: "get_plans",
        description: "List plans for a vendor's product by slugs.",
      },
      {
        name: "get_product_pricing",
        description: "List published pricing signals for a product.",
      },
    ],
    publicDataPolicy:
      "Only published, reviewed public pricing signals are exposed through this endpoint.",
  });
}
