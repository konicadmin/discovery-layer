"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; label: string };

export function RequirementForm(props: {
  buyers: Option[];
  cities: Option[];
  categories: Option[];
  users: Option[];
}) {
  const router = useRouter();
  const [buyerOrganizationId, setBuyer] = useState(props.buyers[0]?.id ?? "");
  const [cityId, setCity] = useState(props.cities[0]?.id ?? "");
  const [serviceCategoryId, setCategory] = useState(props.categories[0]?.id ?? "");
  const [createdByUserId, setUser] = useState(props.users[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [siteType, setSiteType] = useState("office");
  const [headcount, setHeadcount] = useState("20");
  const [shift, setShift] = useState("24x7");
  const [term, setTerm] = useState("12");
  const [startDate, setStartDate] = useState("");
  const [relief, setRelief] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/buyer/requirements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        buyerOrganizationId,
        title,
        serviceCategoryId,
        cityId,
        siteType,
        headcountRequired: Number(headcount) || undefined,
        shiftPattern: shift,
        reliefRequired: relief,
        contractTermMonths: Number(term) || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        createdByUserId,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(JSON.stringify(json.error));
      return;
    }
    router.push(`/buyer/requirements/${json.id}`);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="bg-white border rounded p-4 space-y-3">
      <Row label="Buyer organization">
        <Select value={buyerOrganizationId} onChange={setBuyer} options={props.buyers} />
      </Row>
      <Row label="Title">
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="20 guards Whitefield warehouse"
        />
      </Row>
      <div className="grid grid-cols-3 gap-3">
        <Row label="Category">
          <Select value={serviceCategoryId} onChange={setCategory} options={props.categories} />
        </Row>
        <Row label="City">
          <Select value={cityId} onChange={setCity} options={props.cities} />
        </Row>
        <Row label="Site type">
          <Select
            value={siteType}
            onChange={setSiteType}
            options={[
              { id: "office", label: "Office" },
              { id: "warehouse", label: "Warehouse" },
              { id: "industrial", label: "Industrial" },
              { id: "residential", label: "Residential" },
              { id: "retail", label: "Retail" },
            ]}
          />
        </Row>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Row label="Headcount">
          <input
            type="number"
            className="w-full border rounded px-3 py-2 text-sm"
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
          />
        </Row>
        <Row label="Shift">
          <Select
            value={shift}
            onChange={setShift}
            options={[
              { id: "8h", label: "8h (day only)" },
              { id: "12h", label: "12h" },
              { id: "24x7", label: "24x7" },
            ]}
          />
        </Row>
        <Row label="Term (months)">
          <input
            type="number"
            className="w-full border rounded px-3 py-2 text-sm"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </Row>
        <Row label="Start date">
          <input
            type="date"
            className="w-full border rounded px-3 py-2 text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Row>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={relief}
          onChange={(e) => setRelief(e.target.checked)}
        />
        Relief staffing required
      </label>
      <Row label="Created by (user)">
        <Select value={createdByUserId} onChange={setUser} options={props.users} />
      </Row>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button
        type="submit"
        disabled={submitting}
        className="bg-gray-900 text-white px-4 py-2 rounded text-sm disabled:opacity-40"
      >
        {submitting ? "Saving…" : "Create draft requirement"}
      </button>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border rounded px-3 py-2 text-sm bg-white"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
