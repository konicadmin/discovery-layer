import { NextRequest, NextResponse } from "next/server";
import { PricingSignalStatus, PublicStatus, Region } from "@/generated/prisma";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type ToolCallParams = {
  name?: string;
  arguments?: Record<string, unknown>;
};

const protocolVersion = "2025-06-18";

const tools = [
  {
    name: "discovery.list_markets",
    description:
      "List region/category markets that currently have published public pricing signals.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "discovery.search_pricing",
    description:
      "Search reviewed public pricing signals by optional region, category code, or vendor name.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: ["IN", "US", "EU"] },
        category: { type: "string" },
        vendor: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "discovery.get_vendor",
    description:
      "Fetch a published vendor public profile, pricing signals, and source citations by slug.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "discovery.list_products",
    description: "List products for a vendor. Arg: vendorSlug.",
    inputSchema: {
      type: "object",
      required: ["vendorSlug"],
      properties: { vendorSlug: { type: "string" } },
    },
  },
  {
    name: "discovery.get_plans",
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
    name: "discovery.get_product_pricing",
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
];

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } },
    { status: code === -32603 ? 500 : 200 },
  );
}

function textContent(data: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function textResult(text: string) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

function parseRegion(raw: unknown): Region | undefined {
  if (raw !== "IN" && raw !== "US" && raw !== "EU") return undefined;
  return raw;
}

function parseLimit(raw: unknown) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 25;
  return Math.max(1, Math.min(50, Math.floor(raw)));
}

async function sourceMap(sourceIds: Array<string | null>) {
  const ids = sourceIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map<string, string>();
  const sources = await prisma.sourceUrl.findMany({
    where: { id: { in: ids } },
    select: { id: true, url: true },
  });
  return new Map(sources.map((source) => [source.id, source.url]));
}

async function listMarkets() {
  const rows = await prisma.vendorServiceCategory.findMany({
    where: {
      vendorProfile: {
        pricingSignals: { some: { status: PricingSignalStatus.published } },
      },
    },
    include: {
      serviceCategory: true,
      vendorProfile: { include: { organization: true } },
    },
    take: 5000,
  });

  const markets = new Map<string, { category: string; label: string; regions: Set<Region>; vendors: Set<string> }>();
  for (const row of rows) {
    const region = row.vendorProfile.organization.region;
    const key = row.serviceCategory.code;
    const market =
      markets.get(key) ??
      {
        category: row.serviceCategory.code,
        label: row.serviceCategory.label,
        regions: new Set<Region>(),
        vendors: new Set<string>(),
      };
    market.regions.add(region);
    market.vendors.add(row.vendorProfileId);
    markets.set(key, market);
  }

  return Array.from(markets.values()).map((market) => ({
    category: market.category,
    label: market.label,
    regions: Array.from(market.regions).sort(),
    vendorCount: market.vendors.size,
    url: absoluteUrl(`/pricing/${market.category}`),
  }));
}

async function searchPricing(args: Record<string, unknown>) {
  const region = parseRegion(args.region);
  const category = typeof args.category === "string" ? args.category : undefined;
  const vendor = typeof args.vendor === "string" ? args.vendor : undefined;
  const limit = parseLimit(args.limit);

  const signals = await prisma.publicPricingSignal.findMany({
    where: {
      status: PricingSignalStatus.published,
      vendorProfile: {
        organization: {
          ...(region ? { region } : {}),
          ...(vendor
            ? { displayName: { contains: vendor, mode: "insensitive" } }
            : {}),
        },
        ...(category
          ? { serviceCategories: { some: { serviceCategory: { code: category } } } }
          : {}),
      },
    },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          serviceCategories: { include: { serviceCategory: true } },
          publicSnapshots: {
            where: { publicStatus: PublicStatus.published },
            take: 1,
          },
        },
      },
    },
    orderBy: { observedAt: "desc" },
    take: limit,
  });
  const sources = await sourceMap(signals.map((signal) => signal.sourceUrlId));

  return signals.map((signal) => {
    const profile = signal.vendorProfile;
    const slug = profile.publicSnapshots[0]?.slug;
    return {
      vendor: profile.organization.displayName,
      region: profile.organization.region,
      city: profile.hqCity?.name ?? null,
      categories: profile.serviceCategories.map((item) => ({
        code: item.serviceCategory.code,
        label: item.serviceCategory.label,
      })),
      price: Number(signal.priceValue),
      currency: signal.currency,
      unit: signal.unit,
      signalType: signal.signalType,
      normalizedPgpm:
        signal.normalizedPgpm == null ? null : Number(signal.normalizedPgpm),
      observedAt: signal.observedAt.toISOString(),
      excerpt: signal.extractedText,
      sourceUrl:
        signal.sourceUrlId == null ? null : sources.get(signal.sourceUrlId) ?? null,
      publicPage: slug == null ? null : absoluteUrl(`/vendors/${slug}`),
    };
  });
}

async function getVendor(args: Record<string, unknown>) {
  if (typeof args.slug !== "string" || args.slug.trim() === "") {
    throw new Error("slug is required");
  }

  const snap = await prisma.vendorPublicSnapshot.findUnique({
    where: { slug: args.slug },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          serviceCategories: { include: { serviceCategory: true } },
          pricingSignals: {
            where: { status: PricingSignalStatus.published },
            orderBy: { observedAt: "desc" },
          },
          evidenceItems: true,
        },
      },
    },
  });
  if (!snap || snap.publicStatus !== PublicStatus.published) return null;

  const profile = snap.vendorProfile;
  const sources = await sourceMap([
    ...profile.pricingSignals.map((signal) => signal.sourceUrlId),
    ...profile.evidenceItems.map((item) => item.sourceUrlId),
  ]);

  return {
    name: profile.organization.displayName,
    slug: snap.slug,
    url: absoluteUrl(`/vendors/${snap.slug}`),
    website: profile.organization.website,
    region: profile.organization.region,
    city: profile.hqCity?.name ?? null,
    categories: profile.serviceCategories.map((item) => ({
      code: item.serviceCategory.code,
      label: item.serviceCategory.label,
    })),
    summary: profile.serviceSummary,
    pricingSignals: profile.pricingSignals.map((signal) => ({
      price: Number(signal.priceValue),
      currency: signal.currency,
      unit: signal.unit,
      signalType: signal.signalType,
      observedAt: signal.observedAt.toISOString(),
      excerpt: signal.extractedText,
      sourceUrl:
        signal.sourceUrlId == null ? null : sources.get(signal.sourceUrlId) ?? null,
    })),
    evidence: profile.evidenceItems.map((item) => ({
      field: item.fieldName,
      value: item.normalizedValue ?? item.rawValue,
      observedAt: item.observedAt.toISOString(),
      sourceUrl: item.sourceUrlId == null ? null : sources.get(item.sourceUrlId) ?? null,
    })),
  };
}

async function callTool(params: unknown) {
  const call = params as ToolCallParams;
  const args = call.arguments ?? {};
  if (call.name === "discovery.list_markets") return textContent(await listMarkets());
  if (call.name === "discovery.search_pricing") return textContent(await searchPricing(args));
  if (call.name === "discovery.get_vendor") return textContent(await getVendor(args));
  if (call.name === "discovery.list_products" || call.name === "list_products") {
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
  if (call.name === "discovery.get_plans" || call.name === "get_plans") {
    const { vendorSlug, productSlug } = args as {
      vendorSlug: string;
      productSlug: string;
    };
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
  if (
    call.name === "discovery.get_product_pricing" ||
    call.name === "get_product_pricing"
  ) {
    const { vendorSlug, productSlug } = args as {
      vendorSlug: string;
      productSlug: string;
    };
    const snap = await prisma.vendorPublicSnapshot.findUnique({
      where: { slug: vendorSlug },
    });
    if (!snap) return textResult(`vendor ${vendorSlug} not found`);
    const product = await prisma.product.findFirst({
      where: { vendorProfileId: snap.vendorProfileId, slug: productSlug },
      include: {
        pricingSignals: {
          where: { status: PricingSignalStatus.published },
          orderBy: { observedAt: "desc" },
          include: { plan: true },
        },
      },
    });
    if (!product) return textResult(`product ${productSlug} not found`);
    const sources = await sourceMap(
      product.pricingSignals.map((signal) => signal.sourceUrlId),
    );
    const lines = product.pricingSignals.map(
      (s) =>
        `- ${s.plan?.displayName ?? "(no plan)"}: ${s.currency} ${s.priceValue} ${s.unit}` +
        ` · observed ${s.observedAt.toISOString().slice(0, 10)}` +
        (s.sourceUrlId && sources.get(s.sourceUrlId)
          ? ` · source ${sources.get(s.sourceUrlId)}`
          : ""),
    );
    return textResult(lines.length ? lines.join("\n") : "no published signals");
  }
  throw new Error(`Unknown tool: ${call.name ?? "(missing)"}`);
}

export async function GET() {
  return NextResponse.json({
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    protocolVersion,
    capabilities: { tools: {} },
    tools,
  });
}

export async function POST(request: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  try {
    if (body.method === "initialize") {
      return rpcResult(body.id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: SITE_NAME, version: "0.1.0" },
      });
    }
    if (body.method === "notifications/initialized") {
      return rpcResult(body.id, null);
    }
    if (body.method === "ping") {
      return rpcResult(body.id, {});
    }
    if (body.method === "tools/list") {
      return rpcResult(body.id, { tools });
    }
    if (body.method === "tools/call") {
      return rpcResult(body.id, await callTool(body.params));
    }
    return rpcError(body.id, -32601, `Method not found: ${body.method ?? "(missing)"}`);
  } catch (error) {
    return rpcError(
      body.id,
      -32603,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}
