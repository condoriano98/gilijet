import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { prisma } from "./db";
import { buildQrPayload } from "./qr";
import { renderQrPng } from "./qr-render";
import { formatLocalDate, formatLocalTime } from "./datetime";
import { getPortInfo } from "./port-info";
import { formatIDR } from "./utils";

/**
 * The boarding pass PDF, generated once a booking reaches CONFIRMED.
 *
 * One document per booking: a shared trip header, then a pass card per
 * passenger carrying their own QR. Rendered with react-pdf rather than a
 * headless browser because this runs on Vercel serverless, where shipping a
 * Chromium binary is the difference between a 50 MB function and a 300 MB one.
 *
 * Only CONFIRMED bookings have tickets — see lib/ticket-issuer.ts. Money
 * settling is not enough; an admin has to have reached the operator first.
 */

const INK = "#0f172a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const BRAND = "#0369a1";
const RULE = "#e2e8f0";
const WASH = "#f8fafc";

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 28, paddingHorizontal: 32, fontSize: 9, color: INK },

  brandBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 8,
  },
  brand: { fontSize: 17, color: BRAND, fontFamily: "Helvetica-Bold" },
  kicker: { fontSize: 7.5, color: MUTED, letterSpacing: 1.6, marginTop: 3 },
  refLabel: { fontSize: 7, color: MUTED, letterSpacing: 1.2, textAlign: "right" },
  ref: { fontSize: 13, fontFamily: "Courier-Bold", color: INK, textAlign: "right", marginTop: 2 },

  // Route: the thing a passenger and a gate agent both look for first.
  route: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: WASH,
    borderRadius: 6,
  },
  endpoint: { flex: 1 },
  endpointRight: { flex: 1, alignItems: "flex-end" },
  port: { fontSize: 15, fontFamily: "Helvetica-Bold", color: INK },
  time: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BRAND, marginTop: 3 },
  timeNote: { fontSize: 7, color: MUTED, marginTop: 2 },
  connector: { width: 96, alignItems: "center", paddingHorizontal: 8 },
  connectorLine: { height: 1, backgroundColor: FAINT, width: "100%", marginVertical: 4 },
  duration: { fontSize: 7.5, color: MUTED },

  facts: { flexDirection: "row", marginTop: 14, flexWrap: "wrap" },
  fact: { width: "25%", paddingRight: 10, marginBottom: 10 },
  factWide: { width: "50%", paddingRight: 10, marginBottom: 10 },
  label: { fontSize: 6.5, color: MUTED, letterSpacing: 1, marginBottom: 2 },
  value: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  valueSmall: { fontSize: 8, lineHeight: 1.35 },

  sectionTitle: {
    fontSize: 8,
    color: MUTED,
    letterSpacing: 1.4,
    marginTop: 14,
    marginBottom: 6,
  },

  pass: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: RULE,
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  passBody: { flex: 1, paddingRight: 12 },
  seq: { fontSize: 6.5, color: FAINT, letterSpacing: 1 },
  passenger: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  ticketCode: { fontSize: 8.5, fontFamily: "Courier", color: MUTED, marginTop: 3 },
  idNote: { fontSize: 7.5, color: MUTED, marginTop: 5, lineHeight: 1.35 },
  // The perforation a paper ticket would have; sells the "tear here" idea.
  stub: {
    borderLeftWidth: 1,
    borderLeftColor: RULE,
    borderLeftStyle: "dashed",
    paddingLeft: 12,
    alignItems: "center",
  },
  qr: { width: 84, height: 84 },
  scanNote: { fontSize: 6, color: FAINT, marginTop: 3 },

  notice: {
    marginTop: 4,
    padding: 10,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 5,
  },
  noticeTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#92400e" },
  noticeBody: { fontSize: 7.5, color: "#92400e", marginTop: 3, lineHeight: 1.45 },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: RULE,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 6.5, color: FAINT },
});

export type BoardingPassData = {
  bookingReference: string;
  customerName: string;
  originPort: string;
  destinationPort: string;
  departureDate: Date;
  arrivalDate: Date;
  durationMinutes: number;
  boatName: string;
  operatorName: string;
  operatorPhone: string;
  totalAmount: number;
  dockAddress: string;
  dockTip: string;
  arrivalBuffer: number;
  passengers: { name: string; ticketCode: string; qr: Buffer }[];
};

/** Trailing passenger index of a ticket code; 0 when it has no numeric tail. */
function passengerIndex(ticketCode: string): number {
  const m = ticketCode.match(/-(\d+)$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Tickets in passenger order.
 *
 * Ticket codes end in the passenger index (see lib/references.ts), so this
 * sorts on that number rather than the string: compared as text, "…-10" comes
 * before "…-2" and a group of ten is listed in the wrong order.
 */
export function orderPassengerTickets<T extends { ticketCode: string }>(
  tickets: T[],
): T[] {
  return [...tickets].sort(
    (a, b) => passengerIndex(a.ticketCode) - passengerIndex(b.ticketCode),
  );
}

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function BoardingPassDocument({ data }: { data: BoardingPassData }) {
  const dep = data.departureDate;
  return (
    <Document
      title={`Gilifast boarding pass ${data.bookingReference}`}
      author="Gilifast"
      subject={`${data.originPort} to ${data.destinationPort}`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.brandBar}>
          <View>
            <Text style={s.brand}>Gilifast</Text>
            <Text style={s.kicker}>BOARDING PASS</Text>
          </View>
          <View>
            <Text style={s.refLabel}>BOOKING CODE</Text>
            <Text style={s.ref}>{data.bookingReference}</Text>
          </View>
        </View>

        <View style={s.route}>
          <View style={s.endpoint}>
            <Text style={s.port}>{data.originPort}</Text>
            <Text style={s.time}>{formatLocalTime(dep)}</Text>
            <Text style={s.timeNote}>
              {formatLocalDate(dep, "EEE, dd MMM yyyy")} · WITA
            </Text>
          </View>
          <View style={s.connector}>
            <Text style={s.duration}>{durationLabel(data.durationMinutes)}</Text>
            <View style={s.connectorLine} />
            <Text style={s.duration}>by boat</Text>
          </View>
          <View style={s.endpointRight}>
            <Text style={s.port}>{data.destinationPort}</Text>
            <Text style={s.time}>{formatLocalTime(data.arrivalDate)}</Text>
            <Text style={s.timeNote}>estimated arrival</Text>
          </View>
        </View>

        <View style={s.facts}>
          <View style={s.fact}>
            <Text style={s.label}>BOAT</Text>
            <Text style={s.value}>{data.boatName}</Text>
          </View>
          <View style={s.fact}>
            <Text style={s.label}>OPERATOR</Text>
            <Text style={s.value}>{data.operatorName}</Text>
          </View>
          <View style={s.fact}>
            <Text style={s.label}>PASSENGERS</Text>
            <Text style={s.value}>{data.passengers.length}</Text>
          </View>
          <View style={s.fact}>
            <Text style={s.label}>TOTAL PAID</Text>
            <Text style={s.value}>{formatIDR(data.totalAmount)}</Text>
          </View>
          <View style={s.factWide}>
            <Text style={s.label}>DEPARTURE DOCK</Text>
            <Text style={s.valueSmall}>{data.dockAddress}</Text>
          </View>
          <View style={s.factWide}>
            <Text style={s.label}>BOOKED BY</Text>
            <Text style={s.valueSmall}>{data.customerName}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>PASSENGERS</Text>
        {data.passengers.map((p, i) => (
          <View key={p.ticketCode} style={s.pass} wrap={false}>
            <View style={s.passBody}>
              <Text style={s.seq}>
                PASSENGER {i + 1} OF {data.passengers.length}
              </Text>
              <Text style={s.passenger}>{p.name}</Text>
              <Text style={s.ticketCode}>{p.ticketCode}</Text>
              <Text style={s.idNote}>
                Bring a government ID whose name matches this pass. Boarding
                closes {data.arrivalBuffer} minutes before departure.
              </Text>
            </View>
            <View style={s.stub}>
              {/* react-pdf's Image is a PDF primitive, not an HTML img — it has
                  no alt prop, and a PDF has no screen-reader text layer for one
                  to land in. The adjacent ticket code is the textual equivalent. */}
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image style={s.qr} src={p.qr} />
              <Text style={s.scanNote}>SCAN AT DOCK</Text>
            </View>
          </View>
        ))}

        <View style={s.notice}>
          <Text style={s.noticeTitle}>Before you travel</Text>
          <Text style={s.noticeBody}>
            {data.dockTip} Arrive at least {data.arrivalBuffer} minutes early.
            This pass is valid only for the date, time and route shown above.
            Sailings can be delayed or cancelled by weather or harbourmaster
            instruction — we contact you on the number you booked with.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Operator {data.operatorName} · {data.operatorPhone}
          </Text>
          <Text style={s.footerText}>
            Refunds: 7+ days full · 48h–7 days 50% · under 48h none
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Load a confirmed booking and render its pass.
 *
 * Returns null when the booking is missing, not CONFIRMED, or carries no
 * tickets — callers treat that as "there is no pass yet" rather than an error,
 * because that is the normal state of every booking still waiting on the
 * operator call.
 */
export async function generateBoardingPassPdf(
  bookingReference: string,
): Promise<Buffer | null> {
  const booking = await prisma.booking.findUnique({
    where: { bookingReference },
    include: {
      leg: {
        include: {
          schedule: { include: { boat: { include: { operator: true } } } },
        },
      },
      tickets: true,
    },
  });
  if (!booking || booking.status !== "CONFIRMED") return null;
  if (booking.tickets.length === 0) return null;

  const { leg } = booking;
  const port = getPortInfo(leg.schedule.originPort);

  const ordered = orderPassengerTickets(booking.tickets);

  const passengers = await Promise.all(
    ordered.map(async (t) => ({
      name: t.passengerName,
      ticketCode: t.ticketCode,
      qr: await renderQrPng(buildQrPayload(t.ticketCode, leg.departureDate)),
    })),
  );

  return renderToBuffer(
    <BoardingPassDocument
      data={{
        bookingReference: booking.bookingReference,
        customerName: booking.customerName,
        originPort: leg.schedule.originPort,
        destinationPort: leg.schedule.destinationPort,
        departureDate: leg.departureDate,
        arrivalDate: new Date(
          leg.departureDate.getTime() + leg.schedule.durationMinutes * 60_000,
        ),
        durationMinutes: leg.schedule.durationMinutes,
        boatName: leg.schedule.boat.name,
        operatorName: leg.schedule.boat.operator.companyName,
        operatorPhone: leg.schedule.boat.operator.phoneNumber,
        totalAmount: Number(booking.totalAmount),
        dockAddress: port.address,
        dockTip: port.dockTip,
        arrivalBuffer: port.arrivalBuffer,
        passengers,
      }}
    />,
  );
}

/** Filename used for the attachment, the download and the WhatsApp document. */
export function boardingPassFilename(bookingReference: string): string {
  return `Gilifast-${bookingReference}.pdf`;
}
