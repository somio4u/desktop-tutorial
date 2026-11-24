"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AREAS, MAX_CV_BYTES, MAX_SELFIE_BYTES } from "@/lib/constants";
import { applicationSchema, fieldErrors } from "@/lib/validation";

type Errors = Record<string, string>;
const CV_EXT = /\.(pdf|docx?)$/i;

async function compressImage(file: File, maxSide = 1200): Promise<File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], "selfie.jpg", { type: "image/jpeg" });
  } catch {
    return file; // fall back to the original
  }
}

function Field({ label, required, hint, error, children, id }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="card" id={id}>
      <label className="label">
        {label} {required && <span className="text-tred">*</span>}
      </label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

export default function ApplyForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const selfieRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const clear = (k: string) => errors[k] && setErrors((e) => ({ ...e, [k]: "" }));

  function onSelfieChange(e: React.ChangeEvent<HTMLInputElement>) {
    clear("selfie");
    const f = e.target.files?.[0];
    setSelfiePreview(f ? URL.createObjectURL(f) : null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const errs: Errors = {};

    const parsed = applicationSchema.safeParse({
      full_name: fd.get("full_name") ?? "",
      age: fd.get("age") ?? "",
      phone: fd.get("phone") ?? "",
      email: fd.get("email") ?? "",
      education: fd.get("education") ?? "",
      experience_level: fd.get("experience_level") ?? "",
      areas: fd.getAll("areas").map(String),
      portfolio_url: fd.get("portfolio_url") ?? "",
      can_work_onsite: fd.get("can_work_onsite") ?? "",
      consent: fd.get("consent") ?? "",
    });
    if (!parsed.success) Object.assign(errs, fieldErrors(parsed.error));

    const cv = fd.get("cv");
    if (cv instanceof File && cv.size > 0) {
      if (!CV_EXT.test(cv.name)) errs.cv = "CV must be a PDF, DOC or DOCX file";
      else if (cv.size > MAX_CV_BYTES) errs.cv = `CV is too large (max ${MAX_CV_BYTES / 1024 / 1024} MB)`;
    }
    let selfie = fd.get("selfie");
    if (selfie instanceof File && selfie.size > 0) {
      if (!/^image\/(jpeg|png|webp)$/.test(selfie.type)) errs.selfie = "Selfie must be a JPG, PNG or WEBP image";
      else if (selfie.size > MAX_SELFIE_BYTES) errs.selfie = "Selfie is too large (max 5 MB)";
    }

    if (Object.keys(errs).length) {
      setErrors(errs);
      const first = form.querySelector<HTMLElement>(`[data-field="${Object.keys(errs)[0]}"]`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      if (selfie instanceof File && selfie.size > 0) {
        selfie = await compressImage(selfie);
        fd.set("selfie", selfie);
      } else fd.delete("selfie");
      if (!(cv instanceof File && cv.size > 0)) fd.delete("cv");
      fd.set("consent", "true");

      const res = await fetch("/api/apply", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.push(`/thank-you${data.updated ? "?updated=1" : ""}`);
        return;
      }
      setErrors(data.errors ?? { form: "Something went wrong. Please try again." });
    } catch {
      setErrors({ form: "Network problem. Please check your connection and try again." });
    }
    setSubmitting(false);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-3">
      {/* Honeypot: hidden from people, bots fill it */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website <input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <Field label="Full name" required error={errors.full_name}>
        <input data-field="full_name" name="full_name" className="input" autoComplete="name" maxLength={80} onChange={() => clear("full_name")} />
      </Field>

      <Field label="Age" required error={errors.age}>
        <input data-field="age" name="age" type="number" inputMode="numeric" min={16} max={60} className="input" onChange={() => clear("age")} />
      </Field>

      <Field label="Phone / WhatsApp number" required error={errors.phone} hint="10-digit Indian mobile number, +91 optional">
        <input data-field="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" className="input" onChange={() => clear("phone")} />
      </Field>

      <Field label="Email" error={errors.email}>
        <input data-field="email" name="email" type="email" autoComplete="email" className="input" onChange={() => clear("email")} />
      </Field>

      <Field label="Education" required error={errors.education} hint="Your course and college, e.g. BA Mass Communication, Utkal University">
        <input data-field="education" name="education" className="input" maxLength={200} onChange={() => clear("education")} />
      </Field>

      <Field label="Experience" required error={errors.experience_level}>
        <div data-field="experience_level" className="space-y-2.5">
          {[
            ["fresher", "Fresher"],
            ["experienced", "Have worked on projects / have work experience"],
          ].map(([v, l]) => (
            <label key={v} className="flex items-start gap-3 py-0.5">
              <input type="radio" name="experience_level" value={v} className="mt-1 h-5 w-5 accent-tred" onChange={() => clear("experience_level")} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Which areas of film production do you know?" required error={errors.areas}>
        <div data-field="areas" className="space-y-2.5">
          {AREAS.map((a) => (
            <label key={a.value} className="flex items-center gap-3 py-0.5">
              <input type="checkbox" name="areas" value={a.value} className="h-5 w-5 accent-tred" onChange={() => clear("areas")} />
              <span>{a.label}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Portfolio / showreel link" error={errors.portfolio_url} hint="YouTube, Drive, Instagram… must start with https://">
        <input data-field="portfolio_url" name="portfolio_url" type="url" inputMode="url" placeholder="https://" className="input" onChange={() => clear("portfolio_url")} />
      </Field>

      <Field label="Upload your CV" error={errors.cv} hint="PDF, DOC or DOCX, max 4 MB">
        <input data-field="cv" name="cv" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="input file:mr-3 file:rounded-md file:border-0 file:bg-tblue file:px-3 file:py-1.5 file:text-white" onChange={() => clear("cv")} />
      </Field>

      <Field label="Upload a selfie" error={errors.selfie} hint="On a phone you can take it with the front camera. JPG, PNG or WEBP.">
        <input ref={selfieRef} data-field="selfie" name="selfie" type="file" accept="image/*" capture="user" className="input file:mr-3 file:rounded-md file:border-0 file:bg-tblue file:px-3 file:py-1.5 file:text-white" onChange={onSelfieChange} />
        {selfiePreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfiePreview} alt="Selfie preview" className="mt-3 h-24 w-24 rounded-lg border object-cover" />
        )}
      </Field>

      <Field label="Can you work on-site in Bhubaneswar for 2–3 months?" required error={errors.can_work_onsite}>
        <div data-field="can_work_onsite" className="flex gap-8">
          {[["yes", "Yes"], ["no", "No"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-3 py-0.5">
              <input type="radio" name="can_work_onsite" value={v} className="h-5 w-5 accent-tred" onChange={() => clear("can_work_onsite")} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="card">
        <label className="flex items-start gap-3">
          <input data-field="consent" type="checkbox" name="consent" value="true" className="mt-1 h-5 w-5 shrink-0 accent-tred" onChange={() => clear("consent")} />
          <span className="text-[15px]">
            I agree that Tarang Plus may store my details, CV and photo to process my internship application.{" "}
            <Link href="/privacy" target="_blank" className="text-tred underline">Privacy note</Link> <span className="text-tred">*</span>
          </span>
        </label>
        {errors.consent && <p className="err" role="alert">{errors.consent}</p>}
      </div>

      {errors.form && <p className="rounded-lg border border-tred/40 bg-white p-3 text-tred" role="alert">{errors.form}</p>}

      <button type="submit" disabled={submitting} className="btn w-full py-3 text-lg">
        {submitting ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
