import Link from "next/link";
import { notFound } from "next/navigation";
import { PricingSignalStatus, PublicStatus } from "@/generated/prisma";
import { absoluteUrl } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

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
// Mirrors the mapping used on `app/vendors/[slug]/page.tsx`.
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
      return { description: "per shift" };
    case "package_monthly":
      return { unitCode: "MON", description: "monthly package" };
    default:
      return {};
  }
}

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
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const category = await prisma.serviceCategory.findUnique({ where: { code } });
  if (!category) return {};
  return {
    title: `${category.label} pricing — Discovery Layer`,
    description: `Public pricing signals from vendors offering ${category.label.toLowerCase()} services, sorted by most recent observation.`,
  };
}

export default async function CategoryLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const category = await prisma.serviceCategory.findUnique({ where: { code } });
  if (!category) notFound();

  const signals = await prisma.publicPricingSignal.findMany({
    where: {
      status: PricingSignalStatus.published,
      vendorProfile: {
        serviceCategories: { some: { serviceCategoryId: category.id } },
      },
    },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          publicSnapshots: {
            where: { publicStatus: PublicStatus.published },
            take: 1,
          },
        },
      },
    },
    orderBy: { observedAt: "desc" },
    take: 200,
  });

  const sourceIds = Array.from(
    new Set(
      signals
        .map((s) => s.sourceUrlId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const sources =
    sourceIds.length > 0
      ? await prisma.sourceUrl.findMany({ where: { id: { in: sourceIds } } })
      : [];
  const sourceById = new Map(sources.map((source) => [source.id, source.url]));

  const itemListJsonLd = stripUndefined({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${category.label} pricing`,
    url: absoluteUrl(`/categories/${category.code}`),
    numberOfItems: signals.length,
    itemListElement: signals.map((signal, idx) => {
      const profile = signal.vendorProfile;
      const slug = profile.publicSnapshots[0]?.slug;
      const offerUrl = signal.sourceUrlId
        ? sourceById.get(signal.sourceUrlId) ??
          (slug ? absoluteUrl(`/vendors/${slug}`) : absoluteUrl(`/categories/${category.code}`))
        : slug
          ? absoluteUrl(`/vendors/${slug}`)
          : absoluteUrl(`/categories/${category.code}`);
      const unitMeta = mapPricingUnit(signal.unit);
      const priceSpecification = stripUndefined({
        "@type": "UnitPriceSpecification",
        price: Number(signal.priceValue),
        priceCurrency: signal.currency,
        unitCode: unitMeta.unitCode,
        referenceQuantity: unitMeta.referenceQuantity,
        description: unitMeta.description,
      });
      const eligibleQuantity =
        signal.minQuantity != null
          ? {
              "@type": "QuantitativeValue",
              minValue: signal.minQuantity,
            }
          : undefined;
      const description = signal.extractedText
        ? signal.extractedText.length > 280
          ? `${signal.extractedText.slice(0, 277)}...`
          : signal.extractedText
        : undefined;
      return {
        "@type": "ListItem",
        position: idx + 1,
        item: stripUndefined({
          "@type": "Product",
          name: `${profile.organization.displayName} — ${signal.signalType}`,
          url: slug ? absoluteUrl(`/vendors/${slug}`) : undefined,
          category: category.label,
          offers: stripUndefined({
            "@type": "Offer",
            url: offerUrl,
            availability: "https://schema.org/InStock",
            priceSpecification,
            eligibleQuantity,
            description,
          }),
        }),
      };
    }),
  });

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">{category.label} pricing</h1>
          <p className="text-sm text-gray-600">
            Published public pricing signals from vendors offering{" "}
            {category.label.toLowerCase()}, sorted by most recently observed.
          </p>
        </header>

        <section className="mt-6 bg-white border rounded p-4">
          {signals.length === 0 ? (
            <p className="text-sm text-gray-600">
              No published pricing signals yet for this category.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-2 py-1">Vendor</th>
                    <th className="px-2 py-1">HQ city</th>
                    <th className="px-2 py-1">Signal</th>
                    <th className="px-2 py-1">Price</th>
                    <th className="px-2 py-1">Currency</th>
                    <th className="px-2 py-1">Unit</th>
                    <th className="px-2 py-1">Observed</th>
                    <th className="px-2 py-1">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((signal) => {
                    const profile = signal.vendorProfile;
                    const slug = profile.publicSnapshots[0]?.slug;
                    const sourceUrl = signal.sourceUrlId
                      ? sourceById.get(signal.sourceUrlId)
                      : undefined;
                    return (
                      <tr key={signal.id} className="border-t align-top">
                        <td className="px-2 py-1">
                          {slug ? (
                            <Link className="underline" href={`/vendors/${slug}`}>
                              {profile.organization.displayName}
                            </Link>
                          ) : (
                            profile.organization.displayName
                          )}
                        </td>
                        <td className="px-2 py-1 text-xs">
                          {profile.hqCity?.name ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-xs">{signal.signalType}</td>
                        <td className="px-2 py-1 font-mono text-sm">
                          {Number(signal.priceValue).toLocaleString("en-US")}
                        </td>
                        <td className="px-2 py-1 text-xs">{signal.currency}</td>
                        <td className="px-2 py-1 text-xs">{signal.unit}</td>
                        <td className="px-2 py-1 text-xs">
                          {signal.observedAt.toISOString().slice(0, 10)}
                        </td>
                        <td className="px-2 py-1 text-xs">
                          {sourceUrl ? (
                            <a
                              className="underline"
                              href={sourceUrl}
                              rel="nofollow noreferrer"
                            >
                              source
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
