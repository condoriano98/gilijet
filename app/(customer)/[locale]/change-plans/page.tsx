import Link from "next/link";

export const metadata = {
  title: "Change my plans — refund, reschedule or dispute · Gilifast",
  description:
    "A guide to help you decide the best option when your plans change: cash refund, reschedule credit, or payment dispute.",
};

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-semibold">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

export default function ChangePlansPage() {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl prose prose-slate prose-sm">
        <Link href="/" className="text-sm text-sky-700 no-underline hover:underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          &quot;I need to change my plans&quot; — what&apos;s your best option?
        </h1>
        <p className="text-sm text-slate-500">
          A guide to help you decide: refund, reschedule, or dispute
        </p>

        <p className="rounded-md bg-sky-50 px-4 py-3 not-prose text-sm text-sky-900">
          Plans change — that&apos;s normal. This page helps you figure out the
          fastest, most financially sound path. Read each option and pick the
          one that fits where you are right now. For the full terms, see our{" "}
          <Link href="/refunds" className="underline">
            Refund &amp; Reschedule Policy
          </Link>
          .
        </p>

        <h2 className="mt-8 text-xl font-semibold">Step 1 — Find your situation</h2>
        <div className="my-6 overflow-hidden rounded-lg border not-prose">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>Your situation</Th>
                <Th>What to do</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
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

        <h2 className="mt-8 text-xl font-semibold">Option A — Cash Refund</h2>
        <p>
          Best when you want your money back and your departure is more than 48
          hours away. How much you get back depends on when you cancel:
        </p>
        <div className="my-6 overflow-hidden rounded-lg border not-prose">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr><Th>When you cancel</Th><Th>You get back</Th><Th>Note</Th></tr>
            </thead>
            <tbody className="divide-y">
              <tr><Td>More than 7 days (&gt;168 hrs) before departure</Td><Td><span className="font-semibold text-green-700">100%</span></Td><Td>Admin transfer fee may apply</Td></tr>
              <tr><Td>48 hours to 7 days before departure</Td><Td><span className="font-semibold text-amber-700">50%</span></Td><Td>Remaining 50% non-refundable — consider Option B</Td></tr>
              <tr><Td>Less than 48 hours before departure</Td><Td><span className="font-semibold text-red-700">Not available</span></Td><Td>—</Td></tr>
              <tr><Td>No-show (you missed the boat)</Td><Td><span className="font-semibold text-red-700">Not available</span></Td><Td>No exceptions</Td></tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>How to request:</strong> email{" "}
          <a href="mailto:info@balinusafast.com">info@balinusafast.com</a> with
          subject <strong>REFUND REQUEST [your booking code]</strong> — include
          your full name, booking code, departure date, and reason. We reply
          within 1 business day with a refund form and your Refund Reference
          Number (RRN). To check status later, email{" "}
          <strong>TRACKING REFUND [your RRN number]</strong>.
        </p>
        <p className="text-sm text-slate-600">
          Timing after we confirm: e-wallet / QRIS 1–3 business days · bank
          transfer 3–5 days · Indonesian card 5–10 days · international card
          7–14 days.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Option B — Reschedule Credit</h2>
        <p>
          Best when you still want to travel, just on a different date. This
          keeps the full value of your ticket regardless of how close to
          departure you are.
        </p>
        <p className="rounded-md bg-slate-50 px-4 py-3 not-prose text-sm text-slate-700">
          If your departure is between 48 hours and 7 days away, a cash refund
          (Option A) returns only 50%. A Reschedule Credit gives you 100% of
          your ticket value to use on any route, any operator, any date — for
          most people in that window, the smarter choice.
        </p>
        <p>
          <strong>How to request:</strong> email{" "}
          <a href="mailto:info@balinusafast.com">info@balinusafast.com</a> with
          subject <strong>RESCHEDULE [your booking code]</strong>. Once
          approved we send a cancellation confirmation, a Reschedule Credit Code
          worth the full amount paid, and checkout instructions.
        </p>
        <ul>
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

        <h2 className="mt-8 text-xl font-semibold">Option C — Payment Dispute</h2>
        <p>
          Only relevant if you were charged for a booking you did not make, or
          we failed to deliver a paid service and have not resolved it after 14
          days of contact. Please contact us <strong>before</strong> involving
          your bank — it is faster. Email{" "}
          <a href="mailto:info@balinusafast.com">info@balinusafast.com</a> with
          subject <strong>DISPUTE [booking code or description]</strong>; most
          concerns are resolved in 1–5 business days.
        </p>
        <p className="text-sm text-slate-600">
          Note: if you already received a Reschedule Credit and used it for a
          new ticket, a chargeback on the original transaction is double
          recovery, which we contest with your bank using our booking records,
          manifest, and correspondence.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Quick comparison</h2>
        <div className="my-6 overflow-hidden rounded-lg border not-prose">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr><Th>Situation</Th><Th>Cash refund</Th><Th>Credit</Th><Th>Recommended</Th></tr>
            </thead>
            <tbody className="divide-y">
              <tr><Td>&gt;7 days before departure</Td><Td>100%</Td><Td>100%</Td><Td>Either — same result</Td></tr>
              <tr><Td>48 hrs – 7 days before departure</Td><Td>50%</Td><Td>100%</Td><Td>Credit (keeps full value)</Td></tr>
              <tr><Td>&lt;48 hrs before departure</Td><Td>Not available</Td><Td>Not available</Td><Td>Contact us</Td></tr>
              <tr><Td>No-show</Td><Td>Not available</Td><Td>Not available</Td><Td>Contact us</Td></tr>
              <tr><Td>Operator cancels</Td><Td>100%</Td><Td>100%</Td><Td>Your choice</Td></tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-xl font-semibold">Not sure? Get in touch first</h2>
        <p>
          We are here seven days a week, 07:00–20:00 WITA (Bali time). Send us a
          message and we will help you find the best path.
        </p>
        <ul>
          <li>Email: <a href="mailto:info@balinusafast.com">info@balinusafast.com</a></li>
          <li>WhatsApp: <a href="https://wa.me/628133399869">+62 813-3399-869</a></li>
          <li>Manage your booking: <Link href="/b">find your booking</Link></li>
          <li>Full policy: <Link href="/refunds">Refund &amp; Reschedule Policy</Link></li>
        </ul>
      </div>
    </div>
  );
}
