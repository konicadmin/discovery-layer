import { notFound } from "next/navigation";
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
        },
      },
    },
  });
  if (!snap || snap.publicStatus !== "published") notFound();
  const profile = snap.vendorProfile;
  const band = deriveTrustBand(profile);
  const trust = TRUST_LABELS[band] ?? TRUST_LABELS.unclaimed_public_record!;

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
