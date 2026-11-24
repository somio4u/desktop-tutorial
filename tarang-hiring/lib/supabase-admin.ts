import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client. SERVER ONLY — bypasses RLS. */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
