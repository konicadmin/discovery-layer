import Link from "next/link";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function RfqsList() {
  const rfqs = await prisma.rfq.findMany({
    take: 100,
    orderBy: { updatedAt: "desc" },
    include: {
      buyerOrganization: true,
      requirement: { include: { city: true } },
      _count: { select: { recipients: true, quotes: true } },
    },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">RFQs</h1>
      <table className="min-w-full text-sm bg-white border">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Buyer</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Recipients</th>
            <th className="px-3 py-2">Quotes</th>
            <th className="px-3 py-2">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {rfqs.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">
                <Link href={`/admin/rfqs/${r.id}`} className="text-blue-700 hover:underline">
                  {r.rfqCode}
                </Link>
              </td>
              <td className="px-3 py-2">{r.buyerOrganization.displayName}</td>
              <td className="px-3 py-2">{r.requirement.city.name}</td>
              <td className="px-3 py-2 text-xs">{r.status}</td>
              <td className="px-3 py-2">{r._count.recipients}</td>
              <td className="px-3 py-2">{r._count.quotes}</td>
              <td className="px-3 py-2 text-xs text-gray-600">
                {r.responseDeadline?.toISOString().slice(0, 10) ?? "—"}
              </td>
            </tr>
          ))}
          {rfqs.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-gray-500 text-sm">
                No RFQs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
