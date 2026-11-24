import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeScore, priorityFor } from "./scoring-rules";
import { normalizePhone, applicationSchema } from "./validation";

const bd = { production_knowledge: 28, projects: 22, pipeline_coverage: 12, education: 8, portfolio: 10, cv_clarity: 9 };
const ctx = { canWorkOnsite: true, hasCvText: true, hasPortfolio: true };

test("bands", () => {
  assert.equal(priorityFor(70), "high");
  assert.equal(priorityFor(69), "medium");
  assert.equal(priorityFor(45), "medium");
  assert.equal(priorityFor(44), "low");
});

test("total is recomputed from the breakdown, not trusted from the AI", () => {
  const r = finalizeScore({ score: 99, breakdown: bd }, ctx);
  assert.equal(r.score, 89);
  assert.equal(r.priority, "high");
});

test("cannot work on-site => always low with concern", () => {
  const r = finalizeScore({ score: 95, breakdown: bd, concerns: ["x"] }, { ...ctx, canWorkOnsite: false });
  assert.equal(r.priority, "low");
  assert.equal(r.concerns[0], "Cannot work on-site in Bhubaneswar");
});

test("no CV adds concern and zeroes cv_clarity; no portfolio zeroes portfolio", () => {
  const r = finalizeScore({ breakdown: bd }, { canWorkOnsite: true, hasCvText: false, hasPortfolio: false });
  assert.equal(r.breakdown.cv_clarity, 0);
  assert.equal(r.breakdown.portfolio, 0);
  assert.ok(r.concerns.includes("No CV uploaded – limited information"));
});

test("values are clamped to caps", () => {
  const r = finalizeScore({ breakdown: { production_knowledge: 80, projects: -5 } }, ctx);
  assert.equal(r.breakdown.production_knowledge, 30);
  assert.equal(r.breakdown.projects, 0);
});

test("phone normalisation", () => {
  assert.equal(normalizePhone("98765 43210"), "+919876543210");
  assert.equal(normalizePhone("+91 98765-43210"), "+919876543210");
  assert.equal(normalizePhone("09876543210"), "+919876543210");
  assert.equal(normalizePhone("1234567890"), null);
  assert.equal(normalizePhone("98765"), null);
});

test("application schema", () => {
  const ok = applicationSchema.safeParse({
    full_name: "Asha Das", age: "22", phone: "9876543210", email: "", education: "BA, Utkal",
    experience_level: "fresher", areas: ["post_production"], portfolio_url: "", can_work_onsite: "yes", consent: "true",
  });
  assert.ok(ok.success);
  const bad = applicationSchema.safeParse({ full_name: "A", age: "10", phone: "1", portfolio_url: "http://x.com", areas: [], consent: "false" });
  assert.ok(!bad.success);
});
