import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";
import { ShortlistPanel } from "./shortlist-panel";
import { AiRationalePanel } from "./ai-rationale";

export const dynamic = "force-dynamic";

export default async function RequirementDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requirement = await prisma.buyerRequirement.findUnique({
    where: { id },
    include: {
      buyerOrganization: true,
      city: true,
      serviceCategory: true,
      rfqs: { orderBy: { createdAt: "desc" } },
      shortlistEntries: {
        orderBy: { matchScore: "desc" },
        include: {
          vendorProfile: {
            include: { organization: true, hqCity: true },
          },
        },
      },
    },
  });
  if (!requirement) notFound();

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-gray-500">Requirement</div>
        <h1 className="text-xl font-semibold">{requirement.title}</h1>
        <div className="text-xs text-gray-500 mt-1">
          {requirement.buyerOrganization.displayName} · {requirement.serviceCategory.label} ·{" "}
          {requirement.city.name} · headcount {requirement.headcountRequired ?? "—"} ·{" "}
          {requirement.shiftPattern ?? "—"} · status {requirement.status}
        </div>
      </div>

      <ShortlistPanel
        requirementId={requirement.id}
        initial={requirement.shortlistEntries.map((s) => ({
          vendorProfileId: s.vendorProfileId,
          displayName: s.vendorProfile.organization.displayName,
          hqCity: s.vendorProfile.hqCity?.name ?? null,
          verificationStatus: s.vendorProfile.verificationStatus,
          matchScore: s.matchScore ? Number(s.matchScore) : null,
          reasons: s.matchReasonsJson,
        }))}
      />

      <AiRationalePanel
        title="AI rationale (shortlist)"
        endpoint={`/api/ai/shortlists/${requirement.id}/explain`}
      />

      <section className="bg-white border rounded p-4">
        <h2 className="text-sm font-semibold mb-2">RFQs</h2>
        {requirement.rfqs.length === 0 ? (
          <div className="text-sm text-gray-500">
            No RFQs yet. Generate the shortlist, then issue one.
          </div>
        ) : (
          <ul className="text-sm space-y-1">
            {requirement.rfqs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/buyer/rfqs/${r.id}`}
                  className="font-mono text-xs text-blue-700 hover:underline"
                >
                  {r.rfqCode}
                </Link>
                <span className="ml-2 text-gray-500">{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
