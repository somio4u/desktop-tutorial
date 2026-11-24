"use client";

import { useState } from "react";
import { STATUSES, statusLabel } from "@/lib/constants";

export default function StatusSelect({ id, value, className = "" }: { id: string; value: string; className?: string }) {
  const [v, setV] = useState(value);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  async function change(next: string) {
    const prev = v;
    setV(next);
    setSaving(true);
    setErr(false);
    const res = await fetch(`/api/admin/applicants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setV(prev);
      setErr(true);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <select
        aria-label="Status"
        value={v}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className={`rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-tred focus:outline-none focus:ring-2 focus:ring-tred/30 ${className}`}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>{statusLabel(s)}</option>
        ))}
      </select>
      {err && <span className="text-xs text-tred">Could not save</span>}
    </span>
  );
}
