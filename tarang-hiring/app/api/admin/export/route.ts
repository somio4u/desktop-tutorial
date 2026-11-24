import { NextResponse } from "next/server";
import { apiAdmin } from "@/lib/auth";
import { filtersFrom, queryApplicants } from "@/lib/applicants";
import { areaLabel } from "@/lib/constants";

// Spreadsheet formula-injection guard + CSV quoting
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const a = await apiAdmin();
  if ("error" in a) return a.error;
  const rows = await queryApplicants(filtersFrom(new URL(req.url).searchParams));
  const head = ["Name", "Phone", "Email", "Age", "Education", "Experience", "Areas", "Portfolio", "On-site", "Status", "AI score", "AI priority", "Best fit", "AI summary", "Strengths", "Concerns", "Applied at"];
  const lines = [head.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.full_name, r.phone, r.email, r.age, r.education, r.experience_level,
        r.areas.map(areaLabel).join("; "), r.portfolio_url, r.can_work_onsite ? "Yes" : "No", r.status,
        r.ai_score, r.ai_priority, r.ai_best_fit_area, r.ai_summary,
        (r.ai_strengths ?? []).join("; "), (r.ai_concerns ?? []).join("; "), r.created_at,
      ].map(cell).join(","),
    );
  }
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tarang-applicants-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
