import Link from "next/link";
import { PricingSignalStatus } from "@prisma/client";
import { absoluteUrl } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Global Public Pricing Index | Discovery Layer",
  description:
    "Source-linked public pricing signals across global B2B markets, vendors, categories, and regions.",
};

export default async function PricingIndexPage() {
  const [signals, categories] = await Promise.all([
    prisma.publicPricingSignal.findMany({
      where: { status: PricingSignalStatus.published },
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
      take: 50,
    }),
    prisma.vendorServiceCategory.findMany({
      where: {
        vendorProfile: {
          pricingSignals: { some: { status: PricingSignalStatus.published } },
        },
      },
      include: {
        serviceCategory: true,
        vendorProfile: { include: { organization: true } },
      },
      take: 500,
    }),
  ]);

  const categoryCounts = new Map<string, { label: string; region: string; count: number }>();
  for (const item of categories) {
    const region = item.vendorProfile.organization.region;
    const key = `${region}:${item.serviceCategory.code}`;
    const current =
      categoryCounts.get(key) ??
      { label: item.serviceCategory.label, region, count: 0 };
    current.count += 1;
    categoryCounts.set(key, current);
  }

  return (
    <main className="min-h-screen bg-white text-gray-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: "Discovery Layer Global Public Pricing Index",
            description:
              "Reviewed public pricing signals extracted from source-linked vendor pages.",
            url: absoluteUrl("/pricing"),
            distribution: [
              {
                "@type": "DataDownload",
                encodingFormat: "text/markdown",
                contentUrl: absoluteUrl("/pricing.md"),
              },
            ],
          }),
        }}
      />
      <section className="border-b bg-gray-50">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Global public pricing intelligence
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold">
            Source-linked pricing signals from public vendor pages.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-gray-600">
            Discovery Layer crawls public pricing pages, extracts visible rates,
            and publishes reviewed evidence for buyers, search engines, and AI agents.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link className="underline" href="/llms.txt">
              llms.txt
            </Link>
            <Link className="underline" href="/llms-full.txt">
              llms-full.txt
            </Link>
            <Link className="underline" href="/pricing.md">
              markdown pricing index
            </Link>
            <Link className="underline" href="/sitemap.xml">
              sitemap
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <h2 className="text-lg font-semibold">Published markets</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from(categoryCounts.entries()).map(([key, item]) => {
            const [, code] = key.split(":");
            return (
              <Link
                key={key}
                href={`/pricing/${item.region.toLowerCase()}/${code}`}
                className="border p-4 hover:bg-gray-50"
              >
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {item.region} · {item.count} vendor record{item.count === 1 ? "" : "s"}
                </div>
              </Link>
            );
          })}
          {categoryCounts.size === 0 && (
            <p className="text-sm text-gray-600">
              No reviewed pricing has been published yet. Once real crawls are reviewed,
              markets will appear here automatically.
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-lg font-semibold">Recent pricing signals</h2>
          <Link className="text-sm underline" href="/pricing.md">
            machine-readable version
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Region</th>
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
                    <td className="px-3 py-2">{profile.organization.region}</td>
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
                    No published pricing signals yet.
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
