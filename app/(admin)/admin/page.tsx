import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [
    organizations,
    vendors,
    verifiedVendors,
    pendingReviews,
    requirements,
    rfqs,
    quotes,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.vendorProfile.count(),
    prisma.vendorProfile.count({ where: { verificationStatus: "verified" } }),
    prisma.vendorProfile.count({ where: { verificationStatus: "pending" } }),
    prisma.buyerRequirement.count(),
    prisma.rfq.count(),
    prisma.quote.count(),
  ]);

  const stats = [
    { label: "Organizations", value: organizations },
    { label: "Vendor profiles", value: vendors },
    { label: "Verified vendors", value: verifiedVendors },
    { label: "Pending verification", value: pendingReviews },
    { label: "Requirements", value: requirements },
    { label: "RFQs", value: rfqs },
    { label: "Quotes", value: quotes },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Operations dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border rounded p-4">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className="text-2xl font-semibold mt-1">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
