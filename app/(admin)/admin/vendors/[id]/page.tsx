import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function VendorDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id },
    include: {
      organization: true,
      hqCity: true,
      serviceAreas: { include: { city: true } },
      serviceCategories: { include: { serviceCategory: true } },
      complianceRecords: true,
      documents: { include: { documentFile: true } },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!vendor) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{vendor.organization.displayName}</h1>
        <div className="text-xs text-gray-500 mt-1">
          {vendor.organization.legalName} · GSTIN {vendor.organization.gstin ?? "—"}
        </div>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Profile status" value={vendor.profileStatus} />
        <Stat label="Verification" value={vendor.verificationStatus} />
        <Stat label="Source" value={vendor.createdBySource} />
        <Stat label="HQ city" value={vendor.hqCity?.name ?? "—"} />
        <Stat label="Operating cities" value={String(vendor.operatingCitiesCount)} />
        <Stat label="Verified at" value={vendor.verifiedAt?.toISOString().slice(0, 10) ?? "—"} />
      </section>

      <Section title="Service categories">
        <ul className="text-sm">
          {vendor.serviceCategories.map((c) => (
            <li key={c.id}>
              {c.serviceCategory.label}
              {c.primaryCategory && <span className="ml-2 text-xs text-gray-500">(primary)</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Service areas">
        <ul className="text-sm">
          {vendor.serviceAreas.map((a) => (
            <li key={a.id}>
              {a.city.name} {a.locality ? `· ${a.locality}` : ""}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Compliance">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-2 py-1">Type</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Identifier</th>
              <th className="px-2 py-1">Valid to</th>
            </tr>
          </thead>
          <tbody>
            {vendor.complianceRecords.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.complianceType}</td>
                <td className="px-2 py-1">{r.status}</td>
                <td className="px-2 py-1">{r.identifier ?? "—"}</td>
                <td className="px-2 py-1">{r.validTo?.toISOString().slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
            {vendor.complianceRecords.length === 0 && (
              <tr>
                <td className="px-2 py-1 text-gray-500" colSpan={4}>
                  No compliance records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title="Reviews">
        <ul className="text-sm">
          {vendor.reviews.map((r) => (
            <li key={r.id}>
              {r.reviewType} · {r.status} · {r.createdAt.toISOString().slice(0, 16)}
            </li>
          ))}
          {vendor.reviews.length === 0 && (
            <li className="text-gray-500">No reviews yet.</li>
          )}
        </ul>
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium mt-1">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border rounded p-4">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}
