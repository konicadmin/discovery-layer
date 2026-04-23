"use client";

import { useState } from "react";

export function ClaimForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !phone) {
      setError("provide email or phone");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/public/vendors/${slug}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email || undefined, phone: phone || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "claim failed");
      return;
    }
    setMessage(
      "We sent a claim invite. Open the link in that message (or paste the claim token at /vendor/claim) to finish.",
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        />
        <input
          type="tel"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        />
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {message && <div className="text-xs text-green-700">{message}</div>}
      <button
        type="submit"
        disabled={busy}
        className="bg-gray-900 text-white px-4 py-2 rounded text-sm disabled:opacity-40"
      >
        {busy ? "Sending…" : "Claim this listing"}
      </button>
    </form>
  );
}
