"use client";

import { useState } from "react";
import Image from "next/image";
import { browserClient } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await browserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await browserClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) {
      setBusy(false);
      return setErr("That code is not valid or has expired.");
    }
    window.location.href = "/admin";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-tbg px-4">
      <div className="card w-full max-w-sm border-t-[10px] border-t-tred">
        <Image src="/brand/tarang-plus-logo.png" alt="Tarang Plus" width={120} height={72} className="mx-auto mb-3 h-auto w-28" />
        <h1 className="mb-1 text-center text-xl font-bold text-tblue">Admin login</h1>
        {!sent ? (
          <form onSubmit={send} className="mt-4 space-y-3">
            <label className="label" htmlFor="email">Your work email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
            <button className="btn w-full" disabled={busy}>{busy ? "Sending…" : "Email me a login code"}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-4 space-y-3">
            <p className="text-sm text-muted">We emailed a login link and code to <b>{email}</b>. Click the link, or type the code here.</p>
            <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from email" className="input tracking-widest" />
            <button className="btn w-full" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
            <button type="button" className="w-full text-sm text-tred underline" onClick={() => { setSent(false); setCode(""); }}>Use a different email</button>
          </form>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <p className="mt-4 text-center text-xs text-muted">Only authorised Tarang Plus team members can sign in.</p>
      </div>
    </div>
  );
}
