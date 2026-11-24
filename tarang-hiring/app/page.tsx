import PublicShell from "@/components/PublicShell";
import ApplyForm from "@/components/ApplyForm";

export default function Home() {
  return (
    <PublicShell>
      <div className="card mb-3 border-t-[10px] border-t-tred">
        <span className="inline-block rounded-full bg-tyellow px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-tblue">We are hiring</span>
        <h1 className="mt-2 text-2xl font-bold text-tblue">Production Intern – Web Series</h1>
        <dl className="mt-3 space-y-1.5 text-[15px]">
          <div><dt className="inline font-medium">Work: </dt><dd className="inline text-muted">pre-production, production and post-production of a web series, plus promotion</dd></div>
          <div><dt className="inline font-medium">Duration: </dt><dd className="inline text-muted">2–3 months, depending on learning pace. Interns found fit are offered an appointment.</dd></div>
          <div><dt className="inline font-medium">Location: </dt><dd className="inline text-muted">On-site / on set, Bhubaneswar, Odisha</dd></div>
          <div><dt className="inline font-medium">Who can apply: </dt><dd className="inline text-muted">Freshers welcome, but film production knowledge is a must</dd></div>
        </dl>
        <p className="mt-3 text-sm text-muted">Takes about 1 minute. Fields marked <span className="text-tred">*</span> are required.</p>
      </div>
      <ApplyForm />
    </PublicShell>
  );
}
