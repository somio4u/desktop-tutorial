"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RescoreButton({ id, label = "Re-score" }: { id: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/admin/score/${id}`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMsg(d.error ? `Failed: ${d.error}` : "Scoring failed");
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button onClick={go} disabled={busy} className="btn-ghost">{busy ? "Scoring…" : label}</button>
      {msg && <span className="max-w-xs text-xs text-tred">{msg}</span>}
    </span>
  );
}

export function ScoreAllButton({ unscored }: { unscored: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (let i = 0; i < 200; i++) {
      setMsg(`Scoring… ${done} done`);
      const res = await fetch("/api/admin/score-all", { method: "POST" });
      if (!res.ok) { setMsg("Could not score (are you signed in?)"); break; }
      const d = await res.json();
      done += d.done;
      failed += d.failed;
      if (!d.remaining) break;
    }
    setBusy(false);
    setMsg(`Scored ${done}${failed ? `, ${failed} failed – use Re-score` : ""}`);
    router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={go} disabled={busy || unscored === 0} className="btn-ghost">
        {busy ? "Scoring…" : `Score all unscored${unscored ? ` (${unscored})` : ""}`}
      </button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </span>
  );
}
