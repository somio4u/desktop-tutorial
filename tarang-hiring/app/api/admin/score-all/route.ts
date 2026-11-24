import { NextResponse } from "next/server";
import { apiAdmin } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-admin";
import { scoreApplicant } from "@/lib/scoring";

export const maxDuration = 60;
const BATCH = 4; // processed one at a time; the browser calls again until none remain

export async function POST() {
  const a = await apiAdmin();
  if ("error" in a) return a.error;
  const db = serviceClient();
  const { data } = await db
    .from("applicants")
    .select("id")
    .is("ai_scored_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  let done = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const r = await scoreApplicant(row.id);
    r.ok ? done++ : failed++;
  }
  const { count } = await db.from("applicants").select("id", { count: "exact", head: true }).is("ai_scored_at", null);
  // If every item in this batch failed, stop the client loop rather than retrying forever.
  const remaining = failed === (data?.length ?? 0) && failed > 0 ? 0 : (count ?? 0);
  return NextResponse.json({ done, failed, remaining, unscoredLeft: count ?? 0 });
}
