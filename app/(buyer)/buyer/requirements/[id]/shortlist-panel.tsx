"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ShortlistItem = {
  vendorProfileId: string;
  displayName: string;
  hqCity: string | null;
  verificationStatus: string;
  matchScore: number | null;
  reasons: unknown;
};

export function ShortlistPanel(props: {
  requirementId: string;
  initial: ShortlistItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(props.initial);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/buyer/requirements/${props.requirementId}/shortlist`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "failed");
      return;
    }
    setItems(
      json.items.map((it: {
        vendorProfileId: string;
        displayName: string;
        verificationStatus: string;
        score: number;
        reasons: unknown;
      }) => ({
        vendorProfileId: it.vendorProfileId,
        displayName: it.displayName,
        hqCity: null,
        verificationStatus: it.verificationStatus,
        matchScore: it.score,
        reasons: it.reasons,
      })),
    );
  }

  async function issueRfq() {
    const recipientIds = Object.keys(selected).filter((id) => selected[id]);
    if (recipientIds.length === 0) {
      setError("select at least one vendor");
      return;
    }
    setIssuing(true);
    setError(null);
    const res = await fetch(
      `/api/buyer/requirements/${props.requirementId}/rfqs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientVendorProfileIds: recipientIds,
          issueNow: true,
          responseDeadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          createdByUserId: "buyer-console",
        }),
      },
    );
    const json = await res.json();
    setIssuing(false);
    if (!res.ok) {
      setError(JSON.stringify(json.error));
      return;
    }
    router.push(`/buyer/rfqs/${json.id}`);
  }

  return (
    <section className="bg-white border rounded">
      <header className="px-4 py-2 border-b text-sm font-semibold flex items-center justify-between">
        <span>Shortlist</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void regenerate()}
            className="text-xs px-2 py-1 border rounded disabled:opacity-40"
          >
            {busy ? "Generating…" : "Regenerate"}
          </button>
          <button
            type="button"
            disabled={issuing || items.length === 0}
            onClick={() => void issueRfq()}
            className="text-xs px-2 py-1 bg-gray-900 text-white rounded disabled:opacity-40"
          >
            {issuing ? "Issuing…" : "Issue RFQ to selected"}
          </button>
        </div>
      </header>
      {error && <div className="px-4 py-2 text-xs text-red-600">{error}</div>}
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="px-3 py-2 w-8"> </th>
            <th className="px-3 py-2">Vendor</th>
            <th className="px-3 py-2">Verification</th>
            <th className="px-3 py-2">Score</th>
            <th className="px-3 py-2">Reasons</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.vendorProfileId} className="border-t align-top">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={!!selected[it.vendorProfileId]}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [it.vendorProfileId]: e.target.checked }))
                  }
                />
              </td>
              <td className="px-3 py-2">{it.displayName}</td>
              <td className="px-3 py-2 text-xs">{it.verificationStatus}</td>
              <td className="px-3 py-2 text-xs font-mono">
                {it.matchScore != null ? it.matchScore.toFixed(3) : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-gray-600">
                {Array.isArray(it.reasons)
                  ? (it.reasons as Array<{ component: string; detail: string }>).map(
                      (r, i) => (
                        <div key={i}>
                          <span className="font-mono">{r.component}</span>: {r.detail}
                        </div>
                      ),
                    )
                  : "—"}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-gray-500 text-sm text-center">
                No shortlist yet. Click Regenerate.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
