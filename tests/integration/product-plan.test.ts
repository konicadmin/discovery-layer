import { describe, it, expect } from "vitest";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";
import {
  PricingUnit,
  PricingSignalStatus,
  PricingSignalType,
} from "@/generated/prisma";

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
        signalType: PricingSignalType.starting_price,
        priceValue: "20",
        currency: "USD",
        unit: "per_seat_per_month",
        confidence: "0.900",
        extractedText: "$20/month per user",
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
