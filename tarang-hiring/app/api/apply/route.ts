import { NextResponse } from "next/server";
import { after } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { serviceClient } from "@/lib/supabase-admin";
import { applicationSchema, fieldErrors, normalizePhone } from "@/lib/validation";
import { CV_TYPES, SELFIE_TYPES, MAX_CV_BYTES, MAX_SELFIE_BYTES } from "@/lib/constants";
import { scoreApplicant } from "@/lib/scoring";

export const maxDuration = 60;

const RATE_LIMIT = 5; // submissions per IP per hour

function looksLike(buf: Buffer, ext: string) {
  if (ext === "pdf") return buf.subarray(0, 4).toString() === "%PDF";
  if (ext === "docx") return buf.subarray(0, 2).toString() === "PK";
  if (ext === "doc") return buf[0] === 0xd0 && buf[1] === 0xcf;
  if (ext === "png") return buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG";
  if (ext === "jpg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (ext === "webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  return false;
}

async function readFile(
  form: FormData,
  key: string,
  types: Record<string, string>,
  max: number,
  label: string,
): Promise<{ file?: { buf: Buffer; ext: string; type: string }; error?: string }> {
  const f = form.get(key);
  if (!(f instanceof File) || f.size === 0) return {};
  // Some phones/browsers send an empty or generic MIME type: fall back to the file extension.
  const byExt = Object.entries(types).find(([, e]) => f.name.toLowerCase().endsWith("." + e) || (e === "jpg" && f.name.toLowerCase().endsWith(".jpeg")));
  const mime = types[f.type] ? f.type : byExt?.[0] ?? f.type;
  const ext = types[mime];
  if (!ext) return { error: `${label}: unsupported file type` };
  if (f.size > max) return { error: `${label}: file is too large (max ${Math.round(max / 1024 / 1024)} MB)` };
  const buf = Buffer.from(await f.arrayBuffer());
  if (!looksLike(buf, ext)) return { error: `${label}: file looks damaged or is not a real ${ext.toUpperCase()}` };
  return { file: { buf, ext, type: mime } };
}

export async function POST(req: Request) {
  const form = await req.formData();

  // Honeypot: bots fill the hidden field. Pretend it worked.
  if (String(form.get("website") ?? "").trim() !== "") return NextResponse.json({ ok: true, updated: false });

  const db = serviceClient();

  // Validate
  const parsed = applicationSchema.safeParse({
    full_name: form.get("full_name") ?? "",
    age: form.get("age") ?? "",
    phone: form.get("phone") ?? "",
    email: form.get("email") ?? "",
    education: form.get("education") ?? "",
    experience_level: form.get("experience_level") ?? "",
    areas: form.getAll("areas").map(String),
    portfolio_url: form.get("portfolio_url") ?? "",
    can_work_onsite: form.get("can_work_onsite") ?? "",
    consent: form.get("consent") ?? "",
  });
  const errors: Record<string, string> = parsed.success ? {} : fieldErrors(parsed.error);
  const cv = await readFile(form, "cv", CV_TYPES, MAX_CV_BYTES, "CV");
  const selfie = await readFile(form, "selfie", SELFIE_TYPES, MAX_SELFIE_BYTES, "Selfie");
  if (cv.error) errors.cv = cv.error;
  if (selfie.error) errors.selfie = selfie.error;
  if (!parsed.success || Object.keys(errors).length) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }
  const v = parsed.data;
  const phone = normalizePhone(v.phone)!;

  // Rate limit: 5 per IP per hour (hash only; raw IPs are not stored)
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
  const ipHash = createHash("sha256").update(`${ip}|${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-12) ?? ""}`).digest("hex");
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from("apply_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT) {
    return NextResponse.json(
      { ok: false, errors: { form: "Too many submissions from your network. Please try again in an hour." } },
      { status: 429 },
    );
  }
  await db.from("apply_attempts").insert({ ip_hash: ipHash });
  // opportunistic cleanup of old rows
  await db.from("apply_attempts").delete().lt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());

  // Duplicate check by phone
  const { data: existing } = await db
    .from("applicants")
    .select("id, cv_path, selfie_path")
    .eq("phone", phone)
    .maybeSingle();
  const id = existing?.id ?? randomUUID();

  // Upload files to private buckets
  let cvPath: string | undefined;
  let selfiePath: string | undefined;
  try {
    if (cv.file) {
      cvPath = `${id}/cv-${Date.now()}.${cv.file.ext}`;
      const { error } = await db.storage.from("cvs").upload(cvPath, cv.file.buf, { contentType: cv.file.type });
      if (error) throw error;
    }
    if (selfie.file) {
      selfiePath = `${id}/selfie-${Date.now()}.${selfie.file.ext}`;
      const { error } = await db.storage.from("selfies").upload(selfiePath, selfie.file.buf, { contentType: selfie.file.type });
      if (error) throw error;
    }
  } catch (e) {
    console.error("Upload failed", e);
    return NextResponse.json({ ok: false, errors: { form: "Could not upload your files. Please try again." } }, { status: 500 });
  }

  const fields = {
    full_name: v.full_name,
    age: v.age,
    phone,
    email: v.email ?? null,
    education: v.education,
    experience_level: v.experience_level,
    areas: v.areas,
    portfolio_url: v.portfolio_url ?? null,
    can_work_onsite: v.can_work_onsite === "yes",
    consent_at: new Date().toISOString(),
    // new AI result will replace the old one
    ai_error: null,
    ...(cvPath ? { cv_path: cvPath, cv_text: null } : {}),
    ...(selfiePath ? { selfie_path: selfiePath } : {}),
  };

  const { error } = existing
    ? await db.from("applicants").update(fields).eq("id", id)
    : await db.from("applicants").insert({ id, ...fields });
  if (error) {
    console.error("Save failed", error);
    return NextResponse.json({ ok: false, errors: { form: "Something went wrong. Please try again." } }, { status: 500 });
  }

  // Remove replaced files
  if (existing) {
    if (cvPath && existing.cv_path) await db.storage.from("cvs").remove([existing.cv_path]);
    if (selfiePath && existing.selfie_path) await db.storage.from("selfies").remove([existing.selfie_path]);
  }

  // Score in the background so the applicant isn't kept waiting
  if (process.env.ANTHROPIC_API_KEY) after(() => scoreApplicant(id));

  return NextResponse.json({ ok: true, updated: !!existing });
}
