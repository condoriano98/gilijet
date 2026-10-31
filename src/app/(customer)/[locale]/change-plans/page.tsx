import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'Change my plans',
  description:
    'A guide to help you decide the best option when your plans change: cash refund, reschedule credit, or payment dispute.',
};

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3.5 text-left text-[13px] font-bold text-brand-dark">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3.5 align-top text-[15px] leading-relaxed">{children}</td>;
}

export default function ChangePlansPage() {
  return (
    <div className="mx-auto max-w-[1080px] px-5 pb-4 sm:px-6">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
      >
        ← Home
      </Link>

      <section className="relative mt-1 overflow-hidden rounded-[32px] bg-brand-dark px-6 py-10 text-white sm:px-14 sm:py-12">
        <Image
          src="/brand/hero-home.png"
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="object-cover object-[25%_60%] opacity-30 sm:object-[center_60%]"
        />
        <div className="relative max-w-3xl">
          <h1 className="font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-[42px]">
            &quot;I need to change my plans&quot; — what&apos;s your best option?
          </h1>
          <p className="mt-3 text-base text-brand-periwinkle sm:text-[17px]">
            A guide to help you decide: refund, reschedule, or dispute
          </p>
        </div>
      </section>

      <div className="mt-6">
        <p className="not-prose rounded-[18px] bg-brand-periwinkle px-5 py-4 text-[15px] leading-relaxed text-brand-dark">
          Plans change — that&apos;s normal. This page helps you figure out the
          fastest, most financially sound path. Read each option and pick the
          one that fits where you are right now. For the full terms, see our{' '}
          <Link href="/refunds" className="font-bold underline">
            Refund &amp; Reschedule Policy
          </Link>
          .
        </p>

        <h2 className="mt-12 font-display text-[26px] font-extrabold tracking-tight text-brand-ink">Step 1 — Find your situation</h2>
        <div className="not-prose my-6 overflow-hidden rounded-[22px] border border-brand-line">
          <table className="w-full text-sm">
            <thead className="bg-brand-surface">
              <tr>
                <Th>Your situation</Th>
                <Th>What to do</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              <tr><Td>The operator cancelled my departure</Td><Td><strong>Option A</strong>: full refund or free reschedule — your choice.</Td></tr>
              <tr><Td>Change date, departure is more than 48 hours away</Td><Td><strong>Option B</strong>: Reschedule Credit — keeps 100% of your ticket value.</Td></tr>
              <tr><Td>Cash refund, departure is more than 7 days away</Td><Td><strong>Option A</strong>: full refund. Email us and get 100% back.</Td></tr>
              <tr><Td>Cash refund, departure is 48 hrs – 7 days away</Td><Td>Option A gives 50%; <strong>Option B</strong> keeps 100% as credit. Compare below.</Td></tr>
              <tr><Td>Departure is less than 48 hours away and I can no longer go</Td><Td>No refund or reschedule at this stage. Contact us to discuss.</Td></tr>
              <tr><Td>I already missed the boat</Td><Td>No refund for no-shows. Contact us if there were emergency circumstances.</Td></tr>
              <tr><Td>Medical emergency or bereavement</Td><Td>Contact us with documentation — we review these individually.</Td></tr>
              <tr><Td>I don&apos;t recognise the charge on my card</Td><Td><strong>Option C</strong>: contact us first so we can verify the charge.</Td></tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 font-display text-[26px] font-extrabold tracking-tight text-brand-ink">Option A — Cash Refund</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-text">
          Best when you want your money back and your departure is more than 48
          hours away. How much you get back depends on when you cancel:
        </p>
        <div className="not-prose my-6 overflow-hidden rounded-[22px] border border-brand-line">
          <table className="w-full text-sm">
            <thead className="bg-brand-surface">
              <tr><Th>When you cancel</Th><Th>You get back</Th><Th>Note</Th></tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              <tr><Td>More than 7 days (&gt;168 hrs) before departure</Td><Td><span className="font-semibold text-green-700">100%</span></Td><Td>Admin transfer fee may apply</Td></tr>
              <tr><Td>48 hours to 7 days before departure</Td><Td><span className="font-semibold text-amber-700">50%</span></Td><Td>Remaining 50% non-refundable — consider Option B</Td></tr>
              <tr><Td>Less than 48 hours before departure</Td><Td><span className="font-semibold text-red-700">Not available</span></Td><Td>—</Td></tr>
              <tr><Td>No-show (you missed the boat)</Td><Td><span className="font-semibold text-red-700">Not available</span></Td><Td>No exceptions</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-text">
          <strong>How to request:</strong> email{' '}
          <a className="font-semibold text-brand underline underline-offset-2" href="mailto:info@balinusafast.com">info@balinusafast.com</a> with
          subject <strong>REFUND REQUEST [your booking code]</strong> — include
          your full name, booking code, departure date, and reason. We reply
          within 1 business day with a refund form and your Refund Reference
          Number (RRN). To check status later, email{' '}
          <strong>TRACKING REFUND [your RRN number]</strong>.
        </p>
        <p className="text-sm text-brand-muted">
          Timing after we confirm: e-wallet / QRIS 1–3 business days · bank
          transfer 3–5 days · Indonesian card 5–10 days · international card
          7–14 days.
        </p>

        <h2 className="mt-12 font-display text-[26px] font-extrabold tracking-tight text-brand-ink">Option B — Reschedule Credit</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-text">
          Best when you still want to travel, just on a different date. This
          keeps the full value of your ticket regardless of how close to
          departure you are.
        </p>
        <p className="not-prose rounded-[18px] border border-brand-line bg-brand-surface px-5 py-4 text-[15px] leading-relaxed text-brand-text">
          If your departure is between 48 hours and 7 days away, a cash refund
          (Option A) returns only 50%. A Reschedule Credit gives you 100% of
          your ticket value to use on any route, any operator, any date — for
          most people in that window, the smarter choice.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-text">
          <strong>How to request:</strong> email{' '}
          <a className="font-semibold text-brand underline underline-offset-2" href="mailto:info@balinusafast.com">info@balinusafast.com</a> with
          subject <strong>RESCHEDULE [your booking code]</strong>. Once
          approved we send a cancellation confirmation, a Reschedule Credit Code
          worth the full amount paid, and checkout instructions.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-[15px] leading-relaxed text-brand-text marker:text-brand">
          <li>Valid 90 days from the date your original booking is cancelled.</li>
          <li>Single-use, tied to your email — cannot be shared or transferred.</li>
          <li>Usable on any route, operator, and available date.</li>
          <li>
            Not redeemable during High Season (1 Jul–31 Aug, 20 Dec–5 Jan) if
            the requested departure is more than 80% full.
          </li>
          <li>First reschedule is free; a second carries IDR 75,000 per passenger.</li>
          <li>
            New ticket cheaper than the credit? No cashback — the credit is used
            in full. More expensive? Pay the difference at checkout.
          </li>
        </ul>

        <h2 className="mt-12 font-display text-[26px] font-extrabold tracking-tight text-brand-ink">Option C — Payment Dispute</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-text">
          Only relevant if you were charged for a booking you did not make, or
          we failed to deliver a paid service and have not resolved it after 14
          days of contact. Please contact us <strong>before</strong> involving
          your bank — it is faster. Email{' '}
          <a className="font-semibold text-brand underline underline-offset-2" href="mailto:info@balinusafast.com">info@balinusafast.com</a> with
          subject <strong>DISPUTE [booking code or description]</strong>; most
          concerns are resolved in 1–5 business days.
        </p>
        <p className="text-sm text-brand-muted">
          Note: if you already received a Reschedule Credit and used it for a
          new ticket, a chargeback on the original transaction is double
          recovery, which we contest with your bank using our booking records,
          manifest, and correspondence.
        </p>

        <h2 className="mt-12 font-display text-[26px] font-extrabold tracking-tight text-brand-ink">Quick comparison</h2>
        <div className="not-prose my-6 overflow-hidden rounded-[22px] border border-brand-line">
          <table className="w-full text-sm">
            <thead className="bg-brand-surface">
              <tr><Th>Situation</Th><Th>Cash refund</Th><Th>Credit</Th><Th>Recommended</Th></tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              <tr><Td>&gt;7 days before departure</Td><Td>100%</Td><Td>100%</Td><Td>Either — same result</Td></tr>
              <tr><Td>48 hrs – 7 days before departure</Td><Td>50%</Td><Td>100%</Td><Td>Credit (keeps full value)</Td></tr>
              <tr><Td>&lt;48 hrs before departure</Td><Td>Not available</Td><Td>Not available</Td><Td>Contact us</Td></tr>
              <tr><Td>No-show</Td><Td>Not available</Td><Td>Not available</Td><Td>Contact us</Td></tr>
              <tr><Td>Operator cancels</Td><Td>100%</Td><Td>100%</Td><Td>Your choice</Td></tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 font-display text-[26px] font-extrabold tracking-tight text-brand-ink">Not sure? Get in touch first</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-text">
          We are here seven days a week, 07:00–20:00 WITA (Bali time). Send us a
          message and we will help you find the best path.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-[15px] leading-relaxed text-brand-text marker:text-brand">
          <li>Email: <a className="font-semibold text-brand underline underline-offset-2" href="mailto:info@balinusafast.com">info@balinusafast.com</a></li>
          <li>WhatsApp: <a className="font-semibold text-brand underline underline-offset-2" href="https://wa.me/628133399869">+62 813-3399-869</a></li>
          <li>Manage your booking: <Link className="font-semibold text-brand underline underline-offset-2" href="/b">find your booking</Link></li>
          <li>Full policy: <Link className="font-semibold text-brand underline underline-offset-2" href="/refunds">Refund &amp; Reschedule Policy</Link></li>
        </ul>
      </div>
    </div>
  );
}
