import "server-only";
import { serviceClient } from "./supabase-admin";
import { STATUSES } from "./constants";

export type Applicant = {
  id: string;
  created_at: string;
  full_name: string;
  age: number;
  phone: string;
  email: string | null;
  education: string;
  experience_level: "fresher" | "experienced";
  areas: string[];
  portfolio_url: string | null;
  cv_path: string | null;
  cv_text: string | null;
  selfie_path: string | null;
  can_work_onsite: boolean;
  consent_at: string;
  status: (typeof STATUSES)[number];
  ai_score: number | null;
  ai_priority: "high" | "medium" | "low" | null;
  ai_summary: string | null;
  ai_strengths: string[] | null;
  ai_concerns: string[] | null;
  ai_best_fit_area: string | null;
  ai_breakdown: Record<string, number> | null;
  ai_scored_at: string | null;
  ai_error: string | null;
};

export type Filters = {
  priority?: string;
  status?: string;
  exp?: string;
  area?: string;
  onsite?: string;
  from?: string;
  to?: string;
  q?: string;
};

export const FILTER_KEYS: (keyof Filters)[] = ["priority", "status", "exp", "area", "onsite", "from", "to", "q"];

export function filtersFrom(sp: Record<string, string | string[] | undefined> | URLSearchParams): Filters {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  const f: Filters = {};
  for (const k of FILTER_KEYS) f[k] = get(k);
  return f;
}

export function filtersToQuery(f: Filters) {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) p.set(k, f[k]!);
  return p.toString();
}

/** Applicants in list order: score high→low, unscored last, newest first as tie-break. */
export async function queryApplicants(f: Filters, columns = "*"): Promise<Applicant[]> {
  const db = serviceClient();
  let q = db.from("applicants").select(columns);
  if (f.priority === "unscored") q = q.is("ai_score", null);
  else if (f.priority) q = q.eq("ai_priority", f.priority);
  if (f.status) q = q.eq("status", f.status);
  if (f.exp) q = q.eq("experience_level", f.exp);
  if (f.area) q = q.contains("areas", [f.area]);
  if (f.onsite === "yes") q = q.eq("can_work_onsite", true);
  if (f.onsite === "no") q = q.eq("can_work_onsite", false);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+05:30`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59+05:30`);
  if (f.q) {
    const s = f.q.replace(/[%,()*\\]/g, " ").trim();
    if (s) q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,education.ilike.%${s}%`);
  }
  const { data, error } = await q
    .order("ai_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Applicant[];
}

/** Signed URL (10 min) for a private file. */
export async function signedUrl(bucket: "cvs" | "selfies", path: string | null, download?: string | boolean) {
  if (!path) return null;
  const { data } = await serviceClient().storage.from(bucket).createSignedUrl(path, 600, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

export async function signedUrls(bucket: "cvs" | "selfies", paths: string[]) {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data } = await serviceClient().storage.from(bucket).createSignedUrls(paths, 600);
  data?.forEach((d) => d.path && d.signedUrl && map.set(d.path, d.signedUrl));
  return map;
}
