import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function RequirementsList() {
  const items = await prisma.buyerRequirement.findMany({
    take: 100,
    orderBy: { updatedAt: "desc" },
    include: { buyerOrganization: true, city: true, serviceCategory: true },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Buyer requirements</h1>
      <table className="min-w-full text-sm bg-white border">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Buyer</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Headcount</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.title}</td>
              <td className="px-3 py-2">{r.buyerOrganization.displayName}</td>
              <td className="px-3 py-2">{r.serviceCategory.label}</td>
              <td className="px-3 py-2">{r.city.name}</td>
              <td className="px-3 py-2">{r.headcountRequired ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{r.status}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-gray-500 text-sm">
                No requirements yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
