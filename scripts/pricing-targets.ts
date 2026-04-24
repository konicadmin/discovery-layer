import { Region } from "@prisma/client";

export type PricingTarget = {
  vendorName: string;
  region: Region;
  categoryCode: string;
  categoryLabel: string;
  website: string;
  pricingUrl: string;
};

export const PRICING_TARGETS: PricingTarget[] = [
  {
    vendorName: "OpenAI",
    region: Region.US,
    categoryCode: "ai_api",
    categoryLabel: "AI API",
    website: "https://openai.com",
    pricingUrl: "https://openai.com/api/pricing/",
  },
  {
    vendorName: "Anthropic",
    region: Region.US,
    categoryCode: "ai_api",
    categoryLabel: "AI API",
    website: "https://www.anthropic.com",
    pricingUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
  },
  {
    vendorName: "Twilio",
    region: Region.US,
    categoryCode: "communications_api",
    categoryLabel: "Communications API",
    website: "https://www.twilio.com",
    pricingUrl: "https://www.twilio.com/en-us/pricing",
  },
  {
    vendorName: "Vercel",
    region: Region.US,
    categoryCode: "developer_platform",
    categoryLabel: "Developer platform",
    website: "https://vercel.com",
    pricingUrl: "https://vercel.com/pricing",
  },
  {
    vendorName: "Cloudflare",
    region: Region.US,
    categoryCode: "edge_cloud",
    categoryLabel: "Edge cloud",
    website: "https://www.cloudflare.com",
    pricingUrl: "https://www.cloudflare.com/plans/",
  },
  {
    vendorName: "Notion",
    region: Region.US,
    categoryCode: "productivity_software",
    categoryLabel: "Productivity software",
    website: "https://www.notion.com",
    pricingUrl: "https://www.notion.com/pricing",
  },
  {
    vendorName: "Slack",
    region: Region.US,
    categoryCode: "collaboration_software",
    categoryLabel: "Collaboration software",
    website: "https://slack.com",
    pricingUrl: "https://slack.com/pricing",
  },
  {
    vendorName: "GitHub",
    region: Region.US,
    categoryCode: "developer_platform",
    categoryLabel: "Developer platform",
    website: "https://github.com",
    pricingUrl: "https://github.com/pricing",
  },
  {
    vendorName: "GitLab",
    region: Region.US,
    categoryCode: "developer_platform",
    categoryLabel: "Developer platform",
    website: "https://about.gitlab.com",
    pricingUrl: "https://about.gitlab.com/pricing/",
  },
  {
    vendorName: "SendGrid",
    region: Region.US,
    categoryCode: "email_api",
    categoryLabel: "Email API",
    website: "https://sendgrid.com",
    pricingUrl: "https://sendgrid.com/en-us/pricing",
  },
  {
    vendorName: "Postmark",
    region: Region.US,
    categoryCode: "email_api",
    categoryLabel: "Email API",
    website: "https://postmarkapp.com",
    pricingUrl: "https://postmarkapp.com/pricing",
  },
  {
    vendorName: "OVHcloud",
    region: Region.EU,
    categoryCode: "cloud_infrastructure",
    categoryLabel: "Cloud infrastructure",
    website: "https://www.ovhcloud.com",
    pricingUrl: "https://www.ovhcloud.com/en/public-cloud/prices/",
  },
  {
    vendorName: "DeepL",
    region: Region.EU,
    categoryCode: "translation_api",
    categoryLabel: "Translation API",
    website: "https://www.deepl.com",
    pricingUrl: "https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans",
  },
];
