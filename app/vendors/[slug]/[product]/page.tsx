import { notFound } from "next/navigation";
import Link from "next/link";
import { absoluteUrl } from "@/lib/site";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string; product: string }> }) {
  const { slug, product } = await params;
  const snap = await prisma.vendorPublicSnapshot.findUnique({ where: { slug } });
  if (!snap || snap.publicStatus !== "published") return {};
  const p = await prisma.product.findFirst({
    where: { vendorProfileId: snap.vendorProfileId, slug: product },
  });
  if (!p) return {};
  return {
    title: `${p.displayName} pricing | Discovery Layer`,
    description: `Public pricing signals for ${p.displayName}.`,
  };
}

export default async function ProductPage({
  params,
}: { params: Promise<{ slug: string; product: string }> }) {
  const { slug, product } = await params;
  const snap = await prisma.vendorPublicSnapshot.findUnique({
    where: { slug },
    include: { vendorProfile: { include: { organization: true } } },
  });
  if (!snap || snap.publicStatus !== "published") notFound();

  const p = await prisma.product.findFirst({
    where: { vendorProfileId: snap.vendorProfileId, slug: product },
    include: {
      plans: { orderBy: { displayName: "asc" } },
      pricingSignals: {
        where: { status: "published" },
        orderBy: { observedAt: "desc" },
        include: { plan: true },
      },
    },
  });
  if (!p) notFound();

  const canonical = absoluteUrl(`/vendors/${slug}/${product}`);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.displayName,
            brand: snap.vendorProfile.organization.displayName,
            url: canonical,
            offers: p.pricingSignals.map((s) => ({
              "@type": "Offer",
              price: Number(s.priceValue),
              priceCurrency: s.currency,
              priceSpecification: {
                "@type": "UnitPriceSpecification",
                price: Number(s.priceValue),
                priceCurrency: s.currency,
                unitText: s.unit,
              },
              availability: "https://schema.org/InStock",
              description: s.plan?.displayName,
              url: canonical,
            })),
          }),
        }}
      />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-sm text-gray-500">
          <Link className="underline" href={`/vendors/${slug}`}>
            ← {snap.vendorProfile.organization.displayName}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{p.displayName}</h1>
        {p.description && <p className="mt-2 text-sm text-gray-600">{p.description}</p>}

        <section className="mt-6 bg-white border rounded p-4">
          <h2 className="text-sm font-semibold mb-2">Plans</h2>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-2 py-1">Plan</th>
                <th className="px-2 py-1">Tier</th>
                <th className="px-2 py-1">Price signals</th>
              </tr>
            </thead>
            <tbody>
              {p.plans.map((pl) => {
                const signals = p.pricingSignals.filter((s) => s.planId === pl.id);
                return (
                  <tr key={pl.id} className="border-t align-top">
                    <td className="px-2 py-1">{pl.displayName}</td>
                    <td className="px-2 py-1 text-xs">{pl.tier}</td>
                    <td className="px-2 py-1 text-xs">
                      {signals.length === 0
                        ? "—"
                        : signals
                            .map(
                              (s) =>
                                `${s.currency} ${Number(s.priceValue)} ${s.unit}`,
                            )
                            .join(" · ")}
                    </td>
                  </tr>
                );
              })}
              {p.plans.length === 0 && (
                <tr>
                  <td className="px-2 py-2 text-sm text-gray-600" colSpan={3}>
                    No plans recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
