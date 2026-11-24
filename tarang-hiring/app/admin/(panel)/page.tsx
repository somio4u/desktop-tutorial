import Link from "next/link";
import { serviceClient } from "@/lib/supabase-admin";
import { filtersFrom, filtersToQuery, queryApplicants, signedUrls, type Applicant } from "@/lib/applicants";
import { AREAS, STATUSES, areaLabel, statusLabel } from "@/lib/constants";
import { PriorityBadge } from "@/components/Badges";
import StatusSelect from "@/components/StatusSelect";
import { ScoreAllButton } from "@/components/ScoreButtons";

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

async function stats() {
  const db = serviceClient();
  const head = () => db.from("applicants").select("id", { count: "exact", head: true });
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [total, week, high, short, sel, unscored] = await Promise.all([
    head(),
    head().gte("created_at", weekAgo),
    head().eq("ai_priority", "high"),
    head().eq("status", "shortlisted"),
    head().eq("status", "selected"),
    head().is("ai_scored_at", null),
  ]);
  return {
    total: total.count ?? 0, week: week.count ?? 0, high: high.count ?? 0,
    short: short.count ?? 0, sel: sel.count ?? 0, unscored: unscored.count ?? 0,
  };
}

function Selfie({ url, name }: { url?: string; name: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} className="h-10 w-10 shrink-0 rounded-full border object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tblue/10 font-semibold text-tblue">{name.charAt(0).toUpperCase()}</span>
  );
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = filtersFrom(sp);
  const qs = filtersToQuery(filters);
  const [rows, s] = await Promise.all([queryApplicants(filters), stats()]);
  const thumbs = await signedUrls("selfies", rows.map((r) => r.selfie_path).filter(Boolean) as string[]);
  const href = (r: Applicant) => `/admin/applicants/${r.id}${qs ? `?${qs}` : ""}`;

  const cards = [
    ["Total applicants", s.total],
    ["New this week", s.week],
    ["High priority", s.high],
    ["Shortlisted", s.short],
    ["Selected", s.sel],
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([l, n]) => (
          <div key={l as string} className="card !p-4">
            <p className="text-sm text-muted">{l}</p>
            <p className="font-heading text-3xl font-bold text-tblue">{n}</p>
          </div>
        ))}
      </div>

      <form className="card grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8" method="GET">
        <input name="q" defaultValue={filters.q} placeholder="Search name, phone, education" className="input col-span-2 !py-2 text-sm md:col-span-4 lg:col-span-2" />
        <select name="priority" defaultValue={filters.priority ?? ""} className="input !py-2 text-sm">
          <option value="">Any priority</option>
          <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          <option value="unscored">Not scored</option>
        </select>
        <select name="status" defaultValue={filters.status ?? ""} className="input !py-2 text-sm">
          <option value="">Any status</option>
          {STATUSES.map((x) => <option key={x} value={x}>{statusLabel(x)}</option>)}
        </select>
        <select name="exp" defaultValue={filters.exp ?? ""} className="input !py-2 text-sm">
          <option value="">Any experience</option><option value="fresher">Fresher</option><option value="experienced">Experienced</option>
        </select>
        <select name="area" defaultValue={filters.area ?? ""} className="input !py-2 text-sm">
          <option value="">Any area</option>
          {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <select name="onsite" defaultValue={filters.onsite ?? ""} className="input !py-2 text-sm">
          <option value="">On-site: any</option><option value="yes">On-site: yes</option><option value="no">On-site: no</option>
        </select>
        <label className="text-xs text-muted">From <input type="date" name="from" defaultValue={filters.from} className="input !py-1.5 text-sm" /></label>
        <label className="text-xs text-muted">To <input type="date" name="to" defaultValue={filters.to} className="input !py-1.5 text-sm" /></label>
        <div className="col-span-2 flex items-end gap-2 md:col-span-2">
          <button className="btn !py-2 text-sm">Apply filters</button>
          <Link href="/admin" className="btn-ghost">Clear</Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{rows.length} applicant{rows.length === 1 ? "" : "s"} · sorted by AI score</p>
        <div className="flex flex-wrap items-center gap-2">
          <ScoreAllButton unscored={s.unscored} />
          <a href={`/api/admin/export${qs ? `?${qs}` : ""}`} className="btn-ghost">Export CSV</a>
        </div>
      </div>

      {rows.length === 0 && <div className="card text-center text-muted">No applicants match.</div>}

      {/* Desktop table */}
      {rows.length > 0 && (
        <div className="card hidden overflow-x-auto !p-0 md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                {["", "Name", "Priority", "Score", "Experience", "Areas", "On-site", "Applied", "Status"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2"><Selfie url={r.selfie_path ? thumbs.get(r.selfie_path) : undefined} name={r.full_name} /></td>
                  <td className="px-3 py-2">
                    <Link href={href(r)} className="font-medium text-tblue hover:underline">{r.full_name}</Link>
                    <div className="text-xs text-muted">{r.phone}</div>
                  </td>
                  <td className="px-3 py-2"><PriorityBadge priority={r.ai_priority} error={r.ai_error} /></td>
                  <td className="px-3 py-2 font-semibold">{r.ai_score ?? "–"}</td>
                  <td className="px-3 py-2 capitalize">{r.experience_level}</td>
                  <td className="max-w-[14rem] px-3 py-2 text-xs text-muted">{r.areas.map(areaLabel).join(", ")}</td>
                  <td className="px-3 py-2">{r.can_work_onsite ? <span className="text-green-700">✓</span> : <span className="text-tred">✗</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{fmtDate(r.created_at)}</td>
                  <td className="px-3 py-2"><StatusSelect id={r.id} value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="card !p-3">
            <div className="flex items-start gap-3">
              <Selfie url={r.selfie_path ? thumbs.get(r.selfie_path) : undefined} name={r.full_name} />
              <div className="min-w-0 flex-1">
                <Link href={href(r)} className="block truncate font-medium text-tblue">{r.full_name}</Link>
                <p className="text-xs text-muted">{r.phone} · {fmtDate(r.created_at)}</p>
              </div>
              <div className="text-right">
                <PriorityBadge priority={r.ai_priority} error={r.ai_error} />
                <p className="mt-1 text-sm font-semibold">{r.ai_score ?? "–"}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">
              <span className="capitalize">{r.experience_level}</span> · {r.areas.map(areaLabel).join(", ")} · On-site {r.can_work_onsite ? "✓" : "✗"}
            </p>
            <div className="mt-2"><StatusSelect id={r.id} value={r.status} className="w-full" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
