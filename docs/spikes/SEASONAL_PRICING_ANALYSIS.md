# Seasonal Pricing System Analysis

**Status:** Research / Spike (Not yet implemented)  
**Created:** 2026-09-28  
**Purpose:** Understand current pricing system and plan seasonal pricing integration

---

## 📌 Current State of Pricing System

### ✅ What Already Exists

#### 1. **Pricing Engine** (`lib/pricing.ts`)
- Core function: `computeBookingPriceWithTypes()`
- Takes `unitPrice` (from Leg) and applies:
  - Passenger type multipliers (ADULT: 1.0, CHILD: 0.5, INFANT: 0.0)
  - Commission calculations (PLATFORM/OPERATOR/SHARED cost bearer)
  - Optional service fees (percentage or flat)
  - Promotional discounts
- **Current input:** `leg.basePrice` (static per departure)

#### 2. **Leg Model** (Prisma)
```
model Leg {
  basePrice: Decimal @db.Decimal(12, 2)  ← Currently static, copied from Schedule
  departureDate: DateTime                 ← UTC timestamp
  status: LegStatus                       ← OPEN, FULL, SAILED, CANCELLED
  ...
}
```

#### 3. **Price Adjustment UI** (Admin)
- **Location:** `/admin/operations/departures/[legId]/page.tsx`
- **Action:** `adjustDeparturePrice()` in `app/admin/(authed)/operations/actions.ts`
- **Current behavior:** Admin can manually override `Leg.basePrice` for individual departures
- **Notes:** Only affects that specific leg; schedule base price unchanged

#### 4. **Schedule Model** (Prisma)
```
model Schedule {
  basePrice: Decimal                      ← Base price for all legs
  fareMatrix: Json?                       ← Operator's price sheet (CHILD/INFANT overrides)
  daysOfWeek: Int[]                       ← 1=Mon...7=Sun
  ...
}
```

#### 5. **Search & Display** (Frontend)
- **File:** `app/(customer)/[locale]/search/page.tsx`
- **Current flow:**
  1. Query all Legs for date range & route
  2. Filter by `maxPrice` → checks `leg.basePrice`
  3. Sort by price → uses `leg.basePrice`
  4. Display results → shows `leg.basePrice`

#### 6. **Booking Creation** (`lib/booking-engine.ts`)
- **Line 144:** Booking price calculated using `leg.basePrice`
- **Process:**
  1. Fetch leg with schedule
  2. Resolve platform pricing config
  3. Parse fare matrix (CHILD/INFANT overrides)
  4. Call `computeBookingPriceWithTypes()` with `leg.basePrice`
  5. Apply promo discounts if any
  6. Create booking record

---

## ❌ What's Missing for Season-Based Pricing

### 1. **Database Model for Seasons**
**Not yet created:**
- `SeasonDatabase` table (or similar name)
- Fields needed (TBD from business):
  - Season type (enum: LOW, MEDIUM, PEAK, OFF)
  - Date range (start/end for MONTHLY locks; specific dates for DAILY locks)
  - Price multiplier or absolute override
  - Is active / archived
  - Admin timestamps (created_at, updated_at)

### 2. **Logic to Look Up Season for a Given Date**
**Not yet implemented:**
- Function: `getSeasonForDate(date: Date): Season | null`
- Must handle:
  - MONTHLY seasons (e.g., Jan = LOW, May = MEDIUM)
  - DAILY seasons (e.g., 25 Dec = PEAK, 8 Mar = OFF)
  - Fallback behavior when no match found

### 3. **Integration Point in Pricing Chain**
**Current flow:**
```
Booking creation → leg.basePrice → computeBookingPrice()
```

**Needed:**
```
Booking creation → [SEASON LOOKUP] → adjusted basePrice → computeBookingPrice()
```

**Decision needed:** Should the adjustment happen:
- **Option A:** When Leg is created? (write season to leg.basePrice at generation time)
- **Option B:** When Booking is created? (query season at runtime)
- **Option C:** When displaying prices? (only frontend adjustment)

### 4. **RLS Policies on Season Table**
**Not yet configured:**
- Admin: read/write all seasons
- Public: read only active seasons

### 5. **Admin Dashboard for Season Management**
**Not yet built:**
- CRUD interface for seasons
- Calendar view to see active seasons
- Bulk import / export

---

## ❓ Critical Questions That Need Answers

### 1. **Season Table Structure**
Business mentioned "struktur dataframe lengkap tersedia di attachment". Need to clarify:
- What are the exact column names?
- How are MONTHLY vs DAILY seasons distinguished?
  - Separate `lock_type` enum?
  - `end_date` is NULL for DAILY?
- What triggers "active" status? (date range? explicit flag?)
- Should seasons have priorities? (e.g., PEAK overrides MEDIUM if both match)

### 2. **Price Application Method**
For a given date, how should price adjust?
- **Multiplier approach:** `basePrice × multiplier` (e.g., 1.5 = +50%)
- **Absolute override:** `season.price` replaces `basePrice`
- **Tiered approach:** Different multipliers per passenger type?

Example scenarios:
- Regular weekday (MEDIUM): 500k × 1.0 = 500k ✓
- Peak holiday (PEAK): 500k × 1.5 = 750k ✓
- Low season (LOW): 500k × 0.8 = 400k ✓

### 3. **When Should Season Be Applied?**
Three options with different tradeoffs:

| Timing | Pro | Con |
|--------|-----|-----|
| **Leg Generation** | Price locked at booking creation; consistent reporting | Must regenerate legs if season changes; admin repricing breaks |
| **Booking Time** | Live pricing; accommodates schedule changes | Auditing harder; potential race conditions |
| **Display Only** | Frontend-only, no DB changes | Misleading if backend calculates differently |

**Recommendation:** Depends on business needs. Which matters more—consistency or flexibility?

### 4. **Fallback Behavior**
What if a date has no matching season?
- Use default (e.g., MEDIUM multiplier)?
- Use schedule's `basePrice` unchanged?
- Admin error (block the departure)?

### 5. **Seat Holds During Repricing**
If leg is repriced after someone starts booking:
- Should the hold be invalidated?
- Should price lock at the first checkout page?
- Should we accept race conditions (price at booking differs from price at payment)?

---

## 🎯 Implementation Roadmap (High Level)

Assuming you choose **"Season applied at Booking Time"**:

### Phase 1: Data Model
- [ ] Create `SeasonDatabase` Prisma model (after clarifying schema)
- [ ] Add RLS policies to Supabase
- [ ] Write seed/fixture data

### Phase 2: Backend Logic
- [ ] Create `lib/seasons.ts`:
  - `getSeasonForDate(date: Date): Season | null`
  - `applySeasonPricing(basePrice, season): Decimal`
- [ ] Integrate into `lib/booking-engine.ts`:
  - Look up season for `leg.departureDate`
  - Apply multiplier before `computeBookingPriceWithTypes()`
- [ ] Integrate into `app/(customer)/[locale]/search/page.tsx`:
  - Optionally show season indicator on search results
  - Adjust displayed price based on season

### Phase 3: Admin Interface
- [ ] Create season management CRUD pages under `/admin/console/` or `/admin/operations/`
- [ ] Add calendar view
- [ ] Add import/export CSV

### Phase 4: Testing
- [ ] Unit tests for `getSeasonForDate()` with various edge cases
- [ ] E2E test: Book on LOW, MEDIUM, PEAK, OFF dates—verify prices differ
- [ ] Verify no regressions in existing booking flows

---

## 📋 Files That Will Be Affected

**Will definitely change:**
1. `prisma/schema.prisma` — Add `SeasonDatabase` model
2. `lib/booking-engine.ts` — Apply season multiplier
3. `lib/pricing.ts` — Potentially (if season logic belongs here)
4. `app/(customer)/[locale]/search/page.tsx` — Display season info

**May change:**
1. `app/admin/(authed)/operations/departures/[legId]/page.tsx` — Show applied season
2. Search filters UI — Option to filter by season?
3. Audit log — Track which season was applied to each booking

**Won't change (backward compatible):**
- Existing legs without seasons → fallback to basePrice ✓
- Existing bookings → no repricing ✓
- Payment flow → no changes ✓

---

## 🚨 Risk Areas

1. **Race conditions:** If season is looked up at booking time, concurrent bookings might see different prices
2. **Audit trail:** Admin needs visibility into which season was applied to which booking
3. **Retroactive changes:** If a season is edited after bookings are made, should existing bookings be recalculated?
4. **Operator expectations:** Will operators be upset if peak pricing reduces their takes? (likely split by commission model)

---

## 📌 Industry Best Practices

### How Major Platforms Handle Seasons (Tiket.com, Traveloka)

**Booking Time Approach (Most Common):**
- Season lookup at checkout
- Price locked at payment
- Changes to season config apply to future bookings only
- Existing bookings unaffected

**Advantages:**
- Flexible (seasons can be adjusted on the fly)
- Live pricing (reflects current market conditions)
- Simple audit (book.seasonApplied field stores which season was used)

**Disadvantages:**
- Race condition: price shown in search might differ at checkout
- Complexity: need to handle edge cases (season deleted, season changed)

**Leg Generation Approach (Airlines, some OTAs):**
- Season multiplier applied when legs are pre-generated
- Price static once leg exists
- Admin repricing can override

**Advantages:**
- Guaranteed consistency
- Easier reporting (price locked at leg creation)

**Disadvantages:**
- Inflexible (must regenerate legs if seasons change)
- Lag: new season config only affects new legs

---

## 💭 Recommendation for Gilifast

**For MVP:** Use **Booking Time** approach because:
1. ✅ Simpler to implement (no leg regeneration)
2. ✅ Flexible (seasons adjustable, new bookings see new prices)
3. ✅ Aligns with Tiket.com/Traveloka (proven pattern)
4. ✅ Future enhancement: add audit field to Booking to track which season was applied

---

## 🔄 Sample Implementation (Pseudocode)

```typescript
// lib/seasons.ts
export async function getSeasonForDate(date: Date): Promise<Season | null> {
  // First check: specific dates (PEAK, OFF)
  const dailySeason = await prisma.seasonDatabase.findFirst({
    where: {
      lockType: 'DAILY',
      startDate: { lte: date },
      endDate: { gte: date },
      isActive: true,
    },
  });
  if (dailySeason) return dailySeason;
  
  // Fallback: check monthly seasons
  const month = date.getMonth() + 1; // 1-12
  const monthlySeason = await prisma.seasonDatabase.findFirst({
    where: {
      lockType: 'MONTHLY',
      month: month,
      isActive: true,
    },
  });
  return monthlySeason ?? null;
}

export function applySeasonPricing(
  basePrice: Decimal,
  season: Season | null,
): Decimal {
  if (!season) return basePrice;
  
  // Multiplier approach
  if (season.multiplier) {
    return basePrice.mul(season.multiplier);
  }
  
  // Absolute price approach
  if (season.absolutePrice) {
    return new Decimal(season.absolutePrice);
  }
  
  return basePrice;
}
```

```typescript
// lib/booking-engine.ts (modified)
const season = await getSeasonForDate(leg.departureDate);
const adjustedPrice = applySeasonPricing(leg.basePrice, season);

const price = computeBookingPriceWithTypes({
  unitPrice: adjustedPrice,  // ← Use adjusted price instead of leg.basePrice
  passengerTypes,
  // ... rest of args
});
```

---

## 📅 Effort Estimate (if implemented)

| Phase | Task | Effort |
|-------|------|--------|
| **1** | DB schema + RLS | 0.5 days |
| **2** | Season lookup logic | 0.5 days |
| **3** | Booking engine integration | 1 day |
| **4** | Search display | 0.5 days |
| **5** | Admin CRUD | 1.5 days |
| **6** | Testing | 1 day |
| **7** | Polish & docs | 0.5 days |
| **TOTAL** | | **~5-6 days** |

---

## 🚀 Next Steps (When Ready)

1. Clarify season table structure with business
2. Answer 5 critical questions above
3. Decide on approach (Booking Time vs Leg Generation)
4. Implement Phase 1-4
5. Ship and iterate based on feedback

---

## 📌 Notes

- This is a spike/research document
- Not currently being implemented
- High complexity → break into phases
- Consider MVP approach: start with basic multiplier, add complexity later
- Backward compatible: existing bookings unaffected

