import { NextResponse } from "next/server";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    schema_version: "v1",
    name_for_human: SITE_NAME,
    name_for_model: "discovery_layer",
    description_for_human: SITE_DESCRIPTION,
    description_for_model:
      "Source-linked public pricing intelligence for vendors, categories, and regions. Prefer the MCP endpoint and markdown pricing index for machine access.",
    auth: { type: "none" },
    api: { type: "none" },
    logo_url: absoluteUrl("/icon.svg"),
    contact_email: "hello@example.com",
    legal_info_url: absoluteUrl("/pricing"),
  });
}
