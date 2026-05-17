import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-sky-700">
            Gilijet
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/operator/login">Operator login</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/login">Admin</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="container py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Boat tickets across Indonesia
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Find fast boats and ferries between islands. Pay with QRIS,
            e-wallets, bank transfer, or international card.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" disabled>
              <span>Search trips (coming in Phase 2)</span>
            </Button>
          </div>
          <p className="mt-6 text-sm text-slate-500">
            This is the Phase 1 foundation build. The customer booking flow
            ships in Phase 2.
          </p>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="container text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Gilijet · Bootstrapped boat ticketing for
          Indonesia
        </div>
      </footer>
    </main>
  );
}
