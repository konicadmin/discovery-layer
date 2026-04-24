import { PrismaClient } from "@prisma/client";
import { HttpFetcher } from "../src/server/services/ingestion/http-fetcher";
import { crawlAndCapturePricing } from "../src/server/services/ingestion/crawl";
import { registerSource } from "../src/server/services/ingestion/sources";

type Args = {
  vendorProfileId?: string;
  url?: string;
  expiresInDays?: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) continue;
    if (key === "--vendor-profile-id") {
      args.vendorProfileId = value;
      i += 1;
    } else if (key === "--url") {
      args.url = value;
      i += 1;
    } else if (key === "--expires-in-days") {
      args.expiresInDays = Number(value);
      i += 1;
    }
  }
  return args;
}

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  pnpm crawl:pricing -- --vendor-profile-id <id> --url <https://...> [--expires-in-days 90]",
      "",
      "This fetches the live URL, records a crawl_run, and stores any extracted public pricing signals as pending review rows.",
    ].join("\n"),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.vendorProfileId || !args.url) usage();
  if (args.expiresInDays != null && (!Number.isInteger(args.expiresInDays) || args.expiresInDays < 1)) {
    throw new Error("--expires-in-days must be a positive integer");
  }

  const prisma = new PrismaClient();
  try {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: args.vendorProfileId },
      include: { organization: true },
    });
    if (!vendor) throw new Error(`vendor_profile not found: ${args.vendorProfileId}`);

    const source = await registerSource(prisma, { url: args.url });
    const result = await crawlAndCapturePricing(prisma, {
      vendorProfileId: vendor.id,
      sourceUrlId: source.id,
      fetcher: new HttpFetcher(),
      expiresInDays: args.expiresInDays ?? 90,
    });

    console.log(
      JSON.stringify(
        {
          vendorProfileId: vendor.id,
          vendorName: vendor.organization.displayName,
          sourceUrlId: source.id,
          crawlRunId: result.run.id,
          httpStatus: result.run.httpStatus,
          pricingSignalsCreated: result.created.length,
          totalCandidates: result.totalCandidates,
          pricingSignals: result.created,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
