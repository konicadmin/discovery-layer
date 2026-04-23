import Link from "next/link";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function BuyerDashboard() {
  const requirements = await prisma.buyerRequirement.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      buyerOrganization: true,
      city: true,
      serviceCategory: true,
      _count: { select: { rfqs: true, shortlistEntries: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sourcing requirements</h1>
        <Link
          href="/buyer/new"
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded"
        >
          New requirement
        </Link>
      </div>
      <table className="min-w-full text-sm bg-white border">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Buyer</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Headcount</th>
            <th className="px-3 py-2">Shortlist</th>
            <th className="px-3 py-2">RFQs</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {requirements.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">
                <Link
                  href={`/buyer/requirements/${r.id}`}
                  className="text-blue-700 hover:underline"
                >
                  {r.title}
                </Link>
              </td>
              <td className="px-3 py-2">{r.buyerOrganization.displayName}</td>
              <td className="px-3 py-2">{r.serviceCategory.label}</td>
              <td className="px-3 py-2">{r.city.name}</td>
              <td className="px-3 py-2">{r.headcountRequired ?? "—"}</td>
              <td className="px-3 py-2">{r._count.shortlistEntries}</td>
              <td className="px-3 py-2">{r._count.rfqs}</td>
              <td className="px-3 py-2 text-xs">{r.status}</td>
            </tr>
          ))}
          {requirements.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-gray-500 text-sm">
                No requirements yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
