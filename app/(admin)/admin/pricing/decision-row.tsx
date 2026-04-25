"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  vendorName: string;
  city: string;
  signalType: string;
  unit: string;
  priceValue: number;
  currency: string;
  normalizedPgpm: number | null;
  normalizationNotes: string | null;
  confidence: number;
  excerpt: string;
  minQuantity: number | null;
  minContractMonths: number | null;
};

export function PricingDecisionRow(props: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"publish" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "publish" | "reject") {
    if (decision === "reject" && !notes.trim()) {
      setError("notes required to reject");
      return;
    }
    setBusy(decision);
    setError(null);
    const res = await fetch(`/api/internal/pricing-signals/${props.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        notes: notes || undefined,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "decision failed");
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{props.vendorName}</div>
        <div className="text-xs text-gray-500">{props.city}</div>
      </td>
      <td className="px-3 py-2 text-xs">
        <div>{props.signalType}</div>
        <div className="text-gray-500">unit: {props.unit}</div>
      </td>
      <td className="px-3 py-2">
        <div className="font-mono">
          {props.currency} {props.priceValue.toLocaleString("en-IN")}
        </div>
        {(props.minQuantity || props.minContractMonths) && (
          <div className="text-xs text-gray-500 mt-1">
            {props.minQuantity ? `min ${props.minQuantity} guards` : ""}
            {props.minQuantity && props.minContractMonths ? " · " : ""}
            {props.minContractMonths ? `${props.minContractMonths} mo term` : ""}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="font-mono text-sm">
          {props.normalizedPgpm != null
            ? `₹${props.normalizedPgpm.toLocaleString("en-IN")}`
            : "—"}
        </div>
        {props.normalizationNotes && (
          <div className="text-[11px] text-gray-500 mt-1">{props.normalizationNotes}</div>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{props.confidence.toFixed(2)}</td>
      <td className="px-3 py-2 text-xs text-gray-700 max-w-sm">
        <div className="bg-gray-50 border rounded px-2 py-1">{props.excerpt}</div>
      </td>
      <td className="px-3 py-2 space-y-2 min-w-[220px]">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="notes (required for reject)"
          className="w-full border rounded px-2 py-1 text-xs min-h-[50px]"
        />
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex gap-1">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void decide("publish")}
            className="text-xs px-2 py-1 bg-green-600 text-white rounded disabled:opacity-40"
          >
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void decide("reject")}
            className="text-xs px-2 py-1 bg-red-600 text-white rounded disabled:opacity-40"
          >
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </td>
    </tr>
  );
}
