/**
 * Hand-authored inventory of what this platform actually does.
 *
 * Why hand-authored and not derived by walking `app/`: a filesystem scan cannot
 * tell shipped from unbuilt. `armada/bahan-bakar` is an empty "Phase B+" state
 * that a scan reports as a working fuel log; four `operasi/*` routes are bare
 * `redirect()` aliases a scan counts twice; and five Prisma models
 * (LoyaltyAccount, LoyaltyTransaction, BoatPosition, WeatherForecast,
 * BookingAddon) have no UI at all. `status` is the field that carries the
 * distinction, so it has to be stated rather than inferred.
 *
 * Kept dependency-free on purpose — read by the review MCP server in a plain
 * Node process, so it must not pull in React, next/*, or the Prisma client.
 *
 * tests/unit/feature-catalog.test.ts fails if a `routes`/`modules` path stops
 * existing or a `models` name leaves schema.prisma, so drift shows up as a red
 * test rather than as a stale answer given to whoever is reviewing.
 */

export type FeatureStatus =
  /** Built and reachable in the UI. */
  | "shipped"
  /** Works, with a known gap called out in `notes`. */
  | "partial"
  /** Built but unreachable in production. `notes` must say why. */
  | "broken"
  /** Route exists but renders an empty state — not usable yet. */
  | "placeholder"
  /** Data model exists, no UI reads or writes it. */
  | "schema-only"
  /** Redirect to a canonical route. Not a separate feature; do not count it. */
  | "alias";

export type FeatureArea =
  | "customer"
  | "operator"
  | "admin"
  | "api"
  | "platform";

export type Feature = {
  id: string;
  area: FeatureArea;
  name: string;
  /** Indonesian UI label, where the interface differs from `name`. */
  labelId?: string;
  status: FeatureStatus;
  /** Repo-relative page/route files. Verified to exist by the drift test. */
  routes: string[];
  /** lib/ modules owning the logic. Verified to exist by the drift test. */
  modules: string[];
  /** Prisma models. Verified against schema.prisma by the drift test. */
  models: string[];
  notes?: string;
};

const CUSTOMER: Feature[] = [
  {
    id: "customer-home",
    area: "customer",
    name: "Home & route discovery",
    status: "shipped",
    routes: ["app/(customer)/[locale]/page.tsx"],
    modules: ["lib/home-data.ts", "lib/destination-photos.ts", "lib/geo.ts"],
    models: ["Leg", "Schedule", "Review"],
    notes: "Hero search, popular routes, departing-today, reviews, nearest port.",
  },
  {
    id: "customer-search",
    area: "customer",
    name: "Search departures",
    status: "shipped",
    routes: ["app/(customer)/[locale]/search/page.tsx"],
    modules: [
      "lib/connection-search.ts",
      "lib/seat-urgency.ts",
      "lib/sea-conditions.ts",
      "lib/fx.ts",
    ],
    models: ["Leg", "Schedule", "Boat"],
    notes: "Includes multi-leg connecting routes and seat-scarcity cues.",
  },
  {
    id: "customer-booking",
    area: "customer",
    name: "Booking flow",
    status: "shipped",
    routes: [
      "app/(customer)/[locale]/book/[legId]/page.tsx",
      "app/(customer)/[locale]/checkout/[reference]/page.tsx",
    ],
    modules: ["lib/booking-engine.ts", "lib/pricing.ts", "lib/promotions.ts"],
    models: ["Booking", "SeatHold"],
    notes:
      "Seat hold is taken before payment; the hold-vs-confirm race is owned by lib/booking-engine.ts.",
  },
  {
    id: "customer-payment",
    area: "customer",
    name: "Payment (DOKU Checkout)",
    status: "shipped",
    routes: ["app/(customer)/[locale]/pay/[reference]/page.tsx"],
    modules: ["lib/psp.ts", "lib/doku.ts"],
    models: ["Payment"],
    notes: "Falls back to a mock gateway when DOKU keys are absent.",
  },
  {
    id: "customer-ticket",
    area: "customer",
    name: "E-ticket & booking lookup",
    status: "shipped",
    routes: [
      "app/(customer)/[locale]/b/page.tsx",
      "app/(customer)/[locale]/b/[reference]/page.tsx",
      "app/print/b/[reference]/page.tsx",
    ],
    modules: ["lib/qr.ts", "lib/qr-render.ts", "lib/references.ts"],
    models: ["Ticket", "Booking"],
    notes: "Reference lookup needs no login. QR codes are HMAC-signed.",
  },
  {
    id: "customer-reschedule",
    area: "customer",
    name: "Reschedule request",
    status: "shipped",
    routes: ["app/(customer)/[locale]/b/[reference]/reschedule/page.tsx"],
    modules: ["lib/refunds.ts"],
    models: ["RescheduleRequest"],
    notes: "Customer requests; an admin decides. Not self-service.",
  },
  {
    id: "customer-account",
    area: "customer",
    name: "Accounts & auth",
    status: "shipped",
    routes: [
      "app/(customer)/[locale]/account/page.tsx",
      "app/(customer)/[locale]/account/login/page.tsx",
      "app/(customer)/[locale]/account/register/page.tsx",
      "app/(customer)/[locale]/account/forgot-password/page.tsx",
      "app/(customer)/[locale]/account/reset-password/page.tsx",
    ],
    modules: ["lib/auth.ts", "lib/google-oauth.ts", "lib/login-throttle.ts"],
    models: ["Customer", "PasswordResetToken", "LoginAttempt"],
    notes: "Password + Google OAuth. Booking does not require an account.",
  },
  {
    id: "customer-reviews",
    area: "customer",
    name: "Post-voyage reviews",
    status: "shipped",
    routes: ["app/(customer)/[locale]/reviews/new/page.tsx"],
    modules: [],
    models: ["Review"],
  },
  {
    id: "customer-i18n",
    area: "customer",
    name: "Localisation (en/id/zh/ja)",
    status: "shipped",
    routes: ["middleware.ts", "i18n/routing.ts"],
    modules: [],
    models: [],
    notes:
      "next-intl. Customer surface only — operator and admin are not localised.",
  },
  {
    id: "customer-content",
    area: "customer",
    name: "Policy & marketing pages",
    status: "shipped",
    routes: [
      "app/(customer)/[locale]/refunds/page.tsx",
      "app/(customer)/[locale]/change-plans/page.tsx",
      "app/(customer)/[locale]/best-price-guarantee/page.tsx",
      "app/(customer)/[locale]/blog/page.tsx",
      "app/(customer)/[locale]/about/page.tsx",
      "app/(customer)/[locale]/contact/page.tsx",
      "app/(customer)/[locale]/terms/page.tsx",
      "app/(customer)/[locale]/privacy/page.tsx",
    ],
    modules: ["lib/refunds.ts"],
    models: [],
  },
];

const OPERATOR: Feature[] = [
  {
    id: "operator-signup",
    area: "operator",
    name: "Self-service sign-up & KYB",
    labelId: "Daftar",
    status: "shipped",
    routes: [
      "app/operator/daftar/page.tsx",
      "app/operator/daftar/actions.ts",
      "app/api/operator/document-upload/route.ts",
    ],
    modules: ["lib/operator-documents.ts"],
    models: ["Operator", "OperatorDocument"],
    notes:
      "7 steps: company details, SIUP, NPWP, vessel licence, insurance, captain licence, bank account. Lands in PENDING for admin review. Documents go to Supabase Storage.",
  },
  {
    id: "operator-dashboard",
    area: "operator",
    name: "Dashboard",
    labelId: "Beranda",
    status: "shipped",
    routes: ["app/operator/page.tsx"],
    modules: ["lib/operator-data.ts"],
    models: ["Booking", "Leg"],
    notes: "Today's revenue, tickets sold, occupancy, departures.",
  },
  {
    id: "operator-sales",
    area: "operator",
    name: "Sales & bookings",
    labelId: "Penjualan",
    status: "shipped",
    routes: [
      "app/operator/penjualan/page.tsx",
      "app/operator/penjualan/refund/page.tsx",
    ],
    modules: ["lib/operator-data.ts"],
    models: ["Booking", "Refund"],
    notes: "All channels: web, walk-in, travel agent, phone, aggregator.",
  },
  {
    id: "operator-agents",
    area: "operator",
    name: "Travel agents & commission",
    labelId: "Agen Perjalanan",
    status: "shipped",
    routes: [
      "app/operator/penjualan/agen/page.tsx",
      "app/operator/penjualan/agen/[id]/page.tsx",
    ],
    modules: ["lib/operator-erp-queries.ts"],
    models: ["TravelAgent", "Booking"],
    notes:
      "TravelAgent is the operator's own agent roster. Distinct from the platform-level Agent model, which has no UI.",
  },
  {
    id: "operator-pos",
    area: "operator",
    name: "Port-counter POS",
    labelId: "Kasir Pelabuhan",
    status: "shipped",
    routes: ["app/operator/pos/page.tsx", "app/api/operator/pos/sale/route.ts"],
    modules: ["lib/booking-engine.ts", "lib/pricing.ts"],
    models: ["Booking", "Ticket"],
  },
  {
    id: "operator-cash",
    area: "operator",
    name: "Cash drawer & reconciliation",
    labelId: "Kas & Bank",
    status: "shipped",
    routes: [
      "app/operator/kas/page.tsx",
      "app/operator/kas/rekonsiliasi/page.tsx",
    ],
    modules: [],
    models: ["CashDrawerSession"],
    notes: "Shift open/close with variance tracking.",
  },
  {
    id: "operator-settlement",
    area: "operator",
    name: "Settlement view",
    labelId: "Penyelesaian",
    status: "partial",
    routes: ["app/operator/kas/penyelesaian/page.tsx"],
    modules: [],
    models: ["Booking"],
    notes: "Read-only. No payout execution — settlement is handled off-platform.",
  },
  {
    id: "operator-schedules",
    area: "operator",
    name: "Schedules",
    labelId: "Jadwal",
    status: "shipped",
    routes: [
      "app/operator/schedules/page.tsx",
      "app/operator/schedules/new/page.tsx",
      "app/operator/schedules/[id]/page.tsx",
    ],
    modules: ["lib/legs.ts", "lib/operator-data.ts"],
    models: ["Schedule", "TransitStop"],
    notes:
      "Recurring templates; Legs are generated from these per departure date. Was unreachable behind a next.config.mjs redirect loop until commit 0d445ff — verify /operator/schedules loads after the next deploy.",
  },
  {
    id: "operator-legs",
    area: "operator",
    name: "Departures & manifest",
    labelId: "Keberangkatan",
    status: "shipped",
    routes: [
      "app/operator/legs/page.tsx",
      "app/operator/legs/[id]/page.tsx",
      "app/api/operator/manifest/[legId]/route.ts",
      "app/print/manifest/[legId]/page.tsx",
    ],
    modules: ["lib/legs.ts", "lib/weather-policy.ts"],
    models: ["Leg", "Ticket"],
    notes:
      "Manifests query Legs, not Schedules. CSV and print variants exist. Leg detail — the per-departure manifest and check-in screen — 404'd behind a next.config.mjs redirect loop until commit 0d445ff; it was the highest-impact casualty, so verify it opens after the next deploy.",
  },
  {
    id: "operator-scanner",
    area: "operator",
    name: "QR boarding scanner",
    labelId: "Pemindai QR",
    status: "shipped",
    routes: [
      "app/operator/scanner/page.tsx",
      "app/api/operator/checkin/route.ts",
    ],
    modules: ["lib/qr.ts"],
    models: ["Ticket"],
    notes:
      "Was unreachable behind a next.config.mjs redirect loop until commit 0d445ff. The check-in API was never affected, so offline scanner clients kept working throughout.",
  },
  {
    id: "operator-fleet",
    area: "operator",
    name: "Fleet / boats",
    labelId: "Armada",
    status: "shipped",
    routes: [
      "app/operator/boats/page.tsx",
      "app/operator/boats/new/page.tsx",
      "app/operator/boats/[id]/page.tsx",
    ],
    modules: ["lib/operator-data.ts"],
    models: ["Boat", "BoatFacilitiesOnBoat"],
    notes:
      "Add-boat and edit-boat 404'd behind a next.config.mjs redirect loop until commit 0d445ff — verify both after the next deploy.",
  },
  {
    id: "operator-crew",
    area: "operator",
    name: "Crew roster",
    labelId: "Awak Kapal",
    status: "shipped",
    routes: ["app/operator/awak/page.tsx"],
    modules: [],
    models: ["OperatorStaff"],
  },
  {
    id: "operator-crew-schedule",
    area: "operator",
    name: "Crew schedule & certifications",
    labelId: "Jadwal / Sertifikasi Awak",
    status: "partial",
    routes: [
      "app/operator/awak/jadwal/page.tsx",
      "app/operator/awak/sertifikasi/page.tsx",
      "app/operator/armada/sertifikat/page.tsx",
    ],
    modules: ["lib/operator-documents.ts"],
    models: ["OperatorStaff", "OperatorDocument"],
    notes: "Read-only views. No rostering or renewal workflow.",
  },
  {
    id: "operator-fuel",
    area: "operator",
    name: "Fuel log",
    labelId: "Bahan Bakar",
    status: "placeholder",
    routes: ["app/operator/armada/bahan-bakar/page.tsx"],
    modules: [],
    models: [],
    notes: "Empty state labelled Phase B+. No data model exists.",
  },
  {
    id: "operator-maintenance",
    area: "operator",
    name: "Maintenance log",
    labelId: "Pemeliharaan",
    status: "placeholder",
    routes: ["app/operator/armada/pemeliharaan/page.tsx"],
    modules: [],
    models: [],
    notes: "Empty state labelled Phase B+. No data model exists.",
  },
  {
    id: "operator-accounting",
    area: "operator",
    name: "Accounting & e-Faktur",
    labelId: "Akuntansi",
    status: "partial",
    routes: ["app/operator/akuntansi/page.tsx"],
    modules: ["lib/operator-erp-queries.ts"],
    models: ["Booking"],
    notes:
      "A reporting view over Booking.eFakturNumber/eFakturStatus with manual status transitions. There is no accounting subsystem and no Coretax integration.",
  },
  {
    id: "operator-tax",
    area: "operator",
    name: "Tax reporting (PPN / PPh23)",
    labelId: "Pajak",
    status: "partial",
    routes: [
      "app/operator/pajak/page.tsx",
      "app/api/operator/tax/[period]/csv/route.ts",
    ],
    modules: ["lib/operator-erp-queries.ts"],
    models: ["Booking"],
    notes:
      "Derived read-only view plus CSV export. No tax models; nothing is filed from here.",
  },
  {
    id: "operator-payroll",
    area: "operator",
    name: "Payroll / staff commission",
    labelId: "Penggajian",
    status: "partial",
    routes: ["app/operator/penggajian/page.tsx"],
    modules: ["lib/operator-erp-queries.ts"],
    models: ["OperatorStaff", "Booking"],
    notes:
      "Commission computed from confirmed sales, with period locking. No payroll model, no BPJS or PPh21.",
  },
  {
    id: "operator-reports",
    area: "operator",
    name: "Reports",
    labelId: "Laporan",
    status: "shipped",
    routes: [
      "app/operator/laporan/page.tsx",
      "app/api/operator/reports/[kind]/csv/route.ts",
    ],
    modules: ["lib/operator-erp-queries.ts", "lib/erp-pricing.ts"],
    models: ["Booking", "Leg", "Refund"],
    notes:
      "Four kinds: revenue-by-channel, refund-ratio, agent-leaderboard, cancellation-weather.",
  },
  {
    id: "operator-settings",
    area: "operator",
    name: "Settings, staff & bank details",
    labelId: "Pengaturan",
    status: "shipped",
    routes: ["app/operator/pengaturan/page.tsx"],
    modules: [],
    models: ["Operator", "OperatorStaff"],
  },
  {
    id: "operator-nav-aliases",
    area: "operator",
    name: "Indonesian nav aliases",
    status: "alias",
    routes: [
      "app/operator/operasi/jadwal/page.tsx",
      "app/operator/operasi/keberangkatan/page.tsx",
      "app/operator/operasi/pemindai/page.tsx",
      "app/operator/armada/page.tsx",
      "components/operator-shell/sidebar.tsx",
    ],
    modules: [],
    models: [],
    notes:
      "One-hop redirects to the canonical English routes, which is what the sidebar links to. Not features — do not count them. Until commit 0d445ff next.config.mjs redirected the English routes back here, making every pair an infinite loop.",
  },
];

const ADMIN: Feature[] = [
  {
    id: "admin-overview",
    area: "admin",
    name: "Platform overview",
    status: "shipped",
    routes: ["app/admin/(authed)/page.tsx"],
    modules: [],
    models: ["Booking", "Operator"],
  },
  {
    id: "admin-operators",
    area: "admin",
    name: "Operator management & KYB review",
    status: "shipped",
    routes: [
      "app/admin/(authed)/operators/page.tsx",
      "app/admin/(authed)/operators/new/page.tsx",
      "app/admin/(authed)/operators/[id]/page.tsx",
    ],
    modules: ["lib/operator-documents.ts", "lib/audit.ts"],
    models: ["Operator", "OperatorDocument"],
    notes:
      "Approve/suspend/reject operators; approve or reject each KYB document via signed URLs.",
  },
  {
    id: "admin-bookings",
    area: "admin",
    name: "All bookings + CSV export",
    status: "shipped",
    routes: [
      "app/admin/(authed)/bookings/page.tsx",
      "app/api/admin/bookings/csv/route.ts",
    ],
    modules: [],
    models: ["Booking"],
  },
  {
    id: "admin-refunds",
    area: "admin",
    name: "Refund queue",
    status: "shipped",
    routes: ["app/admin/(authed)/refunds/page.tsx"],
    modules: ["lib/refunds.ts", "lib/refund-gateway.ts", "lib/audit.ts"],
    models: ["Refund", "Booking"],
    notes:
      "Gated by requireAdmin(), so a STAFF admin can approve refunds — this is not a super-admin-only action today.",
  },
  {
    id: "admin-reschedules",
    area: "admin",
    name: "Reschedule decisions",
    status: "shipped",
    routes: ["app/admin/(authed)/reschedules/page.tsx"],
    modules: ["lib/audit.ts"],
    models: ["RescheduleRequest"],
  },
  {
    id: "admin-console-coupons",
    area: "admin",
    name: "Owner console — coupons",
    status: "shipped",
    routes: [
      "app/admin/(authed)/console/coupons/page.tsx",
      "app/admin/(authed)/console/coupons/new/page.tsx",
      "app/admin/(authed)/console/coupons/[id]/page.tsx",
      "app/admin/(authed)/console/actions.ts",
    ],
    modules: ["lib/promotions.ts"],
    models: ["Promotion", "PromotionRedemption"],
    notes:
      "SUPER_ADMIN only. Budget caps, per-customer limits, route/operator targeting, bulk code generation, and a cost-bearer choice (PLATFORM / OPERATOR / SHARED) deciding who absorbs the discount.",
  },
  {
    id: "admin-console-pricing",
    area: "admin",
    name: "Owner console — platform economics",
    status: "shipped",
    routes: ["app/admin/(authed)/console/pricing/page.tsx"],
    modules: ["lib/platform-config.ts", "lib/pricing.ts"],
    models: ["PlatformConfig", "Operator"],
    notes:
      "SUPER_ADMIN only. Default commission, optional service fee, traveler multipliers, per-operator commission override.",
  },
  {
    id: "admin-console-analytics",
    area: "admin",
    name: "Owner console — discount analytics",
    status: "shipped",
    routes: ["app/admin/(authed)/console/page.tsx"],
    modules: [],
    models: ["Promotion", "PromotionRedemption", "Booking"],
    notes: "GMV, effective take-rate net of discounts, budget burn, top coupons.",
  },
  {
    id: "admin-promos-aliases",
    area: "admin",
    name: "Legacy promo redirects",
    status: "alias",
    routes: [
      "app/admin/(authed)/promos/page.tsx",
      "app/admin/(authed)/promos/new/page.tsx",
    ],
    modules: [],
    models: [],
    notes: "Redirect to the owner console. Not features.",
  },
];

const API: Feature[] = [
  {
    id: "api-webhooks",
    area: "api",
    name: "Payment webhooks",
    status: "shipped",
    routes: ["app/api/webhooks/doku/route.ts"],
    modules: [
      "lib/doku.ts",
      "lib/webhook-processor.ts",
      "lib/ticket-issuer.ts",
    ],
    models: ["Payment", "WebhookEvent", "Ticket"],
    notes:
      "Signatures verified timing-safely. Replay-protected by a WebhookEvent unique constraint. DOKU is the only gateway.",
  },
  {
    id: "api-cron-active",
    area: "api",
    name: "Scheduled jobs",
    status: "shipped",
    routes: [
      "app/api/cron/retry-webhooks/route.ts",
      "app/api/cron/topup-legs/route.ts",
      "vercel.json",
    ],
    modules: ["lib/legs.ts", "lib/webhook-processor.ts"],
    models: ["WebhookEvent", "Leg"],
    notes: "The only two jobs actually scheduled in vercel.json. CRON_SECRET-gated.",
  },
  {
    id: "api-cron-unscheduled",
    area: "api",
    name: "Unscheduled cron endpoints",
    status: "partial",
    routes: [
      "app/api/cron/send-reminders/route.ts",
      "app/api/cron/poll-bmkg/route.ts",
      "app/api/cron/refresh-fx/route.ts",
    ],
    modules: ["lib/email.ts", "lib/fx.ts", "lib/weather-policy.ts"],
    models: ["NotificationLog", "WeatherSnapshot", "FxRate"],
    notes:
      "Implemented and callable but absent from vercel.json crons, so they never run on their own. Departure reminders, BMKG weather, and FX refresh are therefore effectively inactive.",
  },
  {
    id: "api-public",
    area: "api",
    name: "Public JSON endpoints",
    status: "shipped",
    routes: [
      "app/api/bookings/route.ts",
      "app/api/promos/validate/route.ts",
      "app/api/bookings/[reference]/ics/route.ts",
      "app/api/auth/me/route.ts",
    ],
    modules: ["lib/booking-engine.ts", "lib/promotions.ts"],
    models: ["Booking", "Promotion"],
  },
];

const PLATFORM: Feature[] = [
  {
    id: "platform-pricing",
    area: "platform",
    name: "Pricing engine",
    status: "shipped",
    routes: [],
    modules: ["lib/pricing.ts", "lib/platform-config.ts"],
    models: ["PlatformConfig"],
    notes:
      "Single source of truth for booking totals. Decimal-safe. Handles traveler multipliers, yield tiers, service fee, and the three coupon cost-bearer splits. Operator payout is floored at 0.",
  },
  {
    id: "platform-refunds",
    area: "platform",
    name: "Refund policy engine",
    status: "shipped",
    routes: [],
    modules: ["lib/refunds.ts"],
    models: ["Refund"],
    notes: "Tiered by hours before departure. Policy is snapshotted onto each booking.",
  },
  {
    id: "platform-seat-holds",
    area: "platform",
    name: "Seat reservation & booking lifecycle",
    status: "shipped",
    routes: [],
    modules: ["lib/booking-engine.ts", "lib/booking-expiry.ts"],
    models: ["SeatHold", "Booking", "Leg"],
    notes: "Owns the hold-vs-confirm race. New seat code must reuse it.",
  },
  {
    id: "platform-auth",
    area: "platform",
    name: "Auth & tenant scoping",
    status: "shipped",
    routes: [],
    modules: ["lib/auth.ts", "lib/login-throttle.ts"],
    models: ["Admin", "Operator", "Customer", "LoginAttempt"],
    notes:
      "Signed HttpOnly JWT cookies, separate per audience. Roles are SUPER_ADMIN/STAFF for admins; there is no read-only role. Enforced per page/action — middleware.ts does no auth.",
  },
  {
    id: "platform-audit",
    area: "platform",
    name: "Audit log",
    status: "shipped",
    routes: [],
    modules: ["lib/audit.ts"],
    models: ["AuditLog"],
    notes:
      "Never throws. Indexed on (entityType, entityId) and createdAt only — querying by user or action scans the table.",
  },
  {
    id: "platform-notifications",
    area: "platform",
    name: "Email & WhatsApp",
    status: "partial",
    routes: [],
    modules: ["lib/email.ts"],
    models: ["NotificationLog", "OperatorNotification"],
    notes:
      "Resend with a mock fallback. Departure reminders exist but their cron is unscheduled, so they do not send.",
  },
  {
    id: "platform-fx",
    area: "platform",
    name: "Multi-currency display",
    status: "partial",
    routes: [],
    modules: ["lib/fx.ts"],
    models: ["FxRate"],
    notes: "Display-only conversion; settlement is IDR. Refresh cron is unscheduled.",
  },
  {
    id: "platform-erp-fee",
    area: "platform",
    name: "ERP subscription tiers",
    status: "partial",
    routes: [],
    modules: ["lib/erp-pricing.ts"],
    models: [],
    notes: "Fee tiers computed and surfaced in reports; no billing or invoicing.",
  },
  {
    id: "platform-loyalty",
    area: "platform",
    name: "Loyalty points",
    status: "schema-only",
    routes: [],
    modules: [],
    models: ["LoyaltyAccount", "LoyaltyTransaction"],
    notes: "Models exist with zero references anywhere in app/. No UI, no accrual logic.",
  },
  {
    id: "platform-addons",
    area: "platform",
    name: "Booking add-ons",
    status: "schema-only",
    routes: [],
    modules: [],
    models: ["BookingAddon"],
    notes: "Model exists with zero references in app/. Not purchasable.",
  },
  {
    id: "platform-vessel-tracking",
    area: "platform",
    name: "Vessel position tracking",
    status: "schema-only",
    routes: [],
    modules: [],
    models: ["BoatPosition"],
    notes: "Model exists with zero references in app/. No ingestion, no map.",
  },
  {
    id: "platform-weather-forecast",
    area: "platform",
    name: "Weather forecasting",
    status: "schema-only",
    routes: [],
    modules: ["lib/weather-policy.ts"],
    models: ["WeatherForecast", "WeatherSnapshot"],
    notes:
      "Sailability logic and models exist; WeatherForecast is unreferenced in app/ and the BMKG poll cron is unscheduled.",
  },
  {
    id: "platform-agents",
    area: "platform",
    name: "Platform-level agent accounts",
    status: "schema-only",
    routes: [],
    modules: [],
    models: ["Agent"],
    notes:
      "Distinct from the operator-owned TravelAgent, which does have UI. Agent has no login route and its apiKey column is unused.",
  },
];

export const FEATURES: Feature[] = [
  ...CUSTOMER,
  ...OPERATOR,
  ...ADMIN,
  ...API,
  ...PLATFORM,
];

/** Features in one area. */
export function featuresByArea(area: FeatureArea): Feature[] {
  return FEATURES.filter((f) => f.area === area);
}

/** Look up one feature by id. */
export function featureById(id: string): Feature | undefined {
  return FEATURES.find((f) => f.id === id);
}

/**
 * Count per status. `alias` entries are included here but are navigation
 * redirects rather than capabilities, so exclude them when reporting how much
 * of the platform is built.
 */
export function statusCounts(features: Feature[] = FEATURES): Record<FeatureStatus, number> {
  const counts: Record<FeatureStatus, number> = {
    shipped: 0,
    partial: 0,
    broken: 0,
    placeholder: 0,
    "schema-only": 0,
    alias: 0,
  };
  for (const f of features) counts[f.status] += 1;
  return counts;
}
