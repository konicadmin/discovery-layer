import { notFound } from "next/navigation";
import { absoluteUrl } from "@/lib/site";
import { prisma } from "@/server/db/client";
import { deriveTrustBand } from "@/server/services/ingestion/publish";

export const dynamic = "force-dynamic";

const TRUST_LABELS: Record<string, { label: string; tone: string }> = {
  unclaimed_public_record: {
    label: "Unclaimed public record",
    tone: "bg-gray-100 text-gray-800",
  },
  claimed_not_verified: {
    label: "Claimed, verification pending",
    tone: "bg-amber-100 text-amber-800",
  },
  verified_vendor: {
    label: "Verified vendor",
    tone: "bg-green-100 text-green-800",
  },
};

type PricingUnitMeta = {
  unitCode?: string;
  referenceQuantity?: {
    "@type": "QuantitativeValue";
    value: number;
    unitCode: string;
  };
  description?: string;
};

// Map Prisma `PricingUnit` enum values to Schema.org / UN/CEFACT codes.
// Unknown / `unspecified` values omit `unitCode` so we don't fabricate one.
function mapPricingUnit(unit: string | null | undefined): PricingUnitMeta {
  switch (unit) {
    case "per_guard_per_month":
      return {
        unitCode: "MON",
        referenceQuantity: {
          "@type": "QuantitativeValue",
          value: 1,
          unitCode: "C62",
        },
        description: "per guard per month",
      };
    case "per_hour":
      return { unitCode: "HUR", description: "per hour" };
    case "per_day":
      return { unitCode: "DAY", description: "per day" };
    case "per_shift":
      // No standard UN/CEFACT code for "shift"; keep description only.
      return { description: "per shift" };
    case "package_monthly":
      return { unitCode: "MON", description: "monthly package" };
    default:
      return {};
  }
}

// Recursively drop keys whose value is `undefined` so the JSON-LD output
// doesn't carry noise. Arrays are preserved (with their undefined entries
// removed) and non-plain objects are returned as-is.
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => stripUndefined(entry)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const snap = await prisma.vendorPublicSnapshot.findUnique({ where: { slug } });
  if (!snap || snap.publicStatus !== "published") return {};
  return { title: snap.pageTitle, description: snap.metaDescription };
}

export default async function PublicVendorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const snap = await prisma.vendorPublicSnapshot.findUnique({
    where: { slug },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          evidenceItems: true,
          serviceCategories: { include: { serviceCategory: true } },
          pricingSignals: {
            where: { status: "published" },
            orderBy: [{ signalType: "asc" }, { observedAt: "desc" }],
          },
        },
      },
    },
  });
  if (!snap || snap.publicStatus !== "published") notFound();
  const profile = snap.vendorProfile;
  const band = deriveTrustBand(profile);
  const trust = TRUST_LABELS[band] ?? TRUST_LABELS.unclaimed_public_record!;
  const sourceIds = profile.pricingSignals
    .map((p) => p.sourceUrlId)
    .filter((id): id is string => Boolean(id));
  const sources =
    sourceIds.length > 0
      ? await prisma.sourceUrl.findMany({ where: { id: { in: sourceIds } } })
      : [];
  const sourceById = new Map(sources.map((source) => [source.id, source.url]));

  // Best-effort page-view counter.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await prisma.vendorPageMetric
    .upsert({
      where: { snapshotId_metricDate: { snapshotId: snap.id, metricDate: today } },
      create: {
        id: crypto.randomUUID(),
        snapshotId: snap.id,
        vendorProfileId: profile.id,
        metricDate: today,
        pageViews: 1,
      },
      update: { pageViews: { increment: 1 } },
    })
    .catch(() => null);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            stripUndefined({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: profile.organization.displayName,
              url:
                profile.organization.website ?? absoluteUrl(`/vendors/${snap.slug}`),
              areaServed: profile.organization.region,
              address: profile.hqCity
                ? {
                    "@type": "PostalAddress",
                    addressLocality: profile.hqCity.name,
                    addressRegion: profile.hqCity.state,
                    addressCountry: profile.hqCity.country,
                  }
                : undefined,
              makesOffer: profile.pricingSignals.map((p) => {
                const offerUrl = p.sourceUrlId
                  ? sourceById.get(p.sourceUrlId) ??
                    absoluteUrl(`/vendors/${snap.slug}`)
                  : absoluteUrl(`/vendors/${snap.slug}`);
                const unitMeta = mapPricingUnit(p.unit);
                const priceSpecification = stripUndefined({
                  "@type": "UnitPriceSpecification",
                  price: Number(p.priceValue),
                  priceCurrency: p.currency,
                  unitCode: unitMeta.unitCode,
                  referenceQuantity: unitMeta.referenceQuantity,
                  description: unitMeta.description,
                });
                const eligibleQuantity =
                  p.minQuantity != null
                    ? {
                        "@type": "QuantitativeValue",
                        minValue: p.minQuantity,
                      }
                    : undefined;
                const description = p.extractedText
                  ? p.extractedText.length > 280
                    ? `${p.extractedText.slice(0, 277)}...`
                    : p.extractedText
                  : undefined;
                return stripUndefined({
                  "@type": "Offer",
                  url: offerUrl,
                  availability: "https://schema.org/InStock",
                  priceSpecification,
                  eligibleQuantity,
                  description,
                });
              }),
            }),
          ),
        }}
      />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <header className="space-y-2">
          <span className={`inline-block px-2 py-0.5 text-xs rounded ${trust.tone}`}>
            {trust.label}
          </span>
          <h1 className="text-2xl font-semibold">{profile.organization.displayName}</h1>
          <div className="text-sm text-gray-600">
            {profile.serviceCategories.map((c) => c.serviceCategory.label).join(", ")}
            {profile.hqCity && ` · ${profile.hqCity.name}`}
          </div>
        </header>

        {profile.serviceSummary && (
          <section className="mt-6 bg-white border rounded p-4">
            <h2 className="text-sm font-semibold mb-2">About</h2>
            <p className="text-sm">{profile.serviceSummary}</p>
          </section>
        )}

        {profile.pricingSignals.length > 0 && (
          <section className="mt-6 bg-white border rounded p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Public pricing signals</h2>
              <span className="text-xs text-amber-700">
                indicative only — confirm with vendor
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              These rates were extracted from public vendor pages.
              They may exclude statutory costs, have minimum-quantity / term
              conditions, or be out of date. Treat normalized figures as rough
              comparators, not firm quotes.
            </p>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-2 py-1">Signal</th>
                  <th className="px-2 py-1">Rate</th>
                  <th className="px-2 py-1">Unit</th>
                  <th className="px-2 py-1">Normalized monthly</th>
                  <th className="px-2 py-1">Conditions</th>
                  <th className="px-2 py-1">Source</th>
                  <th className="px-2 py-1">Observed</th>
                </tr>
              </thead>
              <tbody>
                {profile.pricingSignals.map((p) => (
                  <tr key={p.id} className="border-t align-top">
                    <td className="px-2 py-1 text-xs">{p.signalType}</td>
                    <td className="px-2 py-1 font-mono text-sm">
                      {p.currency} {Number(p.priceValue).toLocaleString("en-IN")}
                    </td>
                    <td className="px-2 py-1 text-xs">{p.unit}</td>
                    <td className="px-2 py-1 font-mono text-sm">
                      {p.normalizedPgpm != null
                        ? `${p.currency} ${Number(p.normalizedPgpm).toLocaleString("en-US")}`
                        : "—"}
                      {p.normalizationNotes && (
                        <div className="text-[11px] text-gray-500">
                          {p.normalizationNotes}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 text-xs">
                      {[
                        p.minQuantity ? `min quantity ${p.minQuantity}` : null,
                        p.minContractMonths ? `${p.minContractMonths}mo term` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-2 py-1 text-xs">
                      {p.sourceUrlId && sourceById.get(p.sourceUrlId) ? (
                        <a
                          className="underline"
                          href={sourceById.get(p.sourceUrlId)}
                          rel="nofollow noreferrer"
                        >
                          source
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1 text-xs">
                      {p.observedAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-6 bg-white border rounded p-4">
          <h2 className="text-sm font-semibold mb-2">Public evidence</h2>
          <p className="text-xs text-gray-500 mb-3">
            These fields were gathered from the public web. Each row shows the field,
            value, provenance, and freshness.
          </p>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-2 py-1">Field</th>
                <th className="px-2 py-1">Value</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Observed</th>
              </tr>
            </thead>
            <tbody>
              {profile.evidenceItems.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-2 py-1 font-mono text-xs">{e.fieldName}</td>
                  <td className="px-2 py-1 text-sm">{e.normalizedValue ?? e.rawValue}</td>
                  <td className="px-2 py-1 text-xs">{e.evidenceType}</td>
                  <td className="px-2 py-1 text-xs">
                    {e.observedAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {band !== "verified_vendor" && (
          <section className="mt-6 bg-white border rounded p-4">
            <h2 className="text-sm font-semibold mb-2">Own this business?</h2>
            <p className="text-sm text-gray-600 mb-3">
              This page was generated from public web evidence. Claim it to complete
              verification and receive qualified RFQs.
            </p>
            <ClaimForm slug={snap.slug} />
          </section>
        )}

        <footer className="mt-6 text-xs text-gray-500">
          This is a {trust.label.toLowerCase()}. Verified status is granted only after
          ops review of proof documents and compliance records. Last published:{" "}
          {snap.lastPublishedAt?.toISOString().slice(0, 10) ?? "—"}.
        </footer>
      </div>
    </main>
  );
}

import { ClaimForm } from "./claim-form";
