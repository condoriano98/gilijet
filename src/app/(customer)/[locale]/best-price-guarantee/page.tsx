import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/shared/ui/button';

export const metadata = { title: 'Best Price Guarantee' };

export default function BestPriceGuaranteePage() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-4 sm:px-6">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
      >
        &larr; Home
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
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,34,142,0.82)_0%,rgba(0,34,142,0.62)_60%,rgba(0,34,142,0.3)_100%)]" />
        <div className="relative max-w-3xl">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            Best Price Guarantee
          </h1>
          <p className="mt-5 text-lg leading-relaxed sm:text-[19px]">
            We believe you should always get the best deal. If you find a
            lower price for the <strong>same operator, route, and departure
            date</strong> on another platform within 24 hours of booking,
            we&apos;ll credit the difference as a Gilifast voucher.
          </p>
        </div>
      </section>

      <section className="mt-12 sm:mt-14">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[32px]">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {[
            'Book your trip on Gilifast as usual.',
            'If you spot a lower price elsewhere for the identical sailing, take a screenshot showing the operator name, route, date, and total price.',
            'Contact us within 24 hours of your booking via WhatsApp (+62 813-3399-869) or email (info@balinusafast.com) with the screenshot and your booking reference.',
            "We'll verify the price within one business day. If it matches, we'll credit the difference to your Gilifast account as a voucher for your next trip.",
          ].map((text, i) => (
            <li key={i} className="rounded-3xl border border-brand-line bg-white p-6">
              <span aria-hidden className="block text-4xl font-extrabold leading-none tracking-tighter text-brand">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="mt-3 block text-[15px] leading-relaxed text-brand-text">{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 rounded-[28px] bg-brand-periwinkle p-6 sm:mt-14 sm:p-8">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-dark">
          Terms
        </h2>
        <ul className="mt-4 flex list-disc flex-col gap-3 pl-5 text-[15px] leading-relaxed text-brand-text">
          <li>
            The competing price must be publicly listed and bookable by
            the general public (no member-only or agent-only rates).
          </li>
          <li>
            The comparison is on the total fare per passenger in IDR,
            including any booking fees.
          </li>
          <li>
            Voucher credit is capped at Rp 50,000 or 20% of the original
            fare, whichever is lower.
          </li>
          <li>
            Cannot be combined with promotional codes or group discounts.
          </li>
          <li>
            Gilifast reserves the right to modify or discontinue this
            guarantee at any time.
          </li>
        </ul>
      </section>

      <div className="mt-10">
        <Button asChild size="lg" className="h-14 rounded-2xl bg-brand px-8 text-base font-bold text-white hover:bg-brand-dark">
          <Link href="/search">Search routes</Link>
        </Button>
      </div>
    </div>
  );
}
