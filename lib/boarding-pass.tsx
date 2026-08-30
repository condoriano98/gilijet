import React from "react";
import {
  Circle,
  Document,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
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
import { env } from "./env";
import { BOARDING_PASS_BANNER } from "./boarding-pass-banner";

/**
 * The boarding pass PDF, generated once a booking reaches CONFIRMED.
 *
 * One landscape page per passenger: the shared trip on the left, that
 * passenger's own QR on a perforated stub at the right. A page each rather than
 * one shared QR because tickets are minted per passenger and
 * app/api/operator/checkin/route.ts scans once per passenger — a single code for
 * a party of four cannot be checked in four times.
 *
 * Rendered with react-pdf rather than a headless browser because this runs on
 * Vercel serverless, where shipping a Chromium binary is the difference between
 * a 50 MB function and a 300 MB one.
 *
 * Only CONFIRMED bookings have tickets — see lib/ticket-issuer.ts. Money
 * settling is not enough; an admin has to have reached the operator first.
 */

const NAVY = "#13315C";
const NAVY_DEEP = "#0E2645";
const TEAL = "#2BA6C4";
const TEAL_LIGHT = "#8ED6E6";
const INK = "#0f172a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const RULE = "#e2e8f0";
const WASH = "#F5F9FB";

const PANEL = 68; // % of the page width before the perforation
const PAD = 22;

const s = StyleSheet.create({
  page: { flexDirection: "row", fontSize: 8.5, color: INK, backgroundColor: "#fff" },

  // ---------- left panel ----------
  panel: { width: `${PANEL}%`, paddingBottom: 0 },

  header: { flexDirection: "row", alignItems: "stretch", height: 108 },
  headerBrand: { width: "44%", paddingTop: PAD, paddingLeft: PAD, paddingRight: 10 },
  wordmarkRow: { flexDirection: "row", alignItems: "baseline", marginTop: 5 },
  wordGili: { fontSize: 23, fontFamily: "Helvetica-BoldOblique", color: NAVY, letterSpacing: -0.5 },
  wordFast: { fontSize: 23, fontFamily: "Helvetica-BoldOblique", color: TEAL, letterSpacing: -0.5 },
  tagline: { fontSize: 7, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 4 },
  headerArt: { width: "56%" },
  banner: { width: "100%", height: "100%", objectFit: "cover" },

  eticketRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: PAD, marginTop: 12 },
  eticketDot: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: TEAL,
    alignItems: "center", justifyContent: "center", marginRight: 8,
  },
  eticketTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 0.5 },
  eticketNote: { fontSize: 6.5, color: MUTED, letterSpacing: 0.8, marginTop: 2 },

  // Route: the thing a passenger and a dock agent both look for first.
  route: {
    marginHorizontal: PAD, marginTop: 12, backgroundColor: NAVY,
    borderRadius: 8, paddingVertical: 20, paddingHorizontal: 18,
    flexDirection: "row", alignItems: "center",
  },
  endpoint: { flex: 1 },
  endpointRight: { flex: 1, alignItems: "flex-end" },
  portName: { fontSize: 14.5, fontFamily: "Helvetica-Bold", color: "#fff" },
  portSub: { fontSize: 6.5, color: TEAL_LIGHT, marginTop: 2 },
  bigTime: { fontSize: 27, fontFamily: "Helvetica-Bold", color: "#fff", marginTop: 6 },
  routeDate: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: TEAL, marginTop: 2 },
  connector: { width: 108, alignItems: "center", paddingHorizontal: 6 },
  dashRow: { flexDirection: "row", alignItems: "center", width: "100%", marginVertical: 3 },
  dash: { flex: 1, borderTopWidth: 1, borderTopColor: "#4A6B94", borderTopStyle: "dashed" },
  connectorLabel: { fontSize: 6, color: TEAL_LIGHT },
  connectorValue: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff" },

  tiles: {
    marginHorizontal: PAD, marginTop: 12, flexDirection: "row",
    borderWidth: 1, borderColor: RULE, borderRadius: 8, paddingVertical: 15,
  },
  tile: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  tileDivider: { width: 1, backgroundColor: RULE, marginVertical: 2 },
  tileLabel: { fontSize: 5.8, color: MUTED, letterSpacing: 0.9, marginTop: 5 },
  tileValue: {
    fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 3, textAlign: "center",
  },
  tileNote: { fontSize: 6, color: MUTED, marginTop: 2, textAlign: "center" },

  lower: { flexDirection: "row", marginHorizontal: PAD, marginTop: 12, flex: 1 },
  card: { borderRadius: 8, padding: 13 },
  notesCard: { flex: 1, backgroundColor: "#F0F9FB", marginRight: 8 },
  checkinCard: { flex: 1.15, borderWidth: 1, borderColor: RULE },
  cardHeadRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  cardTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 0.6, marginLeft: 5 },
  bullet: { flexDirection: "row", marginTop: 5 },
  bulletDot: { fontSize: 7.2, color: TEAL, marginRight: 5 },
  bulletText: { fontSize: 7.2, color: "#334155", lineHeight: 1.45, flex: 1 },
  harbour: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: NAVY },
  harbourSub: { fontSize: 7, color: MUTED, marginTop: 1 },
  address: { fontSize: 7.2, color: "#334155", lineHeight: 1.45, marginTop: 5 },
  checkinTimeRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  checkinTime: { fontSize: 8, fontFamily: "Helvetica-Bold", color: TEAL, marginLeft: 5 },

  footer: {
    marginTop: "auto", backgroundColor: NAVY, marginHorizontal: PAD, marginBottom: PAD,
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  footerItem: { flexDirection: "row", alignItems: "center" },
  footerText: { fontSize: 6.5, color: "#fff", marginLeft: 4 },
  footerThanks: { fontSize: 6.5, color: TEAL_LIGHT },

  // ---------- perforation + stub ----------
  perf: { width: 1, borderLeftWidth: 1, borderLeftColor: RULE, borderLeftStyle: "dashed" },
  stub: { width: `${100 - PANEL}%`, paddingHorizontal: 16, paddingTop: PAD, paddingBottom: PAD },
  stubPill: {
    alignSelf: "center", backgroundColor: NAVY, borderRadius: 12,
    paddingVertical: 5, paddingHorizontal: 22,
  },
  stubPillText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff", letterSpacing: 1.4 },
  stubLabel: { fontSize: 7, color: MUTED, letterSpacing: 1, textAlign: "center", marginTop: 12 },
  stubCode: {
    fontSize: 17, fontFamily: "Courier-Bold", color: TEAL, textAlign: "center", marginTop: 3,
  },
  qrWrap: { alignItems: "center", marginTop: 10 },
  qr: { width: 124, height: 124 },
  scanNote: { fontSize: 6.5, color: MUTED, textAlign: "center", marginTop: 5 },
  ticketCode: { fontSize: 6.5, fontFamily: "Courier", color: FAINT, textAlign: "center", marginTop: 2 },

  stubDivider: {
    borderTopWidth: 1, borderTopColor: RULE, borderTopStyle: "dashed", marginVertical: 12,
  },
  summaryHead: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  summaryTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 0.6, marginLeft: 5 },
  summaryRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4,
  },
  summaryKey: { fontSize: 6.8, color: MUTED },
  summaryVal: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: INK },
  totalRule: { borderTopWidth: 1, borderTopColor: RULE, marginTop: 8, paddingTop: 6 },
  totalKey: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 0.5 },
  totalVal: { fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY },
  paidBadge: {
    alignSelf: "center", backgroundColor: "#DCFCE7", borderRadius: 9,
    paddingVertical: 3, paddingHorizontal: 26, marginTop: 7,
  },
  paidText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#15803D", letterSpacing: 1 },

  helpCard: {
    marginTop: "auto", backgroundColor: NAVY, borderRadius: 8, padding: 10, flexDirection: "row",
  },
  helpTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", letterSpacing: 0.6 },
  helpLine: { fontSize: 6.5, color: TEAL_LIGHT, marginTop: 3 },
  helpPhone: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fff", marginTop: 2 },
});

/* ---------------------------------------------------------------- marks ---- */

/**
 * The Gilifast speedboat, redrawn from components/customer/logo.tsx.
 *
 * Same path data and the same brand fills, so the pass and the site header are
 * literally the same mark rather than two drawings that drift apart.
 */
function BoatMark({ width = 46 }: { width?: number }) {
  return (
    <Svg width={width} height={width * (112 / 200)} viewBox="0 0 200 112">
      <Path d="M22 52 C70 51,132 45,190 28 C184 45,172 60,152 69 L62 76 C38 76,24 66,22 52 Z" fill={NAVY} />
      <Path d="M158 41 C144 27,132 20,117 20 L104 20 L99 47 Z" fill={NAVY} />
      <Path d="M28 60 C82 58,134 50,182 34 L176 43 C130 57,80 65,30 66 Z" fill={TEAL} />
      <Path d="M112 27 C124 27,134 32,144 41 L110 43 Z" fill={TEAL_LIGHT} />
      <Path d="M2 90 C30 80,74 77,120 82 C128 83,132 85,128 87 C88 91,40 94,2 90 Z" fill={TEAL} />
      <Path d="M46 103 C68 97,106 96,144 99 C114 106,72 108,46 103 Z" fill={TEAL_LIGHT} />
    </Svg>
  );
}

function TicketGlyph({ size = 11, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 8 A2 2 0 0 0 5 6 L19 6 A2 2 0 0 0 21 8 L21 10 A2 2 0 0 0 21 14 L21 16 A2 2 0 0 0 19 18 L5 18 A2 2 0 0 0 3 16 L3 14 A2 2 0 0 0 3 10 Z"
        fill={color}
      />
    </Svg>
  );
}

function PinGlyph({ size = 10, color = TEAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2 C8 2 5 5 5 9 C5 14 12 22 12 22 C12 22 19 14 19 9 C19 5 16 2 12 2 Z" fill={color} />
      <Circle cx="12" cy="9" r="2.6" fill="#fff" />
    </Svg>
  );
}

function ClockGlyph({ size = 10, color = TEAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9.5" fill={color} />
      <Path d="M11.1 6 L12.9 6 L12.9 12.2 L17.4 14.8 L16.5 16.4 L11.1 13.2 Z" fill="#fff" />
    </Svg>
  );
}

function InfoGlyph({ size = 10, color = TEAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9.5" fill={color} />
      <Circle cx="12" cy="7.6" r="1.4" fill="#fff" />
      <Path d="M10.9 10.4 L13.1 10.4 L13.1 17 L10.9 17 Z" fill="#fff" />
    </Svg>
  );
}

function SummaryGlyph({ size = 10, color = TEAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 2 L15 2 L19 6 L19 22 L5 22 Z" fill={color} />
      <Path d="M8 11 L16 11 L16 12.6 L8 12.6 Z M8 15 L16 15 L16 16.6 L8 16.6 Z" fill="#fff" />
    </Svg>
  );
}

function PersonGlyph({ size = 13, color = TEAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="7.5" r="4" fill={color} />
      <Path d="M3.5 21 C3.5 16.3 7.3 13.5 12 13.5 C16.7 13.5 20.5 16.3 20.5 21 Z" fill={color} />
    </Svg>
  );
}

function CalendarGlyph({ size = 13, color = TEAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 5 L20 5 L20 21 L4 21 Z" fill={color} />
      <Path d="M4 5 L20 5 L20 9 L4 9 Z" fill={NAVY} />
      <Path d="M7 11.5 L10 11.5 L10 14 L7 14 Z M14 11.5 L17 11.5 L17 14 L14 14 Z M7 16 L10 16 L10 18.5 L7 18.5 Z" fill="#fff" />
    </Svg>
  );
}

/** `accent` is the cabin: it has to contrast with whatever sits behind it. */
function BoatGlyph({
  size = 13,
  color = TEAL,
  accent = NAVY,
}: {
  size?: number;
  color?: string;
  accent?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 15 L21 15 C20 19 17 21 12 21 C7 21 4 19 3 15 Z" fill={color} />
      <Path d="M6 13 L6 7 L13 7 L17 13 Z" fill={accent} />
    </Svg>
  );
}

/** Dashed run with an arrowhead, sized to the connector column. */
function RouteArrow({ width = 96 }: { width?: number }) {
  return (
    <Svg width={width} height={8} viewBox={`0 0 ${width} 8`}>
      <Path
        d={`M0 4 L${width - 7} 4`}
        stroke="#5C7FA8"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <Path d={`M${width - 8} 0.6 L${width} 4 L${width - 8} 7.4 Z`} fill="#5C7FA8" />
    </Svg>
  );
}

function GlobeGlyph({ size = 8, color = TEAL_LIGHT }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9.5" fill={color} />
      <Path d="M2.5 10.6 L21.5 10.6 L21.5 13.4 L2.5 13.4 Z" fill={NAVY} />
      <Path d="M10.6 2.6 L13.4 2.6 L13.4 21.4 L10.6 21.4 Z" fill={NAVY} />
    </Svg>
  );
}

function PhoneGlyph({ size = 8, color = TEAL_LIGHT }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 2 L10 2 L11.6 7 L9 9 C10.2 12 12 13.8 15 15 L17 12.4 L22 14 L22 18 C22 20 20.6 21.4 18.6 21.2 C9.6 20.2 3.8 14.4 2.8 5.4 C2.6 3.4 4 2 6 2 Z"
        fill={color}
      />
    </Svg>
  );
}

function HeadsetGlyph({ size = 15, color = TEAL_LIGHT }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.5 C6.8 2.5 3 6.4 3 11.5 L3 17 L5.4 17 L5.4 11.5 C5.4 7.8 8.3 4.9 12 4.9 C15.7 4.9 18.6 7.8 18.6 11.5 L18.6 17 L21 17 L21 11.5 C21 6.4 17.2 2.5 12 2.5 Z" fill={color} />
      <Path d="M2.2 13.4 L6.4 13.4 L6.4 20 L2.2 20 Z M17.6 13.4 L21.8 13.4 L21.8 20 L17.6 20 Z" fill={color} />
    </Svg>
  );
}

/* ----------------------------------------------------------------- data ---- */

export type BoardingPassData = {
  bookingReference: string;
  bookingDate: Date;
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
  checkInBy: Date;
  refundSummary: string;
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

/** Harbour label for a port, e.g. "Padang Bai" -> "Padang Bai Harbour". */
function harbourName(port: string): string {
  return /harbou?r|pelabuhan|pier|dock/i.test(port) ? port : `${port} Harbour`;
}

/** Host of APP_BASE_URL, for the footer — "https://x/" reads badly on a ticket. */
function siteHost(): string {
  try {
    return new URL(env.APP_BASE_URL).host;
  } catch {
    return "gilifast.com";
  }
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={s.bullet}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

function Tile({
  glyph,
  label,
  value,
  note,
}: {
  glyph: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <View style={s.tile}>
      {glyph}
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={s.tileValue}>{value}</Text>
      {note ? <Text style={s.tileNote}>{note}</Text> : null}
    </View>
  );
}

function PassengerPage({
  data,
  passenger,
  index,
}: {
  data: BoardingPassData;
  passenger: BoardingPassData["passengers"][number];
  index: number;
}) {
  const dep = data.departureDate;
  const total = data.passengers.length;

  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      {/* ------------------------------ left panel ------------------------- */}
      <View style={s.panel}>
        <View style={s.header}>
          <View style={s.headerBrand}>
            <BoatMark />
            <View style={s.wordmarkRow}>
              <Text style={s.wordGili}>GILI</Text>
              <Text style={s.wordFast}>FAST</Text>
            </View>
            <Text style={s.tagline}>Fast. Safe. Easy to Gili.</Text>
          </View>
          <View style={s.headerArt}>
            {/* react-pdf's Image is a PDF primitive, not an HTML img — it has no
                alt prop, and a PDF has no text layer for one to land in. */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.banner} src={BOARDING_PASS_BANNER} />
          </View>
        </View>

        <View style={s.eticketRow}>
          <View style={s.eticketDot}>
            <TicketGlyph />
          </View>
          <View>
            <Text style={s.eticketTitle}>E-TICKET</Text>
            <Text style={s.eticketNote}>PLEASE SHOW THIS E-TICKET AT CHECK-IN</Text>
          </View>
        </View>

        <View style={s.route}>
          <View style={s.endpoint}>
            <Text style={s.portName}>{data.originPort}</Text>
            <Text style={s.portSub}>{harbourName(data.originPort)}</Text>
            <Text style={s.bigTime}>{formatLocalTime(dep)}</Text>
            <Text style={s.routeDate}>{formatLocalDate(dep, "dd MMM yyyy")}</Text>
          </View>

          <View style={s.connector}>
            <BoatGlyph size={16} color="#fff" accent={TEAL} />
            <View style={s.dashRow}>
              <RouteArrow width={96} />
            </View>
            <Text style={s.connectorLabel}>Duration</Text>
            <Text style={s.connectorValue}>{durationLabel(data.durationMinutes)}</Text>
          </View>

          <View style={s.endpointRight}>
            <Text style={s.portName}>{data.destinationPort}</Text>
            <Text style={s.portSub}>{harbourName(data.destinationPort)}</Text>
            <Text style={s.bigTime}>{formatLocalTime(data.arrivalDate)}</Text>
            <Text style={s.routeDate}>
              {formatLocalDate(data.arrivalDate, "dd MMM yyyy")}
            </Text>
          </View>
        </View>

        <View style={s.tiles}>
          <Tile
            glyph={<PersonGlyph />}
            label="PASSENGER"
            value={passenger.name}
            note={total > 1 ? `Passenger ${index + 1} of ${total}` : undefined}
          />
          <View style={s.tileDivider} />
          <Tile
            glyph={<CalendarGlyph />}
            label="DEPARTURE DATE"
            value={formatLocalDate(dep, "dd MMM yyyy")}
            note={formatLocalDate(dep, "EEEE")}
          />
          <View style={s.tileDivider} />
          <Tile
            glyph={<ClockGlyph size={13} />}
            label="CHECK-IN BY"
            value={`${formatLocalTime(data.checkInBy)} WITA`}
            note={`${data.arrivalBuffer} min before departure`}
          />
          <View style={s.tileDivider} />
          <Tile
            glyph={<BoatGlyph />}
            label="BOAT / OPERATOR"
            value={data.boatName}
            note={data.operatorName}
          />
        </View>

        <View style={s.lower}>
          <View style={[s.card, s.notesCard]}>
            <View style={s.cardHeadRow}>
              <InfoGlyph />
              <Text style={s.cardTitle}>IMPORTANT NOTES</Text>
            </View>
            <Bullet>{`Check-in closes ${data.arrivalBuffer} minutes before departure`}</Bullet>
            <Bullet>Bring a government ID whose name matches this pass</Bullet>
            <Bullet>{data.refundSummary}</Bullet>
            <Bullet>Schedule may change due to weather or harbourmaster instruction</Bullet>
            <Bullet>Life jackets are provided on board</Bullet>
          </View>

          <View style={[s.card, s.checkinCard]}>
            <View style={s.cardHeadRow}>
              <PinGlyph />
              <Text style={s.cardTitle}>CHECK-IN INFORMATION</Text>
            </View>
            <Text style={s.harbour}>{harbourName(data.originPort)}</Text>
            <Text style={s.harbourSub}>Gilifast counter</Text>
            <Text style={s.address}>{data.dockAddress}</Text>
            <Text style={s.address}>{data.dockTip}</Text>
            <View style={s.checkinTimeRow}>
              <ClockGlyph />
              <Text style={s.checkinTime}>
                Check-in by {formatLocalTime(data.checkInBy)} WITA
              </Text>
            </View>
          </View>
        </View>

        <View style={s.footer}>
          <View style={s.footerItem}>
            <GlobeGlyph />
            <Text style={s.footerText}>{siteHost()}</Text>
          </View>
          <View style={s.footerItem}>
            <PhoneGlyph />
            <Text style={s.footerText}>{data.operatorPhone}</Text>
          </View>
          <Text style={s.footerThanks}>Thank you for traveling with Gilifast!</Text>
        </View>
      </View>

      {/* ------------------------------- the stub -------------------------- */}
      <View style={s.perf} />
      <View style={s.stub}>
        <View style={s.stubPill}>
          <Text style={s.stubPillText}>E-TICKET</Text>
        </View>

        <Text style={s.stubLabel}>BOOKING CODE</Text>
        <Text style={s.stubCode}>{data.bookingReference}</Text>

        <View style={s.qrWrap}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.qr} src={passenger.qr} />
          <Text style={s.scanNote}>Scan at Check-in</Text>
          <Text style={s.ticketCode}>{passenger.ticketCode}</Text>
        </View>

        <View style={s.stubDivider} />

        <View style={s.summaryHead}>
          <SummaryGlyph />
          <Text style={s.summaryTitle}>BOOKING SUMMARY</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryKey}>Booking Code</Text>
          <Text style={s.summaryVal}>{data.bookingReference}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryKey}>Booking Date</Text>
          <Text style={s.summaryVal}>
            {formatLocalDate(data.bookingDate, "dd MMM yyyy HH:mm")}
          </Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryKey}>Route</Text>
          {/* Plain hyphen, not an arrow: the built-in Helvetica is WinAnsi and
              has no U+2192, which renders as a stray glyph. */}
          <Text style={s.summaryVal}>
            {data.originPort} - {data.destinationPort}
          </Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryKey}>Departure</Text>
          <Text style={s.summaryVal}>
            {formatLocalDate(dep, "dd MMM yyyy")} · {formatLocalTime(dep)}
          </Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryKey}>Total Passenger</Text>
          <Text style={s.summaryVal}>
            {total} {total === 1 ? "Passenger" : "Passengers"}
          </Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryKey}>Booked By</Text>
          <Text style={s.summaryVal}>{data.customerName}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryKey}>This Pass</Text>
          <Text style={s.summaryVal}>
            {total > 1 ? `Passenger ${index + 1} of ${total}` : passenger.name}
          </Text>
        </View>

        <View style={[s.summaryRow, s.totalRule]}>
          <Text style={s.totalKey}>TOTAL PAID</Text>
          <Text style={s.totalVal}>{formatIDR(data.totalAmount)}</Text>
        </View>
        <View style={s.paidBadge}>
          <Text style={s.paidText}>PAID</Text>
        </View>

        <View style={s.helpCard}>
          <HeadsetGlyph />
          <View style={{ marginLeft: 8 }}>
            <Text style={s.helpTitle}>NEED HELP?</Text>
            <Text style={s.helpLine}>{data.operatorName}</Text>
            <Text style={s.helpPhone}>{data.operatorPhone}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

function BoardingPassDocument({ data }: { data: BoardingPassData }) {
  return (
    <Document
      title={`Gilifast e-ticket ${data.bookingReference}`}
      author="Gilifast"
      subject={`${data.originPort} to ${data.destinationPort}`}
    >
      {data.passengers.map((p, i) => (
        <PassengerPage key={p.ticketCode} data={data} passenger={p} index={i} />
      ))}
    </Document>
  );
}

/**
 * One-line refund summary for the notes panel.
 *
 * Read off the policy snapshot stored with the booking rather than today's
 * table, so a pass always states the terms the customer actually bought under.
 */
function refundSummaryFor(snapshot: unknown, deadline: Date | null): string {
  const tiers =
    snapshot && typeof snapshot === "object" && "tiers" in snapshot
      ? (snapshot as { tiers?: Array<{ hoursBeforeDeparture: number; refundFraction: number }> })
          .tiers
      : undefined;

  if (Array.isArray(tiers) && tiers.length > 0) {
    const best = [...tiers].sort((a, b) => b.refundFraction - a.refundFraction)[0];
    if (best && best.refundFraction > 0) {
      const pct = Math.round(best.refundFraction * 100);
      const days = Math.round(best.hoursBeforeDeparture / 24);
      return deadline
        ? `Refundable up to ${pct}% more than ${days} days before departure; none after ${formatLocalDate(deadline, "dd MMM yyyy HH:mm")} WITA`
        : `Refundable up to ${pct}% more than ${days} days before departure`;
    }
  }

  return deadline
    ? `Refunds close ${formatLocalDate(deadline, "dd MMM yyyy HH:mm")} WITA - see our refund policy`
    : "See our refund policy for cancellation terms";
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
        bookingDate: booking.createdAt,
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
        checkInBy: new Date(
          leg.departureDate.getTime() - port.arrivalBuffer * 60_000,
        ),
        refundSummary: refundSummaryFor(
          booking.refundPolicySnapshot,
          booking.refundDeadline,
        ),
        passengers,
      }}
    />,
  );
}

/** Filename used for the attachment, the download and the WhatsApp document. */
export function boardingPassFilename(bookingReference: string): string {
  return `Gilifast-${bookingReference}.pdf`;
}
