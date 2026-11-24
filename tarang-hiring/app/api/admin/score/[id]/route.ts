import { NextResponse } from "next/server";
import { apiAdmin } from "@/lib/auth";
import { scoreApplicant } from "@/lib/scoring";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiAdmin();
  if ("error" in a) return a.error;
  const { id } = await params;
  const r = await scoreApplicant(id);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
