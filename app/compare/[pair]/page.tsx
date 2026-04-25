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

const PAIR_SEPARATOR = "-vs-";

function parsePair(pair: string): [string, string] | null {
  const parts = pair.split(PAIR_SEPARATOR);
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (!a || !b) return null;
  return [a, b];
}

export async function generateStaticParams() {
  // Pull every published vendor snapshot together with the categories its
  // vendor profile is associated with. We use this to build a per-category
  // bucket of slugs and emit lexicographically-ordered pairs.
  const snapshots = await prisma.vendorPublicSnapshot.findMany({
    where: { publicStatus: PublicStatus.published },
    include: {
      vendorProfile: {
        include: {
          serviceCategories: { include: { serviceCategory: true } },
        },
      },
    },
  });

  const byCategory = new Map<string, string[]>();
  for (const snap of snapshots) {
    for (const cat of snap.vendorProfile.serviceCategories) {
      const code = cat.serviceCategory.code;
      const list = byCategory.get(code) ?? [];
      list.push(snap.slug);
      byCategory.set(code, list);
    }
  }

  const seen = new Set<string>();
  const pairs: { pair: string }[] = [];
  for (const slugs of byCategory.values()) {
    if (slugs.length < 2) continue;
    const sorted = [...slugs].sort();
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        const key = `${a}${PAIR_SEPARATOR}${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ pair: key });
        if (pairs.length >= 30) return pairs;
      }
    }
  }
  return pairs;
}

async function loadSnapshot(slug: string) {
  return prisma.vendorPublicSnapshot.findUnique({
    where: { slug },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          pricingSignals: {
            where: { status: PricingSignalStatus.published },
            orderBy: [{ signalType: "asc" }, { observedAt: "desc" }],
          },
        },
      },
    },
  });
}

type LoadedSnapshot = NonNullable<Awaited<ReturnType<typeof loadSnapshot>>>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const parts = parsePair(pair);
  if (!parts) return {};
  const [slugA, slugB] = parts;
  const [snapA, snapB] = await Promise.all([
    prisma.vendorPublicSnapshot.findUnique({
      where: { slug: slugA },
      include: { vendorProfile: { include: { organization: true } } },
    }),
    prisma.vendorPublicSnapshot.findUnique({
      where: { slug: slugB },
      include: { vendorProfile: { include: { organization: true } } },
    }),
  ]);
  if (
    !snapA ||
    !snapB ||
    snapA.publicStatus !== PublicStatus.published ||
    snapB.publicStatus !== PublicStatus.published
  ) {
    return {};
  }
  const nameA = snapA.vendorProfile.organization.displayName;
  const nameB = snapB.vendorProfile.organization.displayName;
  return {
    title: `${nameA} vs ${nameB} pricing comparison — Discovery Layer`,
    description: `Side-by-side public pricing comparison between ${nameA} and ${nameB}, sourced from public web evidence.`,
  };
}

function VendorColumn({ snap }: { snap: LoadedSnapshot }) {
  const profile = snap.vendorProfile;
  return (
    <div className="bg-white border rounded p-4">
      <h2 className="text-lg font-semibold">
        <Link className="underline" href={`/vendors/${snap.slug}`}>
          {profile.organization.displayName}
        </Link>
      </h2>
      <div className="mt-1 text-xs text-gray-600">
        {profile.hqCity ? profile.hqCity.name : "HQ unknown"}
        {profile.organization.region ? ` · ${profile.organization.region}` : ""}
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-semibold">Published pricing signals</h3>
        {profile.pricingSignals.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">
            No published pricing signals.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {profile.pricingSignals.map((p) => (
              <li key={p.id} className="border rounded p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-gray-600">{p.signalType}</span>
                  <span className="font-mono text-sm">
                    {p.currency} {Number(p.priceValue).toLocaleString("en-US")}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  unit: {p.unit}
                  {" · "}
                  observed {p.observedAt.toISOString().slice(0, 10)}
                </div>
                {p.extractedText && (
                  <p className="mt-2 text-xs text-gray-700">
                    {p.extractedText.length > 280
                      ? `${p.extractedText.slice(0, 277)}...`
                      : p.extractedText}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function buildProductJsonLd(snap: LoadedSnapshot) {
  const profile = snap.vendorProfile;
  const offers = profile.pricingSignals.map((p) => {
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
      url: absoluteUrl(`/vendors/${snap.slug}`),
      availability: "https://schema.org/InStock",
      priceSpecification,
      eligibleQuantity,
      description,
    });
  });
  return stripUndefined({
    "@type": "Product",
    name: profile.organization.displayName,
    url: absoluteUrl(`/vendors/${snap.slug}`),
    offers: offers.length > 0 ? offers : undefined,
  });
}

export default async function CompareVendorsPage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const parts = parsePair(pair);
  if (!parts) notFound();
  const [slugA, slugB] = parts;
  const [snapA, snapB] = await Promise.all([
    loadSnapshot(slugA),
    loadSnapshot(slugB),
  ]);
  if (
    !snapA ||
    !snapB ||
    snapA.publicStatus !== PublicStatus.published ||
    snapB.publicStatus !== PublicStatus.published
  ) {
    notFound();
  }

  const itemListJsonLd = stripUndefined({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${snapA.vendorProfile.organization.displayName} vs ${snapB.vendorProfile.organization.displayName} pricing comparison`,
    url: absoluteUrl(`/compare/${pair}`),
    numberOfItems: 2,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        item: buildProductJsonLd(snapA),
      },
      {
        "@type": "ListItem",
        position: 2,
        item: buildProductJsonLd(snapB),
      },
    ],
  });

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {snapA.vendorProfile.organization.displayName} vs{" "}
            {snapB.vendorProfile.organization.displayName}
          </h1>
          <p className="text-sm text-gray-600">
            Side-by-side public pricing comparison from source-linked web evidence.
          </p>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <VendorColumn snap={snapA} />
          <VendorColumn snap={snapB} />
        </section>
      </div>
    </main>
  );
}
