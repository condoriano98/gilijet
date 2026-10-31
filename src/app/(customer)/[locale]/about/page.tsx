import Link from 'next/link';
import Image from 'next/image';

export const metadata = { title: 'About' };

const LINK = 'font-semibold text-brand underline-offset-2 hover:underline';

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1080px] px-5 pb-4 sm:px-6">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
      >
        ← Home
      </Link>

      <section className="relative mt-1 overflow-hidden rounded-[32px] px-6 pb-14 pt-12 text-white sm:px-12 sm:pb-20 sm:pt-16">
        <Image
          src="/brand/hero-home.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[25%_60%] sm:object-[center_60%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,34,142,0.8)_0%,rgba(0,34,142,0.62)_60%,rgba(0,34,142,0.2)_100%)]" />
        <div className="relative max-w-3xl">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            About Gilifast
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed sm:text-[19px]">
            Gilifast is Indonesia&apos;s easiest way to book a boat ticket. From the
            Gili islands to Komodo, from Bali to Lombok, we connect travelers
            with verified boat operators in a few taps.
          </p>
        </div>
      </section>

      <div className="mt-12 grid gap-8 sm:mt-[72px] lg:grid-cols-2 lg:gap-14">
        <section>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[32px]">
            Our mission
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-brand-text">
            Inter-island travel is the lifeblood of Indonesia. Yet for too long,
            buying a boat ticket has meant a 4am phone call, a WhatsApp chain,
            or showing up at a dock and hoping. We&apos;re changing that — bringing
            the same convenience travelers expect for flights to the sea.
          </p>
        </section>

        <section className="rounded-[28px] bg-brand-surface p-6 sm:p-7">
          <h2 className="text-lg font-bold text-brand-dark">Company details</h2>
          <dl className="mt-5 grid gap-5 text-[15px] sm:grid-cols-2">
            <div>
              <dt className="text-[13px] font-semibold text-brand-muted">Legal name</dt>
              <dd className="mt-1 font-semibold text-brand-ink">CV Hi Bali Nusa Tenggara</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-brand-muted">Business type</dt>
              <dd className="mt-1 font-semibold text-brand-ink">Persekutuan Komanditer (CV)</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[13px] font-semibold text-brand-muted">Registered office</dt>
              <dd className="mt-1 font-semibold text-brand-ink">Mataram, Nusa Tenggara Barat, Indonesia</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-12 sm:mt-[72px]">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[32px]">
          How it works
        </h2>
        <ol className="mt-7 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {[
            <><strong>Search</strong> your route and date.</>,
            <><strong>Compare</strong> operators on price, time, and seats.</>,
            <><strong>Pay</strong> with QRIS, GoPay, OVO, DANA, bank transfer, or international card.</>,
            <><strong>Show</strong> your QR e-ticket at the dock.</>,
          ].map((step, i) => (
            <li
              key={i}
              className="rounded-3xl border border-brand-line bg-white p-6 text-[15px] leading-relaxed text-brand-text"
            >
              <span aria-hidden className="block text-4xl font-extrabold leading-none tracking-tighter text-brand">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="mt-3 block [&_strong]:text-lg [&_strong]:text-brand-ink">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-12 grid gap-5 sm:mt-[72px] lg:grid-cols-2 lg:gap-6">
        <section className="rounded-[28px] bg-brand-dark p-7 text-white sm:p-9">
          <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">
            For operators
          </h2>
          <p className="mt-3.5 text-base leading-relaxed text-brand-periwinkle">
            Are you a boat operator looking to sell tickets online? Apply via the
            <Link href="/operator/login" className="font-bold text-white underline underline-offset-2"> operator portal</Link>. We charge a
            flat 8% commission, settle weekly, and provide a free QR scanner app
            so your crew can check passengers in instantly.
          </p>
        </section>

        <section className="rounded-[28px] border border-brand-line bg-white p-7 sm:p-9">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[28px]">
            Trust &amp; safety
          </h2>
          <ul className="mt-4 flex flex-col gap-3.5 text-[15px] leading-relaxed text-brand-text">
            <li>All operators are verified — bank account, NPWP, vessel registration.</li>
            <li>Payments processed by DOKU, regulated by Bank Indonesia.</li>
            <li>Refunds protected by our <Link href="/refunds" className={LINK}>refund policy</Link>.</li>
            <li>Customer data secured under <Link href="/privacy" className={LINK}>UU PDP compliance</Link>.</li>
          </ul>
        </section>
      </div>

      <section className="mt-12 rounded-[28px] bg-brand-periwinkle p-7 sm:mt-14 sm:p-9">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-dark sm:text-[28px]">
          Get in touch
        </h2>
        <p className="mt-2 text-base leading-relaxed text-brand-dark">
          See our <Link href="/contact" className="font-bold underline underline-offset-2">contact page</Link> for customer
          service, operator inquiries, and press.
        </p>
      </section>
    </div>
  );
}
