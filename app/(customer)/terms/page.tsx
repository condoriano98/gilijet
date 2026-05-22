import Link from "next/link";

export const metadata = { title: "Terms of Service · Gilijet" };

export default function TermsPage() {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl prose prose-slate prose-sm">
        <Link href="/" className="text-sm text-sky-700 no-underline hover:underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-slate-500">Last updated: 19 May 2026</p>

        <h2 className="mt-6 text-xl font-semibold">1. About Gilijet</h2>
        <p>
          Gilijet (&quot;we&quot;, &quot;us&quot;, the &quot;Platform&quot;) is a marketplace operated by
          PT Gilijet Nusantara that connects passengers with licensed boat
          operators across the Indonesian archipelago. We facilitate the sale
          of tickets and the routing of payments, but the transport service
          itself is provided by the listed operator.
        </p>

        <h2 className="mt-6 text-xl font-semibold">2. Acceptance of Terms</h2>
        <p>
          By using Gilijet, you confirm that you are at least 18 years old and
          legally able to enter into a contract. If you book on behalf of
          others, you confirm you have their permission to provide their
          information.
        </p>

        <h2 className="mt-6 text-xl font-semibold">3. Booking and Payment</h2>
        <ul>
          <li>Prices are displayed in Indonesian Rupiah (IDR) including taxes.</li>
          <li>Payment is processed by our gateway partner, Mayar. We do not store full card details on our servers.</li>
          <li>A booking is only confirmed once payment has been received and an e-ticket has been issued.</li>
          <li>Pending bookings hold seats for 30 minutes before automatically expiring.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">4. Boarding</h2>
        <ul>
          <li>Passengers must arrive at the departure point at least 30 minutes before scheduled departure.</li>
          <li>A valid government-issued ID matching the passenger name on the ticket is required.</li>
          <li>The QR code on your e-ticket must be presented for scanning at the dock.</li>
          <li>Operators may refuse boarding to passengers who do not comply with safety requirements.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">5. Cancellations and Refunds</h2>
        <p>
          See our full <Link href="/refunds">refund policy</Link>. In summary:
        </p>
        <ul>
          <li>7+ days before departure: 100% refund</li>
          <li>4-6 days before departure: 50% refund</li>
          <li>0-3 days before departure: no refund</li>
          <li>Operator-initiated cancellation (weather, mechanical, etc.): 100% refund</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">6. Liability</h2>
        <p>
          Gilijet&apos;s liability is limited to the amount paid for the affected
          booking. The transport service, including safety, schedule
          adherence, and conduct of crew, is the sole responsibility of the
          boat operator listed on the e-ticket. We strongly recommend that
          travelers carry independent travel insurance.
        </p>

        <h2 className="mt-6 text-xl font-semibold">7. Prohibited Conduct</h2>
        <p>
          You may not use Gilijet to: (a) make fraudulent bookings; (b)
          resell tickets without authorization; (c) interfere with the
          platform&apos;s operation; or (d) violate Indonesian law. Violations
          may result in account suspension and forfeit of unused tickets.
        </p>

        <h2 className="mt-6 text-xl font-semibold">8. Governing Law</h2>
        <p>
          These terms are governed by the laws of the Republic of Indonesia.
          Disputes will be resolved by the District Court of Denpasar.
        </p>

        <h2 className="mt-6 text-xl font-semibold">9. Changes to Terms</h2>
        <p>
          We may update these terms; the &quot;Last updated&quot; date above will reflect
          changes. Continued use after a change means you accept the new terms.
        </p>

        <h2 className="mt-6 text-xl font-semibold">10. Contact</h2>
        <p>
          For questions about these terms, see our <Link href="/contact">contact page</Link>.
        </p>
      </div>
    </div>
  );
}
