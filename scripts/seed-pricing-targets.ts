import { PrismaClient } from "@prisma/client";
import { PRICING_TARGETS } from "./pricing-targets";
import { ensurePricingTarget } from "./pricing-target-utils";

async function main() {
  const prisma = new PrismaClient();
  try {
    const created = [];
    for (const target of PRICING_TARGETS) {
      const row = await ensurePricingTarget(prisma, target);
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

