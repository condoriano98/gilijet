import { notFound } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { getOperatorLeg } from "@/lib/operator-data";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { PrintButton } from "../../b/[reference]/print-button";

/**
 * Print-optimised passenger manifest for operators. Operator opens this and
 * saves as PDF for the harbor authority. Lives outside the operator layout
 * so the dashboard chrome doesn't print.
 */
export default async function PrintManifestPage({
  params,
}: {
  params: Promise<{ legId: string }>;
}) {
  const session = await requireOperator();
  const { legId } = await params;

  const leg = await getOperatorLeg(session.sub, legId);
  if (!leg) notFound();

  const confirmedBookings = leg.bookings.filter((b) => b.status === "CONFIRMED");
  const rows = confirmedBookings.flatMap((b) =>
    b.tickets.map((t) => ({
      ticketCode: t.ticketCode,
      passengerName: t.passengerName,
      passengerIdNumber: t.passengerIdNumber ?? "—",
      status: t.status,
      bookingReference: b.bookingReference,
    })),
  );
  const checkedIn = rows.filter((r) => r.status === "CHECKED_IN").length;

  return (
    <div style={{ background: "white", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" }}>
      <style>{`
        @page { margin: 12mm; size: A4; }
        .m-header { border-bottom: 2px solid #0369a1; padding-bottom: 12px; margin-bottom: 16px; }
        .m-brand { font-size: 20px; font-weight: 700; color: #0369a1; }
        .m-sub { font-size: 13px; color: #475569; margin-top: 4px; }
        .m-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0 20px; }
        .m-label { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
        .m-value { font-size: 13px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; border-bottom: 2px solid #cbd5e1; padding: 6px 8px; font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
        td { border-bottom: 1px solid #e2e8f0; padding: 8px; }
        tr { page-break-inside: avoid; }
        .m-code { font-family: ui-monospace, monospace; font-size: 11px; }
        .m-sign { width: 90px; }
        .m-footer { margin-top: 20px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b; }
        .m-actions { padding: 0 0 16px; }
        @media print { .no-print { display: none !important; } body, html { background: white !important; } }
      `}</style>

      <div className="m-actions no-print">
        <PrintButton />
      </div>

      <div className="m-header">
        <div className="m-brand">Gilijet · Passenger Manifest</div>
        <div className="m-sub">
          {leg.schedule.originPort} → {leg.schedule.destinationPort}
        </div>
      </div>

      <div className="m-grid">
        <div>
          <div className="m-label">Departure</div>
          <div className="m-value">
            {formatLocalDate(leg.departureDate, "EEE, dd MMM yyyy")} ·{" "}
            {formatLocalTime(leg.departureDate)} WITA
          </div>
        </div>
        <div>
          <div className="m-label">Boat</div>
          <div className="m-value">{leg.schedule.boat.name}</div>
        </div>
        <div>
          <div className="m-label">Passengers</div>
          <div className="m-value">
            {rows.length} total · {checkedIn} checked in
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ textAlign: "center", color: "#64748b", padding: "40px 0" }}>
          No confirmed passengers for this departure.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>Passenger</th>
              <th>ID Number</th>
              <th>Ticket</th>
              <th>Booking</th>
              <th>Status</th>
              <th className="m-sign">Signature</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.ticketCode}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{r.passengerName}</td>
                <td>{r.passengerIdNumber}</td>
                <td className="m-code">{r.ticketCode}</td>
                <td className="m-code">{r.bookingReference}</td>
                <td>{r.status === "CHECKED_IN" ? "Checked in" : "Awaiting"}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="m-footer">
        Generated {formatLocalDate(new Date(), "dd MMM yyyy")}{" "}
        {formatLocalTime(new Date())} WITA · This manifest lists all confirmed
        passengers for the departure above. Verify each passenger against a
        government ID at boarding.
      </div>
    </div>
  );
}
