import {
  LegalPage,
  PROSE_ARTICLE,
  PROSE_H2,
  type LegalTocItem,
} from '@/app/(customer)/_components/legal-layout';

export const metadata = { title: 'Privacy Policy' };

const TOC: LegalTocItem[] = [
  { id: 's1', label: '1. Data We Collect' },
  { id: 's2', label: '2. How We Use Your Data' },
  { id: 's3', label: '3. Who We Share With' },
  { id: 's4', label: '4. Data Retention' },
  { id: 's5', label: '5. Your Rights (UU PDP)' },
  { id: 's6', label: '6. Security' },
  { id: 's7', label: '7. Cookies' },
  { id: 's8', label: '8. Children' },
  { id: 's9', label: '9. Changes' },
  { id: 's10', label: '10. Contact' },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      toc={TOC}
      title="Privacy Policy"
      meta={<p>Last updated: 26 October 2026</p>}
    >
      <div className={PROSE_ARTICLE}>
        <p>
          CV Hi Bali Nusa Tenggara (&quot;Gilifast&quot;, &quot;we&quot;) is committed to protecting
          your privacy in accordance with Indonesia&apos;s Personal Data
          Protection Law (UU PDP No. 27/2022).
        </p>

        <h2 id="s1" className={PROSE_H2}>1. Data We Collect</h2>
        <ul>
          <li><strong>Booking data:</strong> Names, email, phone, nationality, ID/passport numbers of the booker and passengers.</li>
          <li><strong>Payment data:</strong> Method (QRIS, e-wallet, etc.), amount, timestamp. Card numbers and PINs are handled by DOKU; we never see them.</li>
          <li><strong>Technical data:</strong> Anonymized IP, browser type, and pages visited to improve performance.</li>
          <li><strong>Measurement data (only with your consent):</strong> how you reached us (for example the ad campaign or website that sent you), the pages and journeys you viewed, and, for advertising measurement, the click identifiers Google and Meta add to ad links plus your IP address and browser user agent. This is linked to your booking so we can tell which ads lead to paid trips.</li>
        </ul>

        <h2 id="s2" className={PROSE_H2}>2. How We Use Your Data</h2>
        <ul>
          <li>Process bookings and issue e-tickets.</li>
          <li>Share necessary passenger info with the listed boat operator so they can fulfill the trip.</li>
          <li>Send transactional emails (booking confirmation, cancellation, refund updates).</li>
          <li>Respond to customer service queries.</li>
          <li>Comply with legal and tax obligations.</li>
        </ul>

        <h2 id="s3" className={PROSE_H2}>3. Who We Share With</h2>
        <ul>
          <li><strong>Boat operators:</strong> Only the data necessary for transport (passenger names, departure, contact phone in case of disruption).</li>
          <li><strong>DOKU (payment gateway):</strong> Payment details so the transaction can be processed.</li>
          <li><strong>Email provider (Google Workspace / Gmail):</strong> Recipient email and ticket details to deliver e-tickets.</li>
          <li><strong>Google (Analytics, Ads) and Meta (Facebook/Instagram ads), only with your consent:</strong> that a booking was paid, its value, route and party size, with the ad click identifier, analytics cookie id and, for Meta, your IP address and user agent. We never send your name, email, phone number or passport details to them.</li>
          <li><strong>Law enforcement:</strong> When required by valid legal request under Indonesian law.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your data to advertisers or marketing networks.
        </p>

        <h2 id="s4" className={PROSE_H2}>4. Data Retention</h2>
        <ul>
          <li>Booking records are retained for 10 years to comply with Indonesian tax law.</li>
          <li>Marketing email opt-ins can be withdrawn at any time.</li>
          <li>Anonymized analytics: 24 months.</li>
          <li>Ad click identifiers, IP address and user agent linked to a booking for measurement: deleted after 90 days.</li>
          <li>Your cookie choice: 6 months, after which we ask again.</li>
        </ul>

        <h2 id="s5" className={PROSE_H2}>5. Your Rights (UU PDP)</h2>
        <ul>
          <li>Access the personal data we hold about you.</li>
          <li>Correct inaccurate data.</li>
          <li>Request deletion (subject to legal retention requirements).</li>
          <li>Withdraw consent for marketing communications.</li>
          <li>Lodge a complaint with the Indonesian data protection authority.</li>
        </ul>
        <p>
          To exercise these rights, contact <a href="mailto:info@balinusafast.com">info@balinusafast.com</a>.
        </p>

        <h2 id="s6" className={PROSE_H2}>6. Security</h2>
        <p>
          We use industry-standard encryption (HTTPS/TLS) for all data in
          transit. Database access is restricted, payment data is tokenized via
          DOKU, and we log every administrative action. Despite this, no
          internet service can be guaranteed 100% secure.
        </p>

        <h2 id="s7" className={PROSE_H2}>7. Cookies</h2>
        <p>
          Essential cookies (session, sign-in, language, your cookie choice)
          are always on because bookings cannot work without them.
        </p>
        <p>
          With your permission we also use:
        </p>
        <ul>
          <li><strong>Analytics</strong>: Google Analytics and our own visit counts, to understand which pages and routes people look at.</li>
          <li><strong>Marketing</strong>: Google Ads and Meta (Facebook/Instagram) measurement, to learn which of our ads lead to paid bookings.</li>
        </ul>
        <p>
          Both are off until you choose. You can change your choice at any
          time through &quot;Cookie settings&quot; at the bottom of every page.
          Saying no never affects your ability to book or pay.
        </p>

        <h2 id="s8" className={PROSE_H2}>8. Children</h2>
        <p>
          Gilifast is not intended for users under 18. Minors travel under the
          booking of a parent or guardian who accepts these terms on their
          behalf.
        </p>

        <h2 id="s9" className={PROSE_H2}>9. Changes</h2>
        <p>
          Material changes to this policy will be notified by email to active
          account holders at least 30 days before taking effect.
        </p>

        <h2 id="s10" className={PROSE_H2}>10. Contact</h2>
        <p>
          Data Protection Officer · <a href="mailto:info@balinusafast.com">info@balinusafast.com</a><br />
          CV Hi Bali Nusa Tenggara · Jl. Swakarya Raya No.5B, Kekalik Jaya, Kec. Sekarbela, Kota Mataram, Nusa Tenggara Barat 83114, Indonesia
        </p>
      </div>
    </LegalPage>
  );
}
