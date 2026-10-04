# Feature: Return Trip Booking (Round Trip) End-to-End

**Status:** ✅ Approved (Requirement: 2026-10-03)  
**Created:** 2026-09-28  
**Updated:** 2026-10-03  
**Owner:** Product Team

---

## 📌 Overview

Aktifkan fitur booking return (pulang-pergi) end-to-end sehingga customer bisa memesan tiket round trip dalam satu transaksi, bukan perlu booking dua kali.

---

## 👤 User Story

```
Sebagai customer,
Saya ingin bisa memesan tiket pulang-pergi (return) dalam satu transaksi,
Agar lebih efisien dan tidak perlu booking dua kali.
```

**Latar Belakang:** Pilihan "Return" sudah ada di UI pencarian, tapi belum berfungsi — customer tidak bisa menyelesaikan booking return hingga pembayaran.

---

## 🎯 Approach: Single Booking with Dual Legs

### Prinsip
- **1 Booking Record** (mencakup outbound + return)
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
│  ├─ passengers: [Budi, Ani, Citra] (sama untuk outbound & return)
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

### Search & Pilih Jadwal
- [ ] User bisa memilih "One Way" atau "Return" di halaman search
- [ ] Untuk Return: user bisa input tanggal & memilih jadwal pulang
- [ ] Hasil pencarian menampilkan pilihan jadwal untuk kedua arah (berangkat & pulang)

### Booking Flow
- [ ] Satu booking ID mencakup kedua perjalanan (outbound + return)
- [ ] Data penumpang diisi sekali untuk kedua perjalanan
- [ ] Total harga terhitung benar (outbound + return)
- [ ] User lihat summary: "Outbound: Rp X | Return: Rp Y | Total: Rp Z"

### Database
- [ ] Booking model punya `outboundLegId` field (reference ke leg outbound)
- [ ] Booking model punya `returnLegId` field (reference ke leg return)
- [ ] Booking model punya `tripType` field ("ONE_WAY" | "ROUND_TRIP")
- [ ] 1 Booking record created (mencakup 2 legs)
- [ ] 1 Payment record created (covers both)
- [ ] Booking return tersimpan dengan referensi ke kedua jadwal

### Admin Dashboard
- [ ] Admin bisa melihat detail kedua leg di dashboard
- [ ] Admin bisa filter bookings by type (ONE_WAY vs ROUND_TRIP)
- [ ] Admin view shows: booking ref, outbound leg, return leg, combined total

### Notifications & E-Tiket
- [ ] Email: 1 email dengan subject "Round Trip Booking Confirmed"
  - Show outbound details (leg, passengers, price)
  - Show return details (leg, passengers, price)
  - Show total payment & invoice
- [ ] E-tickets: 2 tiket files (1 outbound, 1 return) dalam 1 email
- [ ] E-tiket mencantumkan kedua perjalanan secara jelas
- [ ] Notifikasi email/WA menyertakan detail outbound dan return

### End-to-End Test
- [ ] Booking return berhasil hingga e-tiket diterima
- [ ] Customer bisa search & pilih outbound & return legs
- [ ] Customer bisa enter passenger data (once, apply to both)
- [ ] Payment berhasil
- [ ] Email dengan booking ref & 2 tiket diterima

---

## 🔒 Current Constraints (MVP)

### Cancellation
- ✅ **Full cancellation only** — cancel entire round trip (tidak ada per-leg cancellation)

### Refund
- ✅ **Full refund** — 100% refund untuk entire round trip
- ❌ No partial/per-leg refund (future)

### Passengers
- ✅ **Same passengers** for outbound & return (mandatory)
- Example: [Budi, Ani, Citra] untuk outbound → same untuk return

### Operator
- ✅ **Same operator** for outbound & return (mandatory)
- Example: Outbound Operator A → Return juga Operator A
- ❌ Multi-operator (future)

### Business Logic
- ✅ One booking ID covers both legs
- ✅ One payment covers both legs
- ✅ One email notification with both itineraries
- ✅ Data penumpang diisi sekali untuk kedua perjalanan

---

## 📊 Data Model Changes

### Booking Model (Prisma)
```prisma
model Booking {
  id                 String       @id @default(cuid())
  bookingReference   String       @unique
  legId              String?      // DEPRECATED for round trips: use outboundLegId & returnLegId
  
  // NEW FIELDS for Round Trip
  outboundLegId      String?      // for ROUND_TRIP: reference ke leg outbound
  returnLegId        String?      // for ROUND_TRIP: reference ke leg return
  tripType           String       // "ONE_WAY" | "ROUND_TRIP"
  
  customerId         String?
  operatorId         String
  totalAmount        Decimal      // total for both legs (if ROUND_TRIP)
  
  // ... existing fields (customerName, passengers, status, etc)
  
  @@index([tripType])             // NEW: untuk filter ONE_WAY vs ROUND_TRIP
  @@index([outboundLegId])        // NEW: untuk query by outbound leg
  @@index([returnLegId])          // NEW: untuk query by return leg
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
- ROUND_TRIP bookings: use `outboundLegId` + `returnLegId` (legId tetap NULL)
- Payment tetap 1:1 dengan Booking (not changed)

---

## 🔄 Implementation Flow (High Level)

### 1. Search & Selection
```
Customer selects "Round Trip"
  ↓
Show 2 date pickers (departure date & return date)
  ↓
Query legs untuk departure date & return date
  ↓
Display pilihan jadwal untuk kedua arah
  ↓
Customer selects outbound leg & return leg
```

### 2. Booking Creation
```
Customer enters passenger data (diisi sekali untuk kedua perjalanan)
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
Send 1 email dengan detail outbound & return
```

### 4. Admin View
```
Admin view booking dengan tripType="ROUND_TRIP"
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
   - ✅ **1 Booking ID** mencakup 2 leg (outbound + return)
   - ✅ Satu transaksi pembayaran

2. **Cancellation Policy**
   - ✅ **Full cancel only** (no per-leg cancel)

3. **Refund Policy**
   - ✅ **Full refund 100%** (no per-leg refund)

4. **Operator Requirement**
   - ✅ **Same operator mandatory** for outbound & return

5. **Passenger Requirement**
   - ✅ **Same passengers mandatory** for both legs
   - ✅ Data diisi sekali, apply ke kedua perjalanan

6. **Notifications & E-Tickets**
   - ✅ 1 Email dengan detail outbound & return
   - ✅ 2 E-ticket files (1 outbound, 1 return)
   - ✅ Email/WA menyertakan detail kedua perjalanan

---

## 📅 Effort Estimate & Progress

| Phase | Task | Estimate | Status | Actual |
|-------|------|----------|--------|--------|
| **1** | DB schema changes | 0.5 day | ✅ Done | ~0.5 day |
| **2** | Backend: booking-engine.ts | 1 day | ✅ Done | ~1 day |
| **3** | Frontend: search & checkout UI | 1-1.5 days | ✅ Done | ~2 days |
| **4** | Notifications: email + e-tickets | 0.5-1 day | ⏳ TODO | — |
| **5** | Admin dashboard: round trip view | 0.5 day | ⏳ TODO | — |
| **6** | Testing (E2E + unit) | 1-1.5 days | ⏳ TODO | — |
| **7** | Bug fixes & polish | 0.5 day | ⏳ TODO | — |
| **COMPLETED** | Phase 1, 2 & 3 | **3.5 days** | ✅ | ~3.5 days |
| **REMAINING** | Phase 4-7 | **2.5-3.5 days** | ⏳ | — |
| **TOTAL** | | **6-7 days** | 52% | — |

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

### 🔄 In Progress / TODO

5. **Phase 4:** Notifications (email + e-tickets) - fix remaining Decimal errors in non-critical paths
6. **Phase 5:** Admin dashboard - update booking views for round-trip
7. **Phase 6:** Testing & QA - E2E round-trip flow
8. **Phase 7:** Deploy & monitoring

---

## 📌 Notes

- Approach: Single Booking with 2 Leg References (simpler than 2 separate bookings)
- MVP scope: full cancel, full refund, same operator, same passengers
- Future phases dapat add: per-leg cancel, multi-operator, flexible passengers, etc
- All existing ONE_WAY bookings tetap unaffected (backward compatible)
- tripType field helps filter & identify booking type
