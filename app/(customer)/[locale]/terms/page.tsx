import Link from "next/link";

export const metadata = {
  title: "Terms & Conditions",
  description: "Gilibali booking terms, cancellation policy, and refund schedule.",
};

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">
        {n}. {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-sky-700 hover:underline">
          ← Home
        </Link>

        <div className="mt-4 border-b pb-6">
          <h1 className="text-3xl font-bold tracking-tight">GILIBALI.COM</h1>
          <p className="mt-1 text-sm text-slate-600">Fast Boat Ticketing Platform</p>
          <p className="mt-1 text-xs text-slate-500">
            Bali • Gili Trawangan • Gili Air • Gili Meno • Lombok (Bangsal) ·
            Nusa Penida • Nusa Lembongan
          </p>
          <p className="mt-3 font-semibold text-slate-800">
            Terms &amp; Conditions | Refund &amp; Cancellation Policy
          </p>
          <p className="text-xs text-slate-500">
            Effective Date: June 2026 · Version 1.1
          </p>
        </div>

        <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>IMPORTANT:</strong> By purchasing a ticket or using the
          gilibali.com platform, you confirm that you have read, understood, and
          agreed to all Terms &amp; Conditions set out in this document. If you
          do not agree with any part of these terms, please do not proceed with
          your booking.
        </p>

        <Section n="1" title="Definitions">
          <p>In these Terms &amp; Conditions, the following definitions apply:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>&quot;Platform&quot;</strong> means the gilibali.com
              website, mobile application, and all related digital booking
              services.
            </li>
            <li>
              <strong>&quot;Operator&quot; or &quot;Carrier&quot;</strong> means
              the licensed fast boat / speedboat company whose services are
              listed and sold on the Platform (e.g., Eka Jaya Fast Ferry, Wahana
              Gili Ocean, Blue Water Express, and others).
            </li>
            <li>
              <strong>&quot;Passenger&quot;</strong> means any individual who
              purchases or holds a ticket booked through the Platform.
            </li>
            <li>
              <strong>&quot;Ticket&quot;</strong> means the electronic booking
              confirmation or e-ticket issued by the Platform upon successful
              payment.
            </li>
            <li>
              <strong>&quot;Departure Port&quot;</strong> means Serangan
              Harbour, Padang Bai Harbour (Bali), Buyuk Harbour (Nusa Penida),
              Bangsal Harbour (Lombok), or any other port as stated on the
              ticket.
            </li>
            <li>
              <strong>&quot;Departure Date/Time&quot;</strong> means the
              scheduled departure date and time as printed on the ticket.
            </li>
            <li>
              <strong>&quot;High Season&quot;</strong> means the periods of 1
              July – 31 August and 20 December – 5 January each year.
            </li>
            <li>
              <strong>&quot;Force Majeure&quot;</strong> means any event beyond
              the reasonable control of the Platform or Operator, including but
              not limited to adverse weather conditions, natural disasters,
              government directives, or port authority decisions.
            </li>
          </ul>
        </Section>

        <Section n="2" title="About gilibali.com">
          <p>
            2.1 gilibali.com is an independent online ticketing platform that
            facilitates the booking and purchase of fast boat tickets from and
            between Bali, the Gili Islands (Gili Trawangan, Gili Air, Gili
            Meno), Lombok (Bangsal Harbour), Nusa Penida, and Nusa Lembongan.
          </p>
          <p>
            2.2 gilibali.com acts as a ticketing agent and intermediary. We are
            not the owner or operator of any vessel. The contract of carriage is
            between the Passenger and the relevant boat Operator.
          </p>
          <p>
            2.3 While we endeavour to ensure accurate scheduling, pricing, and
            availability information, gilibali.com cannot guarantee information
            provided by third-party Operators and shall not be held liable for
            any inaccuracies.
          </p>
          <p>
            2.4 gilibali.com is operated by CV Hi Bali Nusa Tenggara, a company
            registered in Indonesia. Registered address: Jl. Swakarya Raya
            No.5B, Kekalik Jaya, Kec. Sekarbela, Kota Mataram, Nusa Tenggara
            Barat 83114, Indonesia.
          </p>
        </Section>

        <Section n="3" title="Booking & Payment">
          <p>
            <strong>3.1 Booking Process.</strong> All bookings made through
            gilibali.com are subject to seat availability at the time of
            purchase. A booking is only confirmed upon receipt of full payment
            and issuance of a booking confirmation email and/or e-ticket.
          </p>
          <p>
            <strong>3.2 Payment Methods.</strong> gilibali.com accepts the
            following payment methods:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Credit card (Visa, Mastercard – local and international)</li>
            <li>Debit card</li>
            <li>QRIS (Quick Response Code Indonesian Standard)</li>
            <li>Bank transfer via Virtual Account (BCA, BNI, BRI, Mandiri, and others)</li>
            <li>E-wallet (GoPay, ShopeePay, OVO, DANA, LinkAja)</li>
          </ul>
          <p>
            Payment processing is handled by DOKU, licensed
            payment gateway providers regulated by Bank Indonesia. gilibali.com
            does not store card or bank account details.
          </p>
          <p>
            <strong>3.3 Payment Currency.</strong> All transactions are
            processed in Indonesian Rupiah (IDR). For international card
            payments, your card issuer will apply the applicable exchange rate
            and may charge foreign transaction fees, for which gilibali.com
            bears no responsibility.
          </p>
          <p>
            <strong>3.4 Booking Confirmation.</strong> Upon successful payment, a
            booking confirmation and e-ticket will be sent to the email address
            provided during checkout within 15 minutes. If you do not receive a
            confirmation within 60 minutes, please contact us at
            info@balinusafast.com before assuming the payment has failed.
          </p>
          <p>
            <strong>3.5 Ticket Validity.</strong> Each ticket is valid for the
            specific passenger(s), route, date, and departure time stated on the
            e-ticket. Tickets are non-transferable to other passengers unless
            otherwise approved in writing by gilibali.com.
          </p>
          <p>
            <strong>3.6 Convenience Fee.</strong> A convenience fee or payment
            processing surcharge may be applied to certain payment methods
            (particularly credit card payments). Where applicable, this fee will
            be clearly disclosed at the checkout page before payment is
            confirmed.
          </p>
        </Section>

        <Section n="4" title="Check-in & Boarding">
          <p>
            4.1 Passengers must check in at the designated departure port no
            later than 30 minutes before the scheduled departure time. Check-in
            counters typically open 60 minutes before departure.
          </p>
          <p>
            4.2 Passengers must present a valid e-ticket (printed or digital) and
            a government-issued photo identification (passport, national ID
            card, or driver&apos;s licence) at check-in.
          </p>
          <p>
            4.3 Failure to check in on time will result in forfeiture of the
            seat without refund. gilibali.com and the Operator accept no
            responsibility for late arrivals due to traffic, transfer delays, or
            any other cause.
          </p>
          <p>
            4.4 For routes involving Gili Air, Gili Meno, and Nusa Lembongan,
            passengers should note that check-in may close up to 45 minutes
            before departure due to shuttle transfers between the port and the
            vessel.
          </p>
          <p>
            4.5 The Operator reserves the right to refuse boarding to any
            passenger who, in the reasonable judgment of the vessel&apos;s
            captain or crew, poses a risk to the safety of other passengers or
            crew. In such cases, no refund will be issued.
          </p>
        </Section>

        <Section n="5" title="Cancellation & Refund Policy">
          <p>
            This section incorporates our <strong>Refund &amp; Reschedule
            Policy (Version 1.1, effective 1 June 2026)</strong>. The full,
            standalone version is published at{" "}
            <Link href="/refunds" className="text-sky-700 underline">
              gilibali.com/refunds
            </Link>
            .
          </p>

          <p>
            <strong>5.1 Cancellation by Passenger.</strong> All cancellation
            requests must be submitted in writing via email to
            info@balinusafast.com. Verbal, WhatsApp, or social-media
            cancellations are not accepted unless confirmed by written email. The
            refund you receive depends on how far in advance of departure you let
            us know:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-sky-50 text-left">
                  <th className="border px-3 py-2 font-semibold">When you cancel</th>
                  <th className="border px-3 py-2 font-semibold">What you receive</th>
                  <th className="border px-3 py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border px-3 py-2">More than 7 days (&gt;168 hours) before departure</td>
                  <td className="border px-3 py-2">100% refund</td>
                  <td className="border px-3 py-2">Admin transfer fee may apply</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="border px-3 py-2">48 hours – 7 days before departure</td>
                  <td className="border px-3 py-2">50% refund</td>
                  <td className="border px-3 py-2">Remaining 50% non-refundable — consider rescheduling to keep full value</td>
                </tr>
                <tr>
                  <td className="border px-3 py-2">Less than 48 hours before departure</td>
                  <td className="border px-3 py-2">No refund</td>
                  <td className="border px-3 py-2">Ticket is non-refundable</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="border px-3 py-2">No-show (you did not board)</td>
                  <td className="border px-3 py-2">No refund</td>
                  <td className="border px-3 py-2">Operator manifests are recorded at every departure</td>
                </tr>
                <tr>
                  <td className="border px-3 py-2">Operator cancels (weather / safety / force majeure)</td>
                  <td className="border px-3 py-2">Full refund or free reschedule</td>
                  <td className="border px-3 py-2">Your choice — see Clause 5.5</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            <strong>5.2 How the refund amount is calculated.</strong> Refund
            percentages apply to the base ticket price paid at checkout, excluding
            any payment surcharge or convenience fee. For return journey tickets
            where the outbound leg has already been completed, only the unused
            return leg is covered. Group bookings of 10 or more passengers may be
            subject to different terms — please contact us before booking.
          </p>

          <p>
            <strong>5.3 How to request a refund and processing times.</strong>{" "}
            Email info@balinusafast.com with the subject{" "}
            <em>REFUND REQUEST [your booking code]</em>, including your full name,
            booking code, departure date, and reason. We reply within one
            business day (Mon–Sun, 07:00–20:00 WITA) with a Refund Reference
            Number (RRN) and a secure refund form. After we confirm the refund,
            timing to your original payment method is:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-sky-50 text-left">
                  <th className="border px-3 py-2 font-semibold">Payment method</th>
                  <th className="border px-3 py-2 font-semibold">Estimated time after admin confirms</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border px-3 py-2">E-wallet (GoPay, OVO, DANA, ShopeePay)</td><td className="border px-3 py-2">1–3 business days</td></tr>
                <tr className="bg-slate-50"><td className="border px-3 py-2">QRIS</td><td className="border px-3 py-2">1–3 business days</td></tr>
                <tr><td className="border px-3 py-2">Bank transfer / Virtual Account (Indonesian bank)</td><td className="border px-3 py-2">3–5 business days</td></tr>
                <tr className="bg-slate-50"><td className="border px-3 py-2">Credit / debit card — Indonesian-issued</td><td className="border px-3 py-2">5–10 business days</td></tr>
                <tr><td className="border px-3 py-2">Credit / debit card — international</td><td className="border px-3 py-2">7–14 business days</td></tr>
              </tbody>
            </table>
          </div>

          <p>
            <strong>5.4 Rescheduling &amp; Reschedule Credit.</strong> Reschedule
            requests must reach us at least 48 hours before the original departure
            (96 hours during High Season: 1 July – 31 August and 20 December – 5
            January), subject to seat availability. Your first reschedule is free;
            a second reschedule for the same booking carries an admin fee of IDR
            75,000 per passenger. On approval we issue a Reschedule Credit Code
            equal to the full amount paid, which:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>is valid for 90 days from the date your original booking is cancelled;</li>
            <li>is single-use and tied to your booking email — it cannot be shared or transferred;</li>
            <li>may be used on any route, any operator, and any available departure date;</li>
            <li>is not redeemable during High Season if the requested departure has less than 20% seats remaining;</li>
            <li>requires payment of the difference if the new ticket costs more, and gives no cashback if the new ticket costs less (the credit is used in full).</li>
          </ul>

          <p>
            <strong>5.5 Cancellation by Operator.</strong> If the Operator cancels
            a departure (weather, safety, mechanical, or force majeure),
            gilibali.com will offer, at your choice: (a) a full refund of the
            ticket value paid, or (b) a free reschedule to the next available
            departure on the same route. gilibali.com shall not be liable for
            secondary losses (accommodation, onward flights, pre-booked tours). We
            recommend travelling the day before any time-sensitive connection,
            particularly during rainy season (November – March).
          </p>

          <p>
            <strong>5.6 No-shows.</strong> If you do not arrive by the check-in
            deadline (30 minutes before departure) and the boat sails without you,
            the ticket is forfeited — no refund, credit, or rebooking.{" "}
            <em>Documented medical emergencies:</em> if you missed your departure
            due to a genuine medical emergency, contact info@balinusafast.com
            within 48 hours with a medical certificate from a registered
            healthcare provider; we review such cases individually.
          </p>

          <p>
            <strong>5.7 Refund method.</strong> Refunds are always returned to the
            original payment method used at purchase. We cannot redirect a refund
            to a different account, except where the original method is no longer
            active (e.g. an expired card), in which case we will agree an
            alternative in writing.
          </p>

          <p>
            <strong>5.8 Weather &amp; Force Majeure.</strong> Fast boat services
            are subject to sea and weather conditions. Departures may be delayed,
            diverted, or cancelled at the discretion of the vessel captain or port
            authority; in such cases the options in Clause 5.5 apply.
          </p>
        </Section>

        <Section n="6" title="Luggage & Personal Belongings">
          <p>
            6.1 <strong>Standard Allowance:</strong> Each passenger is permitted
            a maximum of two (2) pieces of checked baggage with a combined weight
            not exceeding 25 kg, plus one small carry-on item.
          </p>
          <p>
            6.2 <strong>Excess Luggage:</strong> Baggage exceeding the allowance
            may be refused by the Operator at the port, or may incur additional
            charges payable directly to the Operator.
          </p>
          <p>
            6.3 <strong>Liability for Luggage:</strong> The Operator and
            gilibali.com accept no responsibility for loss, damage, or theft of
            passenger luggage during transit, port handling, or shuttle
            transfers. Passengers are strongly advised to arrange comprehensive
            travel insurance.
          </p>
          <p>
            6.4 <strong>Prohibited Items:</strong> The following items are not
            permitted on board any vessel: flammable materials, explosives,
            weapons, narcotics and controlled substances, and any items
            prohibited under Indonesian law or maritime regulations.
          </p>
        </Section>

        <Section n="7" title="Passenger Responsibilities & Conduct">
          <p>
            7.1 Passengers must comply with all instructions given by the vessel
            captain, crew, and port staff at all times.
          </p>
          <p>
            7.2 Passengers must not engage in disruptive, aggressive, or
            dangerous behaviour on board or at the port.
          </p>
          <p>
            7.3 Passengers are responsible for their own safety, including
            wearing a life jacket when instructed by crew.
          </p>
          <p>
            7.4 Sea crossings can be rough, particularly in adverse weather.
            Passengers with medical conditions, pregnant passengers, infants, and
            the elderly should seek medical advice before travelling. gilibali.com
            and the Operator accept no liability for sea sickness or medical
            incidents during transit.
          </p>
          <p>
            7.5 Passengers travelling with children under 2 years of age are
            advised that sea conditions may be unsuitable for infants. This is the
            sole responsibility of the accompanying adult.
          </p>
          <p>
            7.6 Passengers must ensure they hold valid travel documents, including
            visas if required. gilibali.com accepts no responsibility for denied
            entry or boarding due to insufficient travel documentation.
          </p>
        </Section>

        <Section n="8" title="Safety Standards">
          <p>
            8.1 All Operators listed on gilibali.com are required to hold valid
            licenses and certifications from Indonesian maritime authorities,
            including compliance with regulations issued by the Directorate
            General of Sea Transportation (Direktorat Jenderal Perhubungan Laut),
            Ministry of Transportation of the Republic of Indonesia.
          </p>
          <p>
            8.2 All vessels are required to be equipped with life jackets, life
            rafts, GPS navigation, ship-to-shore radio, depth sounders, and fire
            extinguishers.
          </p>
          <p>
            8.3 gilibali.com endeavours to list only reputable and
            safety-compliant Operators; however, gilibali.com does not
            independently inspect or certify any vessel and cannot guarantee the
            safety standards of third-party Operators.
          </p>
          <p>
            8.4 Passenger accident insurance is included in tickets provided by
            participating Operators. Coverage details are subject to the
            Operator&apos;s insurance policy. Passengers are strongly encouraged
            to purchase comprehensive travel insurance independently.
          </p>
        </Section>

        <Section n="9" title="Intellectual Property & Website Use">
          <p>
            9.1 All content on gilibali.com — including but not limited to text,
            images, logos, route maps, pricing information, and booking system
            interfaces — is the intellectual property of gilibali.com or its
            content licensors and is protected under the copyright laws of
            Indonesia and applicable international treaties.
          </p>
          <p>
            9.2 No content from gilibali.com may be reproduced, distributed,
            modified, or used for commercial purposes without prior written
            consent from gilibali.com.
          </p>
          <p>
            9.3 Automated scraping, crawling, or extraction of pricing or
            scheduling data from gilibali.com is strictly prohibited.
          </p>
        </Section>

        <Section n="10" title="Privacy & Data">
          <p>
            10.1 gilibali.com collects personal data (name, email, phone number,
            nationality, passport number) solely for the purposes of processing
            bookings, issuing tickets, and communicating with passengers about
            their journey.
          </p>
          <p>
            10.2 Passenger data will not be sold or disclosed to third parties
            other than the relevant Operator for the purposes of fulfilling the
            booking.
          </p>
          <p>
            10.3 By making a booking, Passengers consent to gilibali.com
            processing their personal data for the purposes stated in this clause.
          </p>
          <p>
            10.4 Passengers may request deletion of their personal data by
            contacting info@balinusafast.com, subject to legal retention
            requirements.
          </p>
          <p>
            10.5 gilibali.com takes reasonable technical measures to protect
            personal data in accordance with applicable Indonesian data
            protection laws, including Law No. 27 of 2022 on Personal Data
            Protection (Undang-Undang Perlindungan Data Pribadi).
          </p>
        </Section>

        <Section n="11" title="Limitation of Liability">
          <p>11.1 gilibali.com is a ticketing intermediary and shall not be liable for:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Delays, cancellations, diversions, or schedule changes by the Operator;</li>
            <li>Loss, injury, or damage to passengers or their property during transit;</li>
            <li>
              Losses arising from missed connecting flights, accommodation
              bookings, or pre-booked activities as a result of delays or
              cancellations;
            </li>
            <li>Technical failures of the booking platform that are beyond our reasonable control.</li>
          </ul>
          <p>
            11.2 The maximum liability of gilibali.com in any circumstances shall
            not exceed the face value of the ticket(s) purchased.
          </p>
          <p>
            11.3 Nothing in these Terms &amp; Conditions limits liability for
            death or personal injury arising from gross negligence or wilful
            misconduct.
          </p>
        </Section>

        <Section n="12" title="Chargebacks & Payment Disputes">
          <p>
            12.1 By completing a purchase on gilibali.com, Passengers agree that
            once a ticket has been issued and the relevant service has been
            provided (i.e., boarding has taken place), they waive the right to
            initiate a chargeback, payment reversal, or dispute through their card
            issuer or bank for that transaction.
          </p>
          <p>
            12.2 For service failures or disputes, Passengers are required to
            contact gilibali.com in writing at info@balinusafast.com before
            initiating any bank or card dispute. gilibali.com will endeavour to
            resolve all legitimate complaints within 5 business days.
          </p>
          <p>
            12.3 Fraudulent or unjustified chargeback attempts may result in
            cancellation of the booking and blacklisting from the Platform.
          </p>
        </Section>

        <Section n="13" title="Modifications to Terms">
          <p>
            13.1 gilibali.com reserves the right to amend these Terms &amp;
            Conditions at any time. The most current version will be published at
            gilibali.com/terms. By continuing to use the Platform after any such
            amendment, Passengers accept the updated terms.
          </p>
          <p>
            13.2 gilibali.com reserves the right to modify prices, schedules, and
            route availability without prior notice. Prices confirmed at the time
            of payment will be honoured for confirmed bookings.
          </p>
        </Section>

        <Section n="14" title="Governing Law & Dispute Resolution">
          <p>
            14.1 These Terms &amp; Conditions are governed by and construed in
            accordance with the laws of the Republic of Indonesia.
          </p>
          <p>
            14.2 In the event of a dispute, the parties agree to first attempt
            resolution through good-faith negotiation. If unresolved within 30
            days, disputes shall be submitted to the jurisdiction of the District
            Court of Denpasar (Pengadilan Negeri Denpasar), Bali, Indonesia.
          </p>
        </Section>

        <Section n="15" title="Contact Information">
          <p>
            For any queries regarding bookings, cancellations, refunds, or these
            Terms &amp; Conditions, please contact us:
          </p>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="font-semibold">Website:</dt>
            <dd>www.gilibali.com</dd>
            <dt className="font-semibold">Email:</dt>
            <dd>info@balinusafast.com</dd>
            <dt className="font-semibold">WhatsApp:</dt>
            <dd>+62 812-3606-1818</dd>
            <dt className="font-semibold">Office:</dt>
            <dd>
              Jl. Swakarya Raya No.5B, Kekalik Jaya, Kec. Sekarbela, Kota
              Mataram, Nusa Tenggara Barat 83114, Indonesia
            </dd>
            <dt className="font-semibold">Hours:</dt>
            <dd>Monday – Sunday, 07:00 – 20:00 WITA (Central Indonesia Time, GMT+8)</dd>
          </dl>
        </Section>

        <p className="mt-8 border-t pt-6 text-sm text-slate-600">
          By completing a purchase on gilibali.com, you confirm that you have
          read and agreed to these Terms &amp; Conditions.
          <br />
          <span className="text-slate-400">
            gilibali.com — Your Gateway to the Gili Islands
          </span>
        </p>
      </div>
    </div>
  );
}
