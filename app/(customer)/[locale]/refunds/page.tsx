import Link from "next/link";

export const metadata = {
  title: "Refund & Reschedule Policy · Gilibali",
  description:
    "Gilibali refund and reschedule policy — cancellation schedule, processing times, reschedule credits, no-shows, and disputes.",
};

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-semibold">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

export default function RefundsPage() {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl prose prose-slate prose-sm">
        <Link href="/" className="text-sm text-sky-700 no-underline hover:underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Refund &amp; Reschedule Policy
        </h1>
        <p className="text-sm text-slate-500">
          Version 1.1 · Effective 1 June 2026
        </p>

        <p className="rounded-md bg-sky-50 px-4 py-3 not-prose text-sm text-sky-900">
          By completing a booking on gilibali.com, gilifast.com, or
          balinusafast.com, you confirm that you have read and agree to this
          policy. It forms part of our{" "}
          <Link href="/terms" className="underline">
            Terms &amp; Conditions
          </Link>
          . If anything here is unclear, please contact us before booking — we
          are happy to help.
        </p>

        <h2 className="mt-8 text-xl font-semibold">1. About this policy</h2>
        <p>
          This page sets out what happens when you need to cancel or change your
          fast boat ticket booked through gilibali.com, gilifast.com, or
          balinusafast.com.
        </p>
        <p>
          We act as a ticketing agent — we sell tickets on behalf of licensed
          fast boat operators, but the contract of carriage is between you and
          the operator. This policy covers what we, as the ticketing platform,
          can offer in terms of refunds and rescheduling. Operator-side policies
          (e.g. onboard rules, baggage limits) are governed by each
          operator&apos;s own terms, which we can provide on request.
        </p>

        <h2 className="mt-8 text-xl font-semibold">2. Cancellations &amp; refunds</h2>
        <p>
          The refund you receive depends on how far in advance of your departure
          you let us know:
        </p>
        <div className="my-6 overflow-hidden rounded-lg border not-prose">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>When you cancel</Th>
                <Th>What you receive</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <Td>More than 7 days (&gt;168 hours) before departure</Td>
                <Td>
                  <span className="font-semibold text-green-700">100% refund</span>
                </Td>
                <Td>Admin transfer fee may apply</Td>
              </tr>
              <tr>
                <Td>48 hours to 7 days before departure</Td>
                <Td>
                  <span className="font-semibold text-amber-700">50% refund</span>
                </Td>
                <Td>
                  Remaining 50% is non-refundable. Consider rescheduling to keep
                  full value.
                </Td>
              </tr>
              <tr>
                <Td>Less than 48 hours before departure</Td>
                <Td>
                  <span className="font-semibold text-red-700">No refund</span>
                </Td>
                <Td>—</Td>
              </tr>
              <tr>
                <Td>No-show (you did not board)</Td>
                <Td>
                  <span className="font-semibold text-red-700">No refund</span>
                </Td>
                <Td>Operator manifests are recorded at every departure</Td>
              </tr>
              <tr>
                <Td>Operator cancels (weather / safety / force majeure)</Td>
                <Td>
                  <span className="font-semibold text-green-700">
                    Full refund or free reschedule
                  </span>
                </Td>
                <Td>Your choice — see Section 3</Td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 text-lg font-semibold">How the refund amount is calculated</h3>
        <ul>
          <li>
            Refund percentages apply to the base ticket price paid at checkout,
            excluding any payment surcharge or convenience fee.
          </li>
          <li>
            For return journey tickets where the outbound leg has already been
            completed, only the unused return leg is covered by this schedule.
          </li>
          <li>
            Group bookings of 10 or more passengers may be subject to different
            cancellation terms. Please contact us before booking to confirm.
          </li>
        </ul>

        <h3 className="mt-6 text-lg font-semibold">How to request a refund</h3>
        <p>
          All refund requests must be submitted by email. We do not accept
          requests via WhatsApp, social media, or verbally. Email{" "}
          <a href="mailto:info@balinusafast.com">info@balinusafast.com</a> with
          subject <strong>REFUND REQUEST [your booking code]</strong> and
          include your full name, booking code, departure date, and reason. We
          reply within one business day (Mon–Sun, 07:00–20:00 WITA) with a
          Refund Reference Number (RRN), a secure refund form, and confirmation
          of the amount.
        </p>

        <h3 className="mt-6 text-lg font-semibold">How long until the money arrives</h3>
        <div className="my-6 overflow-hidden rounded-lg border not-prose">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>Payment method</Th>
                <Th>Estimated time after admin confirms</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr><Td>E-wallet (GoPay, OVO, DANA, ShopeePay)</Td><Td>1–3 business days</Td></tr>
              <tr><Td>QRIS</Td><Td>1–3 business days</Td></tr>
              <tr><Td>Bank transfer / Virtual Account (Indonesian bank)</Td><Td>3–5 business days</Td></tr>
              <tr><Td>Credit / debit card — Indonesian-issued</Td><Td>5–10 business days</Td></tr>
              <tr><Td>Credit / debit card — international</Td><Td>7–14 business days</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-600">
          International card refunds pass through several layers — our payment
          gateway, the acquiring bank, the card network, and finally your own
          bank abroad. Once we initiate the refund, the remaining timeline is
          outside our direct control. To track a refund, email us with subject{" "}
          <strong>TRACKING REFUND [your RRN number]</strong>.
        </p>

        <h2 className="mt-8 text-xl font-semibold">3. When the operator cancels</h2>
        <p>
          Sometimes departures are cancelled by the boat operator — bad weather
          or rough seas are the most common reason, and passenger safety always
          comes first. If this happens, we notify you by email and WhatsApp as
          soon as the operator confirms. You then choose, entirely at your
          discretion:
        </p>
        <ul>
          <li>a full refund of everything you paid, to your original payment method, or</li>
          <li>a free reschedule to the next available departure on the same route.</li>
        </ul>
        <p>
          We are not responsible for secondary costs arising from an operator
          cancellation — missed flights, hotel bookings, or pre-arranged tours.
          We strongly recommend travelling the day before any time-sensitive
          onward connection, particularly during rainy season (November –
          March).
        </p>

        <h2 className="mt-8 text-xl font-semibold">4. Rescheduling your trip</h2>
        <ul>
          <li>
            Your request must reach us at least <strong>48 hours</strong> before
            your original departure (<strong>96 hours</strong> during High
            Season: 1 Jul – 31 Aug and 20 Dec – 5 Jan).
          </li>
          <li>Rescheduling is subject to seat availability on the new date.</li>
          <li>
            Your first reschedule is free. A second reschedule for the same
            booking carries an admin fee of IDR 75,000 per passenger.
          </li>
        </ul>
        <p>
          Email <a href="mailto:info@balinusafast.com">info@balinusafast.com</a>{" "}
          with subject <strong>RESCHEDULE [your booking code]</strong>. Once
          approved, we send a cancellation confirmation, a Reschedule Credit
          Code equal to the full amount paid, and instructions for using it at
          checkout.
        </p>
        <h3 className="mt-6 text-lg font-semibold">Reschedule Credit — what to know</h3>
        <ul>
          <li>Valid for 90 days from the date your original booking is cancelled.</li>
          <li>Single-use, tied to your booking email — cannot be shared or transferred.</li>
          <li>Usable on any route, any operator, any available departure date.</li>
          <li>
            Not redeemable during High Season if the requested departure has
            less than 20% seats remaining.
          </li>
          <li>If the new ticket costs more, pay the difference at checkout.</li>
          <li>If the new ticket costs less, there is no cashback — the credit is used in full.</li>
        </ul>
        <p className="rounded-md bg-slate-50 px-4 py-3 not-prose text-sm text-slate-700">
          If your departure is between 48 hours and 7 days away, a cash refund
          returns only 50%. A reschedule credit keeps 100% of your ticket value
          for a future trip — for most passengers in that window, rescheduling
          is the better option.
        </p>

        <h2 className="mt-8 text-xl font-semibold">5. No-shows</h2>
        <p>
          If you do not arrive at the departure port by the check-in deadline
          (30 minutes before departure) and the boat sails without you, your
          ticket is forfeited. No refund, credit, or rebooking is available for
          no-shows.
        </p>
        <p>
          <strong>Documented medical emergencies:</strong> if you missed your
          departure due to a genuine medical emergency, contact us within 48
          hours of the missed sailing with a medical certificate from a
          registered healthcare provider. We review these cases individually.
        </p>

        <h2 className="mt-8 text-xl font-semibold">6. Refund method</h2>
        <p>
          Refunds are always returned to the original payment method used at
          purchase. We cannot redirect a refund to a different account. The only
          exception is where your original method is no longer active (e.g. an
          expired card) — contact us and we will agree an alternative in
          writing.
        </p>

        <h2 className="mt-8 text-xl font-semibold">7. Payment disputes</h2>
        <p>
          If you believe a refund was processed incorrectly, or have a concern
          about a charge, please contact us first at{" "}
          <a href="mailto:info@balinusafast.com">info@balinusafast.com</a> with
          subject <strong>DISPUTE [booking code or description]</strong>. We
          respond within five business days.
        </p>
        <p>
          Please allow us 14 calendar days to resolve your concern before
          initiating a chargeback. If you have already received a Reschedule
          Credit and used it to buy a new ticket, a chargeback for the original
          transaction would mean you received the new ticket without payment —
          double recovery, which we are required to contest using our booking
          records and passenger manifests.
        </p>

        <h2 className="mt-8 text-xl font-semibold">8. Contact us</h2>
        <p>
          Our team handles all refund, reschedule, and dispute enquiries{" "}
          <strong>Monday to Sunday, 07:00 – 20:00 WITA (GMT+8)</strong>, replying
          within one business day.
        </p>
        <ul>
          <li>Email: <a href="mailto:info@balinusafast.com">info@balinusafast.com</a></li>
          <li>WhatsApp: <a href="https://wa.me/628133399869">+62 813-3399-869</a></li>
          <li>Office — Mataram: Jl. Swakarya Raya No.5B, Kekalik Jaya, Sekarbela, Kota Mataram, NTB 83114</li>
          <li>Office — Denpasar: Jl. Cokroaminoto No.70, Pemecutan Kaja, Denpasar Utara, Bali</li>
          <li>Office — Gili Trawangan: Jl. Pantai Gili Indah, Gili Trawangan, Pemenang, Lombok, NTB 83351</li>
        </ul>

        <p className="mt-8 border-t pt-4 text-xs text-slate-500">
          Not sure which option is best? See our{" "}
          <Link href="/change-plans" className="underline">
            &quot;change my plans&quot; guide
          </Link>
          . · Version 1.1 · June 2026 — added the Reschedule Credit system,
          per-method processing times, and the dispute section.
        </p>
      </div>
    </div>
  );
}
