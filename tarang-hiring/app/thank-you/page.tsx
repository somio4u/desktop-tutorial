import PublicShell from "@/components/PublicShell";

export const metadata = { title: "Thank you – Tarang Plus" };

export default async function ThankYou({ searchParams }: { searchParams: Promise<{ updated?: string }> }) {
  const { updated } = await searchParams;
  return (
    <PublicShell>
      <div className="card border-t-[10px] border-t-tred text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-tyellow text-2xl text-tblue">✓</div>
        <h1 className="text-2xl font-bold text-tblue">Thank you for applying!</h1>
        {updated === "1" && (
          <p className="mt-2 rounded-lg bg-tyellow/30 px-3 py-2 text-sm text-ink">
            We already had an application from this phone number, so we have updated it with your new details.
          </p>
        )}
        <p className="mt-3 text-muted">Our team will contact shortlisted candidates by phone or WhatsApp.</p>
      </div>
    </PublicShell>
  );
}
