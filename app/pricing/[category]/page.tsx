import { notFound } from "next/navigation";
import Link from "next/link";
import { PricingSignalStatus } from "@/generated/prisma";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = await prisma.serviceCategory.findUnique({ where: { code: category } });
  if (!cat) return {};
  return {
    title: `${cat.label} pricing | Discovery Layer`,
    description: `Published pricing signals for ${cat.label}.`,
  };
}

export default async function CategoryPage({
  params,
}: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = await prisma.serviceCategory.findUnique({ where: { code: category } });
  if (!cat) notFound();

  const rows = await prisma.publicPricingSignal.findMany({
    where: {
      status: PricingSignalStatus.published,
      vendorProfile: {
        serviceCategories: { some: { serviceCategoryId: cat.id } },
      },
    },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          publicSnapshots: { where: { publicStatus: "published" }, take: 1 },
        },
      },
      product: true,
      plan: true,
    },
    orderBy: { observedAt: "desc" },
    take: 200,
  });

  const sourceUrlIds = Array.from(
    new Set(rows.map((r) => r.sourceUrlId).filter((id): id is string => Boolean(id))),
  );
  const sourceUrls = sourceUrlIds.length
    ? await prisma.sourceUrl.findMany({
        where: { id: { in: sourceUrlIds } },
        select: { id: true, url: true },
      })
    : [];
  const sourceUrlById = new Map(sourceUrls.map((s) => [s.id, s.url]));

  return (
    <main className="min-h-screen bg-white text-gray-950">
      <section className="mx-auto max-w-6xl px-5 py-8">
        <p className="text-sm text-gray-500">
          <Link className="underline" href="/pricing">← Categories</Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{cat.label}</h1>

        <div className="mt-6 overflow-x-auto border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Observed</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const slug = r.vendorProfile.publicSnapshots[0]?.slug;
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      {slug ? (
                        <Link className="underline" href={`/vendors/${slug}`}>
                          {r.vendorProfile.organization.displayName}
                        </Link>
                      ) : (
                        r.vendorProfile.organization.displayName
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.product && slug ? (
                        <Link className="underline" href={`/vendors/${slug}/${r.product.slug}`}>
                          {r.product.displayName}
                        </Link>
                      ) : (
                        r.product?.displayName ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2">{r.plan?.displayName ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">
                      {r.currency} {Number(r.priceValue).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2">{r.unit}</td>
                    <td className="px-3 py-2">
                      {r.observedAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">
                      {r.sourceUrlId && sourceUrlById.get(r.sourceUrlId) ? (
                        <a
                          className="underline"
                          href={sourceUrlById.get(r.sourceUrlId)}
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
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-sm text-gray-600" colSpan={7}>
                    No published pricing signals in this category yet.
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
