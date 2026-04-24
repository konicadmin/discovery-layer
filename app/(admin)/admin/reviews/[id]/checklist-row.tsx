"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChecklistItemStatus } from "@/generated/prisma";

const STATUSES: ChecklistItemStatus[] = [
  ChecklistItemStatus.pending,
  ChecklistItemStatus.pass,
  ChecklistItemStatus.fail,
  ChecklistItemStatus.not_applicable,
];

export function ChecklistRow(props: {
  reviewId: string;
  checklistItemId: string;
  label: string;
  required: boolean;
  status: ChecklistItemStatus;
  notes: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(props.status);
  const [notes, setNotes] = useState(props.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextStatus: ChecklistItemStatus, nextNotes: string) {
    setSaving(true);
    setError(null);
    const res = await fetch(
      `/api/admin/reviews/${props.reviewId}/checklist-items/${props.checklistItemId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          notes: nextNotes || undefined,
          // Real auth replaces this; for now the panel takes ownership.
          actorUserId: "ops-console",
        }),
      },
    );
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.error === "string" ? json.error : "save failed");
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-3 py-2 text-sm">{props.label}</td>
      <td className="px-3 py-2 text-xs">{props.required ? "yes" : "no"}</td>
      <td className="px-3 py-2">
        <select
          value={status}
          disabled={props.disabled || saving}
          onChange={(e) => {
            const next = e.target.value as ChecklistItemStatus;
            setStatus(next);
            void save(next, notes);
          }}
          className="text-xs border rounded px-2 py-1 bg-white"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          defaultValue={notes}
          disabled={props.disabled || saving}
          onBlur={(e) => {
            if (e.target.value !== notes) {
              setNotes(e.target.value);
              void save(status, e.target.value);
            }
          }}
          placeholder="reviewer notes…"
          className="w-full text-xs border rounded px-2 py-1"
        />
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </td>
    </tr>
  );
}
