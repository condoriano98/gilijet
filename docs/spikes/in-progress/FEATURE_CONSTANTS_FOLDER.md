# Feature: a constants folder for values that are repeated or are policy

**Update 2026-10-30:** committed as `61240c0` and pushed to `staging`. It is **not in `main` yet** (it needs the next PR `staging` → `main`). **Status (2026-10-30):** implemented in the working tree, not committed. Unit, lint, typecheck and the e2e specs listed in QC pass; not yet checked on the staging deployment.
**Created:** 2026-10-30
**Target version:** `[Unreleased]` (refactor, no user-visible change, no schema change, no behaviour change).

## Why

There is no constants folder. Values are spread over the code as literals or as module-local `const`s, and some policy values are written twice. The goal is cleaner code and one place to change a value, without changing what the app does.

## Survey (2026-10-30, `src/` has 355 `.ts`/`.tsx` files)

| What | Finding |
|---|---|
| Existing UPPER_CASE `const`s | 191, in about 70 files (most in `features/marketing`, `payments/webhook-events`, `tickets/boarding-pass`, `app/layout`). Most are private to one module and sit next to the code that uses them. |
| Time arithmetic written inline | about 65 places: `60 * 60 * 1000`, `24 * 60 * 60 * 1000`, `48 * 60 * 60 * 1000`, `2 * 60 * 1000`, cookie `maxAge: 60 * 10`, and so on. |
| Duplicated policy value | the **48-hour refund/reschedule cutoff** is in `features/refunds/refunds.ts:66` and again as a literal in `app/(customer)/[locale]/b/[reference]/page.tsx:569`. CLAUDE.md says refund math lives only in `refunds.ts`, so the second copy can drift. |
| `process.env` read outside `shared/server/env.ts` | 23 places. `APP_BASE_URL` with the `|| 'http://localhost:3000'` fallback and trailing-slash strip is repeated in 4 files (`app/layout.tsx`, `robots.ts`, `sitemap.ts`, `blog/[slug]/page.tsx`). `NODE_ENV === 'production'` for cookies appears twice. |
| Currency and timezone literals | `'IDR'` in about 12 places (`payments/doku.ts`, `webhook-processor.ts`, the marketing deliverers, the book page). `Asia/Jakarta` is hard-coded twice in `env.ts`. `OPERATOR_TIMEZONE` already exists in `shared/lib/datetime.ts`. |
| Cookie names | already constants in `shared/server/auth.ts` (`gilifast_op`, `gilifast_admin`, `gilifast_cust`); other cookies (consent, attribution, visitor, OAuth state) live in their own modules. |
| Enum-like strings | about 189 literals such as `'PAID'`, `'AWAITING_CONFIRMATION'`, `'CANCELLED'`. These are Prisma enums, so the source of truth is `@prisma/client`, not a new constants file (see decision 2). |
| Route path strings | about 198 literals (`'/admin/...'`, `'/operator/...'`, `'/api/...'`) used in `redirect()`, `revalidatePath`, links and `fetch`. |

## Rules for what moves (so this stays clean, not busy)

Move a value to the constants folder only if it is at least one of:
1. **Used in two or more files** (or written twice in one), or
2. **A business or policy number** someone may need to change or review (hold time, cutoffs, windows, limits, rates, retention), or
3. **A shared identifier** (currency, timezone, brand and site strings, cookie names, header names).

Keep it where it is if it is private to one module and only explains that module (a regex, a parser table, a UI layout size, a local retry count). Moving those makes the code harder to read. No wrappers, no speculative "config" layers (CLAUDE.md "Don't"). Values are moved verbatim: the same number, the same string.

## Proposed structure

Layers stay one way (`app` → `features` → `shared`), so shared constants cannot import features.

```
src/shared/constants/
  time.ts        MS_PER_SECOND/MINUTE/HOUR/DAY, SECONDS_PER_*, and small helpers' inputs (no logic)
  locale.ts      OPERATOR_TIMEZONE (re-homed from datetime.ts), DEFAULT_REPORT_TIMEZONE, DEFAULT_CURRENCY ('IDR')
  site.ts        brand name, tab title, default base URL fallback, support contact placeholders
  auth.ts        cookie names, session lifetimes, OAuth state max age
  index.ts       barrel (optional; decide in the plan)
src/features/<domain>/constants.ts   domain policy that more than one file in that domain needs:
  refunds/       REFUND_CUTOFF_HOURS (48) and the tier fractions' inputs, used by refunds.ts AND b/[reference]/page.tsx
  booking/       hold, PayPal verify window, countdown warning, reschedule window defaults
  payments/      webhook rate windows, stuck-processing, retry spacing
  marketing/     match/retention windows, delivery max ages, consent and visitor cookie ages
  tickets/       forward windows, parse limits
  schedules/     MIN_TRANSFER_MINUTES, search horizon defaults
```

Notes:
- `shared/lib/datetime.ts` keeps its functions; only `OPERATOR_TIMEZONE` moves (and is re-exported or its imports updated in the same step).
- `env.ts` stays the only reader of `process.env`; the 23 stray reads are folded into `env.ts` accessors where they are config (base URL, tokens, flags). That is a dedupe, not a constant, and is Phase 3 so it can be dropped without blocking the rest.
- Environment-driven numbers (`BOOKING_HOLD_MINUTES`, `PLATFORM_COMMISSION_RATE`) stay env values with their defaults in `env.ts`; constants only hold values that are not configurable.

## Phases (each its own commit; tests run before each)

1. **Time and shared identifiers.** Add `shared/constants/{time,locale,site,auth}.ts`. Replace the inline `60 * 60 * 1000` family and the `'IDR'` / timezone / cookie-name literals. Mechanical, behaviour identical.
2. **Domain policy.** One `constants.ts` per domain for values used by 2+ files. First fix: the 48-hour cutoff used by both `refunds.ts` and the booking page, so there is one definition.
3. **Env dedupe.** `siteUrl()` accessor in `shared/server/env.ts` (replaces the 4 copies of the base URL), and the other config reads. Remove the `Asia/Jakarta` duplicate in `env.ts`.
4. **(Optional) Routes.** A small map only for paths used in 3+ places (login redirects, `revalidatePath` targets). Not all 198 literals: links in JSX are clearer inline.
5. **Guard.** An ESLint `no-restricted-syntax` rule (or a unit test) that flags inline `60 * 60 * 1000`-style arithmetic outside `shared/constants`, so the problem does not grow back.

## Out of scope

- Changing any value. If a value looks wrong it is reported, not changed, in a separate task.
- Moving module-private constants "for tidiness".
- Translations in `src/messages` and copy strings.
- Prisma enum string literals, unless decision 2 says otherwise.
- Test files, except where an import path changes.

## Decisions (answered 2026-10-30: all four defaults accepted)

1. **Direct file imports, no barrel.** (Was: barrel `index.ts` or direct imports?) Direct imports (`@/shared/constants/time`) are easier to trace; a barrel is shorter. Default proposal: direct.
2. **Enum literals (`'PAID'`, ...).** Option A (default): leave them, they are typed by Prisma. Option B: use the Prisma enum objects (`BookingStatus.PAID`) in server code; client components cannot import the Prisma runtime, so those would need a small shared list. Option B is a bigger change; do it only if you want it.
3. **Routes map (phase 4):** do it or skip?
4. **ESLint guard (phase 5):** rule or unit test?

## Risks and how they are handled

- **Silent value drift:** a typo changes a number. Mitigation: values are moved verbatim; a unit test asserts each moved constant equals its previous literal; the existing suites (refunds, expiry, webhooks, marketing, pricing) must pass unchanged.
- **Client/server boundary:** a constants file imported by a client component must not import server code. `shared/constants` has no imports, which keeps it safe for both.
- **Merge noise:** about 100 files may change. Phases are separate commits so each can be reviewed and reverted alone; do it while few feature branches are open (the marketing and redesign work touch the same files).
- **Protected flows:** booking, payments, refunds and tickets files are touched only for constants with identical values; `code-reviewer` and the security-auditor read the diff.

## Test plan (rule 2, 3 and 6)

- Unit: one test per constants file asserting the exact values and units (for example `MS_PER_DAY === 86_400_000`, `REFUND_CUTOFF_HOURS * MS_PER_HOUR === 48 * 60 * 60 * 1000`); an assertion that the refunds page and `refunds.ts` read the same constant.
- Existing unit suites unchanged and green; `pnpm lint` and `pnpm typecheck` clean.
- E2E: `customer-booking`, `round-trip-booking`, `reschedule-season`, `admin-refund`, `marketing-consent`, `eticket-*` unchanged and green (staging DB, fixtures removed).
- Dev server QC: a booking with its payment countdown, the refund and reschedule screens (the 48-hour boundary), the home and search pages, an admin diagnostics page.
- Record in this doc what ran and what could not be verified.

## Done when

- [x] Decisions 1-4 answered (defaults).
- [x] Phases 1 to 5 done (see QC for what each covered). Not committed yet.
- [x] The refund cutoff has one definition; the base URL has one accessor.
- [x] A final `git grep` finds no inline time arithmetic, `'IDR'` or timezone literal outside the constants files (two comment/example strings remain: a note in `marketing/ads/csv.ts` and a comment in `mcp/serialize.ts`).
- [x] Docs swept (rule 7): `STRUCTURE.md`, `CLAUDE.md` ("Where code goes" and the refund line), `CHANGELOG.md` `[Unreleased]`. `README.md` and `.claude/agents/*.md` do not mention these values.
- [x] `pnpm lint`, `pnpm typecheck`, unit and the e2e specs listed in QC pass.
- [x] QC recorded here.

## QC and findings

### What was done (2026-10-30)

- **Phase 1:** `shared/constants/{time,locale,auth,site,platform,calendar,routes}.ts`. About 65 inline time expressions in 33 files became `MS_PER_*` / `SECONDS_PER_*`; `'IDR'` (9 files) became `DEFAULT_CURRENCY`; `OPERATOR_TIMEZONE` moved out of `shared/lib/datetime.ts` (importers and the datetime test updated); the `Asia/Jakarta` default is one constant; cookie names, session length and the Google OAuth state cookie (it was defined in both the start and callback routes) are in `constants/auth.ts`.
- **Phase 2:** `features/{refunds,booking,schedules,payments,marketing}/constants.ts`. `REFUND_CUTOFF_HOURS` (48) and `FULL_REFUND_WINDOW_HOURS` (168) now serve `refunds.ts` and the booking page; `REVIEW_OPENS_AFTER_DEPARTURE_MS`; `DEFAULT_LOOKAHEAD_DAYS` (search page and home data); `CASH_DRAWER_METHODS` (was copied in two files); `VISITOR_COOKIE` (was defined twice) and the three marketing cookie lifetimes; `DEFAULT_COMMISSION_RATE` and `PLATFORM_CONFIG_ID` (each defined twice, and 0.08 a third time in `env.ts`); `MONTH_NAMES_SHORT_ID` (two copies).
- **Phase 3 (narrowed):** `siteUrl()` in `shared/server/site-url.ts` replaces the four copies of the base URL fallback (layout, robots, sitemap, blog page); `DEFAULT_APP_BASE_URL` is used in `env.ts`. The other `process.env` reads (about 19: WhatsApp, MCP, build info, NODE_ENV checks, marketing tags) were **not** moved into `env.ts`; each is a separate behaviour question and was left alone.
- **Phase 4 (narrowed):** only the three login redirect paths, each used from three files (`routes.ts`). The other repeated redirects (for example `/admin/console/coupons`, 8 uses) sit in one file, so they stay inline.
- **Phase 5:** the guard is a unit test, not an ESLint rule (`tests/unit/shared/constants/constants.test.ts`). It pins every moved value, checks the refund tier boundaries (169, 168, 48 and 47 hours), and scans `src/` for inline time arithmetic and for the timezone and currency literals.

Values were moved verbatim. Coincidental duplicates were deliberately **not** merged: `72 * MS_PER_HOUR` (GA4 max age vs FX rate age), `10 * MS_PER_MINUTE` (three unrelated windows), `5 * MS_PER_MINUTE`, `STUCK_PROCESSING_MS` (5 min in webhooks, 10 min in marketing) and `PROVIDER_TIMEOUT_MS` (10 s vs 3 s). Merging them would tie unrelated policies together.

### QC

| Check | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | 0 errors; 1 existing warning in `postcss.config.mjs` |
| `pnpm test:unit` | 90 files, 1304 tests passed (was 89 files, 1294; the new file adds 10) |
| e2e on the staging DB, mock payments, all live keys blanked: `customer-booking`, `round-trip-booking` (2), `seasonal-booking` (3), `reschedule-season` (3), `admin-refund`, `admin-diagnostics` (2), `operator-manifest`, `marketing-consent` (5), `tab-branding` (3) | 21 passed. With the DOKU/PayPal/WhatsApp/SMTP keys set, the booking and round-trip specs skip themselves; that is by design (`requireMockPayments`) |
| Dev server smoke: `/operator` and `/admin` redirect to their login pages, `/en/account` redirects, `/robots.txt`, `/sitemap.xml`, `/icon` and both login pages return 200, Google start redirects back when OAuth is off | as expected. The sitemap shows `yourdomain.com` because `APP_BASE_URL` in `.env.local` is that placeholder; not caused by this work |

### Not verified

- `mobile-layout.spec.ts` was not run (it is unrelated to the moved values; it was red once on 2026-10-26 for another reason).
- Nothing was checked on the staging deployment, in a real browser, or with a logged-in customer session. The account-page redirect and the review window are covered by the unit pins and by reading the source, not by a click-through.
- The review window and the lookahead constant have no e2e; they are pinned by the unit test only.
- `scripts/` and `prisma/` were not touched; their literals are outside this task.
- Four unused imports that were already there (`getReturnLeg`, `getAllLegsForBooking`, `expireStalePendingBookings`, `getMainLeg`) were left.
- About 190 enum string literals (`'PAID'` and the like) were left on purpose (decision 2).
