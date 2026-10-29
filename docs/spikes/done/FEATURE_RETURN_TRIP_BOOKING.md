# Feature: Return Trip Booking (Round Trip) End-to-End

**Status:** ✅ Implemented and on `staging` (v1.1.0); bug round-trip GIL-28 fixed and verified there (2026-10-09). Phase 8 (production) not done (2026-10-14).  
**Created:** 2026-09-28  
**Updated:** 2026-10-14 (acceptance criteria checked against code and the staging verification in `BUGS_ROUND_TRIP.md`)  
**Update 2026-10-29 (v1.10.2):** the pricing described below (each leg at its one-way fare) is outdated. A round-trip leg is now charged half of the price sheet's `return` fare; see `docs/spikes/in-progress/BUG_ROUND_TRIP_PRICE_EQUALS_TWO_ONE_WAY.md`.  
**Update 2026-10-30:** round trip, seasonal pricing and the migrations behind them are in `main` and live on production. The owner reports (2026-10-30) a production verification test (PVT) on 2026-10-29 with the business team, and round trip passed. That test ran on what production served before PR #7 merged (`main` at 1.10.1, merge #6 of 2026-10-25); the 1.10.2 price change reached `main` with PR #7 on 2026-10-30 00:14 +0700, so the PVT does not cover it (see `BUG_ROUND_TRIP_PRICE_EQUALS_TWO_ONE_WAY.md`). Phase 8 boxes below are left as written because the PVT notes were not recorded here; the date, the tester and which checks were done are not known to this doc. Git tags `v1.1.0`, `v1.1.1` and `v1.2.0` do not exist (CHANGELOG sections only).  
**Note:** paths like `lib/…` below are the old layout; now `src/features/…` (see `STRUCTURE.md`).  
**Owner:** Product Team

---

## 📌 Overview

Enable the return (round trip) booking feature end-to-end so customers can book round-trip tickets in a single transaction instead of booking twice.

---

## 👤 User Story

```
As a customer,
I want to book a round-trip (return) ticket in a single transaction,
So that it is more efficient and I do not need to book twice.
```

**Background:** The "Return" option already exists in the search UI, but does not work yet — customers cannot complete a return booking through to payment.

---

## 🎯 Approach: Single Booking with Dual Legs

### Principle
- **1 Booking Record** (covers outbound + return)
- **1 Payment** (covers both legs)
- **1 Email** (shows both legs)
- **Stored with:** `outboundLegId` + `returnLegId` (references to both legs)

### Visual Structure

```
Round Trip Transaction
├─ Booking ID: BK-2026-001
│  ├─ outboundLegId: LEG-2026-001
│  │  └─ Bali → Jakarta (24 Des, 08:00)
│  │
│  ├─ returnLegId: LEG-2026-002
│  │  └─ Jakarta → Bali (26 Des, 15:00)
│  │
│  ├─ passengers: [Budi, Ani, Citra] (same for outbound & return)
│  ├─ status: PENDING_PAYMENT
│  ├─ tripType: "ROUND_TRIP"
│  │
│  ├─ OUTBOUND INFO
│  │  ├─ leg: Bali → Jakarta (24 Des, 08:00)
│  │  ├─ tickets: [TK-001-1, TK-001-2, TK-001-3] (1 per passenger)
│  │  └─ price: Rp 1,500,000
│  │
│  ├─ RETURN INFO
│  │  ├─ leg: Jakarta → Bali (26 Des, 15:00)
│  │  ├─ tickets: [TK-002-1, TK-002-2, TK-002-3] (1 per passenger)
│  │  └─ price: Rp 1,500,000
│  │
│  └─ TOTAL: Rp 3,000,000
│
└─ PAYMENT (1 transaction)
   ├─ paymentId: PAY-001
   ├─ bookingId: BK-2026-001
   ├─ totalAmount: Rp 3,000,000
   ├─ method: BANK_TRANSFER / CARD / etc
   └─ status: PENDING
```

---

## ✅ Acceptance Criteria

### Search & Select Schedule
- [x] User can choose "One Way" or "Return" on the search page — _search-form.tsx: `tripType` one_way/round_trip_
- [x] For Return: user can enter a date & choose a return schedule — _search-form.tsx: `returnDate`; round-trip-leg-selector_
- [x] Search results show schedule options for both directions (outbound & return) — _verified on staging, BUGS_ROUND_TRIP.md bug #1_

### Booking Flow
- [x] One booking ID covers both trips (outbound + return) — _engine.ts `createRoundTripBooking`; engine-round-trip.test.ts_
- [x] Passenger data is entered once for both trips — _book page: "same passengers apply to both legs"_
- [x] Total price is calculated correctly (outbound + return) — _engine.ts sums both legs; QC season: HIGH+PEAK = 525.000_
- [x] User lihat summary: "Outbound: Rp X | Return: Rp Y | Total: Rp Z" — _v1.2.0: `roundTripBreakdown` (helpers.ts) + `BookingPriceSummary`; e2e `round-trip-booking.spec.ts` (Outbound Rp 225.000, Return Rp 300.000, Total Rp 525.000), screenshot viewed_

### Database
- [x] Booking model has an `outboundLegId` field (reference to the outbound leg) — _schema.prisma_
- [x] Booking model has a `returnLegId` field (reference to the return leg) — _schema.prisma_
- [x] Booking model has a `tripType` field ("ONE_WAY" | "ROUND_TRIP") — _schema.prisma_
- [x] 1 Booking record created (covers 2 legs) — _engine.ts `createBookingRow`_
- [x] 1 Payment record created (covers both) — _engine.ts: nested `payment.create` once_
- [x] Return booking is stored with references to both schedules — _outboundLegId + returnLegId_

### Admin Dashboard
- [x] Admin can see the details of both legs in the dashboard — _verified on staging, bug #3_
- [x] Admin can filter bookings by type (ONE_WAY vs ROUND_TRIP) — _v1.2.0: chip "Trip Type" on `/admin/bookings`, `buildBookingWhere` (admin-filters.ts) also used by the CSV export; e2e `admin-bookings-filter.spec.ts`_
- [x] Admin view shows: booking ref, outbound leg, return leg, combined total — _booking-row.tsx (`isRoundTrip`); admin-booking-display.test.ts_

### Notifications & E-Tickets
- [ ] Email: 1 email with subject "Round Trip Booking Confirmed" — _the actual subject is "Your Gilifast booking <ref>" / "Payment received for <ref>"; the body mentions both legs_
  - Show outbound details (leg, passengers, price)
  - Show return details (leg, passengers, price)
  - Show total payment & invoice
- [x] E-tickets: 2 ticket files (1 outbound, 1 return) in 1 email — _verified on staging (mock email), BUGS_ROUND_TRIP.md putaran 2_
- [x] E-ticket clearly lists both trips — _boarding-pass.tsx; verified on staging (mock)_
- [x] Email/WA notifications include outbound and return details — _email.ts + bug #5, verified on staging (mock)_

### End-to-End Test
- [ ] Return booking succeeds through to receiving the e-ticket — _verified on staging with mock email/WA/payment; real delivery not yet tested_
- [x] Customer can search & select outbound & return legs — _verified manually on staging; automated E2E `round-trip-booking.spec.ts` active again since 2026-10-14_
- [x] Customer can enter passenger data (once, apply to both) — _verified manually on staging; automated E2E is skipped_
- [ ] Payment berhasil — _not tested yet: DOKU/PayPal in this env are production; staging uses mock_
- [ ] Email with booking ref & 2 tickets received — _mock only (Vercel log); no real delivery yet_

---

## 🔒 Current Constraints (MVP)

### Cancellation
- ✅ **Full cancellation only** — cancel entire round trip (no per-leg cancellation)

### Refund
- ✅ **Full refund** — 100% refund for the entire round trip
- ❌ No partial/per-leg refund (future)

### Passengers
- ✅ **Same passengers** for outbound & return (mandatory)
- Example: [Budi, Ani, Citra] for outbound → same for return

### Operator
- ✅ **Same operator** for outbound & return (mandatory)
- Example: Outbound Operator A → Return also Operator A
- ❌ Multi-operator (future)

### Business Logic
- ✅ One booking ID covers both legs
- ✅ One payment covers both legs
- ✅ One email notification with both itineraries
- ✅ Passenger data is entered once for both trips

---

## 📊 Data Model Changes

### Booking Model (Prisma)
```prisma
model Booking {
  id                 String       @id @default(cuid())
  bookingReference   String       @unique
  legId              String?      // DEPRECATED for round trips: use outboundLegId & returnLegId
  
  // NEW FIELDS for Round Trip
  outboundLegId      String?      // for ROUND_TRIP: reference to the outbound leg
  returnLegId        String?      // for ROUND_TRIP: reference to the return leg
  tripType           String       // "ONE_WAY" | "ROUND_TRIP"
  
  customerId         String?
  operatorId         String
  totalAmount        Decimal      // total for both legs (if ROUND_TRIP)
  
  // ... existing fields (customerName, passengers, status, etc)
  
  @@index([tripType])             // NEW: to filter ONE_WAY vs ROUND_TRIP
  @@index([outboundLegId])        // NEW: to query by outbound leg
  @@index([returnLegId])          // NEW: to query by return leg
}
```

### Payment Model (no change needed)
```prisma
model Payment {
  id       String  @id @default(cuid())
  bookingId String  @unique
  amount   Decimal // covers entire booking (both legs if ROUND_TRIP, or single leg if ONE_WAY)
  // ... existing fields
}
```

**Note:** 
- ONE_WAY bookings: use existing `legId` field
- ROUND_TRIP bookings: use `outboundLegId` + `returnLegId` (legId stays NULL)
- Payment stays 1:1 with Booking (not changed)

---

## 🔄 Implementation Flow (High Level)

### 1. Search & Selection
```
Customer selects "Round Trip"
  ↓
Show 2 date pickers (departure date & return date)
  ↓
Query legs for departure date & return date
  ↓
Display schedule options for both directions
  ↓
Customer selects outbound leg & return leg
```

### 2. Booking Creation
```
Customer enters passenger data (entered once for both trips)
  ↓
Create 1 Booking record:
  - outboundLegId: {outbound leg ID}
  - returnLegId: {return leg ID}
  - tripType: "ROUND_TRIP"
  - passengers: [Budi, Ani, Citra]
  ↓
Calculate prices:
  - Outbound price: outbound leg price × number of passengers
  - Return price: return leg price × number of passengers
  - Total: Outbound + Return
  ↓
Create 1 Payment record:
  - bookingId: {booking ID}
  - amount: Total
  ↓
Return booking ref (single)
```

### 3. Payment Processing
```
Payment gateway processes Total amount
  ↓
On success:
  - Update Booking status → AWAITING_CONFIRMATION
  - Update Payment status → SUCCESSFUL
  ↓
Send 1 email with outbound & return details
```

### 4. Admin View
```
Admin view booking with tripType="ROUND_TRIP"
  ↓
Display:
  - Booking ref, outbound leg details, return leg details
  - Passengers, combined total, payment status
  - Actions: View details, Cancel (full), Refund (full)
```

---

## 📋 Files to Modify

### Database & Schema
- `prisma/schema.prisma` — Add `outboundLegId`, `returnLegId`, `tripType` to Booking model

### Backend
- `lib/booking-engine.ts` — Create 1 booking with 2 leg references + 1 payment
- `lib/booking-notifications.ts` — Send 1 email with both outbound & return details
- `app/admin/(authed)/bookings/page.tsx` — Show both legs for ROUND_TRIP bookings
- Booking creation API — Accept outboundLegId & returnLegId instead of single legId

### Frontend
- `app/(customer)/[locale]/search/page.tsx` — Add "One Way" vs "Round Trip" toggle
- `components/customer/search-form.tsx` — Add return date picker
- `app/(customer)/[locale]/checkout/page.tsx` — Show both legs + combined pricing
- `app/(customer)/[locale]/confirmation/page.tsx` — Show single booking ref with both leg details

### Testing
- `tests/e2e/round-trip-booking.spec.ts` — End-to-end test
- `tests/unit/booking-engine.test.ts` — Unit tests for round trip booking creation

---

## ⚠️ Risks & Considerations

1. **Payment Linking**
   - One Payment → 2 Bookings: need to decide how to model
   - Option: Modify Payment model to support array of bookingIds
   - Or: Link via roundTripId (simpler, no schema change)

2. **Cancellation Cascade**
   - If cancel outbound, should return auto-cancel too? (YES, MVP requires full cancel)
   - Implement in transaction to ensure atomicity

3. **Audit Trail**
   - Need to track which round trip was created together
   - roundTripId acts as audit key

4. **Seat Hold Race Condition**
   - Hold seats for both legs simultaneously
   - If one leg fill up between selection & booking, reject entire booking

5. **Operator Commission**
   - Each booking has own `operatorAmount` (same operator, so no issue)
   - Payment split: straight 50-50? Or based on leg price ratio?
   - **For now:** Commission per leg (outbound commission A, return commission B)

---

## ✅ Business Confirmation & Requirements (2026-10-03)

1. **Booking Structure**
   - ✅ **1 Booking ID** covers 2 legs (outbound + return)
   - ✅ One payment transaction

2. **Cancellation Policy**
   - ✅ **Full cancel only** (no per-leg cancel)

3. **Refund Policy**
   - ✅ **Full refund 100%** (no per-leg refund)

4. **Operator Requirement**
   - ✅ **Same operator mandatory** for outbound & return

5. **Passenger Requirement**
   - ✅ **Same passengers mandatory** for both legs
   - ✅ Data entered once, applies to both trips

6. **Notifications & E-Tickets**
   - ✅ 1 Email with outbound & return details
   - ✅ 2 E-ticket files (1 outbound, 1 return)
   - ✅ Email/WA include details of both trips

---

## 📅 Effort Estimate & Progress

| Phase | Task | Estimate | Status | Actual |
|-------|------|----------|--------|--------|
| **1** | DB schema changes | 0.5 day | ✅ Done | ~0.5 day |
| **2** | Backend: booking-engine.ts | 1 day | ✅ Done | ~1 day |
| **3** | Frontend: search & checkout UI | 1-1.5 days | ✅ Done | ~2 days |
| **4** | Notifications: email + e-tickets | 0.5-1 day | ✅ Done | ~1.5 days |
| **5** | Admin dashboard: round trip view | 0.5 day | ✅ Done | ~0.5 days |
| **6** | Testing (E2E + unit) + TypeScript fix | 1-2 days | ✅ Done | ~2 days |
| **7** | Staging QA & readiness | 0.5-1 day | ⏳ TODO | — |
| **8** | Manual merge to main (developer decision) | 0.25 day | ⏳ AFTER Phase 7 | — |
| **COMPLETED** | Phase 1-6 | **6.5 days** | ✅ | ~7 days |
| **REMAINING** | Phase 7 → Staging | **0.5-1 day** | ⏳ | — |
| **FUTURE** | Phase 8 → Main (manual) | **0.25 day** | ⏳ On-demand | — |
| **TOTAL** | **To Staging** | **7-8 days** | 96% | — |

---

## 🚀 Implementation Progress

### ✅ Completed

1. **Requirement aligned** (2026-10-03)

2. **Phase 1: DB Schema** (2026-10-03)
   - Added `TripType` enum (ONE_WAY | ROUND_TRIP)
   - Added `outboundLegId`, `returnLegId`, `tripType` to Booking
   - Made `legId` optional (used only for ONE_WAY)
   - Updated Leg model with relation aliases
   - Pushed to staging database ✓

3. **Phase 2: Backend Booking Engine** (2026-10-04)
   - Extended `CreateBookingArgs` for round-trip support
   - Implemented `createOneWayBooking()` function
   - Implemented `createRoundTripBooking()` function with:
     - Same operator validation
     - Both legs OPEN & future validation
     - Return date > outbound date validation
     - Combined pricing from both legs
     - Promo code support with split discount
   - Refactored common logic to `createBookingRow()`
   - All TypeScript errors resolved ✓

4. **Phase 3: Frontend - Search & Booking** (2026-10-04)
   - Created `RoundTripLegSelector` component (side-by-side leg selection)
   - Search page queries both outbound and return legs for round-trip
   - Book page supports dual-leg form submission with combined pricing
   - Fixed all `booking.leg` null-safety across 17+ files
   - Created `booking-helpers.ts` utility (`getMainLeg`, `getReturnLeg`)
   - Created `serialize-decimals.ts` for Server→Client serialization
   - Critical path (search → book → confirmation) fully typed and clean ✓
   - All validations in place:
     - Same operator enforcement
     - Both legs OPEN validation
     - Both legs in future validation
     - Return date > outbound date validation
   - Backward compatible: one-way bookings unaffected ✓

### ✅ Phase 4: Notifications & E-tickets (2026-10-04)
   - Extended `PaymentReceivedArgs`, `BookingConfirmationArgs`, `CancellationEmailArgs` to support round-trip
   - Email templates updated: show outbound + return legs separately with pricing breakdown
   - New function `generateBoardingPassPdfsForBooking()`: generates 1 PDF for one-way, 2 PDFs for round-trip
   - Updated notifications: all 3 functions (`notifyPaymentReceived`, `notifyBoardingPassIssued`, `notifyOperatorUnavailable`) handle round-trip
   - Pricing calculation: leg prices × passenger count for outbound + return display
   - Unit tests added: 4 new round-trip tests + updated 2 existing tests
   - All 12 booking-notifications tests passing ✓
   - Typecheck: clean ✓
   - E2E: 7/10 passing (same status) ✓

### ✅ Phase 5: Admin Dashboard (2026-10-04)
   - Updated BookingRow component to display round-trip bookings
   - Added trip type badge (ONE_WAY vs ROUND_TRIP) for quick identification
   - Return leg details shown in expandable format within table cells (ports, times, boats)
   - Outbound + return info side-by-side display for compactness
   - Admin confirmations page already compatible (uses getMainLeg correctly)
   - Unit tests: 3 new tests for round-trip row rendering
   - All tests passing ✓
   - E2E: 7/10 passing (no regressions) ✓

### ✅ Phase 6: Testing & QA (2026-10-04 → 2026-10-07)
   - Created `round-trip-booking.spec.ts` E2E test (structure ready for manual verification)
   - Backend fully tested via unit tests:
     - Round-trip booking engine: 45+ tests ✓
     - Notifications (emails + e-tickets): 16 tests ✓
     - Admin dashboard display: 10 tests ✓
   - Total: 798/798 unit tests passing (100%) ✓
   - TypeScript compilation: CLEAN (no errors) ✓
   - **Phase 6 Fix (2026-10-07):**
     - Fixed admin-booking-display.test.ts TypeScript errors
     - Created proper LegWithSchedule & BookingWithLegs types
     - All 10 admin dashboard tests now type-safe and passing
   - E2E: 7/10 passing, 4 skipped (round-trip E2E selector tuning deferred) — _note 2026-10-14: those four tests are active again (see TESTING_PLAN); the real cause of the skips was QA data, not selectors_
   - Search page UI confirmed working with round-trip support
   - Checkout page verified handling round-trip bookings
   - All critical paths tested and working
   - E2E test can be tuned later (selector refinement, not UI changes needed)
   - **Status: READY FOR PHASE 7** ✅

### ✅ Phase 7: Staging Readiness & Final QA (functional QA done 2026-10-09; visual/mobile pending)

**Target:** Get feature stable on staging branch for developer testing

**Scope:** Verify round-trip feature works end-to-end on staging branch (no main merge)

#### Tasks:

1. **E2E Test Verification** ✅ DONE (2026-10-07)
   - ✅ Ran `pnpm test:e2e`
   - ✅ Result: 7/10 passing, 4 skipped (expected)
   - ✅ No regressions in existing flows
   - ✅ Known skipped test issues documented

2. **Branch Sync & Cleanup** ✅ DONE (2026-10-07)
   - ✅ Synced staging with main (rebased 26 commits)
   - ✅ Removed incomplete UI from main (one-way only)
   - ✅ Restored full UI to staging (both options)
   - ✅ Branches diverged correctly for safety

3. **Manual Testing on Staging** ✅ DONE for the functional flow (2026-10-09, three rounds, see `BUGS_ROUND_TRIP.md`); real email/WA/payment not covered
   - Round-trip search flow (one-way vs return toggle)
   - Passenger data entry (once, applies to both legs)
   - Payment flow (single transaction for both legs)
   - Booking confirmation email (shows both legs)
   - Admin dashboard (round-trip display)
   - Booking cancellation (full cancel, both legs)

4. **Visual & UX Polish** ⏳ NOT VERIFIED (only text/DOM was checked)
   - Mobile responsiveness (search & checkout)
   - Error messaging clarity
   - Accessibility (keyboard, screen readers)
   - Cross-browser spot check (Chrome, Safari)

5. **Documentation & Rollout** ✅ COMPLETE
   - Feature marked as "Ready on Staging"
   - E2E limitations documented
   - Staging deployment ready

#### Definition of Done (Staging):
- ✅ All unit tests passing (798/798)
- ✅ TypeScript compilation clean
- ✅ E2E tests running (7/10 passing documented)
- ⏳ Manual end-to-end flow (dev will verify)
- ✅ No regressions in one-way bookings
- ✅ Staging branch updated with feature
- ✅ Ready for developer testing on staging environment

---

### 🚀 Phase 8: Release to production (not done)

Production is the `main` branch (Vercel project `gilifast`); the old branch name
`claude/boat-ticketing-mvp-YAGl9` and the commands that were here are obsolete.
Round trip reaches production with **v1.1.x** (v1.1.0 plus the v1.1.1 fixes) and **v1.2.0** (admin trip-type filter, Outbound/Return breakdown), together with seasonal pricing.
Process and the per-version steps: `docs/RELEASING.md`.

- [ ] Baseline the production database first (`docs/RELEASING.md`, "Production database"), then PR `staging` → `main`, merge (the production build runs `prisma migrate deploy` against the production database)
- [ ] Post-deploy steps for 1.1.0 (`pnpm seed:seasons`; the Season RLS now ships inside the migration)
- [ ] `/admin/diagnostics` on gilifast.com shows the released version (currently v1.1.1; staging code is v1.2.0)
- [ ] Move this spike and `BUGS_ROUND_TRIP.md` to `docs/spikes/done/` once the open checks in `BUGS_ROUND_TRIP.md` are closed

---

## 📌 Notes

- Approach: Single Booking with 2 Leg References (simpler than 2 separate bookings)
- MVP scope: full cancel, full refund, same operator, same passengers
- Future phases can add: per-leg cancel, multi-operator, flexible passengers, etc
- All existing ONE_WAY bookings stay unaffected (backward compatible)
- tripType field helps filter & identify booking type
