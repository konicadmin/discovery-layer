import { PrismaClient } from "@/generated/prisma";
import { PRICING_TARGETS, type PricingTarget } from "./pricing-targets";
import { ensurePricingTarget } from "./pricing-target-utils";
import { newId } from "../src/lib/id";

async function seedProducts(
  prisma: PrismaClient,
  vendorProfileId: string,
  target: PricingTarget,
) {
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

async function main() {
  const prisma = new PrismaClient();
  try {
    const created = [];
    for (const target of PRICING_TARGETS) {
      const row = await ensurePricingTarget(prisma, target);
      await seedProducts(prisma, row.profile.id, target);
      created.push({
        vendorName: target.vendorName,
        region: target.region,
        category: target.categoryCode,
        vendorProfileId: row.profile.id,
        sourceUrlId: row.source.id,
        pricingUrl: target.pricingUrl,
      });
    }
    console.log(JSON.stringify({ targets: created }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
