export const AREAS = [
  { value: "pre_production", label: "Pre-production" },
  { value: "production", label: "Production (on set)" },
  { value: "post_production", label: "Post-production" },
  { value: "promotion", label: "Promotion" },
] as const;

export type AreaValue = (typeof AREAS)[number]["value"];
export const AREA_VALUES = AREAS.map((a) => a.value) as [AreaValue, ...AreaValue[]];
export const areaLabel = (v: string) => AREAS.find((a) => a.value === v)?.label ?? v;

export const STATUSES = ["new", "shortlisted", "interview", "selected", "rejected", "on_hold"] as const;
export type Status = (typeof STATUSES)[number];
export const statusLabel = (s: string) =>
  s === "on_hold" ? "On hold" : s.charAt(0).toUpperCase() + s.slice(1);

export const MAX_SELFIE_BYTES = 5 * 1024 * 1024; // before in-browser compression
// Vercel functions accept request bodies up to 4.5 MB, so the CV is capped at 4 MB
// (the selfie is compressed to well under 1 MB in the browser before upload).
export const MAX_CV_BYTES = 4 * 1024 * 1024;
export const CV_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const SELFIE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
