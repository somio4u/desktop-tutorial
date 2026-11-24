// Pure server-side rules applied on top of the AI's answer (no I/O, easy to test).

export const CAPS = {
  production_knowledge: 30,
  projects: 25,
  pipeline_coverage: 15,
  education: 10,
  portfolio: 10,
  cv_clarity: 10,
} as const;
export type BreakdownKey = keyof typeof CAPS;
export type Breakdown = Record<BreakdownKey, number>;
export type Priority = "high" | "medium" | "low";

export interface RawAiScore {
  score?: unknown;
  priority?: unknown;
  summary?: unknown;
  strengths?: unknown;
  concerns?: unknown;
  best_fit_area?: unknown;
  breakdown?: Partial<Record<BreakdownKey, unknown>>;
}

export interface FinalScore {
  score: number;
  priority: Priority;
  summary: string;
  strengths: string[];
  concerns: string[];
  best_fit_area: string;
  breakdown: Breakdown;
}

export const priorityFor = (score: number): Priority => (score >= 70 ? "high" : score >= 45 ? "medium" : "low");

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const list = (v: unknown) =>
  (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 4);

export const NO_ONSITE_CONCERN = "Cannot work on-site in Bhubaneswar";
export const NO_CV_CONCERN = "No CV uploaded – limited information";

export function finalizeScore(
  raw: RawAiScore,
  ctx: { canWorkOnsite: boolean; hasCvText: boolean; hasPortfolio: boolean },
): FinalScore {
  const breakdown = {} as Breakdown;
  for (const k of Object.keys(CAPS) as BreakdownKey[]) {
    breakdown[k] = Math.round(Math.min(CAPS[k], Math.max(0, num(raw.breakdown?.[k]))));
  }
  // Facts we know for certain override the model.
  if (!ctx.hasPortfolio) breakdown.portfolio = 0;
  if (!ctx.hasCvText) breakdown.cv_clarity = 0;

  // The breakdown is the source of truth for the total.
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  let priority = priorityFor(score);
  const concerns = list(raw.concerns);
  if (!ctx.canWorkOnsite) {
    priority = "low";
    if (!concerns.includes(NO_ONSITE_CONCERN)) concerns.unshift(NO_ONSITE_CONCERN);
  }
  if (!ctx.hasCvText && !concerns.includes(NO_CV_CONCERN)) concerns.push(NO_CV_CONCERN);

  return {
    score,
    priority,
    summary: String(raw.summary ?? "").trim().slice(0, 1200),
    strengths: list(raw.strengths),
    concerns: concerns.slice(0, 5),
    best_fit_area: String(raw.best_fit_area ?? "").trim().slice(0, 60),
    breakdown,
  };
}
