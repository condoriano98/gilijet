import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
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
  if (!parsed.success) {
    if (process.env.NODE_ENV === "production") {
      console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
      throw new Error("Invalid environment variables");
    }
    // In dev, allow partial env so `next build` etc. doesn't blow up.
    console.warn(
      "[env] Invalid or missing variables (continuing in non-production):",
      parsed.error.flatten().fieldErrors,
    );
    return envSchema.partial().parse(process.env) as z.infer<typeof envSchema>;
  }
  return parsed.data;
}

export const env = loadEnv();
