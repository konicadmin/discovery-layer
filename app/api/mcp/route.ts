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

  const markets = new Map<string, { region: Region; category: string; label: string; vendors: Set<string> }>();
  for (const row of rows) {
    const region = row.vendorProfile.organization.region;
    const key = `${region}:${row.serviceCategory.code}`;
    const market =
      markets.get(key) ??
      {
        region,
        category: row.serviceCategory.code,
        label: row.serviceCategory.label,
        vendors: new Set<string>(),
      };
    market.vendors.add(row.vendorProfileId);
    markets.set(key, market);
  }

  return Array.from(markets.values()).map((market) => ({
    region: market.region,
    category: market.category,
    label: market.label,
    vendorCount: market.vendors.size,
    url: absoluteUrl(`/pricing/${market.region.toLowerCase()}/${market.category}`),
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
