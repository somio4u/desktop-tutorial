# Tarang Plus – Production Intern Hiring App

Public application form + private admin panel with AI priority scoring (Claude).
Full brief: [SPEC.md](./SPEC.md). Next.js 15 (App Router) · Tailwind · Supabase · Anthropic API.

## 1. Set up Supabase
1. Create a project at supabase.com.
2. **SQL Editor** → paste and run `supabase/migrations/0001_init.sql`
   (creates tables, Row Level Security, private `cvs` and `selfies` buckets).
3. **Authentication → Providers → Email**: keep enabled. In **Authentication → URL Configuration** add
   `http://localhost:3000/auth/callback` and your Vercel URL + `/auth/callback` to *Redirect URLs*.
   (Optional: in *Email Templates → Magic Link* add `{{ .Token }}` so the email also shows a 6-digit code.)
4. **Project Settings → API**: copy the Project URL, `anon` key and `service_role` key.

## 2. Configure keys
```bash
cp .env.example .env.local     # then fill the values
```
| Variable | Where from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` (server only) | same page. **Never share or expose it.** |
| `ANTHROPIC_API_KEY` (server only) | console.anthropic.com → API keys |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` |
| `ADMIN_SEED_EMAIL` | your email: becomes the first admin on first login |

## 3. Run
```bash
npm install
npm run dev          # http://localhost:3000   (admin: /admin)
npm test             # unit tests for scoring rules + validation
npm run seed         # optional: 5 fake applicants + 2 sample CV PDFs
```
After seeding, open `/admin` and click **Score all unscored**.

## 4. Deploy (Vercel)
Import the repo in Vercel, set **Root Directory** to `tarang-hiring`, add the env vars above
(also `NEXT_PUBLIC_SITE_URL`), deploy, then add the Vercel URL to Supabase Redirect URLs.

## Notes
- The public form never talks to the database: it posts to `/api/apply`, which uses the service-role key on the server.
- CV limit is **4 MB** (not 5) because Vercel functions accept request bodies up to 4.5 MB; the selfie is compressed in the browser to ~1200px.
- Only job-relevant fields and CV text go to Claude: never the selfie, name, age, phone or email.
  Totals, the on-site rule and priority bands are re-applied on the server (`lib/scoring-rules.ts`).
- Legacy `.doc` CVs are stored and downloadable but their text can't be extracted, so they are scored from the form details only.
