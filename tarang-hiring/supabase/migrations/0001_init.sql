-- Tarang Plus hiring app: schema, RLS, storage buckets

create extension if not exists pgcrypto;

create table if not exists public.admins (
  email text primary key
);

create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  age int not null,
  phone text not null unique,
  email text,
  education text not null,
  experience_level text not null check (experience_level in ('fresher','experienced')),
  areas text[] not null default '{}',
  portfolio_url text,
  cv_path text,
  cv_text text,
  selfie_path text,
  can_work_onsite boolean not null,
  consent_at timestamptz not null,
  status text not null default 'new'
    check (status in ('new','shortlisted','interview','selected','rejected','on_hold')),
  ai_score int check (ai_score between 0 and 100),
  ai_priority text check (ai_priority in ('high','medium','low')),
  ai_summary text,
  ai_strengths text[],
  ai_concerns text[],
  ai_best_fit_area text,
  ai_breakdown jsonb,
  ai_scored_at timestamptz,
  ai_error text
);
create index if not exists applicants_score_idx on public.applicants (ai_score desc nulls last, created_at desc);
create index if not exists applicants_status_idx on public.applicants (status);

create table if not exists public.applicant_notes (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  author_email text not null,
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists notes_applicant_idx on public.applicant_notes (applicant_id, created_at desc);

-- Rate limiting for the public form (written only by the server with the service role key)
create table if not exists public.apply_attempts (
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists apply_attempts_idx on public.apply_attempts (ip_hash, created_at desc);

-- Row Level Security on every table
alter table public.admins enable row level security;
alter table public.applicants enable row level security;
alter table public.applicant_notes enable row level security;
alter table public.apply_attempts enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(auth.jwt() ->> 'email'));
$$;

-- The service role bypasses RLS. Anonymous users get NO policies (= no access).
-- Logged-in admins can read; all writes go through the server API.
drop policy if exists "admins read applicants" on public.applicants;
create policy "admins read applicants" on public.applicants for select to authenticated using (public.is_admin());
drop policy if exists "admins read notes" on public.applicant_notes;
create policy "admins read notes" on public.applicant_notes for select to authenticated using (public.is_admin());
drop policy if exists "admins read admins" on public.admins;
create policy "admins read admins" on public.admins for select to authenticated using (public.is_admin());

-- Private storage buckets
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('cvs', 'cvs', false, 5242880),
  ('selfies', 'selfies', false, 5242880)
on conflict (id) do update set public = false;
-- No storage policies are created: only the service role (server) can read/write files,
-- and admins view them through short-lived signed URLs.
