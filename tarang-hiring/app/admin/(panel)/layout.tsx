import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  const supa = await sessionClient();
  await supa.auth.signOut();
  redirect("/admin/login");
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();

  if (!me.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-sm text-center">
          <h1 className="text-xl font-bold text-tred">Not authorised</h1>
          <p className="mt-2 text-muted">{me.email} is not on the Tarang Plus admin list. Ask an existing admin to add your email.</p>
          <form action={signOut} className="mt-4"><button className="btn">Sign out</button></form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="bg-tblue text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="rounded bg-white p-1"><Image src="/brand/tarang-plus-logo.png" alt="Tarang Plus" width={60} height={36} className="h-7 w-auto" /></span>
            <span className="font-heading text-lg font-semibold">Hiring</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin" className="hover:underline">Applicants</Link>
            <Link href="/admin/settings" className="hover:underline">Settings</Link>
          </nav>
          <form action={signOut} className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-white/80 sm:inline">{me.email}</span>
            <button className="rounded border border-white/40 px-2.5 py-1 hover:bg-white/10">Sign out</button>
          </form>
        </div>
        <div className="wave" aria-hidden style={{ height: 8, borderRadius: 0 }} />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}
