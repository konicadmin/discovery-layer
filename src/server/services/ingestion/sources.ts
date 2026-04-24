import {
  DiscoveryMethod,
  SourceUrlStatus,
  SourceUrlType,
} from "@/generated/prisma";
import { ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";

export type RegisterSourceInput = {
  url: string;
  sourceType?: SourceUrlType;
  discoveryMethod?: DiscoveryMethod;
};

export async function registerSource(db: Db, input: RegisterSourceInput) {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new ValidationError("invalid url");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ValidationError("only http(s) URLs are supported");
  }

  return withTx(db, async (tx) => {
    const existing = await tx.sourceUrl.findUnique({ where: { url: input.url } });
    if (existing) return existing;
    return tx.sourceUrl.create({
      data: {
        id: newId(),
        url: input.url,
        domain: parsed.hostname,
        sourceType: input.sourceType ?? SourceUrlType.vendor_site,
        discoveryMethod: input.discoveryMethod ?? DiscoveryMethod.manual,
        status: SourceUrlStatus.queued,
      },
    });
  });
}

export async function listSources(
  db: Db,
  args: { status?: SourceUrlStatus; limit?: number } = {},
) {
  return withTx(db, async (tx) => {
    return tx.sourceUrl.findMany({
      where: args.status ? { status: args.status } : undefined,
      take: args.limit ?? 100,
      orderBy: { createdAt: "desc" },
    });
  });
}
