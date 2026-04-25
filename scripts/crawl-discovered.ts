import { PrismaClient } from "@/generated/prisma";
import { crawlApprovedCandidates } from "../src/server/services/discovery/crawl-batch";
import { HttpFetcher } from "../src/server/services/ingestion/http-fetcher";

type Args = {
  limit?: number;
  expiresInDays?: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) continue;
    if (key === "--limit") {
      args.limit = Number(value);
      i += 1;
    } else if (key === "--expires-in-days") {
      args.expiresInDays = Number(value);
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (
    args.expiresInDays != null &&
    (!Number.isInteger(args.expiresInDays) || args.expiresInDays < 1)
  ) {
    throw new Error("--expires-in-days must be a positive integer");
  }

  const prisma = new PrismaClient();
  try {
    const result = await crawlApprovedCandidates(
      prisma,
      new HttpFetcher({ maxBytes: 5_000_000 }),
      {
        limit: args.limit ?? 25,
        expiresInDays: args.expiresInDays ?? 90,
      },
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
