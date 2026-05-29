import Link from "next/link";

export const metadata = { title: "Refund Policy · Gilijet" };

export default function RefundsPage() {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl prose prose-slate prose-sm">
        <Link href="/" className="text-sm text-sky-700 no-underline hover:underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Refund Policy</h1>
        <p className="text-sm text-slate-500">Last updated: 19 May 2026</p>

        <h2 className="mt-6 text-xl font-semibold">Customer-Initiated Cancellations</h2>
        <p>The refund you receive depends on how far in advance you cancel:</p>

        <div className="my-6 overflow-hidden rounded-lg border not-prose">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Time before departure</th>
                <th className="px-4 py-3 text-left font-semibold">Refund amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-4 py-3">More than 7 days (168 hrs)</td>
                <td className="px-4 py-3 text-green-700 font-semibold">100%</td>
              </tr>
              <tr>
                <td className="px-4 py-3">48 hours to 7 days</td>
                <td className="px-4 py-3 text-amber-700 font-semibold">50%</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Less than 48 hours</td>
                <td className="px-4 py-3 text-red-700 font-semibold">No refund</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-6 text-xl font-semibold">Operator-Initiated Cancellations</h2>
        <p>
          If your operator cancels the trip for any reason — including bad
          weather, mechanical issues, port closures, or insufficient bookings —
          you receive a <strong>100% refund</strong> regardless of how close to
          departure the cancellation occurs. We will notify you by email and
          WhatsApp.
        </p>

        <h2 className="mt-6 text-xl font-semibold">How to Request a Refund</h2>
        <ol>
          <li>Open your booking via the <Link href="/b">Find booking</Link> page.</li>
          <li>Enter your booking reference (sent to your email).</li>
          <li>Click <em>Cancel booking</em> and confirm your email.</li>
          <li>The refund is initiated immediately and arrives in 1-3 business days.</li>
        </ol>

        <h2 className="mt-6 text-xl font-semibold">Refund Method</h2>
        <p>
          Refunds are credited back to the original payment method (e.g. the
          same e-wallet, bank account, or card you used to pay). We cannot
          redirect a refund to a different account.
        </p>

        <h2 className="mt-6 text-xl font-semibold">Processing Time</h2>
        <ul>
          <li><strong>E-wallets (GoPay, OVO, DANA):</strong> Instant to 24 hours</li>
          <li><strong>QRIS:</strong> 1-2 business days</li>
          <li><strong>Bank transfer (Virtual Account):</strong> 1-3 business days</li>
          <li><strong>International cards:</strong> 5-14 business days (bank-dependent)</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">No-Shows</h2>
        <p>
          If you do not arrive at the departure point and the boat sails
          without you, the ticket is forfeit. There is no refund or rebooking
          for no-shows.
        </p>

        <h2 className="mt-6 text-xl font-semibold">Disputes</h2>
        <p>
          If you believe a refund was processed incorrectly, contact us at
          <a href="mailto:support@gilijet.com"> support@gilijet.com</a> within
          14 days of the original transaction. We&apos;ll investigate and respond
          within 5 business days.
        </p>
      </div>
    </div>
  );
}
