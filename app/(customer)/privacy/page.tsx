import Link from "next/link";

export const metadata = { title: "Privacy Policy · Gilijet" };

export default function PrivacyPage() {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl prose prose-slate prose-sm">
        <Link href="/" className="text-sm text-sky-700 no-underline hover:underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-slate-500">Last updated: 19 May 2026</p>

        <p>
          PT Gilijet Nusantara (&quot;Gilijet&quot;, &quot;we&quot;) is committed to protecting
          your privacy in accordance with Indonesia&apos;s Personal Data
          Protection Law (UU PDP No. 27/2022).
        </p>

        <h2 className="mt-6 text-xl font-semibold">1. Data We Collect</h2>
        <ul>
          <li><strong>Booking data:</strong> Names, email, phone, nationality, ID/passport numbers of the booker and passengers.</li>
          <li><strong>Payment data:</strong> Method (QRIS, e-wallet, etc.), amount, timestamp. Card numbers and PINs are handled by Xendit; we never see them.</li>
          <li><strong>Technical data:</strong> Anonymized IP, browser type, and pages visited to improve performance.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">2. How We Use Your Data</h2>
        <ul>
          <li>Process bookings and issue e-tickets.</li>
          <li>Share necessary passenger info with the listed boat operator so they can fulfill the trip.</li>
          <li>Send transactional emails (booking confirmation, cancellation, refund updates).</li>
          <li>Respond to customer service queries.</li>
          <li>Comply with legal and tax obligations.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">3. Who We Share With</h2>
        <ul>
          <li><strong>Boat operators:</strong> Only the data necessary for transport (passenger names, departure, contact phone in case of disruption).</li>
          <li><strong>Xendit (payment gateway):</strong> Payment details so the transaction can be processed.</li>
          <li><strong>Email provider (Resend):</strong> Recipient email and ticket details to deliver e-tickets.</li>
          <li><strong>Law enforcement:</strong> When required by valid legal request under Indonesian law.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your data to advertisers or marketing networks.
        </p>

        <h2 className="mt-6 text-xl font-semibold">4. Data Retention</h2>
        <ul>
          <li>Booking records are retained for 10 years to comply with Indonesian tax law.</li>
          <li>Marketing email opt-ins can be withdrawn at any time.</li>
          <li>Anonymized analytics: 24 months.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">5. Your Rights (UU PDP)</h2>
        <ul>
          <li>Access the personal data we hold about you.</li>
          <li>Correct inaccurate data.</li>
          <li>Request deletion (subject to legal retention requirements).</li>
          <li>Withdraw consent for marketing communications.</li>
          <li>Lodge a complaint with the Indonesian data protection authority.</li>
        </ul>
        <p>
          To exercise these rights, contact <a href="mailto:privacy@gilijet.com">privacy@gilijet.com</a>.
        </p>

        <h2 className="mt-6 text-xl font-semibold">6. Security</h2>
        <p>
          We use industry-standard encryption (HTTPS/TLS) for all data in
          transit. Database access is restricted, payment data is tokenized via
          Xendit, and we log every administrative action. Despite this, no
          internet service can be guaranteed 100% secure.
        </p>

        <h2 className="mt-6 text-xl font-semibold">7. Cookies</h2>
        <p>
          We use only essential cookies (session, authentication). We do not
          use third-party advertising trackers.
        </p>

        <h2 className="mt-6 text-xl font-semibold">8. Children</h2>
        <p>
          Gilijet is not intended for users under 18. Minors travel under the
          booking of a parent or guardian who accepts these terms on their
          behalf.
        </p>

        <h2 className="mt-6 text-xl font-semibold">9. Changes</h2>
        <p>
          Material changes to this policy will be notified by email to active
          account holders at least 30 days before taking effect.
        </p>

        <h2 className="mt-6 text-xl font-semibold">10. Contact</h2>
        <p>
          Data Protection Officer · <a href="mailto:privacy@gilijet.com">privacy@gilijet.com</a><br />
          PT Gilijet Nusantara · Jakarta, Indonesia
        </p>
      </div>
    </div>
  );
}
