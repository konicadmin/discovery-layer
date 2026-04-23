"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubmitForReviewButton({
  vendorProfileId,
  disabled,
}: {
  vendorProfileId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/vendors/${vendorProfileId}/submit-for-review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "submit failed");
      return;
    }
    router.refresh();
  }

  if (disabled) {
    return (
      <div className="text-xs text-gray-500">
        Already submitted or under review. Wait for ops decision.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="w-full bg-gray-900 text-white py-2 rounded text-sm disabled:opacity-40"
      >
        {busy ? "Submitting…" : "Submit for review"}
      </button>
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
