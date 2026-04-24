import Link from "next/link";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function VerificationQueue() {
  const queue = await prisma.vendorProfile.findMany({
    where: {
      verificationStatus: { in: ["pending", "unverified"] },
      profileStatus: { in: ["submitted", "under_review", "in_progress"] },
    },
    include: {
      organization: true,
      hqCity: true,
      reviews: {
        where: { status: { in: ["pending", "in_review", "needs_changes"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Verification queue</h1>
      <p className="text-xs text-gray-500 mb-3">
        {queue.length} vendor{queue.length === 1 ? "" : "s"} awaiting review.
      </p>
      <table className="min-w-full text-sm bg-white border">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-3 py-2">Vendor</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Profile</th>
            <th className="px-3 py-2">Verification</th>
            <th className="px-3 py-2">Updated</th>
            <th className="px-3 py-2">Open review</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((v) => (
            <tr key={v.id} className="border-t">
              <td className="px-3 py-2">
                <Link href={`/admin/vendors/${v.id}`} className="text-blue-700 hover:underline">
                  {v.organization.displayName}
                </Link>
              </td>
              <td className="px-3 py-2">{v.hqCity?.name ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{v.profileStatus}</td>
              <td className="px-3 py-2 text-xs">{v.verificationStatus}</td>
              <td className="px-3 py-2 text-xs text-gray-600">
                {v.updatedAt.toISOString().slice(0, 16)}
              </td>
              <td className="px-3 py-2 text-xs">
                {v.reviews[0] ? (
                  <Link
                    href={`/admin/reviews/${v.reviews[0].id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {v.reviews[0].status} →
                  </Link>
                ) : (
                  <span className="text-gray-400">no review</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
