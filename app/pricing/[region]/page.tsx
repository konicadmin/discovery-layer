import Link from "next/link";
import { notFound } from "next/navigation";
import { PricingSignalStatus, Region } from "@/generated/prisma";
import { absoluteUrl } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

const REGION_NAMES: Record<Region, string> = {
  IN: "India",
  US: "United States",
  EU: "Europe",
};

function parseRegion(raw: string): Region | null {
  const up = raw.toUpperCase();
  return up === "US" || up === "EU" || up === "IN" ? (up as Region) : null;
}

function buildIntro(regionName: string) {
  return `Source-linked pricing signals from public vendor pages in ${regionName}, refreshed regularly. Each row shows the price exactly as listed on the vendor's site, with a link back to the source.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region: rawRegion } = await params;
  const region = parseRegion(rawRegion);
  if (!region) return {};
  const regionName = REGION_NAMES[region];
  return {
    title: `${regionName} public pricing — Discovery Layer`,
    description: buildIntro(regionName),
  };
}

export default async function PricingRegionPage({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region: rawRegion } = await params;
  const region = parseRegion(rawRegion);
  if (!region) notFound();

  const regionName = REGION_NAMES[region];

  const [signals, categoryRows] = await Promise.all([
    prisma.publicPricingSignal.findMany({
      where: {
        status: PricingSignalStatus.published,
        vendorProfile: { organization: { region } },
      },
      include: {
        vendorProfile: {
          include: {
            organization: true,
            hqCity: true,
            serviceCategories: { include: { serviceCategory: true } },
            publicSnapshots: { where: { publicStatus: "published" }, take: 1 },
          },
        },
      },
      orderBy: { observedAt: "desc" },
      take: 250,
    }),
    prisma.vendorServiceCategory.findMany({
      where: {
        vendorProfile: {
          organization: { region },
          pricingSignals: { some: { status: PricingSignalStatus.published } },
        },
      },
      include: { serviceCategory: true },
    }),
  ]);

  const categoryCounts = new Map<string, { code: string; label: string; count: number }>();
  for (const row of categoryRows) {
    const code = row.serviceCategory.code;
    const current =
      categoryCounts.get(code) ??
      { code, label: row.serviceCategory.label, count: 0 };
    current.count += 1;
    categoryCounts.set(code, current);
  }

  return (
    <main className="min-h-screen bg-white text-gray-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: `${regionName} public pricing index`,
            description: buildIntro(regionName),
            url: absoluteUrl(`/pricing/${region.toLowerCase()}`),
            spatialCoverage: region,
            variableMeasured: "public pricing signal",
          }),
        }}
      />
      <section className="border-b bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Link className="text-sm underline" href="/pricing">
            Pricing index
          </Link>
          <h1 className="mt-3 text-4xl font-semibold">
            {regionName} public pricing index
          </h1>
          <p className="mt-4 max-w-2xl text-base text-gray-600">
            {buildIntro(regionName)}
          </p>
        </div>
      </section>

      {categoryCounts.size > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-8">
          <h2 className="text-lg font-semibold">Categories in {regionName}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(categoryCounts.values()).map((item) => (
              <Link
                key={item.code}
                href={`/pricing/${region.toLowerCase()}/${item.code}`}
                className="border p-4 hover:bg-gray-50"
              >
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {item.count} vendor record{item.count === 1 ? "" : "s"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="text-lg font-semibold">Recent pricing signals</h2>
        <div className="mt-4 overflow-x-auto border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Observed</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => {
                const profile = signal.vendorProfile;
                const slug = profile.publicSnapshots[0]?.slug;
                return (
                  <tr key={signal.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      {slug ? (
                        <Link className="underline" href={`/vendors/${slug}`}>
                          {profile.organization.displayName}
                        </Link>
                      ) : (
                        profile.organization.displayName
                      )}
                    </td>
                    <td className="px-3 py-2">{profile.hqCity?.name ?? "unknown"}</td>
                    <td className="px-3 py-2">
                      {profile.serviceCategories
                        .map((c) => c.serviceCategory.label)
                        .join(", ") || "uncategorized"}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {signal.currency} {Number(signal.priceValue).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2">{signal.unit}</td>
                    <td className="px-3 py-2">
                      {signal.observedAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
              {signals.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-sm text-gray-600" colSpan={6}>
                    No reviewed pricing signals are published for {regionName} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
