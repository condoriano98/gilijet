import "./env-shim";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  // Direct (non-pooled) URL used by `prisma db push` / `prisma migrate`.
  // The runtime client never reads this — only the Prisma CLI does — so
  // it's optional from the Next.js process's perspective.
  DIRECT_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(16),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Midtrans Snap — the primary payment gateway.
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_IS_PRODUCTION: z
    .string()
    .optional()
    .transform((v) => v === "true")
    .default("false"),

  // Xendit (legacy — diagnostics/refunds only).
  XENDIT_SECRET_KEY: z.string().optional(),
  XENDIT_WEBHOOK_VERIFICATION_TOKEN: z.string().optional(),

  WATI_API_KEY: z.string().optional(),
  WATI_TENANT_ID: z.string().optional(),
  WATI_API_URL: z.string().optional(),

  CRON_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z
    .string()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),

  QR_HMAC_SECRET: z.string().min(32),

  PLATFORM_COMMISSION_RATE: z
    .string()
    .default("0.08")
    .transform((v) => Number(v)),
  BOOKING_HOLD_MINUTES: z
    .string()
    .default("30")
    .transform((v) => Number(v)),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const isProd = process.env.NODE_ENV === "production";
  const fieldErrors = parsed.error.flatten().fieldErrors;
  const missing = Object.keys(fieldErrors);

  const logger = isBuild || !isProd ? console.warn : console.error;
  const label = isBuild
    ? "[env] missing/invalid at build time (ok if set at runtime):"
    : "[env] Invalid or missing variables (continuing in degraded mode):";
  logger(label, isBuild ? missing : fieldErrors);

  // Fall back to a partial parse. Using safeParse here is critical —
  // partial() makes fields optional but the per-field validators (e.g.
  // .url()) still run on any value that IS present. A malformed env
  // var (e.g. APP_BASE_URL set to a non-URL) would otherwise
  // throw at module load and crash any route that imports `env`,
  // taking the whole build / deploy down. Never throw here.
  const partial = envSchema.partial().safeParse(process.env);
  if (partial.success) {
    return partial.data as z.infer<typeof envSchema>;
  }

  // Last resort: validate each field independently and keep the ones that
  // pass. A single malformed optional var (e.g. a bad XENDIT_CALLBACK_URL)
  // must NEVER blank out the whole env — DATABASE_URL, auth secrets and the
  // payment gateway keys have to survive. (Returning {} here was catastrophic.)
  console.error(
    "[env] Partial parse failed; salvaging valid fields individually:",
    partial.error.flatten().fieldErrors,
  );
  const salvaged: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(envSchema.shape)) {
    const r = (fieldSchema as z.ZodTypeAny).safeParse(process.env[key]);
    if (r.success && r.data !== undefined) salvaged[key] = r.data;
  }
  return salvaged as z.infer<typeof envSchema>;
}

const _env = loadEnv();

// Zod's `.partial()` degraded-mode fallback (and the empty-object fallback)
// both BYPASS field defaults, so numeric-with-default fields can come back
// `undefined`. Pricing/booking math builds `new Prisma.Decimal(...)` from
// these, and `Decimal(undefined)` throws. Coalesce to safe defaults here so
// the app never crashes when an unrelated required env var is missing.
function numOr(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
_env.PLATFORM_COMMISSION_RATE = numOr(_env.PLATFORM_COMMISSION_RATE, 0.08);
_env.BOOKING_HOLD_MINUTES = numOr(_env.BOOKING_HOLD_MINUTES, 30);
if (typeof _env.APP_BASE_URL !== "string" || !_env.APP_BASE_URL) {
  _env.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";
}

export const env = _env;
