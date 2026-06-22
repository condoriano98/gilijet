import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderQrSvgDataUrl } from "@/lib/qr-render";
import { buildQrPayload } from "@/lib/qr";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { getPortInfo } from "@/lib/port-info";
import { PrintButton } from "./print-button";

/**
 * Print-optimised ticket page. The customer opens this in a new tab and
 * uses the OS print dialog to save as PDF. Lives outside the (customer)
 * route group so the marketing header/footer don't appear on the printed
 * sheet.
 */
export default async function PrintTicketPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: {
      leg: {
        include: {
          schedule: { include: { boat: { include: { operator: true } } } },
        },
      },
      tickets: { orderBy: { ticketCode: "asc" } },
    },
  });
  if (!booking || booking.status !== "CONFIRMED") notFound();

  const ticketSvgs: Array<{
    ticketCode: string;
    passengerName: string;
    qrDataUrl: string;
  }> = [];
  for (const t of booking.tickets) {
    const qrDataUrl = await renderQrSvgDataUrl(
      buildQrPayload(t.ticketCode, booking.leg.departureDate),
    );
    ticketSvgs.push({
      ticketCode: t.ticketCode,
      passengerName: t.passengerName,
      qrDataUrl,
    });
  }

  const portInfo = getPortInfo(booking.leg.schedule.originPort);

  return (
    <div style={{ background: "white", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" }}>
      <style>{`
        @page { margin: 12mm; size: A4; }
        .print-page * { box-sizing: border-box; }
        .print-header { border-bottom: 2px solid #0369a1; padding-bottom: 12px; margin-bottom: 16px; }
        .print-brand { font-size: 22px; font-weight: 700; color: #0369a1; }
        .print-ref { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 14px; color: #475569; }
        .print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
        .print-label { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
        .print-value { font-size: 14px; font-weight: 600; }
        .print-ticket {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          page-break-inside: avoid;
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 16px;
          align-items: center;
        }
        .print-qr { width: 140px; height: 140px; }
        .print-passenger { font-size: 16px; font-weight: 700; }
        .print-ticket-code { font-family: ui-monospace, monospace; font-size: 12px; color: #475569; margin-top: 4px; }
        .print-footer { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b; }
        .print-actions { padding: 0 0 16px; }
        .print-actions button {
          background: #0369a1; color: white; border: 0; border-radius: 6px;
          padding: 8px 14px; font-size: 13px; cursor: pointer;
        }
        @media print {
          .no-print { display: none !important; }
          body, html { background: white !important; }
        }
      `}</style>

      <div className="print-page">
        <div className="print-actions no-print">
          <PrintButton />
        </div>

        <div className="print-header">
          <div className="print-brand">Gilijet · Boarding Pass</div>
          <div className="print-ref">Booking {booking.bookingReference}</div>
        </div>

        <div className="print-grid">
          <div>
            <div className="print-label">Route</div>
            <div className="print-value">
              {booking.leg.schedule.originPort} →{" "}
              {booking.leg.schedule.destinationPort}
            </div>
          </div>
          <div>
            <div className="print-label">Departure</div>
            <div className="print-value">
              {formatLocalDate(booking.leg.departureDate, "EEE, dd MMM yyyy")} ·{" "}
              {formatLocalTime(booking.leg.departureDate)} WITA
            </div>
          </div>
          <div>
            <div className="print-label">Operator</div>
            <div className="print-value">
              {booking.leg.schedule.boat.operator.companyName}
            </div>
          </div>
          <div>
            <div className="print-label">Boat</div>
            <div className="print-value">{booking.leg.schedule.boat.name}</div>
          </div>
          <div>
            <div className="print-label">Dock</div>
            <div className="print-value" style={{ fontSize: 12 }}>
              {portInfo.address}
            </div>
          </div>
          <div>
            <div className="print-label">Total paid</div>
            <div className="print-value">
              {formatIDR(Number(booking.totalAmount))}
            </div>
          </div>
        </div>

        {ticketSvgs.map((t) => (
          <div key={t.ticketCode} className="print-ticket">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="print-qr"
              src={t.qrDataUrl}
              alt={`QR code for ticket ${t.ticketCode}`}
            />
            <div>
              <div className="print-passenger">{t.passengerName}</div>
              <div className="print-ticket-code">{t.ticketCode}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
                Show this QR at the dock. Arrive {portInfo.arrivalBuffer} minutes
                before departure with a matching government ID.
              </div>
            </div>
          </div>
        ))}

        <div className="print-footer">
          Operator contact: {booking.leg.schedule.boat.operator.phoneNumber} ·
          Refund policy: 7+ days = full · 48h-7 days = 50% · under 48h = none. This
          ticket is valid only for the date, time, and route printed above.
        </div>
      </div>
    </div>
  );
}

