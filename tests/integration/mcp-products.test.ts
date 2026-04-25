import { describe, it, expect } from "vitest";
import { getPrisma } from "./setup";
import { newId } from "@/lib/id";

async function call(method: string, params: unknown) {
  // Import lazily so the route module picks up TEST_DATABASE_URL that setup.ts
  // assigns in beforeAll (top-level test imports would resolve the route's
  // prisma client before the env var is set).
  const { POST } = await import("@/../app/api/mcp/route");
  const req = new Request("http://local/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const res = await POST(req as unknown as Parameters<typeof POST>[0]);
  return res.json();
}

describe("MCP product/plan tools", () => {
  it("list_products returns seeded products for a vendor snapshot slug", async () => {
    const prisma = getPrisma();
    const org = await prisma.organization.create({
      data: { id: newId(), legalName: "Cursor Inc.", displayName: "Cursor",
              type: "vendor", region: "US" },
    });
    const vendor = await prisma.vendorProfile.create({
      data: { id: newId(), organizationId: org.id, createdBySource: "import" },
    });
    const snap = await prisma.vendorPublicSnapshot.create({
      data: {
        id: newId(),
        vendorProfileId: vendor.id,
        slug: "cursor",
        publicStatus: "published",
        pageTitle: "Cursor",
        metaDescription: "desc",
        summaryJson: {},
      },
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
    // silence unused var
    void snap;
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
    await prisma.vendorPublicSnapshot.create({
      data: {
        id: newId(),
        vendorProfileId: vendor.id,
        slug: "notion",
        publicStatus: "published",
        pageTitle: "Notion",
        metaDescription: "desc",
        summaryJson: {},
      },
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
