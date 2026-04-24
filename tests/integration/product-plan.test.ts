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
