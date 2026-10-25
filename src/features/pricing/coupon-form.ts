import { z } from 'zod';
import { localDateTimeToUtc } from '@/shared/lib/datetime';

/** Parse a datetime-local ("YYYY-MM-DDTHH:mm") as WITA, or null when blank. */
function parseWita(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const [ymd, hm] = s.split('T');
  if (!ymd) return null;
  return localDateTimeToUtc(ymd, hm || '00:00');
}

/** Distinct, trimmed, non-empty values of a repeated form field. */
function readList(formData: FormData, name: string): string[] {
  return Array.from(
    new Set(
      formData
        .getAll(name)
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  );
}

export const couponSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/, 'Code: uppercase letters, digits, _ or -'),
    discountType: z.enum(['PERCENT', 'FLAT', 'NET']),
    discountValue: z.coerce.number().positive(),
    minAmount: z.coerce.number().min(0).default(0),
    maxUses: z.coerce.number().int().positive().optional(),
    maxDiscountAmount: z.coerce.number().positive().optional(),
    perCustomerLimit: z.coerce.number().int().positive().optional(),
    budgetCap: z.coerce.number().positive().optional(),
    firstBookingOnly: z.boolean().default(false),
    description: z.string().max(200).optional(),
    startsAt: z.date().nullable(),
    expiresAt: z.date().nullable(),
    allRoutes: z.boolean(),
    routeCodes: z.array(z.string()),
    allOperators: z.boolean(),
    operatorIds: z.array(z.string()),
  })
  .refine((d) => d.discountType !== 'PERCENT' || d.discountValue <= 100, {
    message: 'Percent discount cannot exceed 100',
    path: ['discountValue'],
  })
  .refine(
    (d) => d.budgetCap != null || d.maxUses != null || d.maxDiscountAmount != null,
    {
      message:
        'Gilifast pays for every coupon, so set a budget cap, max uses, or a max discount to bound the cost',
      path: ['budgetCap'],
    },
  )
  .refine((d) => d.allRoutes || d.routeCodes.length > 0, {
    message: 'Pick at least one route, or choose All routes',
    path: ['routeCodes'],
  })
  .refine((d) => d.allOperators || d.operatorIds.length > 0, {
    message: 'Pick at least one operator, or choose All operators',
    path: ['operatorIds'],
  });

export type CouponInput = z.infer<typeof couponSchema>;

export function readCouponForm(formData: FormData) {
  return couponSchema.safeParse({
    code: String(formData.get('code') ?? '').trim().toUpperCase(),
    discountType: formData.get('discountType'),
    discountValue: formData.get('discountValue'),
    minAmount: formData.get('minAmount') || 0,
    maxUses: formData.get('maxUses') || undefined,
    maxDiscountAmount: formData.get('maxDiscountAmount') || undefined,
    perCustomerLimit: formData.get('perCustomerLimit') || undefined,
    budgetCap: formData.get('budgetCap') || undefined,
    firstBookingOnly: formData.get('firstBookingOnly') === 'on',
    description: String(formData.get('description') ?? '').trim() || undefined,
    startsAt: parseWita(formData.get('startsAt')),
    expiresAt: parseWita(formData.get('expiresAt')),
    allRoutes: formData.get('appliesToRouteCodesAll') === 'on',
    routeCodes: readList(formData, 'appliesToRouteCodes'),
    allOperators: formData.get('appliesToOperatorIdsAll') === 'on',
    operatorIds: readList(formData, 'appliesToOperatorIds'),
  });
}

/**
 * The Promotion columns a coupon form sets. An empty targeting list means "all"
 * in `validatePromoCode`. The cost bearer is always the platform: Gilifast
 * pays the operator in full and absorbs every discount.
 */
export function couponRecord(d: CouponInput) {
  return {
    discountType: d.discountType,
    discountValue: d.discountValue,
    minAmount: d.minAmount,
    maxUses: d.maxUses ?? null,
    maxDiscountAmount: d.maxDiscountAmount ?? null,
    perCustomerLimit: d.perCustomerLimit ?? null,
    budgetCap: d.budgetCap ?? null,
    firstBookingOnly: d.firstBookingOnly,
    costBearer: 'PLATFORM' as const,
    description: d.description ?? null,
    startsAt: d.startsAt,
    expiresAt: d.expiresAt,
    appliesToRouteCodes: d.allRoutes ? [] : d.routeCodes,
    appliesToOperatorIds: d.allOperators ? [] : d.operatorIds,
  };
}
