"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DiscoveryCandidateStatus } from "@/generated/prisma";

type Props = {
  id: string;
  vendorName: string | null;
  searchTerm: string | null;
  category: string | null;
  homepageUrl: string | null;
  guessedPricingUrl: string | null;
  guessConfidence: number | null;
  status: DiscoveryCandidateStatus;
  approvedSourceId: string | null;
  approvedSourceUrl: string | null;
  createdAt: string;
};

const STATUS_TONE: Record<string, string> = {
  new: "bg-gray-100 text-gray-700",
  reviewed: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  crawled: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
};

export function CandidateRow(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"guess" | "approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideUrl, setOverrideUrl] = useState(props.guessedPricingUrl ?? "");

  async function call(
    op: "guess" | "approve" | "reject",
    body?: Record<string, unknown>,
  ) {
    setBusy(op);
    setError(null);
    const res = await fetch(
      `/api/admin/discovery/candidates/${props.id}/${op}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      },
    );
    setBusy(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const msg =
        typeof json.error === "string"
          ? json.error
          : Array.isArray(json.error)
            ? json.error[0]?.message ?? `${op} failed`
            : `${op} failed`;
      setError(msg);
      return;
    }
    router.refresh();
  }

  const tone = STATUS_TONE[props.status] ?? STATUS_TONE.new;

  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{props.vendorName ?? "—"}</div>
        {props.searchTerm && (
          <div className="text-xs text-gray-500">“{props.searchTerm}”</div>
        )}
        <div className="text-[11px] text-gray-400 mt-1">
          {props.createdAt.slice(0, 10)}
        </div>
      </td>
      <td className="px-3 py-2 text-xs">{props.category ?? "—"}</td>
      <td className="px-3 py-2 text-xs">
        {props.homepageUrl ? (
          <a
            href={props.homepageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 hover:underline break-all"
          >
            {props.homepageUrl}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 text-xs space-y-1 min-w-[220px]">
        {props.guessedPricingUrl ? (
          <>
            <a
              href={props.guessedPricingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 hover:underline break-all"
            >
              {props.guessedPricingUrl}
            </a>
            {props.guessConfidence != null && (
              <div className="text-gray-500">
                confidence {props.guessConfidence.toFixed(2)}
              </div>
            )}
          </>
        ) : (
          <span className="text-gray-400">—</span>
        )}
        {props.status !== "approved" && props.status !== "crawled" && (
          <input
            value={overrideUrl}
            onChange={(e) => setOverrideUrl(e.target.value)}
            placeholder="override URL (optional)"
            className="w-full border rounded px-2 py-1 text-[11px]"
          />
        )}
        {props.approvedSourceUrl && (
          <div className="text-[11px] text-emerald-700">
            queued: {props.approvedSourceUrl}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-block px-2 py-0.5 text-[11px] rounded ${tone}`}
        >
          {props.status}
        </span>
      </td>
      <td className="px-3 py-2 space-y-1 min-w-[160px]">
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busy !== null || !props.homepageUrl}
            onClick={() => void call("guess")}
            className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-40"
            title={!props.homepageUrl ? "needs a homepage URL" : ""}
          >
            {busy === "guess" ? "Guessing…" : "Guess"}
          </button>
          <button
            type="button"
            disabled={
              busy !== null ||
              (!props.guessedPricingUrl && !overrideUrl) ||
              props.status === "approved" ||
              props.status === "crawled"
            }
            onClick={() =>
              void call(
                "approve",
                overrideUrl && overrideUrl !== props.guessedPricingUrl
                  ? { pricingUrl: overrideUrl }
                  : {},
              )
            }
            className="text-[11px] px-2 py-1 bg-green-600 text-white rounded disabled:opacity-40"
          >
            {busy === "approve" ? "Approving…" : "Approve & queue"}
          </button>
          <button
            type="button"
            disabled={busy !== null || props.status === "rejected"}
            onClick={() => void call("reject")}
            className="text-[11px] px-2 py-1 bg-red-600 text-white rounded disabled:opacity-40"
          >
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </td>
    </tr>
  );
}
