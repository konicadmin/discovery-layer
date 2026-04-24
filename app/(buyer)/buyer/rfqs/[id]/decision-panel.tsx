"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Decision = "awarded" | "closed_no_award" | "cancelled";

export function DecisionPanel(props: {
  rfqId: string;
  existing: { status: string; notes: string; selectedVendorProfileId: string | null } | null;
  vendorOptions: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(
    props.existing?.selectedVendorProfileId ?? props.vendorOptions[0]?.id ?? "",
  );
  const [notes, setNotes] = useState(props.existing?.notes ?? "");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: Decision) {
    setBusy(decision);
    setError(null);
    const body: Record<string, unknown> = {
      decision,
      notes: notes || undefined,
      actorUserId: "buyer-console",
    };
    if (decision === "awarded") body.selectedVendorProfileId = selected;
    const res = await fetch(`/api/buyer/rfqs/${props.rfqId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "decision failed");
      return;
    }
    router.refresh();
  }

  if (props.existing) {
    return (
      <section className="bg-white border rounded p-4">
        <h2 className="text-sm font-semibold mb-2">Decision</h2>
        <div className="text-sm">Status: {props.existing.status}</div>
        {props.existing.selectedVendorProfileId && (
          <div className="text-sm mt-1">
            Awarded to: {props.existing.selectedVendorProfileId}
          </div>
        )}
        {props.existing.notes && (
          <div className="text-sm mt-2 text-gray-600">{props.existing.notes}</div>
        )}
      </section>
    );
  }

  return (
    <section className="bg-white border rounded p-4 space-y-3">
      <h2 className="text-sm font-semibold">Decision</h2>
      <div className="flex items-center gap-2 text-sm">
        <label className="text-xs text-gray-600">Award to:</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="border rounded px-2 py-1 text-sm bg-white"
        >
          {props.vendorOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Decision notes (optional for award; recommended for closures)"
        className="w-full border rounded px-3 py-2 text-sm min-h-[80px]"
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy !== null || props.vendorOptions.length === 0}
          onClick={() => void decide("awarded")}
          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded disabled:opacity-40"
        >
          {busy === "awarded" ? "Awarding…" : "Award"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("closed_no_award")}
          className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded disabled:opacity-40"
        >
          {busy === "closed_no_award" ? "Closing…" : "Close no-award"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("cancelled")}
          className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded disabled:opacity-40"
        >
          {busy === "cancelled" ? "Cancelling…" : "Cancel RFQ"}
        </button>
      </div>
    </section>
  );
}
