"use client";

import { useState } from "react";

export default function ClaimAcceptPage() {
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/vendor-claims/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        claimToken: token.trim(),
        user: { name: name.trim(), email: email || undefined, phone: phone || undefined },
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "claim failed");
      return;
    }
    setResult(`Claim accepted. User id: ${json.userId}`);
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-semibold">Claim your vendor profile</h1>
      <p className="text-xs text-gray-500 mt-1">
        Paste the claim token from your invite email.
      </p>
      <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
        <Input label="Claim token" value={token} onChange={setToken} required />
        <Input label="Your name" value={name} onChange={setName} required />
        <Input label="Email" value={email} onChange={setEmail} type="email" />
        <Input label="Phone" value={phone} onChange={setPhone} />
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-gray-900 text-white py-2 rounded text-sm disabled:opacity-40"
        >
          {busy ? "Accepting…" : "Accept claim"}
        </button>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {result && <div className="text-sm text-green-700">{result}</div>}
      </form>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        required={required}
        className="w-full border rounded px-3 py-2 text-sm"
      />
    </label>
  );
}
