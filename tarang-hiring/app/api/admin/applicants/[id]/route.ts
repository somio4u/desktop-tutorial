import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAdmin } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-admin";
import { STATUSES } from "@/lib/constants";

const body = z.object({ status: z.enum(STATUSES) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiAdmin();
  if ("error" in a) return a.error;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const { id } = await params;
  const { error } = await serviceClient().from("applicants").update({ status: parsed.data.status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
