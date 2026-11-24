import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { serviceClient } from "./supabase-admin";
import { sessionClient } from "./supabase-server";

export type AdminCheck =
  | { ok: true; email: string }
  | { ok: false; reason: "anonymous" | "not_admin"; email?: string };

/** Who is logged in, and are they in the admins table? */
export async function checkAdmin(): Promise<AdminCheck> {
  const supa = await sessionClient();
  const { data } = await supa.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return { ok: false, reason: "anonymous" };

  const db = serviceClient();
  const { data: row } = await db.from("admins").select("email").ilike("email", email).maybeSingle();
  if (row) return { ok: true, email };

  // Bootstrap: if no admin exists yet, the seed email becomes the first admin.
  const seed = process.env.ADMIN_SEED_EMAIL?.toLowerCase();
  if (seed && email === seed) {
    const { count } = await db.from("admins").select("email", { count: "exact", head: true });
    if (!count) {
      await db.from("admins").insert({ email });
      return { ok: true, email };
    }
  }
  return { ok: false, reason: "not_admin", email };
}

/** For admin pages: redirect to login if anonymous; returns the check result otherwise. */
export async function requireAdmin() {
  const r = await checkAdmin();
  if (!r.ok && r.reason === "anonymous") redirect("/admin/login");
  return r;
}

/** For admin API routes. Returns the email or a 401/403 response. */
export async function apiAdmin(): Promise<{ email: string } | { error: NextResponse }> {
  const r = await checkAdmin();
  if (r.ok) return { email: r.email };
  return {
    error: NextResponse.json({ error: r.reason === "anonymous" ? "Not signed in" : "Not authorised" }, { status: r.reason === "anonymous" ? 401 : 403 }),
  };
}
