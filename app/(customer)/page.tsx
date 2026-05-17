import Link from "next/link";
import { prisma } from "@/lib/db";
import { SearchForm } from "@/components/customer/search-form";

// The homepage queries live schedules for the search-form dropdowns, so it
// must be rendered per-request — no static prerender attempt at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const schedules = await prisma.schedule.findMany({
    where: { status: "ACTIVE", boat: { status: "ACTIVE" } },
    select: { originPort: true, destinationPort: true },
  });
  const origins = Array.from(
    new Set(schedules.map((s) => s.originPort)),
  ).sort();
  const destinations = Array.from(
    new Set(schedules.map((s) => s.destinationPort)),
  ).sort();

  return (
    <>
      <section className="container py-12 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Boat tickets across Indonesia
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            Find fast boats and ferries between islands. Pay with QRIS,
            e-wallets, bank transfer, or international card.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-4xl">
          {origins.length === 0 ? (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
              No routes are live yet. Operators are onboarding now — check
              back soon.
            </div>
          ) : (
            <SearchForm origins={origins} destinations={destinations} />
          )}
        </div>
      </section>

      <section className="container pb-16">
        <div className="mx-auto grid max-w-4xl gap-4 text-sm sm:grid-cols-3">
          <Feature title="Pay your way">
            QRIS, GoPay, OVO, DANA, bank transfer, or international card —
            whichever you trust.
          </Feature>
          <Feature title="E-tickets on email">
            Boarding QR codes arrive instantly. Lost yours? Look up your
            booking <Link href="/b" className="underline">here</Link>.
          </Feature>
          <Feature title="Fair refunds">
            7+ days out: full refund. Weather cancellation by the operator?
            Always 100% back.
          </Feature>
        </div>
      </section>
    </>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-1 font-semibold text-slate-900">{title}</div>
      <div className="text-slate-600">{children}</div>
    </div>
  );
}
