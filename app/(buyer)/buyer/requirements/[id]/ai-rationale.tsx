"use client";

import { useState } from "react";

type Explanation = {
  summary: string;
  bullets: string[];
  watchouts: string[];
};

export function AiRationalePanel(props: {
  endpoint: string;
  title: string;
}) {
  const [result, setResult] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(props.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "failed");
      return;
    }
    setResult(await res.json());
  }

  return (
    <section className="bg-white border rounded p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{props.title}</h2>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="text-xs px-2 py-1 border rounded disabled:opacity-40"
        >
          {busy ? "Thinking…" : result ? "Regenerate" : "Explain"}
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {result && (
        <div className="text-sm space-y-2">
          <div>{result.summary}</div>
          {result.bullets.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {result.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          {result.watchouts.length > 0 && (
            <div className="text-xs text-amber-700">
              watchouts: {result.watchouts.join(", ")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
