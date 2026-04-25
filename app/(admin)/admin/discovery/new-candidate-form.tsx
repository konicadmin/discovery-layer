"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Category = { id: string; code: string; label: string };

export function NewCandidateForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [vendorName, setVendorName] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [serviceCategoryId, setServiceCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/discovery/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vendorName: vendorName || undefined,
        homepageUrl: homepageUrl || undefined,
        searchTerm: searchTerm || undefined,
        serviceCategoryId: serviceCategoryId || undefined,
        notes: notes || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "create failed");
      return;
    }
    setVendorName("");
    setHomepageUrl("");
    setSearchTerm("");
    setNotes("");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white border rounded p-4 space-y-3 max-w-3xl"
    >
      <h2 className="text-sm font-semibold">Add candidate</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">
          <span className="text-gray-600">Vendor name</span>
          <input
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="e.g. Stripe"
            className="mt-1 w-full border rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-gray-600">Category</span>
          <select
            value={serviceCategoryId}
            onChange={(e) => setServiceCategoryId(e.target.value)}
            className="mt-1 w-full border rounded px-2 py-1 text-sm"
          >
            <option value="">— none —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-gray-600">Homepage URL</span>
          <input
            value={homepageUrl}
            onChange={(e) => setHomepageUrl(e.target.value)}
            placeholder="https://stripe.com"
            className="mt-1 w-full border rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-gray-600">Search term (optional)</span>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="cloud hosting pricing"
            className="mt-1 w-full border rounded px-2 py-1 text-sm"
          />
        </label>
      </div>
      <label className="text-xs block">
        <span className="text-gray-600">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="optional context"
          className="mt-1 w-full border rounded px-2 py-1 text-sm min-h-[50px]"
        />
      </label>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="text-xs px-3 py-1.5 bg-gray-950 text-white rounded disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add candidate"}
        </button>
      </div>
    </form>
  );
}
