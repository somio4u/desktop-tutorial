import Link from "next/link";
import { notFound } from "next/navigation";
import { serviceClient } from "@/lib/supabase-admin";
import { filtersFrom, filtersToQuery, queryApplicants, signedUrl, type Applicant } from "@/lib/applicants";
import { areaLabel } from "@/lib/constants";
import { PriorityBadge } from "@/components/Badges";
import StatusSelect from "@/components/StatusSelect";
import { RescoreButton } from "@/components/ScoreButtons";
import Notes from "@/components/Notes";

const BARS: [string, string, number][] = [
  ["production_knowledge", "Film production knowledge", 30],
  ["projects", "Hands-on projects", 25],
  ["pipeline_coverage", "Pipeline coverage", 15],
  ["education", "Education / training", 10],
  ["portfolio", "Portfolio / showreel", 10],
  ["cv_clarity", "CV clarity", 10],
];

const fmt = (s: string) =>
  new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-sm text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}

export default async function ApplicantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const filters = filtersFrom(await searchParams);
  const qs = filtersToQuery(filters);
  const db = serviceClient();

  const { data } = await db.from("applicants").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const a = data as Applicant;

  const [{ data: notes }, selfie, cvView, cvDownload, order] = await Promise.all([
    db.from("applicant_notes").select("*").eq("applicant_id", id).order("created_at", { ascending: false }),
    signedUrl("selfies", a.selfie_path),
    signedUrl("cvs", a.cv_path),
    signedUrl("cvs", a.cv_path, true),
    queryApplicants(filters, "id"),
  ]);
  const idx = order.findIndex((o) => o.id === id);
  const prev = idx > 0 ? order[idx - 1].id : null;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1].id : null;
  const nav = (x: string) => `/admin/applicants/${x}${qs ? `?${qs}` : ""}`;
  const isPdf = a.cv_path?.endsWith(".pdf");
  const digits = a.phone.replace("+", "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/admin${qs ? `?${qs}` : ""}`} className="text-sm text-tblue hover:underline">← All applicants</Link>
        <div className="flex gap-2">
          {prev ? <Link href={nav(prev)} className="btn-ghost">← Previous</Link> : <span className="btn-ghost pointer-events-none opacity-40">← Previous</span>}
          {next ? <Link href={nav(next)} className="btn-ghost">Next →</Link> : <span className="btn-ghost pointer-events-none opacity-40">Next →</span>}
        </div>
      </div>

      {/* Header */}
      <div className="card flex flex-wrap items-center gap-4">
        {selfie ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfie} alt={a.full_name} className="h-24 w-24 rounded-xl border object-cover" />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-xl bg-tblue/10 text-3xl font-bold text-tblue">{a.full_name.charAt(0)}</span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-tblue">{a.full_name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <PriorityBadge priority={a.ai_priority} error={a.ai_error} />
            <span className="text-lg font-semibold">{a.ai_score ?? "–"}<span className="text-sm font-normal text-muted"> / 100</span></span>
          </div>
        </div>
        <StatusSelect id={a.id} value={a.status} className="!py-2 text-base" />
      </div>

      {/* Contact */}
      <div className="flex flex-wrap gap-2">
        <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="btn !bg-green-600 hover:!bg-green-700">WhatsApp</a>
        <a href={`tel:${a.phone}`} className="btn-ghost !py-2.5">Call</a>
        {a.email && <a href={`mailto:${a.email}`} className="btn-ghost !py-2.5">Email</a>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* AI */}
        <section className="card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-tblue">AI assessment</h2>
              <p className="text-xs text-muted">AI suggestion – final decision is made by the Tarang Plus team.</p>
            </div>
            <RescoreButton id={a.id} />
          </div>
          {a.ai_error && <p className="rounded-lg bg-red-50 p-2 text-sm text-tred">Not scored – retry. ({a.ai_error})</p>}
          {a.ai_scored_at ? (
            <>
              <p>{a.ai_summary}</p>
              {a.ai_best_fit_area && <p className="text-sm"><span className="text-muted">Best fit:</span> <b>{a.ai_best_fit_area}</b></p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-green-700">Strengths</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-green-800">{(a.ai_strengths ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-tred">Concerns</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-red-800">{(a.ai_concerns ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              </div>
              {a.ai_breakdown && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Score breakdown</h3>
                  {BARS.map(([k, label, max]) => {
                    const v = a.ai_breakdown?.[k] ?? 0;
                    return (
                      <div key={k}>
                        <div className="flex justify-between text-xs"><span>{label}</span><span className="text-muted">{v} / {max}</span></div>
                        <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-tblue" style={{ width: `${(v / max) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted">Scored {fmt(a.ai_scored_at)}</p>
            </>
          ) : (
            !a.ai_error && <p className="text-sm text-muted">Not scored yet. Click Re-score to score now.</p>
          )}
        </section>

        {/* Details */}
        <section className="card">
          <h2 className="mb-1 text-lg font-semibold text-tblue">Details</h2>
          <dl className="divide-y">
            <Row k="Phone / WhatsApp" v={a.phone} />
            <Row k="Email" v={a.email ?? "–"} />
            <Row k="Age" v={a.age} />
            <Row k="Education" v={a.education} />
            <Row k="Experience" v={<span className="capitalize">{a.experience_level}</span>} />
            <Row k="Areas known" v={a.areas.map(areaLabel).join(", ")} />
            <Row k="Portfolio" v={a.portfolio_url ? <a href={a.portfolio_url} target="_blank" rel="noreferrer noopener" className="text-tred underline">{a.portfolio_url}</a> : "–"} />
            <Row k="Can work on-site" v={a.can_work_onsite ? "Yes" : <span className="text-tred">No</span>} />
            <Row k="Applied" v={fmt(a.created_at)} />
            <Row k="Consent given" v={fmt(a.consent_at)} />
          </dl>
        </section>
      </div>

      {/* CV */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-tblue">CV</h2>
          {cvDownload && <a href={cvDownload} className="btn-ghost">Download CV</a>}
        </div>
        {!a.cv_path && <p className="text-sm text-muted">No CV uploaded.</p>}
        {a.cv_path && isPdf && cvView && <iframe src={cvView} title="CV" className="h-[70vh] w-full rounded-lg border" />}
        {a.cv_path && !isPdf && <p className="text-sm text-muted">Preview is available for PDF only. Use Download to open this file.</p>}
        <p className="mt-2 text-xs text-muted">Links expire after 10 minutes. Refresh the page for a new link.</p>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold text-tblue">Notes</h2>
        <Notes applicantId={a.id} initial={notes ?? []} />
      </section>
    </div>
  );
}
