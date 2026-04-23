import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function RfqDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rfq = await prisma.rfq.findUnique({
    where: { id },
    include: {
      buyerOrganization: true,
      requirement: { include: { city: true, serviceCategory: true } },
      recipients: { include: { vendorProfile: { include: { organization: true } } } },
      quotes: {
        orderBy: [{ vendorProfileId: "asc" }, { versionNumber: "desc" }],
        include: { vendorProfile: { include: { organization: true } }, lineItems: true },
      },
    },
  });
  if (!rfq) notFound();

  // Latest submitted quote per vendor for the compare view.
  const latestPerVendor = new Map<string, (typeof rfq.quotes)[number]>();
  for (const q of rfq.quotes) {
    if (q.submissionStatus !== "submitted") continue;
    const prev = latestPerVendor.get(q.vendorProfileId);
    if (!prev || prev.versionNumber < q.versionNumber) {
      latestPerVendor.set(q.vendorProfileId, q);
    }
  }
  const compareRows = Array.from(latestPerVendor.values());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold font-mono">{rfq.rfqCode}</h1>
        <div className="text-xs text-gray-500 mt-1">
          {rfq.buyerOrganization.displayName} · {rfq.requirement.title} ·{" "}
          {rfq.requirement.city.name}
        </div>
      </div>

      <section className="grid grid-cols-4 gap-3">
        <Stat label="Status" value={rfq.status} />
        <Stat label="Issued" value={rfq.issueDate?.toISOString().slice(0, 16) ?? "—"} />
        <Stat label="Deadline" value={rfq.responseDeadline?.toISOString().slice(0, 16) ?? "—"} />
        <Stat label="Recipients" value={String(rfq.recipients.length)} />
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="text-sm font-semibold mb-2">Recipients</h2>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-2 py-1">Vendor</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Sent</th>
              <th className="px-2 py-1">Responded</th>
            </tr>
          </thead>
          <tbody>
            {rfq.recipients.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.vendorProfile.organization.displayName}</td>
                <td className="px-2 py-1 text-xs">{r.recipientStatus}</td>
                <td className="px-2 py-1 text-xs">{r.sentAt?.toISOString().slice(0, 16) ?? "—"}</td>
                <td className="px-2 py-1 text-xs">
                  {r.respondedAt?.toISOString().slice(0, 16) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="text-sm font-semibold mb-2">Compare (latest submitted per vendor)</h2>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-2 py-1">Vendor</th>
              <th className="px-2 py-1">Version</th>
              <th className="px-2 py-1">Monthly subtotal</th>
              <th className="px-2 py-1">Statutory</th>
              <th className="px-2 py-1">Service fee</th>
              <th className="px-2 py-1">Grand total</th>
              <th className="px-2 py-1">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((q) => (
              <tr key={q.id} className="border-t">
                <td className="px-2 py-1">{q.vendorProfile.organization.displayName}</td>
                <td className="px-2 py-1 text-xs">v{q.versionNumber}</td>
                <td className="px-2 py-1">{q.monthlySubtotal?.toString() ?? "—"}</td>
                <td className="px-2 py-1">{q.statutoryCostTotal?.toString() ?? "—"}</td>
                <td className="px-2 py-1">{q.serviceFeeTotal?.toString() ?? "—"}</td>
                <td className="px-2 py-1 font-medium">{q.grandTotal?.toString() ?? "—"}</td>
                <td className="px-2 py-1 text-xs">
                  {q.submittedAt?.toISOString().slice(0, 16) ?? "—"}
                </td>
              </tr>
            ))}
            {compareRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-gray-500 text-sm">
                  No submitted quotes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
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
