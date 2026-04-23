import Link from "next/link";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function VendorsList() {
  const vendors = await prisma.vendorProfile.findMany({
    take: 100,
    orderBy: { updatedAt: "desc" },
    include: {
      organization: true,
      hqCity: true,
      serviceCategories: { include: { serviceCategory: true } },
    },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Vendors</h1>
      <table className="min-w-full text-sm bg-white border">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Region</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Profile</th>
            <th className="px-3 py-2">Verification</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Updated</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id} className="border-t">
              <td className="px-3 py-2">
                <Link href={`/admin/vendors/${v.id}`} className="text-blue-700 hover:underline">
                  {v.organization.displayName}
                </Link>
              </td>
              <td className="px-3 py-2 text-xs font-mono">{v.organization.region}</td>
              <td className="px-3 py-2">{v.hqCity?.name ?? "—"}</td>
              <td className="px-3 py-2">
                <span className="px-2 py-0.5 rounded bg-gray-100 text-xs">{v.profileStatus}</span>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs ${
                    v.verificationStatus === "verified"
                      ? "bg-green-100 text-green-800"
                      : v.verificationStatus === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {v.verificationStatus}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-gray-600">{v.createdBySource}</td>
              <td className="px-3 py-2 text-xs text-gray-600">
                {v.updatedAt.toISOString().slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
