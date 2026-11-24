import Image from "next/image";
import Link from "next/link";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-tblue">
        <div className="mx-auto max-w-[1600px]">
          <Image src="/brand/header-banner.png" alt="Tarang Plus – We are hiring Production Interns" width={1600} height={400} priority className="h-auto w-full" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[640px] flex-1 px-3 py-5 sm:px-0">{children}</main>
      <footer className="mt-8">
        <p className="pb-3 text-center text-sm text-muted">
          © Tarang Plus · <Link href="/privacy" className="text-tred underline">Privacy</Link>
        </p>
        <div className="wave" aria-hidden />
      </footer>
    </div>
  );
}
