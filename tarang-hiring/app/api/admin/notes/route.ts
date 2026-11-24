import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAdmin } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-admin";

const body = z.object({ applicant_id: z.string().uuid(), note: z.string().trim().min(1).max(2000) });

export async function POST(req: Request) {
  const a = await apiAdmin();
  if ("error" in a) return a.error;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Note cannot be empty" }, { status: 400 });
  const { data, error } = await serviceClient()
    .from("applicant_notes")
    .insert({ applicant_id: parsed.data.applicant_id, note: parsed.data.note, author_email: a.email })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, note: data });
}
