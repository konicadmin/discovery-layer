import { PrismaClient } from "@/generated/prisma";
import { HttpFetcher } from "../src/server/services/ingestion/http-fetcher";
import { crawlAndCapturePricing } from "../src/server/services/ingestion/crawl";
import { PRICING_TARGETS } from "./pricing-targets";
import { ensurePricingTarget } from "./pricing-target-utils";

async function main() {
  const prisma = new PrismaClient();
  const fetcher = new HttpFetcher({ maxBytes: 5_000_000 });
  const results = [];
  try {
    for (const target of PRICING_TARGETS) {
      const row = await ensurePricingTarget(prisma, target);
      try {
        const crawl = await crawlAndCapturePricing(prisma, {
          vendorProfileId: row.profile.id,
          sourceUrlId: row.source.id,
          fetcher,
          expiresInDays: 90,
        });
        results.push({
          vendorName: target.vendorName,
          pricingUrl: target.pricingUrl,
          vendorProfileId: row.profile.id,
          sourceUrlId: row.source.id,
          crawlRunId: crawl.run.id,
          httpStatus: crawl.run.httpStatus,
          pricingSignalsCreated: crawl.created.length,
          totalCandidates: crawl.totalCandidates,
          pricingSignals: crawl.created,
        });
      } catch (err) {
        results.push({
          vendorName: target.vendorName,
          pricingUrl: target.pricingUrl,
          vendorProfileId: row.profile.id,
          sourceUrlId: row.source.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    console.log(JSON.stringify({ results }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
