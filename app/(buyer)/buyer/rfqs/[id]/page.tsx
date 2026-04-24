import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";
import { compareRfq } from "@/server/services/quotes/compare";
import { DecisionPanel } from "./decision-panel";
import { AiRationalePanel } from "../../requirements/[id]/ai-rationale";

export const dynamic = "force-dynamic";

export default async function BuyerRfqDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rfq = await prisma.rfq.findUnique({
    where: { id },
    include: {
      buyerOrganization: true,
      requirement: { include: { city: true, serviceCategory: true } },
      recipients: { include: { vendorProfile: { include: { organization: true } } } },
      decisions: { orderBy: { decidedAt: "desc" }, take: 1 },
    },
  });
  if (!rfq) notFound();
  const compare = await compareRfq(prisma, rfq.id);
  const decision = rfq.decisions[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-gray-500">RFQ</div>
        <h1 className="text-xl font-semibold font-mono">{rfq.rfqCode}</h1>
        <div className="text-xs text-gray-500 mt-1">
          {rfq.buyerOrganization.displayName} · {rfq.requirement.title} ·{" "}
          {rfq.requirement.city.name} · status {rfq.status}
        </div>
      </div>

      <section className="bg-white border rounded">
        <header className="px-4 py-2 border-b text-sm font-semibold">Compare</header>
        {compare.rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500">
            No quotes submitted yet. Missing responses:{" "}
            {compare.missingResponses.join(", ") || "—"}.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">Monthly</th>
                <th className="px-3 py-2">Statutory</th>
                <th className="px-3 py-2">Service fee</th>
                <th className="px-3 py-2">Grand total</th>
                <th className="px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {compare.rows.map((row) => (
                <tr key={row.vendorProfileId} className="border-t align-top">
                  <td className="px-3 py-2">{row.vendorName}</td>
                  <td className="px-3 py-2 text-xs">v{row.versionNumber}</td>
                  <td className="px-3 py-2">{fmt(row.monthlySubtotal)}</td>
                  <td className="px-3 py-2">{fmt(row.statutoryCostTotal)}</td>
                  <td className="px-3 py-2">{fmt(row.serviceFeeTotal)}</td>
                  <td className="px-3 py-2 font-medium">{fmt(row.grandTotal)}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.flags.length > 0 ? (
                      <span className="text-amber-700">{row.flags.join(", ")}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {compare.missingResponses.length > 0 && (
                <tr className="border-t bg-gray-50">
                  <td colSpan={7} className="px-3 py-2 text-xs text-gray-500">
                    Awaiting response: {compare.missingResponses.join(", ")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <AiRationalePanel
        title="AI compare explanation"
        endpoint={`/api/ai/rfqs/${rfq.id}/compare/explain`}
      />

      <DecisionPanel
        rfqId={rfq.id}
        existing={
          decision
            ? {
                status: decision.decisionStatus,
                notes: decision.decisionNotes ?? "",
                selectedVendorProfileId: decision.selectedVendorProfileId ?? null,
              }
            : null
        }
        vendorOptions={compare.rows.map((r) => ({
          id: r.vendorProfileId,
          label: `${r.vendorName} · ₹${fmt(r.grandTotal)}`,
        }))}
      />
    </div>
  );
}

function fmt(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN");
}
