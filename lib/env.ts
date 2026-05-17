import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  // Direct (non-pooled) URL used by `prisma db push` / `prisma migrate`.
  // The runtime client never reads this — only the Prisma CLI does — so
  // it's optional from the Next.js process's perspective.
  DIRECT_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(16),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  XENDIT_SECRET_KEY: z.string().optional(),
  XENDIT_WEBHOOK_VERIFICATION_TOKEN: z.string().optional(),
  XENDIT_CALLBACK_URL: z.string().url().optional(),

  WATI_API_KEY: z.string().optional(),
  WATI_TENANT_ID: z.string().optional(),
  WATI_API_URL: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),

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

  // During `next build` (`NEXT_PHASE === "phase-production-build"`) the
  // hosting platform's runtime env may not be wired in yet — Vercel, for
  // instance, only exposes server env at request time. Don't fail the
  // build for it; just warn. We still hard-fail at runtime below.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const missing = Object.keys(parsed.error.flatten().fieldErrors);

  if (isBuild) {
    console.warn(
      "[env] missing/invalid at build time (ok if set at runtime):",
      missing,
    );
    return envSchema.partial().parse(process.env) as z.infer<typeof envSchema>;
  }

  if (process.env.NODE_ENV === "production") {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  // Dev: tolerate so `next dev` and unit-test runs aren't blocked.
  console.warn(
    "[env] Invalid or missing variables (continuing in non-production):",
    parsed.error.flatten().fieldErrors,
  );
  return envSchema.partial().parse(process.env) as z.infer<typeof envSchema>;
}

export const env = loadEnv();
