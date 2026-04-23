"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Decision = "approve" | "request_changes" | "reject";

export function ReviewDecisionPanel(props: {
  reviewId: string;
  canApprove: boolean;
  currentStatus: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (props.currentStatus === "approved" || props.currentStatus === "rejected") {
    return (
      <div className="text-sm text-gray-500">
        Review is {props.currentStatus}. No further action.
      </div>
    );
  }

  async function decide(decision: Decision) {
    if (decision !== "approve" && !notes.trim()) {
      setError("notes required");
      return;
    }
    setBusy(decision);
    setError(null);
    const res = await fetch(`/api/admin/reviews/${props.reviewId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, notes: notes || undefined, actorUserId: "ops-console" }),
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
    <section className="bg-white border rounded p-4 space-y-3">
      <h2 className="text-sm font-semibold">Decision</h2>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Reviewer notes (required for reject / request changes)…"
        className="w-full text-sm border rounded px-3 py-2 min-h-[80px]"
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!props.canApprove || busy !== null}
          onClick={() => void decide("approve")}
          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40"
          title={props.canApprove ? "Approve review" : "Resolve required checklist items first"}
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("request_changes")}
          className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-40"
        >
          {busy === "request_changes" ? "Sending…" : "Request changes"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("reject")}
          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40"
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {!props.canApprove && (
        <div className="text-xs text-amber-700">
          Approve is disabled until all required checklist items are pass / not_applicable.
        </div>
      )}
    </section>
  );
}
