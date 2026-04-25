# Public Pricing Pivot (AI/Dev/SaaS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the public pricing surface from security-staffing-only to a category-first AI/dev/SaaS pricing intelligence layer, adding Product + Plan domain entities, SaaS/token/metered pricing units, a 25+ vendor seed catalog, a category-first URL structure, and MCP tools that expose products and plans to agents.

**Architecture:** Incremental evolution of the existing schema — add `Product` and `Plan` models that both belong to a `VendorProfile`; add optional `productId` / `planId` FKs on `PublicPricingSignal` so existing security-staffing signals keep working unchanged. Extend the `DeterministicPricingExtractor` with three new pattern families (per-seat/month, per-1M-tokens, per-API-call). Replace the region-first public URL tree with a category-first one but keep the old routes 301-redirecting. Add three read-only MCP tools (`list_products`, `get_plans`, `get_product_pricing`) so agents can query without HTML parsing.

**Tech Stack:** Next.js 16.2 App Router, Prisma 5.22 + Postgres (Neon), Zod 3, Vitest 1.6, deterministic regex extractor (no LLM inference at ingest time).

---

## Scope Check

Five phases, each produces working/testable software on its own — an engineer can stop after any phase and still have value:

- **Phase A (Schema)** — migrations only. Ships deployable; nothing visible yet.
- **Phase B (Catalog)** — seed data. Ships a populated target list visible in admin.
- **Phase C (Extractor)** — pattern upgrades. Ships the ability to capture real SaaS pricing from fetched pages.
- **Phase D (Public surface)** — UI restructure. Ships the category-first experience.
- **Phase E (MCP)** — tool additions. Ships direct agent access.

Phase F is a one-task follow-up that simply makes the security-staffing seed non-default on `pnpm db:seed` so local dev reflects the new positioning.

---

## File Structure

**New files:**
- `prisma/migrations/20260425000000_products_plans/migration.sql`
- `prisma/migrations/20260425000100_pricing_unit_saas/migration.sql`
- `prisma/migrations/20260425000200_pricing_signal_product_refs/migration.sql`
- `app/pricing/[category]/page.tsx` — category index (replaces `[region]/[category]`)
- `app/vendors/[slug]/[product]/page.tsx` — per-product canonical page
- `src/server/services/ingestion/pricing-patterns-saas.ts` — SaaS/token/metered regex families
- `tests/integration/pricing-extractor-saas.test.ts`
- `tests/integration/product-plan.test.ts`
- `tests/integration/mcp-products.test.ts`

**Modified files:**
- `prisma/schema.prisma` — add `Product`, `Plan`; extend `PricingUnit`; add FKs on `PublicPricingSignal`
- `prisma/seed.ts` — add 5 new service categories; surface an env flag for security seed
- `scripts/pricing-targets.ts` — extend to ~30 AI/dev/SaaS targets with product + plan metadata
- `scripts/seed-pricing-targets.ts` — also seed `Product` rows where the target defines them
- `src/server/services/ingestion/pricing-extractor.ts` — compose with new pattern families
- `app/pricing/page.tsx` — categories-first landing
- `app/pricing/[region]/[category]/page.tsx` — redirect to `/pricing/[category]`
- `app/vendors/[slug]/page.tsx` — link out to per-product pages, show product list
- `app/pricing.md/route.ts` — include products + plans in the markdown surface
- `app/llms-full.txt/route.ts` — enumerate categories + products
- `app/sitemap.ts` — emit `/pricing/[category]` and `/vendors/[slug]/[product]`
- `app/api/mcp/route.ts` — add three new tools (see E1)
- `app/.well-known/mcp.json/route.ts` — advertise new tools

---

## Task Index

- Phase A — Schema: A1 (Product+Plan), A2 (PricingUnit extension), A3 (Signal FKs), A4 (seed categories)
- Phase B — Catalog: B1 (targets catalog), B2 (seed script update)
- Phase C — Extractor: C1 (per-seat/month), C2 (per-1M-tokens), C3 (metered per-call), C4 (real-page integration test)
- Phase D — Public surface: D1 (categories-first `/pricing`), D2 (`/pricing/[category]`), D3 (per-product page), D4 (sitemap/llms.txt/pricing.md)
- Phase E — MCP: E1 (new tools), E2 (manifest)
- Phase F — Cleanup: F1 (seed flag)

---

## Phase A — Schema

### Task A1: Add Product + Plan models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260425000000_products_plans/migration.sql`
- Create: `tests/integration/product-plan.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/integration/product-plan.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";

describe("Product + Plan models", () => {
  it("creates a Product that belongs to a VendorProfile and has many Plans", async () => {
    const prisma = getPrisma();

    const org = await prisma.organization.create({
      data: { id: newId(), legalName: "OpenAI, Inc.", displayName: "OpenAI",
              type: "vendor", region: "US" },
    });
    const vendor = await prisma.vendorProfile.create({
      data: { id: newId(), organizationId: org.id, createdBySource: "import" },
    });
    const product = await prisma.product.create({
      data: {
        id: newId(),
        vendorProfileId: vendor.id,
        slug: "chatgpt",
        displayName: "ChatGPT",
        productKind: "app",
        canonicalUrl: "https://chatgpt.com",
      },
    });
    await prisma.plan.createMany({
      data: [
        { id: newId(), productId: product.id, slug: "free", displayName: "Free" },
        { id: newId(), productId: product.id, slug: "plus", displayName: "Plus" },
        { id: newId(), productId: product.id, slug: "pro",  displayName: "Pro"  },
      ],
    });

    const loaded = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { plans: { orderBy: { slug: "asc" } } },
    });
    expect(loaded.slug).toBe("chatgpt");
    expect(loaded.plans.map((p) => p.slug)).toEqual(["free", "plus", "pro"]);
  });

  it("enforces unique (vendorProfileId, slug) for Product", async () => {
    const prisma = getPrisma();
    const org = await prisma.organization.create({
      data: { id: newId(), legalName: "Dup Co", displayName: "Dup",
              type: "vendor", region: "US" },
    });
    const vendor = await prisma.vendorProfile.create({
      data: { id: newId(), organizationId: org.id, createdBySource: "import" },
    });
    await prisma.product.create({
      data: { id: newId(), vendorProfileId: vendor.id, slug: "foo",
              displayName: "Foo", productKind: "app" },
    });
    await expect(
      prisma.product.create({
        data: { id: newId(), vendorProfileId: vendor.id, slug: "foo",
                displayName: "Foo 2", productKind: "app" },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
pnpm test tests/integration/product-plan.test.ts
```
Expected: FAIL (`prisma.product is not defined` or similar).

- [ ] **Step 3: Add Product + Plan models to `prisma/schema.prisma`**

Append these models immediately after the existing `VendorProfile` model (around line 243):

```prisma
model Product {
  id              String   @id
  vendorProfileId String   @map("vendor_profile_id")
  vendorProfile   VendorProfile @relation(fields: [vendorProfileId], references: [id], onDelete: Cascade)
  slug            String
  displayName     String   @map("display_name")
  productKind     ProductKind @default(app) @map("product_kind")
  canonicalUrl    String?  @map("canonical_url")
  description     String?
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt      @map("updated_at")

  plans           Plan[]
  pricingSignals  PublicPricingSignal[]

  @@unique([vendorProfileId, slug])
  @@index([slug])
  @@map("products")
}

model Plan {
  id          String   @id
  productId   String   @map("product_id")
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  slug        String
  displayName String   @map("display_name")
  tier        PlanTier @default(unspecified)
  isFree      Boolean  @default(false) @map("is_free")
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt      @map("updated_at")

  pricingSignals PublicPricingSignal[]

  @@unique([productId, slug])
  @@map("plans")
}

enum ProductKind {
  app
  api
  library
  platform
  bundle
}

enum PlanTier {
  free
  starter
  pro
  team
  business
  enterprise
  unspecified
}
```

Also add `products Product[]` to the existing `VendorProfile` model. Locate the `VendorProfile` model and add the relation inside the relations block:

```prisma
  products               Product[]
```

- [ ] **Step 4: Generate migration**

```bash
pnpm prisma migrate dev --name products_plans
```
Expected: creates `prisma/migrations/20260425000000_products_plans/migration.sql` and applies it.

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm test tests/integration/product-plan.test.ts
```
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/integration/product-plan.test.ts
git commit -m "feat(schema): add Product + Plan models"
```

---

### Task A2: Extend PricingUnit for SaaS / token / metered

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260425000100_pricing_unit_saas/migration.sql`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/product-plan.test.ts`:

```ts
import { PricingUnit } from "@/generated/prisma";

describe("PricingUnit enum coverage", () => {
  it("includes SaaS/token/metered units", () => {
    expect(PricingUnit.per_seat_per_month).toBe("per_seat_per_month");
    expect(PricingUnit.per_user_per_month).toBe("per_user_per_month");
    expect(PricingUnit.per_1m_input_tokens).toBe("per_1m_input_tokens");
    expect(PricingUnit.per_1m_output_tokens).toBe("per_1m_output_tokens");
    expect(PricingUnit.per_api_call).toBe("per_api_call");
    expect(PricingUnit.per_request).toBe("per_request");
    expect(PricingUnit.flat_monthly).toBe("flat_monthly");
    expect(PricingUnit.flat_annual).toBe("flat_annual");
    expect(PricingUnit.usage_metered).toBe("usage_metered");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
pnpm test tests/integration/product-plan.test.ts
```
Expected: FAIL (`PricingUnit.per_seat_per_month is undefined`).

- [ ] **Step 3: Extend the enum in `prisma/schema.prisma`**

Locate `enum PricingUnit` and replace it with:

```prisma
enum PricingUnit {
  // Security staffing (retained for backward compatibility)
  per_guard_per_month
  per_hour
  per_day
  per_shift
  package_monthly

  // SaaS / seats
  per_seat_per_month
  per_seat_per_year
  per_user_per_month

  // AI / tokens
  per_1m_input_tokens
  per_1m_output_tokens
  per_1k_tokens

  // API / metered
  per_api_call
  per_request
  per_1k_requests
  usage_metered

  // Flat
  flat_monthly
  flat_annual
  one_time

  unspecified
}
```

- [ ] **Step 4: Generate migration**

```bash
pnpm prisma migrate dev --name pricing_unit_saas
```
Expected: creates `prisma/migrations/20260425000100_pricing_unit_saas/migration.sql` with `ALTER TYPE "PricingUnit" ADD VALUE ...` statements for each new value.

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm test tests/integration/product-plan.test.ts
```
Expected: all tests in the file pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/integration/product-plan.test.ts
git commit -m "feat(schema): extend PricingUnit with SaaS/token/metered values"
```

---

### Task A3: Add optional productId/planId on PublicPricingSignal

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260425000200_pricing_signal_product_refs/migration.sql`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/product-plan.test.ts`:

```ts
import { PricingSignalStatus, PricingSignalType, Region } from "@/generated/prisma";

describe("PublicPricingSignal → Product/Plan link", () => {
  it("attaches a pricing signal to a specific plan", async () => {
    const prisma = getPrisma();
    const org = await prisma.organization.create({
      data: { id: newId(), legalName: "Cursor Inc.", displayName: "Cursor",
              type: "vendor", region: "US" },
    });
    const vendor = await prisma.vendorProfile.create({
      data: { id: newId(), organizationId: org.id, createdBySource: "import" },
    });
    const product = await prisma.product.create({
      data: { id: newId(), vendorProfileId: vendor.id, slug: "cursor",
              displayName: "Cursor", productKind: "app" },
    });
    const plan = await prisma.plan.create({
      data: { id: newId(), productId: product.id, slug: "pro",
              displayName: "Pro", tier: "pro", isFree: false },
    });

    const signal = await prisma.publicPricingSignal.create({
      data: {
        id: newId(),
        vendorProfileId: vendor.id,
        productId: product.id,
        planId: plan.id,
        status: PricingSignalStatus.published,
        signalType: PricingSignalType.headline_rate,
        priceValue: "20",
        currency: "USD",
        unit: "per_seat_per_month",
        region: Region.US,
        extractedText: "$20/month per user",
        sourceUrl: "https://cursor.com/pricing",
        observedAt: new Date(),
      },
    });

    const loaded = await prisma.publicPricingSignal.findUniqueOrThrow({
      where: { id: signal.id },
      include: { product: true, plan: true },
    });
    expect(loaded.product?.slug).toBe("cursor");
    expect(loaded.plan?.slug).toBe("pro");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
pnpm test tests/integration/product-plan.test.ts
```
Expected: FAIL (`Unknown argument 'productId'` on PublicPricingSignal).

- [ ] **Step 3: Add FKs to `PublicPricingSignal` in `prisma/schema.prisma`**

Locate `model PublicPricingSignal` and add inside it:

```prisma
  productId  String?  @map("product_id")
  product    Product? @relation(fields: [productId], references: [id], onDelete: SetNull)
  planId     String?  @map("plan_id")
  plan       Plan?    @relation(fields: [planId], references: [id], onDelete: SetNull)

  @@index([productId])
  @@index([planId])
```

Keep the existing `vendorProfileId` field unchanged — signals that do not know a product still attach to the vendor only.

- [ ] **Step 4: Generate migration**

```bash
pnpm prisma migrate dev --name pricing_signal_product_refs
```
Expected: creates the migration adding `product_id`, `plan_id` columns + FKs + indexes.

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm test tests/integration/product-plan.test.ts
```
Expected: all tests in the file pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/integration/product-plan.test.ts
git commit -m "feat(schema): link PublicPricingSignal to Product + Plan"
```

---

### Task A4: Seed five new service categories

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/categories-seed.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { getPrisma } from "./setup";

describe("service categories seed", () => {
  beforeAll(() => {
    execSync("pnpm db:seed", { env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }, stdio: "pipe" });
  });

  it("seeds ai_models, ai_infra, dev_tools, saas_ops, data_infra", async () => {
    const prisma = getPrisma();
    const codes = [
      "ai_models", "ai_infra", "dev_tools", "saas_ops", "data_infra",
    ];
    const rows = await prisma.serviceCategory.findMany({
      where: { code: { in: codes } },
      orderBy: { code: "asc" },
    });
    expect(rows.map((r) => r.code).sort()).toEqual([...codes].sort());
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
pnpm test tests/integration/categories-seed.test.ts
```
Expected: FAIL (rows length 0 or subset).

- [ ] **Step 3: Update `prisma/seed.ts`**

Locate the service categories upsert block. Add these entries alongside the existing `security_staffing` category:

```ts
const categorySeed = [
  { code: "security_staffing", label: "Security Staffing", public: false },
  { code: "ai_models",   label: "AI Models",   public: true },
  { code: "ai_infra",    label: "AI Infrastructure", public: true },
  { code: "dev_tools",   label: "Developer Tools",   public: true },
  { code: "saas_ops",    label: "SaaS / Operations", public: true },
  { code: "data_infra",  label: "Data Infrastructure", public: true },
];
for (const cat of categorySeed) {
  await prisma.serviceCategory.upsert({
    where: { code: cat.code },
    create: { id: newId(), code: cat.code, label: cat.label },
    update: { label: cat.label },
  });
}
```

(If `public` isn't a column on `ServiceCategory`, drop that property — it was illustrative; the truth is whatever the existing column set supports. Re-read `prisma/schema.prisma` before editing if unsure.)

- [ ] **Step 4: Run test — expect pass**

```bash
pnpm test tests/integration/categories-seed.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts tests/integration/categories-seed.test.ts
git commit -m "feat(seed): add AI/dev/SaaS service categories"
```

---

## Phase B — Catalog

### Task B1: Extend PRICING_TARGETS with AI/dev/SaaS vendors

**Files:**
- Modify: `scripts/pricing-targets.ts`

- [ ] **Step 1: Extend the `PricingTarget` type to carry products + plans**

At the top of `scripts/pricing-targets.ts`, replace the existing type with:

```ts
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
```

- [ ] **Step 2: Replace `PRICING_TARGETS` with the expanded list**

Replace the entire `export const PRICING_TARGETS` array with:

```ts
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
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/pricing-targets.ts
git commit -m "feat(catalog): expand PRICING_TARGETS to 25+ AI/dev/SaaS vendors"
```

---

### Task B2: Update seed-pricing-targets.ts to seed Products + Plans

**Files:**
- Modify: `scripts/seed-pricing-targets.ts`

- [ ] **Step 1: Read current seed behavior**

Open `scripts/seed-pricing-targets.ts` and read it end-to-end. It currently walks `PRICING_TARGETS` and creates/updates `SourceUrl` + `Organization` + `VendorProfile` + `VendorServiceCategory`. The task is to add Product + Plan seeding when `target.products` is present.

- [ ] **Step 2: Add a `seedProducts` helper**

Inside `scripts/seed-pricing-targets.ts`, add (near the top, after the Prisma client import):

```ts
import type { PricingTarget } from "./pricing-targets";
import { newId } from "@/lib/id";
import type { PrismaClient } from "@/generated/prisma";

async function seedProducts(prisma: PrismaClient, vendorProfileId: string, target: PricingTarget) {
  if (!target.products) return;
  for (const p of target.products) {
    const product = await prisma.product.upsert({
      where: { vendorProfileId_slug: { vendorProfileId, slug: p.slug } },
      create: {
        id: newId(),
        vendorProfileId,
        slug: p.slug,
        displayName: p.displayName,
        productKind: p.productKind,
        canonicalUrl: p.canonicalUrl ?? null,
      },
      update: {
        displayName: p.displayName,
        productKind: p.productKind,
        canonicalUrl: p.canonicalUrl ?? null,
      },
    });
    if (!p.plans) continue;
    for (const pl of p.plans) {
      await prisma.plan.upsert({
        where: { productId_slug: { productId: product.id, slug: pl.slug } },
        create: {
          id: newId(),
          productId: product.id,
          slug: pl.slug,
          displayName: pl.displayName,
          tier: pl.tier,
          isFree: Boolean(pl.isFree),
        },
        update: {
          displayName: pl.displayName,
          tier: pl.tier,
          isFree: Boolean(pl.isFree),
        },
      });
    }
  }
}
```

- [ ] **Step 3: Call `seedProducts` inside the main loop**

Inside the per-target loop, after the `VendorProfile` upsert, call:

```ts
await seedProducts(prisma, vendor.id, target);
```

- [ ] **Step 4: Run the script against the local DB**

```bash
pnpm pricing:seed-targets
```
Expected: prints vendor+product counts. Spot-check Postgres:

```bash
psql -h localhost -U discovery -d discovery -c "SELECT v.id, o.display_name, p.slug, p.display_name FROM vendor_profiles v JOIN organizations o ON o.id = v.organization_id JOIN products p ON p.vendor_profile_id = v.id ORDER BY o.display_name LIMIT 20;"
```
Expected: at least 10 rows, with OpenAI/Anthropic/Cursor/Notion visible.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-pricing-targets.ts
git commit -m "feat(seed): seed Products + Plans from PRICING_TARGETS"
```

---

## Phase C — Extractor

### Task C1: Per-seat / per-month SaaS pattern family

**Files:**
- Create: `src/server/services/ingestion/pricing-patterns-saas.ts`
- Modify: `src/server/services/ingestion/pricing-extractor.ts`
- Create: `tests/integration/pricing-extractor-saas.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/integration/pricing-extractor-saas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DeterministicPricingExtractor }
  from "@/server/services/ingestion/pricing-extractor";

describe("SaaS per-seat/month extractor", () => {
  const extractor = new DeterministicPricingExtractor();

  it("extracts '$20 per user per month' as per_seat_per_month", async () => {
    const result = await extractor.extract({
      url: "https://cursor.com/pricing",
      text: "Pro — $20 per user per month. Unlimited completions.",
    });
    const seat = result.find((r) => r.unit === "per_seat_per_month");
    expect(seat).toBeDefined();
    expect(seat!.priceValue).toBe(20);
    expect(seat!.currency).toBe("USD");
  });

  it("extracts '$8/user/month' abbreviated form", async () => {
    const result = await extractor.extract({
      url: "https://linear.app/pricing",
      text: "Linear Standard: $8/user/month billed annually.",
    });
    const seat = result.find((r) => r.unit === "per_seat_per_month");
    expect(seat).toBeDefined();
    expect(seat!.priceValue).toBe(8);
  });

  it("extracts euro per seat", async () => {
    const result = await extractor.extract({
      url: "https://example.eu/pricing",
      text: "Team plan: €12 per seat / month",
    });
    const seat = result.find((r) => r.unit === "per_seat_per_month");
    expect(seat).toBeDefined();
    expect(seat!.priceValue).toBe(12);
    expect(seat!.currency).toBe("EUR");
  });

  it("does not extract when text says 'Contact sales'", async () => {
    const result = await extractor.extract({
      url: "https://example.com/enterprise",
      text: "Enterprise: Contact sales for custom pricing per seat per month.",
    });
    expect(result.find((r) => r.unit === "per_seat_per_month")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
pnpm test tests/integration/pricing-extractor-saas.test.ts
```
Expected: FAIL (all four cases — the extractor doesn't know seats).

- [ ] **Step 3: Create the SaaS pattern family**

`src/server/services/ingestion/pricing-patterns-saas.ts`:
```ts
import type { PricingCandidate } from "./pricing-extractor";
import { detectCurrency, parseLocalizedNumber } from "@/lib/region";

const SEAT_MONTH_RE = new RegExp(
  [
    "(?<!contact\\s*(?:sales|us)[^$€£₹]*)",
    "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)",
    "\\s*(?:/|per)\\s*(?:user|seat|person|member|team\\s*member)",
    "\\s*(?:/|per)?\\s*(?:month|mo|monthly)",
  ].join(""),
  "gi",
);

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
};

export function extractSaasSeatMonth(text: string): PricingCandidate[] {
  const out: PricingCandidate[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(SEAT_MONTH_RE)) {
    const symbol = m.groups?.symbol ?? "";
    const amount = parseLocalizedNumber(m.groups?.amount ?? "");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = CURRENCY_BY_SYMBOL[symbol] ?? detectCurrency(text) ?? "USD";
    const key = `${currency}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      signalType: "headline_rate",
      priceValue: amount,
      currency,
      region: null,
      unit: "per_seat_per_month",
      extractedText: m[0],
      confidence: 0.9,
    });
  }
  return out;
}
```

- [ ] **Step 4: Wire the family into the extractor**

In `src/server/services/ingestion/pricing-extractor.ts`, at the top of `DeterministicPricingExtractor.extract`, immediately before the existing security-staffing pattern block, add:

```ts
import { extractSaasSeatMonth } from "./pricing-patterns-saas";

// ... inside extract():
const saasSignals = extractSaasSeatMonth(input.text);
```

And merge `saasSignals` into the returned array.

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm test tests/integration/pricing-extractor-saas.test.ts
```
Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ingestion/pricing-patterns-saas.ts \
        src/server/services/ingestion/pricing-extractor.ts \
        tests/integration/pricing-extractor-saas.test.ts
git commit -m "feat(extractor): per-seat/month SaaS pattern family"
```

---

### Task C2: Per-1M-tokens AI pattern family

**Files:**
- Modify: `src/server/services/ingestion/pricing-patterns-saas.ts`
- Modify: `src/server/services/ingestion/pricing-extractor.ts`
- Modify: `tests/integration/pricing-extractor-saas.test.ts`

- [ ] **Step 1: Append failing tests**

Add to `tests/integration/pricing-extractor-saas.test.ts`:

```ts
describe("AI token pricing extractor", () => {
  const extractor = new DeterministicPricingExtractor();

  it("extracts '$3.00 per million input tokens' as per_1m_input_tokens", async () => {
    const result = await extractor.extract({
      url: "https://docs.anthropic.com/pricing",
      text: "Claude Sonnet 4.6: $3.00 per million input tokens, $15.00 per million output tokens.",
    });
    const inTok = result.find((r) => r.unit === "per_1m_input_tokens");
    const outTok = result.find((r) => r.unit === "per_1m_output_tokens");
    expect(inTok?.priceValue).toBe(3.0);
    expect(outTok?.priceValue).toBe(15.0);
  });

  it("extracts '$0.002 / 1K tokens' as per_1k_tokens", async () => {
    const result = await extractor.extract({
      url: "https://openai.com/api/pricing/",
      text: "gpt-4o-mini: $0.002 / 1K tokens input, $0.008 / 1K tokens output.",
    });
    const inTok = result.find((r) => r.unit === "per_1k_tokens");
    expect(inTok).toBeDefined();
    expect(inTok!.priceValue).toBe(0.002);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
pnpm test tests/integration/pricing-extractor-saas.test.ts
```
Expected: FAIL on the two new cases.

- [ ] **Step 3: Append token patterns to `pricing-patterns-saas.ts`**

```ts
const TOKENS_1M_RE = new RegExp(
  [
    "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)",
    "\\s*(?:/|per)\\s*(?:1\\s*m|1\\s*million|million|M)",
    "\\s*(?:tokens?|tok)",
    "(?<dir>[^\\n]{0,40}?(?:input|prompt|output|completion))?",
  ].join(""),
  "gi",
);

const TOKENS_1K_RE = new RegExp(
  [
    "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)",
    "\\s*(?:/|per)\\s*(?:1\\s*k|1\\s*thousand|thousand|K)",
    "\\s*(?:tokens?|tok)",
    "(?<dir>[^\\n]{0,40}?(?:input|prompt|output|completion))?",
  ].join(""),
  "gi",
);

function dirToUnit(dir: string | undefined, perK: boolean): PricingCandidate["unit"] {
  if (perK) return "per_1k_tokens";
  if (!dir) return "per_1m_input_tokens"; // ambiguous → assume input
  const s = dir.toLowerCase();
  if (s.includes("output") || s.includes("completion")) return "per_1m_output_tokens";
  return "per_1m_input_tokens";
}

export function extractTokenPricing(text: string): PricingCandidate[] {
  const out: PricingCandidate[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(TOKENS_1M_RE)) {
    const symbol = m.groups?.symbol ?? "";
    const amount = parseLocalizedNumber(m.groups?.amount ?? "");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = CURRENCY_BY_SYMBOL[symbol] ?? "USD";
    const unit = dirToUnit(m.groups?.dir, false);
    const key = `${unit}:${currency}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      signalType: "headline_rate",
      priceValue: amount,
      currency,
      region: null,
      unit,
      extractedText: m[0],
      confidence: 0.85,
    });
  }
  for (const m of text.matchAll(TOKENS_1K_RE)) {
    const symbol = m.groups?.symbol ?? "";
    const amount = parseLocalizedNumber(m.groups?.amount ?? "");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = CURRENCY_BY_SYMBOL[symbol] ?? "USD";
    const unit = dirToUnit(m.groups?.dir, true);
    const key = `${unit}:${currency}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      signalType: "headline_rate",
      priceValue: amount,
      currency,
      region: null,
      unit,
      extractedText: m[0],
      confidence: 0.85,
    });
  }
  return out;
}
```

- [ ] **Step 4: Wire into extractor**

In `pricing-extractor.ts`, add alongside the SaaS import:

```ts
import { extractTokenPricing } from "./pricing-patterns-saas";

// inside extract():
const tokenSignals = extractTokenPricing(input.text);
```

Merge `tokenSignals` into the returned array.

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm test tests/integration/pricing-extractor-saas.test.ts
```
Expected: all passing (6 total across C1 + C2).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ingestion/pricing-patterns-saas.ts \
        src/server/services/ingestion/pricing-extractor.ts \
        tests/integration/pricing-extractor-saas.test.ts
git commit -m "feat(extractor): AI token pricing (per 1M / per 1K)"
```

---

### Task C3: Metered API per-call pattern family

**Files:**
- Modify: `src/server/services/ingestion/pricing-patterns-saas.ts`
- Modify: `src/server/services/ingestion/pricing-extractor.ts`
- Modify: `tests/integration/pricing-extractor-saas.test.ts`

- [ ] **Step 1: Append failing tests**

Add to `tests/integration/pricing-extractor-saas.test.ts`:

```ts
describe("metered API pricing extractor", () => {
  const extractor = new DeterministicPricingExtractor();

  it("extracts '$0.0042 per API call'", async () => {
    const result = await extractor.extract({
      url: "https://example.com",
      text: "Vision API billed at $0.0042 per API call.",
    });
    const api = result.find((r) => r.unit === "per_api_call");
    expect(api?.priceValue).toBeCloseTo(0.0042);
  });

  it("extracts '$0.005 per request'", async () => {
    const result = await extractor.extract({
      url: "https://example.com",
      text: "Pricing: $0.005 per request, no minimum.",
    });
    const req = result.find((r) => r.unit === "per_request");
    expect(req?.priceValue).toBeCloseTo(0.005);
  });

  it("extracts '$0.40 per 1K requests'", async () => {
    const result = await extractor.extract({
      url: "https://example.com",
      text: "Standard tier: $0.40 per 1K requests.",
    });
    const bulk = result.find((r) => r.unit === "per_1k_requests");
    expect(bulk?.priceValue).toBeCloseTo(0.4);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
pnpm test tests/integration/pricing-extractor-saas.test.ts
```
Expected: FAIL on the three new cases.

- [ ] **Step 3: Append metered pattern to `pricing-patterns-saas.ts`**

```ts
const PER_CALL_RE = new RegExp(
  "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)\\s*(?:/|per)\\s*(?:api\\s*call|call)",
  "gi",
);

const PER_REQUEST_RE = new RegExp(
  "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)\\s*(?:/|per)\\s*request",
  "gi",
);

const PER_1K_REQUESTS_RE = new RegExp(
  "(?<symbol>[\\$€£₹])\\s*(?<amount>\\d[\\d,.]*)\\s*(?:/|per)\\s*(?:1\\s*k|1\\s*thousand|thousand|K)\\s*requests?",
  "gi",
);

function meter(text: string, re: RegExp, unit: PricingCandidate["unit"]): PricingCandidate[] {
  const out: PricingCandidate[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const amount = parseLocalizedNumber(m.groups?.amount ?? "");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const symbol = m.groups?.symbol ?? "";
    const currency = CURRENCY_BY_SYMBOL[symbol] ?? "USD";
    const key = `${currency}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      signalType: "headline_rate",
      priceValue: amount,
      currency,
      region: null,
      unit,
      extractedText: m[0],
      confidence: 0.8,
    });
  }
  return out;
}

export function extractMeteredPricing(text: string): PricingCandidate[] {
  return [
    ...meter(text, PER_1K_REQUESTS_RE, "per_1k_requests"),
    ...meter(text, PER_CALL_RE, "per_api_call"),
    ...meter(text, PER_REQUEST_RE, "per_request"),
  ];
}
```

(`PER_1K_REQUESTS_RE` must be matched first so `per 1K requests` is not consumed by `per request`.)

- [ ] **Step 4: Wire into extractor**

In `pricing-extractor.ts`:

```ts
import { extractMeteredPricing } from "./pricing-patterns-saas";

// inside extract():
const meteredSignals = extractMeteredPricing(input.text);
```

Merge into returned array.

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm test tests/integration/pricing-extractor-saas.test.ts
```
Expected: all passing (9 total).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ingestion/pricing-patterns-saas.ts \
        src/server/services/ingestion/pricing-extractor.ts \
        tests/integration/pricing-extractor-saas.test.ts
git commit -m "feat(extractor): metered API per-call/per-request patterns"
```

---

### Task C4: Real-page integration test

**Files:**
- Create: `tests/integration/fixtures/pricing-pages/cursor.txt`
- Create: `tests/integration/fixtures/pricing-pages/openai.txt`
- Create: `tests/integration/fixtures/pricing-pages/notion.txt`
- Modify: `tests/integration/pricing-extractor-saas.test.ts`

- [ ] **Step 1: Capture real text snippets**

Fetch each page with `curl -sL`, take 300 characters containing the first pricing mention, and store plain-text:

`tests/integration/fixtures/pricing-pages/cursor.txt`:
```
Hobby — Free forever. Pro — $20 per user per month. Business — $40 per user per month. Enterprise — custom.
```

`tests/integration/fixtures/pricing-pages/openai.txt`:
```
ChatGPT Plus: $20 / month. ChatGPT Team: $25 per user per month (billed annually). API: gpt-4o input $2.50 per 1M tokens, output $10.00 per 1M tokens.
```

`tests/integration/fixtures/pricing-pages/notion.txt`:
```
Free — $0. Plus — $10 per user / month. Business — $15 per user / month. Enterprise — Contact sales.
```

(If real crawled HTML differs, it is fine to replace these fixtures with actual snippets; the test is a regression guard, not a lock on today's prices.)

- [ ] **Step 2: Write fixture-driven test**

Append to `tests/integration/pricing-extractor-saas.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", "pricing-pages", name), "utf8");

describe("real-page fixtures", () => {
  const extractor = new DeterministicPricingExtractor();

  it("cursor.txt yields at least one per_seat_per_month signal", async () => {
    const r = await extractor.extract({ url: "x", text: fixture("cursor.txt") });
    expect(r.some((s) => s.unit === "per_seat_per_month")).toBe(true);
  });

  it("openai.txt yields token signals in both directions", async () => {
    const r = await extractor.extract({ url: "x", text: fixture("openai.txt") });
    expect(r.some((s) => s.unit === "per_1m_input_tokens")).toBe(true);
    expect(r.some((s) => s.unit === "per_1m_output_tokens")).toBe(true);
  });

  it("notion.txt yields at least two seat-month signals", async () => {
    const r = await extractor.extract({ url: "x", text: fixture("notion.txt") });
    const seats = r.filter((s) => s.unit === "per_seat_per_month");
    expect(seats.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Run — expect pass**

```bash
pnpm test tests/integration/pricing-extractor-saas.test.ts
```
Expected: 12 passing.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/fixtures tests/integration/pricing-extractor-saas.test.ts
git commit -m "test(extractor): real-page fixtures for Cursor/OpenAI/Notion"
```

---

## Phase D — Public surface

### Task D1: Category-first `/pricing` landing

**Files:**
- Modify: `app/pricing/page.tsx`

- [ ] **Step 1: Read the current page**

```bash
cat app/pricing/page.tsx
```
Confirm it currently queries `vendorServiceCategory` with a region bucket.

- [ ] **Step 2: Replace the top-level query + grid**

Inside `app/pricing/page.tsx`, replace the `Promise.all` query and the `categoryCounts` map + the `Published markets` `section` with a category-first layout:

```tsx
const categories = await prisma.serviceCategory.findMany({
  where: {
    vendorCategories: {
      some: {
        vendorProfile: {
          pricingSignals: { some: { status: PricingSignalStatus.published } },
        },
      },
    },
  },
  select: {
    id: true,
    code: true,
    label: true,
    _count: {
      select: {
        vendorCategories: {
          where: {
            vendorProfile: {
              pricingSignals: { some: { status: PricingSignalStatus.published } },
            },
          },
        },
      },
    },
  },
  orderBy: { label: "asc" },
});

// Replace the "Published markets" <section> with:
<section className="mx-auto max-w-6xl px-5 py-8">
  <h2 className="text-lg font-semibold">Categories</h2>
  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {categories.map((c) => (
      <Link key={c.code} href={`/pricing/${c.code}`} className="border p-4 hover:bg-gray-50">
        <div className="text-sm font-semibold">{c.label}</div>
        <div className="mt-1 text-xs text-gray-600">
          {c._count.vendorCategories} vendor record{c._count.vendorCategories === 1 ? "" : "s"}
        </div>
      </Link>
    ))}
    {categories.length === 0 && (
      <p className="text-sm text-gray-600">
        No categories have published pricing yet.
      </p>
    )}
  </div>
</section>
```

The "Recent pricing signals" `<section>` below it stays unchanged.

- [ ] **Step 3: Run build + smoke**

```bash
pnpm build
pnpm dev &
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/pricing
```
Expected: build OK, HTTP 200.

- [ ] **Step 4: Commit**

```bash
git add app/pricing/page.tsx
git commit -m "feat(ui): category-first /pricing landing"
```

---

### Task D2: Add `/pricing/[category]` route

**Files:**
- Create: `app/pricing/[category]/page.tsx`

- [ ] **Step 1: Write the page**

`app/pricing/[category]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { PricingSignalStatus } from "@/generated/prisma";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = await prisma.serviceCategory.findUnique({ where: { code: category } });
  if (!cat) return {};
  return {
    title: `${cat.label} pricing | Discovery Layer`,
    description: `Published pricing signals for ${cat.label}.`,
  };
}

export default async function CategoryPage({
  params,
}: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = await prisma.serviceCategory.findUnique({ where: { code: category } });
  if (!cat) notFound();

  const rows = await prisma.publicPricingSignal.findMany({
    where: {
      status: PricingSignalStatus.published,
      vendorProfile: {
        serviceCategories: { some: { serviceCategoryId: cat.id } },
      },
    },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          publicSnapshots: { where: { publicStatus: "published" }, take: 1 },
        },
      },
      product: true,
      plan: true,
    },
    orderBy: { observedAt: "desc" },
    take: 200,
  });

  return (
    <main className="min-h-screen bg-white text-gray-950">
      <section className="mx-auto max-w-6xl px-5 py-8">
        <p className="text-sm text-gray-500">
          <Link className="underline" href="/pricing">← Categories</Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{cat.label}</h1>

        <div className="mt-6 overflow-x-auto border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Observed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const slug = r.vendorProfile.publicSnapshots[0]?.slug;
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      {slug ? (
                        <Link className="underline" href={`/vendors/${slug}`}>
                          {r.vendorProfile.organization.displayName}
                        </Link>
                      ) : (
                        r.vendorProfile.organization.displayName
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.product && slug ? (
                        <Link className="underline" href={`/vendors/${slug}/${r.product.slug}`}>
                          {r.product.displayName}
                        </Link>
                      ) : (
                        r.product?.displayName ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2">{r.plan?.displayName ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">
                      {r.currency} {Number(r.priceValue).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2">{r.unit}</td>
                    <td className="px-3 py-2">
                      {r.observedAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-sm text-gray-600" colSpan={6}>
                    No published pricing signals in this category yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Build + smoke**

```bash
pnpm build
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/pricing/ai_models
```
Expected: HTTP 200 (empty table until signals exist).

- [ ] **Step 3: Commit**

```bash
git add app/pricing/[category]/page.tsx
git commit -m "feat(ui): /pricing/[category] route"
```

---

### Task D3: Per-product canonical page

**Files:**
- Create: `app/vendors/[slug]/[product]/page.tsx`

- [ ] **Step 1: Write the page**

`app/vendors/[slug]/[product]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { absoluteUrl } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string; product: string }> }) {
  const { slug, product } = await params;
  const snap = await prisma.vendorPublicSnapshot.findUnique({ where: { slug } });
  if (!snap || snap.publicStatus !== "published") return {};
  const p = await prisma.product.findFirst({
    where: { vendorProfileId: snap.vendorProfileId, slug: product },
  });
  if (!p) return {};
  return {
    title: `${p.displayName} pricing | Discovery Layer`,
    description: `Public pricing signals for ${p.displayName}.`,
  };
}

export default async function ProductPage({
  params,
}: { params: Promise<{ slug: string; product: string }> }) {
  const { slug, product } = await params;
  const snap = await prisma.vendorPublicSnapshot.findUnique({
    where: { slug },
    include: { vendorProfile: { include: { organization: true } } },
  });
  if (!snap || snap.publicStatus !== "published") notFound();

  const p = await prisma.product.findFirst({
    where: { vendorProfileId: snap.vendorProfileId, slug: product },
    include: {
      plans: { orderBy: { displayName: "asc" } },
      pricingSignals: {
        where: { status: "published" },
        orderBy: { observedAt: "desc" },
        include: { plan: true },
      },
    },
  });
  if (!p) notFound();

  const canonical = absoluteUrl(`/vendors/${slug}/${product}`);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.displayName,
            brand: snap.vendorProfile.organization.displayName,
            url: canonical,
            offers: p.pricingSignals.map((s) => ({
              "@type": "Offer",
              price: Number(s.priceValue),
              priceCurrency: s.currency,
              priceSpecification: {
                "@type": "UnitPriceSpecification",
                price: Number(s.priceValue),
                priceCurrency: s.currency,
                unitText: s.unit,
              },
              availability: "https://schema.org/InStock",
              description: s.plan?.displayName,
              url: s.sourceUrl ?? canonical,
            })),
          }),
        }}
      />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-sm text-gray-500">
          <Link className="underline" href={`/vendors/${slug}`}>
            ← {snap.vendorProfile.organization.displayName}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{p.displayName}</h1>
        {p.description && <p className="mt-2 text-sm text-gray-600">{p.description}</p>}

        <section className="mt-6 bg-white border rounded p-4">
          <h2 className="text-sm font-semibold mb-2">Plans</h2>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-2 py-1">Plan</th>
                <th className="px-2 py-1">Tier</th>
                <th className="px-2 py-1">Price signals</th>
              </tr>
            </thead>
            <tbody>
              {p.plans.map((pl) => {
                const signals = p.pricingSignals.filter((s) => s.planId === pl.id);
                return (
                  <tr key={pl.id} className="border-t align-top">
                    <td className="px-2 py-1">{pl.displayName}</td>
                    <td className="px-2 py-1 text-xs">{pl.tier}</td>
                    <td className="px-2 py-1 text-xs">
                      {signals.length === 0
                        ? "—"
                        : signals
                            .map(
                              (s) =>
                                `${s.currency} ${Number(s.priceValue)} ${s.unit}`,
                            )
                            .join(" · ")}
                    </td>
                  </tr>
                );
              })}
              {p.plans.length === 0 && (
                <tr>
                  <td className="px-2 py-2 text-sm text-gray-600" colSpan={3}>
                    No plans recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Build + smoke**

Pick any seeded vendor slug that has products and hit:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/vendors/openai/chatgpt
```

Expected: HTTP 200 if a snapshot is published; 404 otherwise — both acceptable.

- [ ] **Step 3: Commit**

```bash
git add 'app/vendors/[slug]/[product]/page.tsx'
git commit -m "feat(ui): per-product canonical page with Product+Offer JSON-LD"
```

---

### Task D4: Update sitemap, llms-full.txt, and pricing.md

**Files:**
- Modify: `app/sitemap.ts`
- Modify: `app/llms-full.txt/route.ts`
- Modify: `app/pricing.md/route.ts`

- [ ] **Step 1: Update `app/sitemap.ts`**

Replace the existing static URL list with a dynamic one:

```ts
import type { MetadataRoute } from "next";
import { prisma } from "@/server/db/client";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, snaps, products] = await Promise.all([
    prisma.serviceCategory.findMany({ select: { code: true } }),
    prisma.vendorPublicSnapshot.findMany({
      where: { publicStatus: "published" },
      select: { slug: true, lastPublishedAt: true },
    }),
    prisma.product.findMany({
      select: {
        slug: true,
        vendorProfile: {
          select: {
            publicSnapshots: {
              where: { publicStatus: "published" },
              select: { slug: true },
            },
          },
        },
      },
    }),
  ]);

  const now = new Date();
  const out: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, priority: 1 },
    { url: absoluteUrl("/pricing"), lastModified: now, priority: 0.9 },
  ];
  for (const c of categories) {
    out.push({ url: absoluteUrl(`/pricing/${c.code}`), lastModified: now, priority: 0.8 });
  }
  for (const s of snaps) {
    out.push({
      url: absoluteUrl(`/vendors/${s.slug}`),
      lastModified: s.lastPublishedAt ?? now,
      priority: 0.7,
    });
  }
  for (const p of products) {
    const slug = p.vendorProfile.publicSnapshots[0]?.slug;
    if (!slug) continue;
    out.push({
      url: absoluteUrl(`/vendors/${slug}/${p.slug}`),
      lastModified: now,
      priority: 0.6,
    });
  }
  return out;
}
```

- [ ] **Step 2: Update `app/llms-full.txt/route.ts`**

Replace the body with a full enumeration:

```ts
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
```

- [ ] **Step 3: Update `app/pricing.md/route.ts`**

Replace the body with:

```ts
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
    lines.push(
      `| ${vendorLink} | ${productLink} | ${r.plan?.displayName ?? ""} | ${cat} | ` +
        `${r.currency} ${Number(r.priceValue)} | ${r.unit} | ` +
        `${r.observedAt.toISOString().slice(0, 10)} | ${r.sourceUrl ?? ""} |`,
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
```

- [ ] **Step 4: Build + smoke**

```bash
pnpm build
curl -s http://localhost:3000/sitemap.xml | head -5
curl -s http://localhost:3000/llms-full.txt | head -10
curl -s http://localhost:3000/pricing.md | head -10
```

- [ ] **Step 5: Commit**

```bash
git add app/sitemap.ts app/llms-full.txt/route.ts app/pricing.md/route.ts
git commit -m "feat(agents): dynamic sitemap + llms-full.txt + pricing.md with products"
```

---

## Phase E — MCP

### Task E1: Add product/plan tools to the MCP server

**Files:**
- Modify: `app/api/mcp/route.ts`
- Create: `tests/integration/mcp-products.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/integration/mcp-products.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import { POST } from "@/../app/api/mcp/route";

async function call(method: string, params: unknown) {
  const req = new Request("http://local/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const res = await POST(req);
  return res.json();
}

describe("MCP product/plan tools", () => {
  it("list_products returns seeded products", async () => {
    const prisma = getPrisma();
    const org = await prisma.organization.create({
      data: { id: newId(), legalName: "Cursor Inc.", displayName: "Cursor",
              type: "vendor", region: "US" },
    });
    const vendor = await prisma.vendorProfile.create({
      data: { id: newId(), organizationId: org.id, createdBySource: "import" },
    });
    await prisma.product.create({
      data: { id: newId(), vendorProfileId: vendor.id, slug: "cursor",
              displayName: "Cursor", productKind: "app" },
    });

    const body = await call("tools/call", {
      name: "list_products",
      arguments: { vendorSlug: "cursor" },
    });
    expect(body.result.content[0].type).toBe("text");
    expect(body.result.content[0].text).toContain("Cursor");
  });

  it("get_plans returns plans for a product", async () => {
    const prisma = getPrisma();
    const org = await prisma.organization.create({
      data: { id: newId(), legalName: "Notion Labs", displayName: "Notion",
              type: "vendor", region: "US" },
    });
    const vendor = await prisma.vendorProfile.create({
      data: { id: newId(), organizationId: org.id, createdBySource: "import" },
    });
    const product = await prisma.product.create({
      data: { id: newId(), vendorProfileId: vendor.id, slug: "notion",
              displayName: "Notion", productKind: "app" },
    });
    await prisma.plan.createMany({
      data: [
        { id: newId(), productId: product.id, slug: "free", displayName: "Free", tier: "free", isFree: true },
        { id: newId(), productId: product.id, slug: "plus", displayName: "Plus", tier: "pro" },
      ],
    });

    const body = await call("tools/call", {
      name: "get_plans",
      arguments: { vendorSlug: "notion", productSlug: "notion" },
    });
    expect(body.result.content[0].text).toContain("Free");
    expect(body.result.content[0].text).toContain("Plus");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
pnpm test tests/integration/mcp-products.test.ts
```
Expected: FAIL (unknown tool).

- [ ] **Step 3: Add the tools to `app/api/mcp/route.ts`**

Find the `tools/list` handler and add three entries:

```ts
{
  name: "list_products",
  description: "List products for a vendor. Arg: vendorSlug.",
  inputSchema: {
    type: "object",
    required: ["vendorSlug"],
    properties: { vendorSlug: { type: "string" } },
  },
},
{
  name: "get_plans",
  description: "List plans for a product. Args: vendorSlug, productSlug.",
  inputSchema: {
    type: "object",
    required: ["vendorSlug", "productSlug"],
    properties: {
      vendorSlug: { type: "string" },
      productSlug: { type: "string" },
    },
  },
},
{
  name: "get_product_pricing",
  description: "List published pricing signals for a product. Args: vendorSlug, productSlug.",
  inputSchema: {
    type: "object",
    required: ["vendorSlug", "productSlug"],
    properties: {
      vendorSlug: { type: "string" },
      productSlug: { type: "string" },
    },
  },
},
```

Find the `tools/call` handler and add three cases:

```ts
case "list_products": {
  const { vendorSlug } = args as { vendorSlug: string };
  const snap = await prisma.vendorPublicSnapshot.findUnique({
    where: { slug: vendorSlug },
    include: { vendorProfile: { include: { products: true } } },
  });
  if (!snap) return textResult(`vendor ${vendorSlug} not found`);
  const lines = snap.vendorProfile.products.map(
    (p) => `- ${p.slug}: ${p.displayName} (${p.productKind})`,
  );
  return textResult(lines.length ? lines.join("\n") : "no products");
}
case "get_plans": {
  const { vendorSlug, productSlug } = args as { vendorSlug: string; productSlug: string };
  const snap = await prisma.vendorPublicSnapshot.findUnique({
    where: { slug: vendorSlug },
  });
  if (!snap) return textResult(`vendor ${vendorSlug} not found`);
  const product = await prisma.product.findFirst({
    where: { vendorProfileId: snap.vendorProfileId, slug: productSlug },
    include: { plans: { orderBy: { displayName: "asc" } } },
  });
  if (!product) return textResult(`product ${productSlug} not found`);
  const lines = product.plans.map(
    (p) => `- ${p.slug}: ${p.displayName} [${p.tier}${p.isFree ? ", free" : ""}]`,
  );
  return textResult(lines.length ? lines.join("\n") : "no plans");
}
case "get_product_pricing": {
  const { vendorSlug, productSlug } = args as { vendorSlug: string; productSlug: string };
  const snap = await prisma.vendorPublicSnapshot.findUnique({
    where: { slug: vendorSlug },
  });
  if (!snap) return textResult(`vendor ${vendorSlug} not found`);
  const product = await prisma.product.findFirst({
    where: { vendorProfileId: snap.vendorProfileId, slug: productSlug },
    include: {
      pricingSignals: {
        where: { status: "published" },
        orderBy: { observedAt: "desc" },
        include: { plan: true },
      },
    },
  });
  if (!product) return textResult(`product ${productSlug} not found`);
  const lines = product.pricingSignals.map(
    (s) =>
      `- ${s.plan?.displayName ?? "(no plan)"}: ${s.currency} ${s.priceValue} ${s.unit}` +
      ` · observed ${s.observedAt.toISOString().slice(0, 10)}` +
      (s.sourceUrl ? ` · ${s.sourceUrl}` : ""),
  );
  return textResult(lines.length ? lines.join("\n") : "no published signals");
}
```

`textResult` is the existing helper in the file that wraps a string into the JSON-RPC response envelope — re-use it. If it is not exported, export it or inline the equivalent (`{ result: { content: [{ type: "text", text: s }] } }`).

- [ ] **Step 4: Run test — expect pass**

```bash
pnpm test tests/integration/mcp-products.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add app/api/mcp/route.ts tests/integration/mcp-products.test.ts
git commit -m "feat(mcp): list_products, get_plans, get_product_pricing tools"
```

---

### Task E2: Advertise new tools in the MCP manifest

**Files:**
- Modify: `app/.well-known/mcp.json/route.ts`

- [ ] **Step 1: Read current manifest**

```bash
cat 'app/.well-known/mcp.json/route.ts'
```
Confirm it emits a JSON manifest with a `tools` array.

- [ ] **Step 2: Append the three new tools to the manifest**

Inside the manifest object, extend the `tools` array with:

```ts
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
```

- [ ] **Step 3: Smoke**

```bash
curl -s http://localhost:3000/.well-known/mcp.json | jq '.tools | length'
```
Expected: the number is 3 greater than before.

- [ ] **Step 4: Commit**

```bash
git add 'app/.well-known/mcp.json/route.ts'
git commit -m "feat(mcp): advertise product/plan tools in manifest"
```

---

## Phase F — Cleanup

### Task F1: Gate the security-staffing seed behind a flag

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Wrap the security-specific seed block**

Find the block in `prisma/seed.ts` that creates the 11 security vendor profiles, review checklists, and open reviews. Wrap it:

```ts
if (process.env.SEED_INCLUDE_SECURITY === "1") {
  // ... existing security-staffing seed code ...
}
```

Keep the category upsert for `security_staffing` outside the flag (it's harmless to have the category exist).

- [ ] **Step 2: Run default seed against a clean DB**

```bash
pnpm db:reset
pnpm db:seed
```
Expected: prints a summary with `vendorProfilesByRegion` counts only for the AI/SaaS seed, and `securityVendors` is absent or 0.

- [ ] **Step 3: Run with the flag**

```bash
SEED_INCLUDE_SECURITY=1 pnpm db:reset
SEED_INCLUDE_SECURITY=1 pnpm db:seed
```
Expected: prints a summary that includes the 11 security vendor profiles.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): gate security-staffing seed behind SEED_INCLUDE_SECURITY=1"
```

---

## Final verification

- [ ] **Run the whole suite**

```bash
pnpm typecheck
pnpm build
pnpm test
```
Expected: typecheck clean, build passes, all tests green.

- [ ] **Push**

```bash
git push origin main
```

- [ ] **Hit production once redeployed**

```bash
for p in / /pricing /pricing/ai_models /llms.txt /pricing.md /sitemap.xml; do
  curl -s -o /dev/null -w "%-22s HTTP %{http_code}\n" "https://rujuai.vercel.app$p"
done
```
Expected: all 200.

- [ ] **Seed Neon with the new catalog**

```bash
vercel env pull .env.vercel --environment production --yes
set -a; . ./.env.vercel; set +a
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm prisma migrate deploy
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:seed
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm pricing:seed-targets
rm -f .env.vercel
```
Expected: all commands exit 0, and `/pricing` now shows the new categories on production.
