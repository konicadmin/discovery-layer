import { NextResponse } from "next/server";
import { PricingSignalStatus } from "@/generated/prisma";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { prisma } from "@/server/db/client";
import { deriveTrustBand } from "@/server/services/ingestion/publish";

export const dynamic = "force-dynamic";

const NOT_AVAILABLE = "—";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTimestampUtc(date: Date): string {
  // YYYY-MM-DD HH:MM UTC
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function escapeCell(value: string): string {
  // Markdown table cells: escape pipes, collapse newlines.
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function formatPrice(priceValue: unknown): string {
  if (priceValue === null || priceValue === undefined) return NOT_AVAILABLE;
  const n = Number(priceValue);
  if (!Number.isFinite(n)) return NOT_AVAILABLE;
  // Trim trailing zeros for readability while preserving precision.
  return n
    .toFixed(2)
    .replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
}

export async function GET() {
  const now = new Date();

  const signals = await prisma.publicPricingSignal.findMany({
    where: { status: PricingSignalStatus.published },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          serviceCategories: { include: { serviceCategory: true } },
        },
      },
    },
  });

  // Batch-fetch source URLs in one query (no relation defined on the model).
  const sourceUrlIds = Array.from(
    new Set(
      signals
        .map((s) => s.sourceUrlId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const sourceUrls = sourceUrlIds.length
    ? await prisma.sourceUrl.findMany({
        where: { id: { in: sourceUrlIds } },
      })
    : [];
  const sourceUrlById = new Map(sourceUrls.map((s) => [s.id, s] as const));

  // Group signals by primary category for the body. A vendor with multiple
  // categories appears under its first (primary, else first) category so each
  // signal is emitted exactly once.
  type Row = {
    vendorName: string;
    signalType: string;
    priceValue: string;
    unit: string;
    currency: string;
    region: string;
    minQty: string;
    minTerm: string;
    sourceCell: string;
    observed: string;
    trustBand: string;
  };
  type Group = {
    code: string;
    label: string;
    rows: Row[];
  };

  const groups = new Map<string, Group>();
  const vendorIds = new Set<string>();

  for (const signal of signals) {
    const profile = signal.vendorProfile;
    vendorIds.add(profile.id);

    const primary =
      profile.serviceCategories.find((c) => c.primaryCategory) ??
      profile.serviceCategories[0];
    const code = primary?.serviceCategory.code ?? "uncategorized";
    const label = primary?.serviceCategory.label ?? "Uncategorized";

    const existing = groups.get(code) ?? { code, label, rows: [] };

    const sourceUrl = signal.sourceUrlId
      ? sourceUrlById.get(signal.sourceUrlId)
      : undefined;
    const sourceCell = sourceUrl ? `[link](${sourceUrl.url})` : NOT_AVAILABLE;

    const trustBand = deriveTrustBand({
      createdBySource: profile.createdBySource,
      claimedAt: profile.claimedAt,
      verificationStatus: profile.verificationStatus,
    });

    existing.rows.push({
      vendorName: escapeCell(profile.organization.displayName),
      signalType: escapeCell(signal.signalType),
      priceValue: formatPrice(signal.priceValue),
      unit: escapeCell(signal.unit),
      currency: escapeCell(signal.currency),
      region: escapeCell(profile.organization.region),
      minQty:
        signal.minQuantity === null || signal.minQuantity === undefined
          ? NOT_AVAILABLE
          : String(signal.minQuantity),
      minTerm:
        signal.minContractMonths === null || signal.minContractMonths === undefined
          ? NOT_AVAILABLE
          : `${signal.minContractMonths}mo`,
      sourceCell,
      observed: formatDate(signal.observedAt),
      trustBand,
    });

    groups.set(code, existing);
  }

  // Sort: category code, then vendor display name, then signal type.
  const orderedGroups = Array.from(groups.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  for (const g of orderedGroups) {
    g.rows.sort((a, b) => {
      const v = a.vendorName.localeCompare(b.vendorName);
      if (v !== 0) return v;
      return a.signalType.localeCompare(b.signalType);
    });
  }

  const lines: string[] = [
    `# ${SITE_NAME} — Full Pricing Catalog`,
    "",
    SITE_DESCRIPTION,
    "",
    `Generated at: ${formatTimestampUtc(now)}`,
    `Home: ${absoluteUrl("/")}`,
    `Agent guide: ${absoluteUrl("/llms.txt")}`,
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    "",
    `${signals.length} published signals across ${vendorIds.size} vendors in ${orderedGroups.length} categories, last refreshed ${formatTimestampUtc(now)}.`,
    "",
    "Note: rows whose trust band is `unclaimed_public_record` were extracted from public web pages and have not been confirmed by the vendor. Treat them as evidence, not vendor-attested pricing.",
    "",
  ];

  if (signals.length === 0) {
    lines.push("## No Published Pricing");
    lines.push("");
    lines.push("No published pricing signals yet.");
    lines.push("");
  } else {
    for (const group of orderedGroups) {
      lines.push(`## ${group.label}`);
      lines.push("");
      lines.push(
        "| Vendor | Plan/Signal | Price | Unit | Currency | Region | Min qty | Min term | Source | Observed |",
      );
      lines.push(
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      );
      for (const row of group.rows) {
        lines.push(
          `| ${row.vendorName} | ${row.signalType} | ${row.priceValue} | ${row.unit} | ${row.currency} | ${row.region} | ${row.minQty} | ${row.minTerm} | ${row.sourceCell} | ${row.observed} |`,
        );
      }
      lines.push("");
    }
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
