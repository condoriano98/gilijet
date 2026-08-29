"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { localDateTimeToUtc } from "@/lib/datetime";

/** Parse a datetime-local ("YYYY-MM-DDTHH:mm") as WITA, or null when blank. */
function parseWita(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const [ymd, hm] = s.split("T");
  if (!ymd) return null;
  return localDateTimeToUtc(ymd, hm || "00:00");
}

/** Split a comma/newline list into a trimmed, de-duped array. */
function parseList(value: FormDataEntryValue | null): string[] {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

const couponSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/, "Code: uppercase letters, digits, _ or -"),
    discountType: z.enum(["PERCENT", "FLAT"]),
    discountValue: z.coerce.number().positive(),
    minAmount: z.coerce.number().min(0).default(0),
    maxUses: z.coerce.number().int().positive().optional(),
    maxDiscountAmount: z.coerce.number().positive().optional(),
    perCustomerLimit: z.coerce.number().int().positive().optional(),
    budgetCap: z.coerce.number().positive().optional(),
    firstBookingOnly: z.boolean().default(false),
    stackable: z.boolean().default(false),
    costBearer: z.enum(["PLATFORM", "OPERATOR", "SHARED"]).default("SHARED"),
    description: z.string().max(200).optional(),
  })
  .refine((d) => d.discountType !== "PERCENT" || d.discountValue <= 100, {
    message: "Percent discount cannot exceed 100",
    path: ["discountValue"],
  })
  .refine(
    (d) =>
      d.costBearer === "SHARED" ||
      d.budgetCap != null ||
      d.maxUses != null ||
      d.maxDiscountAmount != null,
    {
      message:
        "PLATFORM/OPERATOR coupons need a budget cap, max uses, or a max discount to bound exposure",
      path: ["budgetCap"],
    },
  );

function readCouponForm(formData: FormData) {
  return couponSchema.safeParse({
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    minAmount: formData.get("minAmount") || 0,
    maxUses: formData.get("maxUses") || undefined,
    maxDiscountAmount: formData.get("maxDiscountAmount") || undefined,
    perCustomerLimit: formData.get("perCustomerLimit") || undefined,
    budgetCap: formData.get("budgetCap") || undefined,
    firstBookingOnly: formData.get("firstBookingOnly") === "on",
    stackable: formData.get("stackable") === "on",
    costBearer: formData.get("costBearer") || "SHARED",
    description: String(formData.get("description") ?? "").trim() || undefined,
  });
}

function couponData(
  d: z.infer<typeof couponSchema>,
  formData: FormData,
) {
  return {
    discountType: d.discountType,
    discountValue: d.discountValue,
    minAmount: d.minAmount,
    maxUses: d.maxUses ?? null,
    maxDiscountAmount: d.maxDiscountAmount ?? null,
    perCustomerLimit: d.perCustomerLimit ?? null,
    budgetCap: d.budgetCap ?? null,
    firstBookingOnly: d.firstBookingOnly,
    stackable: d.stackable,
    costBearer: d.costBearer,
    description: d.description ?? null,
    startsAt: parseWita(formData.get("startsAt")),
    expiresAt: parseWita(formData.get("expiresAt")),
    appliesToRouteCodes: parseList(formData.get("appliesToRouteCodes")),
    appliesToOperatorIds: parseList(formData.get("appliesToOperatorIds")),
  };
}

export async function createCoupon(formData: FormData) {
  const session = await requireSuperAdmin();
  const parsed = readCouponForm(formData);
  if (!parsed.success) {
    redirect(
      `/admin/console/coupons/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }
  const existing = await prisma.promotion.findUnique({
    where: { code: parsed.data.code },
  });
  if (existing) {
    redirect(
      `/admin/console/coupons/new?error=${encodeURIComponent("Code already exists")}`,
    );
  }
  const created = await prisma.promotion.create({
    data: { code: parsed.data.code, ...couponData(parsed.data, formData) },
  });
  await audit({
    entityType: "PROMOTION",
    entityId: created.id,
    action: "created",
    userId: session.sub,
    userRole: "ADMIN",
    newState: { code: created.code },
  });
  redirect("/admin/console/coupons");
}

export async function updateCoupon(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/console/coupons");
  const parsed = readCouponForm(formData);
  if (!parsed.success) {
    redirect(
      `/admin/console/coupons/${id}?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }
  await prisma.promotion.update({
    where: { id },
    data: couponData(parsed.data, formData),
  });
  await audit({
    entityType: "PROMOTION",
    entityId: id,
    action: "updated",
    userId: session.sub,
    userRole: "ADMIN",
  });
  redirect("/admin/console/coupons");
}

export async function toggleCoupon(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "1";
  if (!id) redirect("/admin/console/coupons");
  await prisma.promotion.update({ where: { id }, data: { isActive: next } });
  await audit({
    entityType: "PROMOTION",
    entityId: id,
    action: next ? "activated" : "deactivated",
    userId: session.sub,
    userRole: "ADMIN",
  });
  redirect("/admin/console/coupons");
}

export async function archiveCoupon(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/console/coupons");
  await prisma.promotion.update({
    where: { id },
    data: { archivedAt: new Date(), isActive: false },
  });
  await audit({
    entityType: "PROMOTION",
    entityId: id,
    action: "archived",
    userId: session.sub,
    userRole: "ADMIN",
  });
  redirect("/admin/console/coupons");
}

const bulkSchema = couponSchema.and(
  z.object({
    prefix: z
      .string()
      .min(2)
      .max(20)
      .regex(/^[A-Z0-9_-]+$/, "Prefix: uppercase letters, digits, _ or -"),
    count: z.coerce.number().int().min(1).max(500),
  }),
);

function randomSuffix(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function generateBulkCodes(formData: FormData) {
  const session = await requireSuperAdmin();
  const base = readCouponForm(formData);
  const meta = bulkSchema.safeParse({
    ...(base.success ? base.data : {}),
    prefix: String(formData.get("prefix") ?? "").trim().toUpperCase(),
    count: formData.get("count"),
  });
  if (!base.success) {
    redirect(`/admin/console/coupons/new?bulk=1&error=${encodeURIComponent(base.error.issues[0].message)}`);
  }
  if (!meta.success) {
    redirect(`/admin/console/coupons/new?bulk=1&error=${encodeURIComponent(meta.error.issues[0].message)}`);
  }
  const shared = couponData(base.data, formData);
  const rows = Array.from({ length: meta.data.count }, () => ({
    code: `${meta.data.prefix}-${randomSuffix()}`,
    ...shared,
  }));
  const result = await prisma.promotion.createMany({
    data: rows,
    skipDuplicates: true,
  });
  await audit({
    entityType: "PROMOTION",
    entityId: meta.data.prefix,
    action: "bulk_generated",
    userId: session.sub,
    userRole: "ADMIN",
    newState: { requested: meta.data.count, created: result.count },
  });
  redirect(`/admin/console/coupons?generated=${result.count}`);
}

// ---------- pricing ----------

const configSchema = z.object({
  commissionRate: z.coerce.number().min(0).max(1),
  serviceFeeType: z.enum(["NONE", "PERCENT", "FLAT"]),
  serviceFeeValue: z.coerce.number().min(0),
  adultMultiplier: z.coerce.number().min(0).max(10),
  childMultiplier: z.coerce.number().min(0).max(10),
  infantMultiplier: z.coerce.number().min(0).max(10),
});

export async function savePlatformConfig(formData: FormData) {
  const session = await requireSuperAdmin();
  const parsed = configSchema.safeParse({
    commissionRate: formData.get("commissionRate"),
    serviceFeeType: formData.get("serviceFeeType") || "NONE",
    serviceFeeValue: formData.get("serviceFeeValue") || 0,
    adultMultiplier: formData.get("adultMultiplier"),
    childMultiplier: formData.get("childMultiplier"),
    infantMultiplier: formData.get("infantMultiplier"),
  });
  if (!parsed.success) {
    redirect(
      `/admin/console/pricing?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }
  const d = parsed.data;
  await prisma.platformConfig.upsert({
    where: { id: "default" },
    update: {
      commissionRate: d.commissionRate,
      serviceFeeType: d.serviceFeeType === "NONE" ? null : d.serviceFeeType,
      serviceFeeValue: d.serviceFeeValue,
      adultMultiplier: d.adultMultiplier,
      childMultiplier: d.childMultiplier,
      infantMultiplier: d.infantMultiplier,
      updatedBy: session.email,
    },
    create: {
      id: "default",
      commissionRate: d.commissionRate,
      serviceFeeType: d.serviceFeeType === "NONE" ? null : d.serviceFeeType,
      serviceFeeValue: d.serviceFeeValue,
      adultMultiplier: d.adultMultiplier,
      childMultiplier: d.childMultiplier,
      infantMultiplier: d.infantMultiplier,
      updatedBy: session.email,
    },
  });
  revalidatePath("/admin/console/pricing");
  redirect("/admin/console/pricing?ok=1");
}

export async function setOperatorCommission(formData: FormData) {
  await requireSuperAdmin();
  const operatorId = String(formData.get("operatorId") ?? "");
  const rate = Number(formData.get("commissionRate"));
  if (!operatorId || !Number.isFinite(rate) || rate < 0 || rate > 1) {
    redirect(
      `/admin/console/pricing?error=${encodeURIComponent("Invalid commission rate (0–1)")}`,
    );
  }
  await prisma.operator.update({
    where: { id: operatorId },
    data: { commissionRate: rate },
  });
  revalidatePath("/admin/console/pricing");
  redirect("/admin/console/pricing?ok=1");
}

// ---------- payment gateway modes ----------

const paymentModeSchema = z.object({
  midtransMode: z.enum(["ENV", "SANDBOX", "LIVE"]),
  paypalMode: z.enum(["ENV", "SANDBOX", "LIVE"]),
});

/**
 * Runtime sandbox/live override for the payment gateways, stored on the
 * PlatformConfig row so staging can be pinned to a host without a redeploy.
 * ENV restores the MIDTRANS_IS_PRODUCTION / PAYPAL_IS_PRODUCTION env behaviour.
 * See lib/payment-mode.ts.
 */
export async function savePaymentModes(formData: FormData) {
  const session = await requireSuperAdmin();
  const parsed = paymentModeSchema.safeParse({
    midtransMode: String(formData.get("midtransMode") ?? "ENV").toUpperCase(),
    paypalMode: String(formData.get("paypalMode") ?? "ENV").toUpperCase(),
  });
  if (!parsed.success) {
    redirect(
      `/admin/console/payments?error=${encodeURIComponent("Invalid gateway mode selection")}`,
    );
  }
  const d = parsed.data;
  const values = {
    midtransMode: d.midtransMode,
    paypalMode: d.paypalMode,
    updatedBy: session.email,
  };
  await prisma.platformConfig.upsert({
    where: { id: "default" },
    update: values,
    create: { id: "default", ...values },
  });
  await audit({
    entityType: "PLATFORM_CONFIG",
    entityId: "default",
    action: "payment_modes_updated",
    userId: session.sub,
    userRole: "ADMIN",
    newState: { midtransMode: d.midtransMode, paypalMode: d.paypalMode },
  });
  revalidatePath("/admin/console/payments");
  redirect("/admin/console/payments?ok=1");
}

// ---------- booking alerts ----------

const alertSchema = z.object({
  // Free-form because normalizeWhatsappNumber accepts 08…, +62…, 62… and
  // strips punctuation; validating a shape here would reject numbers WATI
  // takes. Blank clears the setting and turns alerts off.
  adminWhatsappNumber: z.string().trim().max(32),
  adminAlertTemplate: z.string().trim().max(128),
  alertOnNewBooking: z.coerce.boolean(),
  alertOnBookingPaid: z.coerce.boolean(),
});

export async function saveAlertConfig(formData: FormData) {
  const session = await requireSuperAdmin();
  const parsed = alertSchema.safeParse({
    adminWhatsappNumber: formData.get("adminWhatsappNumber") ?? "",
    adminAlertTemplate: formData.get("adminAlertTemplate") ?? "",
    alertOnNewBooking: formData.get("alertOnNewBooking") === "on",
    alertOnBookingPaid: formData.get("alertOnBookingPaid") === "on",
  });
  if (!parsed.success) {
    redirect(
      `/admin/console/alerts?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }
  const d = parsed.data;
  const values = {
    adminWhatsappNumber: d.adminWhatsappNumber || null,
    adminAlertTemplate: d.adminAlertTemplate || null,
    alertOnNewBooking: d.alertOnNewBooking,
    alertOnBookingPaid: d.alertOnBookingPaid,
    updatedBy: session.email,
  };
  await prisma.platformConfig.upsert({
    where: { id: "default" },
    update: values,
    create: { id: "default", ...values },
  });

  await audit({
    entityType: "PLATFORM_CONFIG",
    entityId: "default",
    action: "alert_config_updated",
    userId: session.sub,
    userRole: "ADMIN",
    // The number is deliberately not logged: audit rows are read widely and a
    // staff mobile number does not need to be in all of them.
    newState: {
      hasNumber: Boolean(d.adminWhatsappNumber),
      template: d.adminAlertTemplate || null,
      alertOnNewBooking: d.alertOnNewBooking,
      alertOnBookingPaid: d.alertOnBookingPaid,
    },
  });

  revalidatePath("/admin/console/alerts");
  redirect("/admin/console/alerts?ok=1");
}
