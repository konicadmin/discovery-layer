import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";
import { ReviewDecisionPanel } from "./decision-panel";
import { ChecklistRow } from "./checklist-row";

export const dynamic = "force-dynamic";

export default async function ReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await prisma.verificationReview.findUnique({
    where: { id },
    include: {
      vendorProfile: {
        include: {
          organization: true,
          hqCity: true,
          complianceRecords: true,
          documents: { include: { documentFile: true } },
          serviceCategories: { include: { serviceCategory: true } },
        },
      },
      reviewItems: { include: { checklistItem: true } },
      assignedTo: true,
      completedBy: true,
    },
  });
  if (!review) notFound();

  const v = review.vendorProfile;
  const requiredOpen = review.reviewItems.filter(
    (it) =>
      it.checklistItem.required && it.status !== "pass" && it.status !== "not_applicable",
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-gray-500 mb-1">Verification review</div>
        <h1 className="text-xl font-semibold">{v.organization.displayName}</h1>
        <div className="text-xs text-gray-500 mt-1">
          {v.hqCity?.name ?? "—"} · profile {v.profileStatus} · verification{" "}
          {v.verificationStatus}
        </div>
      </div>

      <section className="grid grid-cols-4 gap-3">
        <Stat label="Review status" value={review.status} />
        <Stat label="Type" value={review.reviewType} />
        <Stat label="Assigned to" value={review.assignedTo?.name ?? "—"} />
        <Stat
          label="Required items open"
          value={String(requiredOpen)}
          tone={requiredOpen === 0 ? "ok" : "warn"}
        />
      </section>

      <section className="bg-white border rounded">
        <header className="px-4 py-2 border-b text-sm font-semibold">
          Verification checklist
        </header>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Required</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {review.reviewItems.map((it) => (
              <ChecklistRow
                key={it.id}
                reviewId={review.id}
                checklistItemId={it.checklistItemId}
                label={it.checklistItem.label}
                required={it.checklistItem.required}
                status={it.status}
                notes={it.notes ?? ""}
                disabled={
                  review.status === "approved" || review.status === "rejected"
                }
              />
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white border rounded">
        <header className="px-4 py-2 border-b text-sm font-semibold">Documents</header>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {v.documents.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="px-3 py-2 text-xs">{d.documentType}</td>
                <td className="px-3 py-2 text-xs">{d.documentFile.fileName}</td>
                <td className="px-3 py-2 text-xs">{d.status}</td>
                <td className="px-3 py-2 text-xs">
                  {d.reviewedAt?.toISOString().slice(0, 16) ?? "—"}
                </td>
              </tr>
            ))}
            {v.documents.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-gray-500 text-sm">
                  No documents uploaded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <ReviewDecisionPanel
        reviewId={review.id}
        canApprove={requiredOpen === 0 && review.status !== "approved"}
        currentStatus={review.status}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  const ring =
    tone === "ok"
      ? "border-green-300"
      : tone === "warn"
        ? "border-amber-300"
        : "";
  return (
    <div className={`bg-white border rounded p-3 ${ring}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium mt-1">{value}</div>
    </div>
  );
}
