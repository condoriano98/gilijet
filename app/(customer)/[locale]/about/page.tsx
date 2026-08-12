import Link from "next/link";

export const metadata = { title: "About · Gilifast" };

export default function AboutPage() {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl prose prose-slate prose-sm">
        <Link href="/" className="text-sm text-sky-700 no-underline hover:underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">About Gilifast</h1>

        <p className="text-lg text-slate-700">
          Gilifast is Indonesia&apos;s easiest way to book a boat ticket. From the
          Gili islands to Komodo, from Bali to Lombok, we connect travelers
          with verified boat operators in a few taps.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Our mission</h2>
        <p>
          Inter-island travel is the lifeblood of Indonesia. Yet for too long,
          buying a boat ticket has meant a 4am phone call, a WhatsApp chain,
          or showing up at a dock and hoping. We&apos;re changing that — bringing
          the same convenience travelers expect for flights to the sea.
        </p>

        <h2 className="mt-8 text-xl font-semibold">How it works</h2>
        <ol>
          <li><strong>Search</strong> your route and date.</li>
          <li><strong>Compare</strong> operators on price, time, and seats.</li>
          <li><strong>Pay</strong> with QRIS, GoPay, OVO, DANA, bank transfer, or international card.</li>
          <li><strong>Show</strong> your QR e-ticket at the dock.</li>
        </ol>

        <h2 className="mt-8 text-xl font-semibold">For operators</h2>
        <p>
          Are you a boat operator looking to sell tickets online? Apply via the
          <Link href="/operator/login"> operator portal</Link>. We charge a
          flat 8% commission, settle weekly, and provide a free QR scanner app
          so your crew can check passengers in instantly.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Company details</h2>
        <div className="not-prose rounded-lg border bg-slate-50 p-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-700">Legal name</dt>
              <dd>CV Hi Bali Nusa Tenggara</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Business type</dt>
              <dd>Persekutuan Komanditer (CV)</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-slate-700">Registered office</dt>
              <dd>Mataram, Nusa Tenggara Barat, Indonesia</dd>
            </div>
          </dl>
        </div>

        <h2 className="mt-8 text-xl font-semibold">Trust &amp; safety</h2>
        <ul>
          <li>All operators are verified — bank account, NPWP, vessel registration.</li>
          <li>Payments processed by DOKU, regulated by Bank Indonesia.</li>
          <li>Refunds protected by our <Link href="/refunds">refund policy</Link>.</li>
          <li>Customer data secured under <Link href="/privacy">UU PDP compliance</Link>.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">Get in touch</h2>
        <p>
          See our <Link href="/contact">contact page</Link> for customer
          service, operator inquiries, and press.
        </p>
      </div>
    </div>
  );
}
