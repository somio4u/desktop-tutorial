/* Seed 5 fake applicants (2 with sample CV PDFs) + the first admin.
   Run:  npm run seed      (reads .env.local) */
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

async function makePdf(title: string, lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  page.drawText(title, { x: 50, y: 780, size: 20, font: bold });
  let y = 745;
  for (const l of lines) {
    const isHead = l.endsWith(":");
    page.drawText(l, { x: 50, y, size: isHead ? 13 : 11, font: isHead ? bold : font });
    y -= isHead ? 22 : 17;
  }
  return doc.save();
}

const cvStrong = () =>
  makePdf("Rakesh Mohanty - Production Assistant", [
    "Experience:",
    "- Assistant Director, 'Sundarban' Odia short film (2024): script breakdown, shooting schedule,",
    "  call sheets, continuity, managed a 12-member crew over 6 shoot days.",
    "- Production assistant on 3 music videos and 5 ad shoots in Bhubaneswar.",
    "- Edited 10+ YouTube vlogs in Premiere Pro and DaVinci Resolve; exported deliverables for OTT.",
    "- Ran Instagram promotion for a college film festival (12k reach).",
    "Education:",
    "- BA Mass Communication, Utkal University; Workshop on Film Production, FTII outreach.",
    "Skills:",
    "- Scheduling, location recce, budgeting basics, colour correction, social media promos.",
  ]);

const cvFresher = () =>
  makePdf("Priya Sahoo", [
    "Education:",
    "- B.Sc Film and Media Studies (2nd year), Ravenshaw University",
    "Projects:",
    "- Directed and edited a 6-minute college short film 'Nabanna' (role: director, editor).",
    "- Assisted on a student documentary: sound recording and shot logging.",
    "- Created a promo reel and posters for the college cultural fest.",
    "Interests:",
    "- Learning production planning; keen to work across pre-production and post-production.",
  ]);

type Seed = {
  full_name: string; age: number; phone: string; email: string | null; education: string;
  experience_level: "fresher" | "experienced"; areas: string[]; portfolio_url: string | null;
  can_work_onsite: boolean; cv?: () => Promise<Uint8Array>;
};

const people: Seed[] = [
  { full_name: "Rakesh Mohanty (SAMPLE)", age: 26, phone: "+919000000001", email: "rakesh.sample@example.com", education: "BA Mass Communication, Utkal University", experience_level: "experienced", areas: ["pre_production", "production", "post_production", "promotion"], portfolio_url: "https://youtube.com/@sample-rakesh", can_work_onsite: true, cv: cvStrong },
  { full_name: "Priya Sahoo (SAMPLE)", age: 20, phone: "+919000000002", email: null, education: "B.Sc Film and Media Studies, Ravenshaw University", experience_level: "fresher", areas: ["post_production", "promotion"], portfolio_url: "https://vimeo.com/sample-priya", can_work_onsite: true, cv: cvFresher },
  { full_name: "Amit Patra (SAMPLE)", age: 22, phone: "+919000000003", email: "amit.sample@example.com", education: "BCom, Sambalpur University", experience_level: "fresher", areas: ["production"], portfolio_url: null, can_work_onsite: true },
  { full_name: "Sneha Das (SAMPLE)", age: 24, phone: "+919000000004", email: null, education: "MA Film Studies, Delhi", experience_level: "experienced", areas: ["pre_production", "post_production"], portfolio_url: "https://youtube.com/@sample-sneha", can_work_onsite: false },
  { full_name: "Biswajit Nayak (SAMPLE)", age: 19, phone: "+919000000005", email: null, education: "+2 Science", experience_level: "fresher", areas: ["promotion"], portfolio_url: null, can_work_onsite: true },
];

async function main() {
  const admin = process.env.ADMIN_SEED_EMAIL?.toLowerCase();
  if (admin) {
    await db.from("admins").upsert({ email: admin });
    console.log("Admin added:", admin);
  }
  for (const p of people) {
    const { cv, ...fields } = p;
    const { data: existing } = await db.from("applicants").select("id").eq("phone", p.phone).maybeSingle();
    const id = existing?.id ?? crypto.randomUUID();
    let cv_path: string | null = null;
    if (cv) {
      cv_path = `${id}/cv-seed.pdf`;
      const { error } = await db.storage.from("cvs").upload(cv_path, await cv(), { contentType: "application/pdf", upsert: true });
      if (error) throw error;
    }
    const row = { ...fields, id, cv_path, consent_at: new Date().toISOString() };
    const { error } = await db.from("applicants").upsert(row, { onConflict: "phone" });
    if (error) throw error;
    console.log("Seeded", p.full_name);
  }
  console.log("\nDone. Open /admin and click 'Score all unscored' to run the AI scoring.");
}
main().catch((e) => { console.error(e); process.exit(1); });
