import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-admin";

async function addAdmin(formData: FormData) {
  "use server";
  const me = await requireAdmin();
  if (!me.ok) return;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return;
  await serviceClient().from("admins").upsert({ email });
  revalidatePath("/admin/settings");
}

async function removeAdmin(formData: FormData) {
  "use server";
  const me = await requireAdmin();
  if (!me.ok) return;
  const email = String(formData.get("email") ?? "");
  if (email.toLowerCase() === me.email) return; // cannot remove yourself
  await serviceClient().from("admins").delete().eq("email", email);
  revalidatePath("/admin/settings");
}

export default async function Settings() {
  const me = await requireAdmin();
  const { data: admins } = await serviceClient().from("admins").select("email").order("email");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-tblue">Admins</h1>
      <p className="text-sm text-muted">Only these emails can open the admin panel.</p>
      <div className="card">
        <ul className="divide-y">
          {(admins ?? []).map((a) => (
            <li key={a.email} className="flex items-center justify-between gap-3 py-2.5">
              <span className="break-all">{a.email}{me.ok && a.email.toLowerCase() === me.email && <span className="ml-2 text-xs text-muted">(you)</span>}</span>
              {!(me.ok && a.email.toLowerCase() === me.email) && (
                <form action={removeAdmin}>
                  <input type="hidden" name="email" value={a.email} />
                  <button className="text-sm text-tred hover:underline">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
      <form action={addAdmin} className="card flex gap-2">
        <input name="email" type="email" required placeholder="new.admin@example.com" className="input" />
        <button className="btn shrink-0">Add admin</button>
      </form>
    </div>
  );
}
