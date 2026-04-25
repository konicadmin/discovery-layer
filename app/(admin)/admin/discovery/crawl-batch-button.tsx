"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  approvedCount: number;
};

type BatchSummary = {
  approvedCount: number;
  processed: number;
  crawled: number;
  skipped: number;
  failed: number;
  items: Array<{
    candidateId: string;
    vendorName: string | null;
    pricingUrl: string | null;
    status: "crawled" | "skipped" | "failed";
    pricingSignalsCreated?: number;
    error?: string;
  }>;
};

export function CrawlBatchButton({ approvedCount }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setSummary(null);
    const res = await fetch("/api/admin/discovery/crawl-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 25 }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "batch crawl failed");
      return;
    }
    const json = (await res.json()) as BatchSummary;
    setSummary(json);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || approvedCount === 0}
        className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded disabled:opacity-40"
        title={
          approvedCount === 0
            ? "no approved candidates to crawl"
            : `crawl up to 25 of ${approvedCount} approved candidates`
        }
      >
        {busy
          ? "Crawling…"
          : `Crawl approved (${approvedCount})`}
      </button>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {summary && (
        <div className="text-xs bg-white border rounded p-3 max-w-md">
          <div>
            crawled <strong>{summary.crawled}</strong> ·{" "}
            failed <strong>{summary.failed}</strong> ·{" "}
            skipped <strong>{summary.skipped}</strong>
            {" "}of {summary.processed}
          </div>
          {summary.items.some((i) => i.status === "failed") && (
            <ul className="mt-2 space-y-1 text-[11px] text-red-700">
              {summary.items
                .filter((i) => i.status === "failed")
                .map((i) => (
                  <li key={i.candidateId}>
                    {i.vendorName ?? i.candidateId}: {i.error ?? "failed"}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
