import Link from 'next/link';
import Image from 'next/image';

export const metadata = { title: 'Contact' };

const CARD = 'rounded-[28px] bg-white p-6 shadow-ambient sm:p-8';
const DT = 'text-[13px] font-semibold text-brand-muted';
const LINK = 'font-semibold text-brand hover:underline';

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[1080px] px-5 sm:px-6">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
      >
        ← Home
      </Link>

      <section className="relative mt-1 overflow-hidden rounded-[32px] px-6 pb-32 pt-10 text-white sm:px-12 sm:pb-36 sm:pt-14">
        <Image
          src="/brand/hero-home.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[25%_60%] sm:object-[center_60%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,34,142,0.8)_0%,rgba(0,34,142,0.6)_60%,rgba(0,34,142,0.15)_100%)]" />
        <div className="relative">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            Contact us
          </h1>
          <p className="mt-4 text-lg sm:text-[19px]">
            We aim to respond to all inquiries within 24 hours.
          </p>
        </div>
      </section>

      <div className="relative z-10 -mt-20 sm:-mt-24">
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
          <section className={CARD}>
            <h2 className="font-display text-[22px] font-extrabold tracking-tight text-brand-ink">
              Customer support
            </h2>
            <p className="mt-1 text-sm text-brand-muted">Booking questions, refunds, cancellations</p>
            <div className="mt-5 flex flex-col gap-3.5 text-[15px]">
              <div>
                <span className={DT}>Email:</span>{' '}
                <a className={LINK} href="mailto:info@balinusafast.com">
                  info@balinusafast.com
                </a>
              </div>
              <div>
                <span className={DT}>WhatsApp:</span>{' '}
                <a className={LINK} href="https://wa.me/628133399869">
                  +62 813-3399-869
                </a>
              </div>
              <div className="text-sm text-brand-muted">
                Hours: 7 AM – 10 PM WITA, daily
              </div>
            </div>
          </section>

          <section className={CARD}>
            <h2 className="font-display text-[22px] font-extrabold tracking-tight text-brand-ink">
              Privacy &amp; security
            </h2>
            <p className="mt-1 text-sm text-brand-muted">Data requests, vulnerability reports</p>
            <div className="mt-5 flex flex-col gap-3.5 text-[15px]">
              <div>
                <span className={DT}>Email:</span>{' '}
                <a className={LINK} href="mailto:info@balinusafast.com">
                  info@balinusafast.com
                </a>
              </div>
              <div className="text-sm text-brand-muted">
                See our <Link href="/privacy" className={`${LINK} underline`}>Privacy Policy</Link>.
              </div>
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-[28px] bg-brand-surface p-6 sm:mt-6 sm:p-8">
          <h2 className="font-display text-xl font-extrabold tracking-tight text-brand-ink">
            Registered office
          </h2>
          <p className="mt-2 text-[15px] font-semibold text-brand-ink">CV Hi Bali Nusa Tenggara</p>
          <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-brand-muted">
            Jl. Swakarya Raya No.5B, Kekalik Jaya, Kec. Sekarbela, Kota
            Mataram, Nusa Tenggara Barat 83114, Indonesia
          </p>
        </section>
      </div>
    </div>
  );
}
