import { Prisma } from "@prisma/client";
import { readonlyPrisma as db } from "./readonly-client";
import {
  FEATURES,
  featureById,
  statusCounts,
  type Feature,
  type FeatureArea,
} from "../feature-catalog";
import {
  TIMEZONE_NOTE,
  maskEmail,
  maskName,
  maskPhone,
  money,
  page,
  untrusted,
  witaTime,
} from "./serialize";

/**
 * Tool implementations for the review MCP.
 *
 * Every query names its columns explicitly. Returning raw Prisma rows would
 * push tens of thousands of tokens per call — Booking alone has around 40
 * columns — and would leak fields nobody asked for, `passwordHash` among them.
 *
 * Lists are capped and report their total, so a reviewer cannot mistake the
 * first page for the whole dataset and conclude revenue is a fraction of what
 * it is.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function clampLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/** Parse a YYYY-MM-DD bound, or undefined when absent. */
function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const d = new Date(`${value.trim()}T00:00:00+08:00`); // WITA
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function dateRange(from: unknown, to: unknown): { gte?: Date; lte?: Date } | undefined {
  const gte = parseDate(from);
  const lte = parseDate(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

// ---------- features ----------

function summarise(f: Feature) {
  return {
    id: f.id,
    name: f.name,
    labelId: f.labelId,
    area: f.area,
    status: f.status,
    notes: f.notes,
  };
}

export async function listFeatures(args: { area?: string; status?: string }) {
  let rows = FEATURES;
  if (args.area) rows = rows.filter((f) => f.area === (args.area as FeatureArea));
  if (args.status) rows = rows.filter((f) => f.status === args.status);

  return {
    counts: statusCounts(rows),
    statusMeaning: {
      shipped: "built and reachable in the UI",
      partial: "works, with a gap named in notes",
      broken: "built but unreachable — notes say why",
      placeholder: "route exists, empty state only",
      "schema-only": "data model exists, no UI",
      alias: "redirect to a canonical route, not a feature",
    },
    features: rows.map(summarise),
    caveat:
      "Status is hand-maintained in lib/feature-catalog.ts, because it cannot be derived from the filesystem — a route can exist while being an empty placeholder, a redirect, or unreachable. A drift test keeps the paths honest but not the status labels.",
  };
}

export async function describeFeature(args: { id?: string }) {
  const f = args.id ? featureById(args.id) : undefined;
  if (!f) {
    return {
      error: `Unknown feature id "${args.id ?? ""}".`,
      availableIds: FEATURES.map((x) => x.id),
    };
  }
  return { ...f };
}

// ---------- economics ----------

export async function platformMetrics(args: { from?: string; to?: string }) {
  const createdAt = dateRange(args.from, args.to);
  const where: Prisma.BookingWhereInput = {
    status: "CONFIRMED",
    ...(createdAt ? { createdAt } : {}),
  };

  const [totals, bookingCount, operatorCount, discount] = await Promise.all([
    db.booking.aggregate({
      where,
      _sum: { totalAmount: true, commissionAmount: true, operatorAmount: true },
    }),
    db.booking.count({ where }),
    db.operator.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    db.promotionRedemption.aggregate({
      where: createdAt ? { createdAt } : {},
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const gmv = totals._sum.totalAmount ?? new Prisma.Decimal(0);
  const commission = totals._sum.commissionAmount ?? new Prisma.Decimal(0);
  const takeRate = gmv.isZero()
    ? null
    : commission.div(gmv).mul(100).toFixed(2) + "%";

  return {
    window: { from: args.from ?? "all time", to: args.to ?? "now" },
    confirmedBookings: bookingCount,
    gmv: money(gmv),
    platformCommission: money(commission),
    operatorPayout: money(totals._sum.operatorAmount),
    effectiveTakeRate: takeRate,
    discountSpend: money(discount._sum.amount),
    couponRedemptions: discount._count,
    activeOperators: operatorCount,
    note: `${TIMEZONE_NOTE} GMV and take-rate count CONFIRMED bookings only, so held-but-unpaid orders are excluded.`,
  };
}

export async function listCoupons(args: { limit?: number }) {
  const limit = clampLimit(args.limit);
  const [rows, total] = await Promise.all([
    db.promotion.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        costBearer: true,
        isActive: true,
        archivedAt: true,
        startsAt: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
        budgetCap: true,
        budgetSpent: true,
        perCustomerLimit: true,
        firstBookingOnly: true,
      },
    }),
    db.promotion.count(),
  ]);

  return page(
    rows.map((p) => ({
      code: p.code,
      discount:
        p.discountType === "PERCENT"
          ? `${Number(p.discountValue)}%`
          : `IDR ${money(p.discountValue)}`,
      whoAbsorbsIt: p.costBearer,
      active: p.isActive && !p.archivedAt,
      window: { from: witaTime(p.startsAt), to: witaTime(p.expiresAt) },
      uses: `${p.usedCount}${p.maxUses ? ` / ${p.maxUses}` : " (uncapped)"}`,
      budget: p.budgetCap
        ? `${money(p.budgetSpent)} / ${money(p.budgetCap)}`
        : `${money(p.budgetSpent)} spent (uncapped)`,
      perCustomerLimit: p.perCustomerLimit,
      firstBookingOnly: p.firstBookingOnly,
    })),
    total,
    MAX_LIMIT,
  );
}

// ---------- operators ----------

export async function operators(args: { id?: string; limit?: number }) {
  if (args.id) {
    const op = await db.operator.findFirst({
      where: { id: args.id, deletedAt: null },
      select: {
        id: true,
        companyName: true,
        email: true,
        contactPerson: true,
        phoneNumber: true,
        status: true,
        documentsVerified: true,
        commissionRate: true,
        npwp: true,
        createdAt: true,
        documents: {
          select: { type: true, status: true, fileName: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { boats: true, bookings: true } },
      },
    });
    if (!op) return { error: `No active operator with id "${args.id}".` };
    return {
      id: op.id,
      companyName: op.companyName,
      email: op.email,
      contactPerson: maskName(op.contactPerson),
      phone: maskPhone(op.phoneNumber),
      status: op.status,
      documentsVerified: op.documentsVerified,
      commissionRate: `${(Number(op.commissionRate) * 100).toFixed(2)}%`,
      npwp: op.npwp,
      joined: witaTime(op.createdAt),
      boats: op._count.boats,
      bookings: op._count.bookings,
      kybDocuments: op.documents.map((d) => ({
        type: d.type,
        status: d.status,
        fileName: d.fileName,
        uploaded: witaTime(d.createdAt),
      })),
      note: "Bank account details are deliberately not returned.",
    };
  }

  const limit = clampLimit(args.limit);
  const [rows, total] = await Promise.all([
    db.operator.findMany({
      where: { deletedAt: null },
      take: limit,
      orderBy: { companyName: "asc" },
      select: {
        id: true,
        companyName: true,
        status: true,
        documentsVerified: true,
        commissionRate: true,
        _count: { select: { boats: true, bookings: true } },
      },
    }),
    db.operator.count({ where: { deletedAt: null } }),
  ]);

  return page(
    rows.map((o) => ({
      id: o.id,
      companyName: o.companyName,
      status: o.status,
      documentsVerified: o.documentsVerified,
      commissionRate: `${(Number(o.commissionRate) * 100).toFixed(2)}%`,
      boats: o._count.boats,
      bookings: o._count.bookings,
    })),
    total,
    MAX_LIMIT,
  );
}

// ---------- bookings ----------

const BOOKING_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_OPERATOR",
  "EXPIRED",
] as const;

export async function listBookings(args: {
  from?: string;
  to?: string;
  status?: string;
  operatorId?: string;
  limit?: number;
}) {
  const limit = clampLimit(args.limit);
  const createdAt = dateRange(args.from, args.to);
  const status = BOOKING_STATUSES.includes(args.status as never)
    ? (args.status as (typeof BOOKING_STATUSES)[number])
    : undefined;

  const where: Prisma.BookingWhereInput = {
    ...(createdAt ? { createdAt } : {}),
    ...(status ? { status } : {}),
    ...(args.operatorId ? { operatorId: args.operatorId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.booking.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        bookingReference: true,
        status: true,
        customerName: true,
        totalAmount: true,
        commissionAmount: true,
        discountAmount: true,
        salesChannel: true,
        createdAt: true,
        operator: { select: { companyName: true } },
      },
    }),
    db.booking.count({ where }),
  ]);

  return page(
    rows.map((b) => ({
      reference: b.bookingReference,
      status: b.status,
      customer: maskName(b.customerName),
      total: money(b.totalAmount),
      commission: money(b.commissionAmount),
      discount: money(b.discountAmount),
      channel: b.salesChannel,
      operator: b.operator.companyName,
      booked: witaTime(b.createdAt),
    })),
    total,
    MAX_LIMIT,
  );
}

export async function getBooking(args: { reference?: string }) {
  if (!args.reference) return { error: "reference is required." };

  const b = await db.booking.findUnique({
    where: { bookingReference: args.reference.trim().toUpperCase() },
    select: {
      bookingReference: true,
      status: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      customerNationality: true,
      totalAmount: true,
      commissionAmount: true,
      operatorAmount: true,
      discountAmount: true,
      salesChannel: true,
      refundDeadline: true,
      createdAt: true,
      operator: { select: { companyName: true } },
      promotion: { select: { code: true, costBearer: true } },
      tickets: {
        select: { ticketCode: true, passengerName: true, status: true, checkedInAt: true },
      },
      payment: {
        select: { method: true, status: true, gatewayProvider: true, paidAt: true, amount: true },
      },
      refund: {
        select: { refundAmount: true, reason: true, status: true, processedAt: true },
      },
      leg: {
        select: {
          departureDate: true,
          status: true,
          schedule: { select: { originPort: true, destinationPort: true } },
        },
      },
    },
  });
  if (!b) return { error: `No booking with reference "${args.reference}".` };

  return {
    reference: b.bookingReference,
    status: b.status,
    customer: {
      name: maskName(b.customerName),
      email: maskEmail(b.customerEmail),
      phone: maskPhone(b.customerPhone),
      nationality: b.customerNationality,
    },
    journey: {
      route: `${b.leg.schedule.originPort} → ${b.leg.schedule.destinationPort}`,
      departure: witaTime(b.leg.departureDate),
      legStatus: b.leg.status,
    },
    money: {
      total: money(b.totalAmount),
      platformCommission: money(b.commissionAmount),
      operatorPayout: money(b.operatorAmount),
      discount: money(b.discountAmount),
      coupon: b.promotion
        ? { code: b.promotion.code, absorbedBy: b.promotion.costBearer }
        : null,
    },
    channel: b.salesChannel,
    operator: b.operator.companyName,
    refundDeadline: witaTime(b.refundDeadline),
    booked: witaTime(b.createdAt),
    payment: b.payment
      ? {
          method: b.payment.method,
          status: b.payment.status,
          gateway: b.payment.gatewayProvider,
          amount: money(b.payment.amount),
          paidAt: witaTime(b.payment.paidAt),
        }
      : null,
    refund: b.refund
      ? {
          amount: money(b.refund.refundAmount),
          reason: b.refund.reason,
          status: b.refund.status,
          processedAt: witaTime(b.refund.processedAt),
        }
      : null,
    tickets: b.tickets.map((t) => ({
      code: t.ticketCode,
      passenger: untrusted(maskName(t.passengerName)),
      status: t.status,
      checkedInAt: witaTime(t.checkedInAt),
    })),
    note: TIMEZONE_NOTE,
  };
}

export async function findCustomer(args: { email?: string; limit?: number }) {
  if (!args.email) return { error: "email is required." };
  const email = args.email.trim().toLowerCase();
  const limit = clampLimit(args.limit);

  const [customer, bookings, total] = await Promise.all([
    db.customer.findUnique({
      where: { email },
      select: { id: true, fullName: true, email: true, phoneNumber: true, nationality: true, createdAt: true },
    }),
    db.booking.findMany({
      where: { customerEmail: email },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        bookingReference: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        leg: { select: { schedule: { select: { originPort: true, destinationPort: true } } } },
      },
    }),
    db.booking.count({ where: { customerEmail: email } }),
  ]);

  return {
    account: customer
      ? {
          name: maskName(customer.fullName),
          email: maskEmail(customer.email),
          phone: maskPhone(customer.phoneNumber),
          nationality: customer.nationality,
          registered: witaTime(customer.createdAt),
        }
      : null,
    accountNote: customer
      ? undefined
      : "No registered account with that email. Bookings below, if any, were made as a guest.",
    bookings: page(
      bookings.map((b) => ({
        reference: b.bookingReference,
        status: b.status,
        total: money(b.totalAmount),
        route: `${b.leg.schedule.originPort} → ${b.leg.schedule.destinationPort}`,
        booked: witaTime(b.createdAt),
      })),
      total,
      MAX_LIMIT,
    ),
  };
}

export async function listRefunds(args: {
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
}) {
  const limit = clampLimit(args.limit);
  const createdAt = dateRange(args.from, args.to);
  const where: Prisma.RefundWhereInput = {
    ...(createdAt ? { createdAt } : {}),
    ...(args.status
      ? { status: args.status as Prisma.EnumRefundStatusFilter["equals"] }
      : {}),
  };

  const [rows, total, sum] = await Promise.all([
    db.refund.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        refundAmount: true,
        originalAmount: true,
        reason: true,
        status: true,
        createdAt: true,
        processedAt: true,
        adminNote: true,
        booking: {
          select: { bookingReference: true, operator: { select: { companyName: true } } },
        },
      },
    }),
    db.refund.count({ where }),
    db.refund.aggregate({ where, _sum: { refundAmount: true } }),
  ]);

  return {
    totalRefunded: money(sum._sum.refundAmount),
    ...page(
      rows.map((r) => ({
        booking: r.booking.bookingReference,
        operator: r.booking.operator.companyName,
        refunded: money(r.refundAmount),
        original: money(r.originalAmount),
        reason: r.reason,
        status: r.status,
        requested: witaTime(r.createdAt),
        processed: witaTime(r.processedAt),
        adminNote: untrusted(r.adminNote),
      })),
      total,
      MAX_LIMIT,
    ),
  };
}

export async function upcomingDepartures(args: { operatorId?: string; limit?: number }) {
  const limit = clampLimit(args.limit);
  const where: Prisma.LegWhereInput = {
    departureDate: { gte: new Date() },
    ...(args.operatorId ? { operatorId: args.operatorId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.leg.findMany({
      where,
      take: limit,
      orderBy: { departureDate: "asc" },
      select: {
        departureDate: true,
        status: true,
        totalCapacity: true,
        availableSeats: true,
        basePrice: true,
        operator: { select: { companyName: true } },
        schedule: { select: { originPort: true, destinationPort: true } },
      },
    }),
    db.leg.count({ where }),
  ]);

  return page(
    rows.map((l) => {
      const booked = l.totalCapacity - l.availableSeats;
      return {
        departure: witaTime(l.departureDate),
        route: `${l.schedule.originPort} → ${l.schedule.destinationPort}`,
        operator: l.operator.companyName,
        status: l.status,
        seats: `${booked}/${l.totalCapacity} booked`,
        occupancy:
          l.totalCapacity > 0
            ? `${((booked / l.totalCapacity) * 100).toFixed(0)}%`
            : null,
        basePrice: money(l.basePrice),
      };
    }),
    total,
    MAX_LIMIT,
  );
}
