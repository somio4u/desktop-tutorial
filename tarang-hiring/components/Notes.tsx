"use client";

import { useState } from "react";

type Note = { id: string; author_email: string; note: string; created_at: string };

const fmt = (s: string) =>
  new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function Notes({ applicantId, initial }: { applicantId: string; initial: Note[] }) {
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicant_id: applicantId, note: text }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.error ?? "Could not save note");
    setNotes((n) => [d.note, ...n]);
    setText("");
  }

  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="Add a note (e.g. called on Monday, good energy)…" className="input" />
      <div className="mt-2 flex items-center gap-3">
        <button onClick={add} disabled={busy || !text.trim()} className="btn !py-2">{busy ? "Saving…" : "Add note"}</button>
        {err && <span className="text-sm text-tred">{err}</span>}
      </div>
      <ul className="mt-4 space-y-3">
        {notes.length === 0 && <li className="text-sm text-muted">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg bg-gray-50 p-3">
            <p className="whitespace-pre-wrap text-[15px]">{n.note}</p>
            <p className="mt-1 text-xs text-muted">{n.author_email} · {fmt(n.created_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
