import { z } from "zod";
import { AREA_VALUES } from "./constants";

/** Indian mobile: 10 digits starting 6-9, optional +91 / 91 / 0 prefix. Returns +91XXXXXXXXXX or null. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/[\s\-().]/g, "");
  if (d.startsWith("+91")) d = d.slice(3);
  else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const applicationSchema = z.object({
  full_name: z.string().trim().min(2, "Please enter your full name (2–80 characters)").max(80, "Name is too long (max 80 characters)"),
  age: z.coerce
    .number({ invalid_type_error: "Please enter your age" })
    .int("Age must be a whole number")
    .min(16, "Age must be between 16 and 60")
    .max(60, "Age must be between 16 and 60"),
  phone: z
    .string()
    .trim()
    .min(1, "Please enter your phone number")
    .refine((v) => normalizePhone(v) !== null, "Enter a valid 10-digit Indian mobile number"),
  email: z.preprocess(emptyToUndef, z.string().trim().email("Enter a valid email address").max(120).optional()),
  education: z.string().trim().min(2, "Please enter your course and college").max(200, "Too long (max 200 characters)"),
  experience_level: z.enum(["fresher", "experienced"], { errorMap: () => ({ message: "Please choose one" }) }),
  areas: z.array(z.enum(AREA_VALUES)).min(1, "Choose at least one area"),
  portfolio_url: z.preprocess(
    emptyToUndef,
    z
      .string()
      .trim()
      .max(300)
      .regex(/^https:\/\/\S+\.\S+/i, "Link must start with https://")
      .optional(),
  ),
  can_work_onsite: z.enum(["yes", "no"], { errorMap: () => ({ message: "Please choose Yes or No" }) }),
  consent: z.literal("true", { errorMap: () => ({ message: "Please agree to continue" }) }),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

/** Flatten zod errors to { field: firstMessage } */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = String(issue.path[0] ?? "form");
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}
