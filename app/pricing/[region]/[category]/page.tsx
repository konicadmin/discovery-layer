import Link from "next/link";
import { notFound } from "next/navigation";
import { PricingSignalStatus, Region } from "@prisma/client";
import { absoluteUrl } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

function parseRegion(raw: string): Region | null {
  const up = raw.toUpperCase();
  return up === "US" || up === "EU" || up === "IN" ? (up as Region) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string; category: string }>;
}) {
  const { region: rawRegion, category } = await params;
  const region = parseRegion(rawRegion);
  if (!region) return {};
  const cat = await prisma.serviceCategory.findUnique({ where: { code: category } });
  if (!cat) return {};
  return {
    title: `${cat.label} Pricing in ${region} | Discovery Layer`,
    description: `Reviewed public pricing signals for ${cat.label} vendors in ${region}.`,
  };
}

export default async function PricingMarketPage({
  params,
}: {
  params: Promise<{ region: string; category: string }>;
}) {
  const { region: rawRegion, category } = await params;
  const region = parseRegion(rawRegion);
  if (!region) notFound();

  const cat = await prisma.serviceCategory.findUnique({ where: { code: category } });
  if (!cat) notFound();

  const signals = await prisma.publicPricingSignal.findMany({
    where: {
      status: PricingSignalStatus.published,
      vendorProfile: {
        organization: { region },
        serviceCategories: { some: { serviceCategoryId: cat.id } },
      },
    },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          publicSnapshots: { where: { publicStatus: "published" }, take: 1 },
        },
      },
    },
    orderBy: { observedAt: "desc" },
    take: 250,
  });

  return (
    <main className="min-h-screen bg-white text-gray-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: `${cat.label} pricing in ${region}`,
            description: `Reviewed public pricing signals for ${cat.label} vendors in ${region}.`,
            url: absoluteUrl(`/pricing/${region.toLowerCase()}/${cat.code}`),
            spatialCoverage: region,
            variableMeasured: "public pricing signal",
          }),
        }}
      />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <Link className="text-sm underline" href="/pricing">
          Pricing index
        </Link>
        <h1 className="mt-4 text-3xl font-semibold">
          {cat.label} pricing in {region}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-600">
          Reviewed pricing signals extracted from public vendor pages. Values are
          source evidence, not quotes or recommendations.
        </p>

        <div className="mt-6 overflow-x-auto border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Signal</th>
                <th className="px-3 py-2">Excerpt</th>
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
                    <td className="px-3 py-2 font-mono">
                      {signal.currency} {Number(signal.priceValue).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2">
                      {signal.signalType}
                      <div className="text-xs text-gray-500">{signal.unit}</div>
                    </td>
                    <td className="max-w-md px-3 py-2 text-xs text-gray-600">
                      {signal.extractedText}
                    </td>
                    <td className="px-3 py-2">
                      {signal.observedAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
              {signals.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-sm text-gray-600" colSpan={6}>
                    No reviewed pricing signals are published for this market yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
