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
      {
        name: "discovery.list_markets",
        description: "List public pricing categories with published signals.",
      },
      {
        name: "discovery.search_pricing",
        description: "Search reviewed public pricing signals.",
      },
      {
        name: "discovery.get_vendor",
        description: "Fetch a published vendor profile by slug.",
      },
      {
        name: "discovery.list_products",
        description: "List products for a vendor by slug.",
      },
      {
        name: "discovery.get_plans",
        description: "List plans for a vendor's product by slugs.",
      },
      {
        name: "discovery.get_product_pricing",
        description: "List published pricing signals for a product.",
      },
    ],
    publicDataPolicy:
      "Only published, reviewed public pricing signals are exposed through this endpoint.",
  });
}
