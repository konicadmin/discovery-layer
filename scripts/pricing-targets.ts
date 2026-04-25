import { Region } from "@/generated/prisma";

export type ProductSpec = {
  slug: string;
  displayName: string;
  productKind: "app" | "api" | "library" | "platform" | "bundle";
  canonicalUrl?: string;
  plans?: PlanSpec[];
};

export type PlanSpec = {
  slug: string;
  displayName: string;
  tier: "free" | "starter" | "pro" | "team" | "business" | "enterprise" | "unspecified";
  isFree?: boolean;
};

export type PricingTarget = {
  vendorName: string;
  region: Region;
  categoryCode: string;
  categoryLabel: string;
  website: string;
  pricingUrl: string;
  products?: ProductSpec[];
};

export const PRICING_TARGETS: PricingTarget[] = [
  // === AI models (consumer apps + APIs) ===
  {
    vendorName: "OpenAI",
    region: Region.US,
    categoryCode: "ai_models",
    categoryLabel: "AI Models",
    website: "https://openai.com",
    pricingUrl: "https://openai.com/chatgpt/pricing/",
    products: [
      {
        slug: "chatgpt",
        displayName: "ChatGPT",
        productKind: "app",
        canonicalUrl: "https://chatgpt.com",
        plans: [
          { slug: "free", displayName: "Free", tier: "free", isFree: true },
          { slug: "plus", displayName: "Plus", tier: "pro" },
          { slug: "pro",  displayName: "Pro",  tier: "business" },
          { slug: "team", displayName: "Team", tier: "team" },
          { slug: "enterprise", displayName: "Enterprise", tier: "enterprise" },
        ],
      },
    ],
  },
  {
    vendorName: "OpenAI",
    region: Region.US,
    categoryCode: "ai_infra",
    categoryLabel: "AI Infrastructure",
    website: "https://openai.com",
    pricingUrl: "https://openai.com/api/pricing/",
    products: [
      {
        slug: "openai-api",
        displayName: "OpenAI API",
        productKind: "api",
        canonicalUrl: "https://platform.openai.com",
      },
    ],
  },
  {
    vendorName: "Anthropic",
    region: Region.US,
    categoryCode: "ai_models",
    categoryLabel: "AI Models",
    website: "https://www.anthropic.com",
    pricingUrl: "https://www.anthropic.com/pricing",
    products: [
      {
        slug: "claude",
        displayName: "Claude",
        productKind: "app",
        canonicalUrl: "https://claude.ai",
        plans: [
          { slug: "free", displayName: "Free", tier: "free", isFree: true },
          { slug: "pro",  displayName: "Pro",  tier: "pro" },
          { slug: "max",  displayName: "Max",  tier: "business" },
          { slug: "team", displayName: "Team", tier: "team" },
          { slug: "enterprise", displayName: "Enterprise", tier: "enterprise" },
        ],
      },
    ],
  },
  {
    vendorName: "Anthropic",
    region: Region.US,
    categoryCode: "ai_infra",
    categoryLabel: "AI Infrastructure",
    website: "https://www.anthropic.com",
    pricingUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
    products: [
      { slug: "claude-api", displayName: "Claude API", productKind: "api" },
    ],
  },
  {
    vendorName: "Google DeepMind",
    region: Region.US,
    categoryCode: "ai_models",
    categoryLabel: "AI Models",
    website: "https://gemini.google.com",
    pricingUrl: "https://one.google.com/about/ai-premium/",
    products: [{ slug: "gemini", displayName: "Gemini", productKind: "app" }],
  },
  {
    vendorName: "Perplexity",
    region: Region.US,
    categoryCode: "ai_models",
    categoryLabel: "AI Models",
    website: "https://www.perplexity.ai",
    pricingUrl: "https://www.perplexity.ai/pro",
    products: [{ slug: "perplexity", displayName: "Perplexity", productKind: "app" }],
  },
  {
    vendorName: "xAI",
    region: Region.US,
    categoryCode: "ai_models",
    categoryLabel: "AI Models",
    website: "https://x.ai",
    pricingUrl: "https://x.ai/api",
    products: [{ slug: "grok", displayName: "Grok", productKind: "app" }],
  },

  // === Developer tools ===
  {
    vendorName: "Cursor",
    region: Region.US,
    categoryCode: "dev_tools",
    categoryLabel: "Developer Tools",
    website: "https://cursor.com",
    pricingUrl: "https://cursor.com/pricing",
    products: [
      {
        slug: "cursor",
        displayName: "Cursor",
        productKind: "app",
        plans: [
          { slug: "hobby", displayName: "Hobby", tier: "free", isFree: true },
          { slug: "pro",   displayName: "Pro",   tier: "pro" },
          { slug: "business", displayName: "Business", tier: "business" },
        ],
      },
    ],
  },
  {
    vendorName: "GitHub",
    region: Region.US,
    categoryCode: "dev_tools",
    categoryLabel: "Developer Tools",
    website: "https://github.com",
    pricingUrl: "https://github.com/features/copilot/plans",
    products: [
      { slug: "copilot", displayName: "GitHub Copilot", productKind: "app" },
    ],
  },
  {
    vendorName: "Replit",
    region: Region.US,
    categoryCode: "dev_tools",
    categoryLabel: "Developer Tools",
    website: "https://replit.com",
    pricingUrl: "https://replit.com/pricing",
    products: [{ slug: "replit", displayName: "Replit", productKind: "platform" }],
  },
  {
    vendorName: "Cognition",
    region: Region.US,
    categoryCode: "dev_tools",
    categoryLabel: "Developer Tools",
    website: "https://cognition.ai",
    pricingUrl: "https://devin.ai/pricing",
    products: [{ slug: "devin", displayName: "Devin", productKind: "app" }],
  },

  // === AI infrastructure / APIs ===
  {
    vendorName: "Google",
    region: Region.US,
    categoryCode: "ai_infra",
    categoryLabel: "AI Infrastructure",
    website: "https://ai.google.dev",
    pricingUrl: "https://ai.google.dev/pricing",
    products: [{ slug: "google-ai-studio", displayName: "Google AI Studio", productKind: "api" }],
  },
  {
    vendorName: "Together AI",
    region: Region.US,
    categoryCode: "ai_infra",
    categoryLabel: "AI Infrastructure",
    website: "https://www.together.ai",
    pricingUrl: "https://www.together.ai/pricing",
    products: [{ slug: "together-inference", displayName: "Together Inference", productKind: "api" }],
  },
  {
    vendorName: "Fireworks AI",
    region: Region.US,
    categoryCode: "ai_infra",
    categoryLabel: "AI Infrastructure",
    website: "https://fireworks.ai",
    pricingUrl: "https://fireworks.ai/pricing",
    products: [{ slug: "fireworks", displayName: "Fireworks Inference", productKind: "api" }],
  },
  {
    vendorName: "Pinecone",
    region: Region.US,
    categoryCode: "ai_infra",
    categoryLabel: "AI Infrastructure",
    website: "https://www.pinecone.io",
    pricingUrl: "https://www.pinecone.io/pricing/",
    products: [{ slug: "pinecone", displayName: "Pinecone", productKind: "platform" }],
  },

  // === Data / infra ===
  {
    vendorName: "Vercel",
    region: Region.US,
    categoryCode: "data_infra",
    categoryLabel: "Data Infrastructure",
    website: "https://vercel.com",
    pricingUrl: "https://vercel.com/pricing",
    products: [
      {
        slug: "vercel",
        displayName: "Vercel",
        productKind: "platform",
        plans: [
          { slug: "hobby", displayName: "Hobby", tier: "free", isFree: true },
          { slug: "pro",   displayName: "Pro",   tier: "pro" },
          { slug: "enterprise", displayName: "Enterprise", tier: "enterprise" },
        ],
      },
    ],
  },
  {
    vendorName: "Neon",
    region: Region.US,
    categoryCode: "data_infra",
    categoryLabel: "Data Infrastructure",
    website: "https://neon.tech",
    pricingUrl: "https://neon.tech/pricing",
    products: [{ slug: "neon", displayName: "Neon", productKind: "platform" }],
  },
  {
    vendorName: "Supabase",
    region: Region.US,
    categoryCode: "data_infra",
    categoryLabel: "Data Infrastructure",
    website: "https://supabase.com",
    pricingUrl: "https://supabase.com/pricing",
    products: [{ slug: "supabase", displayName: "Supabase", productKind: "platform" }],
  },
  {
    vendorName: "Clerk",
    region: Region.US,
    categoryCode: "data_infra",
    categoryLabel: "Data Infrastructure",
    website: "https://clerk.com",
    pricingUrl: "https://clerk.com/pricing",
    products: [{ slug: "clerk", displayName: "Clerk", productKind: "platform" }],
  },
  {
    vendorName: "Stripe",
    region: Region.US,
    categoryCode: "data_infra",
    categoryLabel: "Data Infrastructure",
    website: "https://stripe.com",
    pricingUrl: "https://stripe.com/pricing",
    products: [{ slug: "stripe", displayName: "Stripe", productKind: "platform" }],
  },

  // === SaaS ops ===
  {
    vendorName: "Notion Labs",
    region: Region.US,
    categoryCode: "saas_ops",
    categoryLabel: "SaaS / Operations",
    website: "https://www.notion.so",
    pricingUrl: "https://www.notion.com/pricing",
    products: [{ slug: "notion", displayName: "Notion", productKind: "app" }],
  },
  {
    vendorName: "Slack",
    region: Region.US,
    categoryCode: "saas_ops",
    categoryLabel: "SaaS / Operations",
    website: "https://slack.com",
    pricingUrl: "https://slack.com/pricing",
    products: [{ slug: "slack", displayName: "Slack", productKind: "app" }],
  },
  {
    vendorName: "Linear",
    region: Region.US,
    categoryCode: "saas_ops",
    categoryLabel: "SaaS / Operations",
    website: "https://linear.app",
    pricingUrl: "https://linear.app/pricing",
    products: [{ slug: "linear", displayName: "Linear", productKind: "app" }],
  },
  {
    vendorName: "HubSpot",
    region: Region.US,
    categoryCode: "saas_ops",
    categoryLabel: "SaaS / Operations",
    website: "https://www.hubspot.com",
    pricingUrl: "https://www.hubspot.com/pricing/marketing",
    products: [{ slug: "hubspot", displayName: "HubSpot", productKind: "platform" }],
  },
  {
    vendorName: "Salesforce",
    region: Region.US,
    categoryCode: "saas_ops",
    categoryLabel: "SaaS / Operations",
    website: "https://www.salesforce.com",
    pricingUrl: "https://www.salesforce.com/sales/pricing/",
    products: [{ slug: "sales-cloud", displayName: "Sales Cloud", productKind: "platform" }],
  },
  {
    vendorName: "Intercom",
    region: Region.US,
    categoryCode: "saas_ops",
    categoryLabel: "SaaS / Operations",
    website: "https://www.intercom.com",
    pricingUrl: "https://www.intercom.com/pricing",
    products: [{ slug: "intercom", displayName: "Intercom", productKind: "platform" }],
  },
];
