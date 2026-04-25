import Link from "next/link";
import { PricingSignalStatus } from "@/generated/prisma";
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
        sourceUrl: true,
      },
      orderBy: { observedAt: "desc" },
      take: 50,
    }),
    prisma.serviceCategory.findMany({
      where: {
        vendorCategories: {
          some: {
            vendorProfile: {
              pricingSignals: { some: { status: PricingSignalStatus.published } },
            },
          },
        },
      },
      select: {
        id: true,
        code: true,
        label: true,
        _count: {
          select: {
            vendorCategories: {
              where: {
                vendorProfile: {
                  pricingSignals: { some: { status: PricingSignalStatus.published } },
                },
              },
            },
          },
        },
      },
      orderBy: { label: "asc" },
    }),
  ]);

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
      <section className="mx-auto max-w-6xl px-5 py-8">
        <h2 className="text-lg font-semibold">Categories</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link key={c.code} href={`/pricing/${c.code}`} className="border p-4 hover:bg-gray-50">
              <div className="text-sm font-semibold">{c.label}</div>
              <div className="mt-1 text-xs text-gray-600">
                {c._count.vendorCategories} vendor record{c._count.vendorCategories === 1 ? "" : "s"}
              </div>
            </Link>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-gray-600">No categories have published pricing yet.</p>
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
                <th className="px-3 py-2">Source</th>
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
                    <td className="px-3 py-2">
                      {signal.sourceUrl?.url ? (
                        <a
                          className="underline"
                          href={signal.sourceUrl.url}
                          rel="nofollow noreferrer"
                          target="_blank"
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
              {signals.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-sm text-gray-600" colSpan={7}>
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
