# Gilijet Platform Expansion — Detailed Requirements & Gap Analysis

> **Source**: `plans/full-platform-requirements.md` (PRD)
> **Date**: 2026-06-09
> **Stack**: Next.js 15 (App Router) · Tailwind CSS · Shadcn/UI · Prisma · PostgreSQL · Custom JWT Auth

---

## Current State Summary

| Area | Status |
|---|---|
| Customer booking flow (search → book → pay → ticket) | **Complete** |
| Customer auth (register, login, forgot/reset password) | **Complete** |
| Account dashboard (profile, bookings, password) | **Complete** |
| Operator dashboard (boats, schedules, legs, scanner) | **Complete** |
| Admin dashboard (overview, bookings, operators, promos, refunds, reschedules) | **Complete** |
| Payment integrations (Xendit, Mayar, Midtrans) | **Complete** |
| QR ticketing + email | **Complete** |
| Promo codes | **Complete** |
| Reviews | **Complete** |
| Reschedule requests | **Complete** |
| Sea conditions | **Partial** (lib exists, not surfaced on homepage) |
| Refund logic | **Complete** (lib/refunds.ts is source of truth) |
| Audit logging | **Complete** |
| E2E tests (Playwright) | **Complete** (3 suites) |

---

## Phase 1: UX/UI & Search Experience

### 1.1 Passenger Selector Component

**PRD**: Popover with Adult/Child/Infant counters.

**Current State**: `SearchForm` uses a plain `<input type="number">` for passenger count (1-10). No age-type breakdown. The booking page (`PassengerFields`) does have per-passenger type (ADULT/CHILD/INFANT) but only after search.

**Gap**: Search form has no passenger-type awareness. Pricing tiers by age don't exist in the search flow.

**Requirements**:

| ID | Requirement | Priority |
|---|---|---|
| P1.1.1 | Create `PassengerSelector` component using Radix `Popover` | High |
| P1.1.2 | Three counters: Adults (12+, min 1), Children (2-11, min 0), Infants (<2, min 0) | High |
| P1.1.3 | Summary button displays "1 Adult, 0 Children, 0 Infants" (pluralized) | High |
| P1.1.4 | Prevent total passengers > 10 | High |
| P1.1.5 | Prevent decrementing Adults below 1 | High |
| P1.1.6 | Each infant must correspond to one adult (safety constraint) | Medium |
| P1.1.7 | Pass `adults`, `children`, `infants` as search params to `/search` | High |
| P1.1.8 | Search results page respects passenger types for pricing display | High |
| P1.1.9 | Booking page pre-fills passenger types from search params | High |

**Schema Changes**: None needed. Passenger type already exists in `PassengerFields` on the booking page.

**Files to Create/Modify**:
- `components/customer/passenger-selector.tsx` (new)
- `components/customer/search-form.tsx` (modify: replace `<input>` with `PassengerSelector`)
- `app/(customer)/search/page.tsx` (modify: parse adults/children/infants params)
- `app/(customer)/book/[legId]/page.tsx` (modify: pre-fill passenger types)

**New Dependencies**: `@radix-ui/react-popover`

---

### 1.2 Smart Search Form

**PRD**: Searchable combobox for ports grouped by region. Circular swap button. Visual "Where"/"When" grouping.

**Current State**: `SearchForm` uses native `<select>` for origin/destination. Swap button exists as a text link. No visual grouping.

**Gap**: No searchable combobox. No region grouping. Swap is functional but not visually prominent. No section grouping.

**Requirements**:

| ID | Requirement | Priority |
|---|---|---|
| P1.2.1 | Create `PortCombobox` component using Radix `Combobox` pattern (Command + Popover) | High |
| P1.2.2 | Ports grouped by region: "Bali" (Sanur, Padang Bai), "Gili Islands" (Gili T, Gili M, Gili A), "Lombok" (Bangsal, Senggigi), "Nusa Islands" (Nusa Penida, Nusa Lembongan, Nusa Ceningan), "Komodo" (Labuan Bajo) | High |
| P1.2.3 | Type-ahead search filters ports by name across all groups | High |
| P1.2.4 | Replace text swap link with circular floating `ArrowUpDown` icon button positioned between origin and destination fields | High |
| P1.2.5 | Visually group fields into "Where" section (origin, destination, swap) and "When" section (date, return date) | Medium |
| P1.2.6 | Passenger selector sits in its own section | Medium |
| P1.2.7 | Maintain existing URL param contract for `/search` | High |
| P1.2.8 | Port data sourced from `lib/port-info.ts` with region metadata | High |

**Schema Changes**: None. Port regions are static configuration.

**Files to Create/Modify**:
- `components/ui/combobox.tsx` (new — shadcn pattern using `cmdk` + Radix Popover)
- `components/customer/port-combobox.tsx` (new)
- `components/customer/search-form.tsx` (major rewrite)
- `lib/port-info.ts` (modify: add region metadata)

**New Dependencies**: `cmdk` (shadcn combobox foundation)

---

### 1.3 Landing Page Polish

**PRD**: Dynamic "Starting from" prices on popular routes. "Recent Bookings" social proof component.

**Current State**: Landing page is fully static. Route prices are hardcoded in `POPULAR_ROUTES` array. No social proof.

**Gap**: No dynamic pricing. No social proof.

**Requirements**:

| ID | Requirement | Priority |
|---|---|---|
| P1.3.1 | Convert landing page (or relevant sections) to a Server Component that queries the DB for lowest available price per route | High |
| P1.3.2 | Popular route cards display "Starting from IDR X" pulled from minimum `basePrice` across active Schedules for that route | High |
| P1.3.3 | Cache route pricing with ISR (revalidate: 3600s) to avoid DB hit on every request | High |
| P1.3.4 | Create `RecentBookings` client component showing anonymized recent purchases | Medium |
| P1.3.5 | Social proof format: "Someone from [city] just booked [origin] → [destination]" | Medium |
| P1.3.6 | Recent bookings sourced from last 20 confirmed bookings (randomized, no PII — city derived from `customerNationality` or random Indonesian city) | Medium |
| P1.3.7 | Auto-rotate social proof entries every 5 seconds | Low |
| P1.3.8 | Featured destination cards also use dynamic pricing | Medium |

**Schema Changes**: None. Uses existing `Schedule.basePrice` and `Booking` tables.

**Files to Create/Modify**:
- `app/(customer)/page.tsx` (modify: make data-driven, add ISR)
- `components/customer/recent-bookings.tsx` (new)
- `app/(customer)/actions.ts` (new: server action for recent bookings query)

---

## Phase 2: Customer Accounts & Personalization

### 2.1 Customer Portal Enhancements

**PRD**: Booking management improvements, saved passengers (Travelers), one-click refund.

**Current State**: Account page shows upcoming/past bookings, profile editing, password change. Bookings link to detail page. No saved passengers. Refund is initiated from booking detail page (cancel button exists).

**Gap**: No "Travelers" (saved passengers) CRUD. No one-click refund from account dashboard. No PDF download for e-tickets.

**Requirements**:

| ID | Requirement | Priority |
|---|---|---|
| P2.1.1 | Create `Traveler` Prisma model: `{ id, customerId, fullName, idNumber, type: ADULT/CHILD/INFANT, phoneNumber?, nationality? }` | High |
| P2.1.2 | Create `/account/travelers` page with list, add, edit, delete travelers | High |
| P2.1.3 | Booking page (`PassengerFields`) offers "Select from saved travelers" dropdown per passenger row | High |
| P2.1.4 | After successful booking, prompt "Save these passengers for next time?" (if logged in) | Medium |
| P2.1.5 | Add "Request Refund" button directly on booking cards in account dashboard (for eligible bookings) | High |
| P2.1.6 | One-click refund uses `refundTierForCustomer()` from `lib/refunds.ts` to show refund amount before confirming | High |
| P2.1.7 | E-ticket PDF download from booking detail page | Medium |
| P2.1.8 | Account dashboard shows refund status for cancelled bookings | Medium |

**Schema Changes**:
```prisma
model Traveler {
  id           String         @id @default(cuid())
  customerId   String
  fullName     String
  idNumber     String?
  type         PassengerType  @default(ADULT)
  phoneNumber  String?
  nationality  String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([customerId])
}

enum PassengerType {
  ADULT
  CHILD
  INFANT
}
```

Add to `Customer` model: `travelers Traveler[]`

**Files to Create/Modify**:
- `prisma/schema.prisma` (add Traveler model)
- `app/(customer)/account/travelers/page.tsx` (new)
- `app/(customer)/account/travelers/actions.ts` (new)
- `app/(customer)/book/[legId]/page.tsx` (modify: traveler selection)
- `app/(customer)/account/page.tsx` (modify: refund button on cards)
- `app/(customer)/b/[reference]/page.tsx` (modify: PDF download)
- `lib/pdf-ticket.ts` (new: PDF generation)

**New Dependencies**: `@react-pdf/renderer` or `pdfkit` (for PDF generation)

---

### 2.2 Insurance & Add-ons

**PRD**: Optional travel insurance at checkout. Port pickup selection.

**Current State**: No insurance or add-on system. Checkout goes straight from booking form to payment.

**Gap**: Entire feature is new.

**Requirements**:

| ID | Requirement | Priority |
|---|---|---|
| P2.2.1 | Create `Addon` Prisma model or use JSON field on Booking for add-ons | High |
| P2.2.2 | Travel insurance: fixed fee (e.g., IDR 25,000/person) or percentage (e.g., 3% of ticket) — configurable per route or globally | High |
| P2.2.3 | Insurance checkbox on booking page with clear description of coverage | High |
| P2.2.4 | Insurance cost added to `totalAmount` before payment | High |
| P2.2.5 | Insurance status tracked on Booking (insured: boolean, insuranceAmount: Decimal) | High |
| P2.2.6 | Port pickup: selection of hotel region/zone at checkout | Low |
| P2.2.7 | Pickup zones defined per destination port (static config) | Low |
| P2.2.8 | Pickup fee added to total if selected | Low |
| P2.2.9 | Insurance claim flow: customer submits claim via account portal (form + file upload) | Medium |

**Schema Changes**:
```prisma
// Add to Booking model:
insuranceAmount  Decimal  @default(0) @db.Decimal(12, 2)
pickupZone       String?
pickupFee        Decimal  @default(0) @db.Decimal(12, 2)
```

**Files to Create/Modify**:
- `prisma/schema.prisma` (add fields to Booking)
- `app/(customer)/book/[legId]/page.tsx` (modify: add insurance + pickup UI)
- `lib/pricing.ts` (modify: include insurance/pickup in total)
- `lib/insurance.ts` (new: insurance rules and pricing)
- `components/customer/insurance-selector.tsx` (new)
- `components/customer/pickup-selector.tsx` (new)

---

## Phase 3: Real-time Operations & Seat Selection

### 3.1 Interactive Seat Maps

**PRD**: SVG/Canvas seat picker with locking mechanism.

**Current State**: `Boat` model has `capacity` (integer) and `Leg` has `availableSeats`. No seat-level tracking. Booking reserves N seats atomically but doesn't assign specific seats.

**Gap**: Entire feature is new. Requires schema changes, UI component, and real-time locking.

**Requirements**:

| ID | Requirement | Priority |
|---|---|---|
| P3.1.1 | Add `layoutConfiguration` JSON field to `Boat` model: `{ rows: [{ id, label, seats: [{ id, label, type, status }] }] }` | High |
| P3.1.2 | Seat types: `STANDARD`, `VIP`, `ECONOMY` (affects pricing multiplier) | High |
| P3.1.3 | Create `SeatMap` client component: SVG-based interactive seat grid | High |
| P3.1.4 | Seat states: Available (blue), Occupied (grey), Selected (green), Locked (amber) | High |
| P3.1.5 | Seat locking: when user selects seats, lock them for 10-15 minutes via Redis or DB row-level lock | High |
| P3.1.6 | Create `SeatLock` model: `{ id, legId, seatId, bookingSessionId, lockedAt, expiresAt }` | High |
| P3.1.7 | Auto-release expired seat locks (cron or lazy cleanup) | High |
| P3.1.8 | Operator UI: boat layout editor (drag-and-drop or grid builder) | Medium |
| P3.1.9 | Booking page shows seat map when boat has `layoutConfiguration`; falls back to generic seat count otherwise | High |
| P3.1.10 | Ticket model gets optional `seatId` field | High |
| P3.1.11 | Real-time updates: poll or SSE for seat availability changes during selection | Medium |

**Schema Changes**:
```prisma
// Add to Boat model:
layoutConfiguration Json?  // { rows: [...], deckLabel: string }

// Add to Ticket model:
seatId String?

// New model:
model SeatLock {
  id              String   @id @default(cuid())
  legId           String
  seatId          String
  bookingSessionId String  // random session token
  lockedAt        DateTime @default(now())
  expiresAt       DateTime
  
  leg Leg @relation(fields: [legId], references: [id])
  
  @@unique([legId, seatId])
  @@index([expiresAt])
}
```

Add to `Leg`: `seatLocks SeatLock[]`

**Files to Create/Modify**:
- `prisma/schema.prisma` (add fields + SeatLock model)
- `components/customer/seat-map.tsx` (new)
- `components/customer/seat-map-legend.tsx` (new)
- `app/(customer)/book/[legId]/page.tsx` (modify: integrate seat map)
- `app/(customer)/book/[legId]/actions.ts` (new/modify: seat lock server action)
- `app/operator/boats/[id]/page.tsx` (modify: layout editor)
- `components/operator/boat-layout-editor.tsx` (new)
- `lib/seat-locks.ts` (new: lock/unlock/cleanup logic)
- `app/api/seats/[legId]/route.ts` (new: real-time seat availability API)

**New Dependencies**: None (SVG is native). Optionally `react-zoom-pan-pinch` for large boats.

---

### 3.2 Automated Notifications

**PRD**: WhatsApp integration (Wati/Twilio). Post-booking QR delivery. Delay/cancellation alerts. Sea conditions banner.

**Current State**: Email notifications via `lib/email.ts` (Resend or mock). Sea conditions lib exists (`lib/sea-conditions.ts`) but not surfaced on homepage. No WhatsApp integration.

**Gap**: WhatsApp is entirely new. Sea conditions banner needs UI integration.

**Requirements**:

| ID | Requirement | Priority |
|---|---|---|
| P3.2.1 | Create `lib/whatsapp.ts` with Wati or Twilio API wrapper | High |
| P3.2.2 | Send WhatsApp message with QR ticket image after payment confirmation | High |
| P3.2.3 | WhatsApp opt-in checkbox at booking (required for WhatsApp notifications) | High |
| P3.2.4 | Store `whatsappNumber` on Booking model (may differ from contact phone) | Medium |
| P3.2.5 | Send delay/cancellation alerts via WhatsApp when operator updates leg status | High |
| P3.2.6 | Template messages registered with WhatsApp Business API | High |
| P3.2.7 | Sea conditions banner on homepage using `lib/sea-conditions.ts` data | Medium |
| P3.2.8 | Banner dismissible per session | Low |
| P3.2.9 | Admin/operator UI to set sea condition status (NORMAL, ROUGH, DANGEROUS) per route | Medium |
| P3.2.10 | Fallback: if WhatsApp API fails, retry via `WebhookEvent` queue pattern | Medium |

**Schema Changes**:
```prisma
// Add to Booking model:
whatsappNumber    String?
whatsappOptIn     Boolean @default(false)

// New model (or use existing config):
model SeaCondition {
  id          String          @id @default(cuid())
  routeKey    String          // "Sanur-Nusa Penida"
  status      SeaStatus       @default(NORMAL)
  message     String?
  updatedAt   DateTime        @default(now())
  updatedBy   String?
  
  @@unique([routeKey])
}

enum SeaStatus {
  NORMAL
  ROUGH
  DANGEROUS
}
```

**Files to Create/Modify**:
- `lib/whatsapp.ts` (new)
- `lib/ticket-issuer.ts` (modify: trigger WhatsApp after email)
- `prisma/schema.prisma` (add fields + SeaCondition model)
- `components/customer/sea-conditions-banner.tsx` (new)
- `app/(customer)/page.tsx` (modify: add banner)
- `app/(customer)/book/[legId]/page.tsx` (modify: WhatsApp opt-in)
- `app/operator/legs/[id]/page.tsx` (modify: send delay alert)
- `app/admin/sea-conditions/page.tsx` (new)

**New Dependencies**: `twilio` or HTTP client for Wati API (use `fetch`)

**Environment Variables**: `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID` (or Wati equivalent)

---

### 3.3 Operator "Crew App" Enhancements

**PRD**: PWA scanner at `/operator/scan`. One-tap check-in from manifest.

**Current State**: Scanner exists at `/operator/scanner` using `@zxing/browser`. Check-in API exists at `/api/operator/checkin`. Manifest page exists at `/api/operator/manifest/[legId]`.

**Gap**: Scanner works but manifest check-in is not one-tap. No PWA manifest/installability.

**Requirements**:

| ID | Requirement | Priority |
|---|---|---|
| P3.3.1 | Add PWA `manifest.json` and service worker for installability | High |
| P3.3.2 | Create `/operator/manifest/[legId]` page (UI) showing passenger list with check-in buttons | High |
| P3.3.3 | One-tap check-in: single click marks passenger as checked in (calls existing `/api/operator/checkin`) | High |
| P3.3.4 | Check-in shows passenger name, ticket code, seat (if assigned), status badge | High |
| P3.3.5 | Manifest shows progress: "12/30 checked in" | High |
| P3.3.6 | Offline-capable: cache manifest for the day's departures | Low |
| P3.3.7 | Scanner route alias: `/operator/scan` redirects to `/operator/scanner` | Low |
| P3.3.8 | Haptic feedback on successful check-in (mobile) | Low |

**Schema Changes**: None needed.

**Files to Create/Modify**:
- `public/manifest.json` (new)
- `app/manifest/route.ts` (new: Next.js PWA manifest)
- `app/operator/manifest/[legId]/page.tsx` (new: UI page)
- `components/operator/manifest-checkin.tsx` (new)
- `app/layout.tsx` (modify: add PWA meta tags)

---

## Phase 4: B2B & Ecosystem Scaling

### 4.1 Agent/Affiliate API

**PRD**: REST API for agents. Commission tracking. Agent dashboard.

**Current State**: No agent/affiliate system. All bookings go through the customer flow. Commission is tracked at the operator level (platform takes commission from operators), not at the agent level.

**Gap**: Entire feature is new.

**Requirements**:

| ID | Requirement | Priority |
|---|---|---|
| P4.1.1 | Create `Agent` Prisma model: `{ id, companyName, contactPerson, email, passwordHash, apiKey, commissionRate, status, bankAccountInfo }` | High |
| P4.1.2 | API key generation: random 32-char hex, stored hashed (like password) | High |
| P4.1.3 | `POST /api/v1/bookings` — agent creates booking on behalf of customer | High |
| P4.1.4 | `GET /api/v1/bookings` — agent lists their bookings | High |
| P4.1.5 | `GET /api/v1/bookings/:reference` — agent gets booking detail | High |
| P4.1.6 | `GET /api/v1/commissions` — agent sees earned commissions | High |
| P4.1.7 | Agent commission: percentage of `totalAmount`, deducted from platform's commission (not from operator) | High |
| P4.1.8 | Agent commission tracked on Booking: `agentId`, `agentCommissionAmount` | High |
| P4.1.9 | Agent dashboard at `/agent`: sales overview, commission summary, booking list | High |
| P4.1.10 | Agent auth: API key for REST, JWT for dashboard | High |
| P4.1.11 | Rate limiting: 100 requests/minute per API key | Medium |
| P4.1.12 | Admin page to onboard/manage agents | High |
| P4.1.13 | Settlement: agent commissions paid weekly (like operator settlements) | Medium |
| P4.1.14 | Webhook: notify agent of booking status changes | Low |

**Schema Changes**:
```prisma
model Agent {
  id              String       @id @default(cuid())
  companyName     String
  contactPerson   String
  email           String       @unique
  passwordHash    String
  apiKeyHash      String       @unique
  commissionRate  Decimal      @default(0.03) @db.Decimal(5, 4)
  status          AgentStatus  @default(PENDING)
  bankAccountInfo Json
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  bookings Booking[]

  @@index([status])
}

enum AgentStatus {
  PENDING
  ACTIVE
  SUSPENDED
  REJECTED
}

// Add to Booking model:
agentId              String?
agentCommissionAmount Decimal @default(0) @db.Decimal(12, 2)
```

**Files to Create/Modify**:
- `prisma/schema.prisma` (add Agent model + Booking fields)
- `app/api/v1/bookings/route.ts` (new)
- `app/api/v1/bookings/[reference]/route.ts` (new)
- `app/api/v1/commissions/route.ts` (new)
- `app/api/v1/auth.ts` (new: API key validation middleware)
- `app/agent/layout.tsx` (new)
- `app/agent/page.tsx` (new: dashboard)
- `app/agent/bookings/page.tsx` (new)
- `app/agent/commissions/page.tsx` (new)
- `app/agent/login/page.tsx` (new)
- `app/admin/agents/page.tsx` (new)
- `app/admin/agents/new/page.tsx` (new)
- `lib/agent-auth.ts` (new: API key + JWT for agents)
- `lib/pricing.ts` (modify: agent commission calculation)

---

## Cross-Cutting Concerns

### Database Migration Strategy

All schema changes should be grouped into **phase-based migrations**:

| Migration | Phase | Models Affected |
|---|---|---|
| `add-traveler-model` | Phase 2 | Traveler (new), Customer (add relation) |
| `add-booking-addons` | Phase 2 | Booking (add insurance/pickup fields) |
| `add-seat-system` | Phase 3 | Boat (add layoutConfiguration), Ticket (add seatId), SeatLock (new), Leg (add relation) |
| `add-notifications` | Phase 3 | Booking (add whatsapp fields), SeaCondition (new) |
| `add-agent-system` | Phase 4 | Agent (new), Booking (add agent fields) |

### New Dependencies Summary

| Package | Phase | Purpose |
|---|---|---|
| `@radix-ui/react-popover` | 1 | Passenger selector |
| `cmdk` | 1 | Port combobox |
| `@react-pdf/renderer` or `pdfkit` | 2 | E-ticket PDF |
| `twilio` (or use `fetch`) | 3 | WhatsApp notifications |

### Environment Variables (New)

| Variable | Phase | Purpose |
|---|---|---|
| `WHATSAPP_API_KEY` | 3 | WhatsApp Business API |
| `WHATSAPP_PHONE_NUMBER_ID` | 3 | WhatsApp sender ID |
| `AGENT_API_SALT` | 4 | API key hashing salt |

### Testing Requirements

| Phase | E2E Tests Needed |
|---|---|
| 1 | Search with passenger types, combobox interaction, dynamic pricing |
| 2 | Traveler CRUD, insurance checkout flow, refund from dashboard |
| 3 | Seat selection + locking, WhatsApp notification trigger, manifest check-in |
| 4 | Agent booking via API, commission calculation, agent dashboard |

### Performance Constraints

- Landing page with dynamic pricing: TTFB < 200ms (ISR with 1-hour revalidation)
- Seat map: initial render < 500ms for 100-seat boat
- Seat lock API: response < 100ms
- Agent API: p95 < 300ms
- All customer-facing times remain WITA (Asia/Makassar) — no regression

---

## Implementation Priority Matrix

```
                    HIGH IMPACT
                        │
         ┌──────────────┼──────────────┐
         │  Phase 1     │  Phase 3.1   │
         │  (Search UX) │  (Seat Maps) │
         │              │              │
LOW ─────┼──────────────┼──────────────┼──────── HIGH EFFORT
EFFORT   │  Phase 2.1   │  Phase 4     │
         │  (Travelers) │  (Agent API) │
         │              │              │
         └──────────────┼──────────────┘
                        │
                    LOW IMPACT
```

**Recommended Execution Order**:
1. Phase 1 (all) — Highest conversion impact, foundational UX
2. Phase 2.1 (Travelers + Refund) — Retention value
3. Phase 3.1 (Seat Maps) — Differentiator, high willingness-to-pay
4. Phase 2.2 (Insurance) — Revenue uplift
5. Phase 3.2 (Notifications) — Operational excellence
6. Phase 3.3 (Crew App) — Polish existing features
7. Phase 4 (Agent API) — Market expansion

---

## Acceptance Criteria Summary

### Phase 1 Done When:
- [ ] Passenger selector shows adult/child/infant counts in search
- [ ] Port combobox is searchable and grouped by region
- [ ] Landing page prices are dynamic (from DB, cached)
- [ ] Social proof component rotates recent bookings

### Phase 2 Done When:
- [ ] Customers can save and reuse traveler profiles
- [ ] Insurance can be added at checkout and appears on booking
- [ ] One-click refund available from account dashboard

### Phase 3 Done When:
- [ ] Boats with layout config show interactive seat maps
- [ ] Seat locks prevent double-booking during checkout
- [ ] WhatsApp notifications fire after payment confirmation
- [ ] Sea conditions banner displays on homepage
- [ ] Manifest page supports one-tap check-in

### Phase 4 Done When:
- [ ] Agents can create bookings via REST API with API key auth
- [ ] Agent commissions are tracked and visible in dashboard
- [ ] Admin can onboard and manage agents
