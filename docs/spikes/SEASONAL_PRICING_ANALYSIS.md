# Seasonal Pricing — Analysis & Plan

**Status:** Planned (belum diimplementasi)
**Created:** 2026-09-28 · **Revised:** 2026-10-12
**Scope:** Wahana saja (belum ada boat lain)

## Tujuan

Harga tiket saat ini statis. Harga harus ikut season pada tanggal keberangkatan: **LOW, HIGH, PEAK, OFF** (UAC menulis "MEDIUM" di beberapa tempat; data season memakai HIGH, jadi enum final = HIGH). Admin bisa mengelola data season. Tanpa data season → fallback ke harga default.

## Data season (dari bisnis)

| Season | Mulai | Selesai | Note |
|---|---|---|---|
| PEAK | 25 Des | 25 Des | |
| PEAK | 1 Jan | 2 Jan | |
| HIGH | 3 Jan | 31 Jan | |
| HIGH | 1 Des | 31 Des | |
| LOW | 1 Feb | 28 Feb | |
| LOW | 1 Mar | 31 Mar | |
| LOW | 1 Apr | 30 Apr | |
| OFF | 27 Mar | 27 Mar | Nyepi |

- Mei–Nov tidak ada baris → fallback default (harga LOW / `basePrice`).
- Rentang boleh overlap (PEAK 25 Des di dalam HIGH Des; OFF 27 Mar di dalam LOW Mar).
- **Precedence:** OFF > PEAK > HIGH/LOW; jika sama, rentang paling sempit menang.
- Tanggal disimpan dengan tahun (Nyepi bergeser tiap tahun), bukan recurring.

## Keputusan

1. **Harga per season disimpan di `Schedule.fareMatrix`**, bukan di tabel season. Struktur `[oneWay|return][low|high|peak][adult|child|infant]` sudah ada (`src/features/pricing/fares.ts`) dan cocok dengan enum season. Tabel `Season` hanya kalender: tanggal → tipe season.
2. **`basePrice` = fallback.** Schedule tanpa `fareMatrix` tetap memakai `basePrice` + multiplier penumpang yang ada (season tidak mengubah harga). Saat ini hanya schedule Wahana yang punya `fareMatrix` (`scripts/import-wahana-schedule.ts`); itu cukup untuk scope ini. Tidak ada editor `fareMatrix` di admin.
3. **Resolve saat tampil & booking** lewat satu resolver, bukan saat generate leg. Leg hanya digenerate 60 hari ke depan (`BOOKING_HORIZON_DAYS`) dan idempotent, jadi harga yang ditulis saat generate akan basi kalau season diubah.
4. **OFF = tidak tersedia**: leg tidak muncul/tidak bisa dibooking.
5. **Override manual menang atas season.** `adjustDeparturePrice` (super admin) menandai `Leg.priceOverridden = true`; resolver melewati season untuk leg itu.
6. **Booking existing tidak dihitung ulang.** Harga sudah snapshot sebagai `totalAmount` saat booking dibuat; `Booking.seasonSnapshot` (Json) mencatat season yang dipakai untuk audit.
7. **Round trip** tetap memakai sel `oneWay` per leg (perilaku sekarang); sel `return` di luar scope.

## Kondisi kode saat ini

| Area | Lokasi |
|---|---|
| Engine harga | `src/features/pricing/pricing.ts` — `computeBookingPriceWithTypes({ unitPrice, … categoryUnitPrices })` |
| Booking | `src/features/booking/engine.ts` — `leg.basePrice` dipakai di ~165, 192 (one-way) dan ~284, 291, 324, 335 (round trip); hanya total yang disimpan di `Booking` |
| Fare matrix | `src/features/pricing/fares.ts` — `categoryFaresFor()` hard-coded ke `oneWay.low` ("no season resolver") |
| Leg | `src/features/schedules/legs.ts` — `generateLegsForSchedule` menyalin `schedule.basePrice` |
| Override admin | `src/app/admin/(authed)/operations/actions.ts` — `adjustDeparturePrice` |
| Zona waktu | `src/shared/lib/datetime.ts` — `ymdInZone()` (WITA) |

Tidak ada migrations (`prisma db push`) dan tidak ada RLS/SQL di repo. Auth custom (JWT), Prisma memakai DB role.

### Pembaca `basePrice` yang harus lewat resolver

Supaya harga yang tampil = harga yang ditagih:

- Search: `src/app/(customer)/[locale]/search/page.tsx` (filter maxPrice, sort, tampil), `_components/round-trip-leg-selector.tsx`
- Book page: `book/[legId]/page.tsx` (menduplikasi logic child/infant dari engine — hapus duplikasi)
- `b/[reference]/page.tsx`, `b/[reference]/reschedule/page.tsx`
- `src/features/booking/notifications.ts` (email round trip; saat ini juga mengabaikan diskon/child fare)
- `src/features/schedules/connection-search.ts`, `home-data.ts`, `src/mcp/tools.ts`
- POS: `src/app/operator/pos/page.tsx`, `pos-client.tsx`

## Rencana implementasi

1. **Schema:** `enum SeasonType { LOW HIGH PEAK OFF }`; `model Season { id, type, startDate @db.Date, endDate @db.Date, note?, isActive, createdAt, updatedAt, deletedAt? }` + index `(startDate, endDate)`; `Leg.priceOverridden`; `Booking.seasonSnapshot Json?`; `SEASON` di `AuditEntityType`.
2. **RLS:** `prisma/sql/season-rls.sql` (public `SELECT`, write hanya service/DB role), diapply manual via Supabase `apply_migration` (`db push` tidak membuat policy). RLS hanya melindungi akses PostgREST langsung; "admin write" ditegakkan `requireAdmin` di app.
3. **Resolver** `src/features/pricing/seasons.ts`: `resolveSeason` (pure), `getSeasonForDate` (query), batch loader untuk list, `resolveLegFares`. Perluas `categoryFaresFor(matrix, season)`. Kunci tanggal = `ymdInZone(departureDate)`.
4. **Engine:** ganti `leg.basePrice` dengan hasil resolver; OFF → tolak booking; tulis `seasonSnapshot`.
5. **Override:** set `priceOverridden` di `adjustDeparturePrice`.
6. **Display:** semua pembaca di atas + badge season di hasil search.
7. **Admin CRUD:** tab "Seasons" di `console/layout.tsx`, template dari `console/coupons/`; guard `requireAdmin`/`requireSuperAdmin`, Zod, `audit()`, soft-delete.
8. **Seed:** season deterministik di `scripts/seed-qa.ts` + seed 2026/27 dari tabel di atas.

## Acceptance Criteria (UAC) → verifikasi

| UAC | Cara verifikasi |
|---|---|
| Tabel season dibuat sesuai struktur | `db push` + cek schema |
| RLS terkonfigurasi | Query anon: SELECT ok, INSERT/UPDATE/DELETE ditolak |
| Harga frontend berubah sesuai season | E2E: tanggal LOW/HIGH/PEAK/OFF, harga search = book page = total booking |
| 25 Des tampil PEAK walau bulan HIGH | Unit `seasons.test.ts` + E2E |
| Nyepi (OFF) tidak tersedia | Unit + E2E: leg tidak bisa dibooking |
| Fallback tanpa data season | Unit: Mei → default; schedule tanpa `fareMatrix` → `basePrice` |
| Tidak ada regresi booking | `pnpm test:e2e`, `pnpm test:unit` (update mock `tests/support/test-utils.ts` dan engine tests) |

Edge case unit test: keberangkatan 06:00 WITA jatuh di hari UTC sebelumnya (jangan pakai `getMonth()`/`getDate()` UTC).

## Risiko

- **Konsistensi harga:** pembaca `basePrice` yang terlewat akan menampilkan harga beda dari total booking. Mitigasi: satu resolver + grep `basePrice` sebelum merge.
- **Perubahan season setelah ada booking:** booking lama tidak berubah (snapshot total); hold PENDING_PAYMENT juga tidak dihitung ulang karena harga dihitung sekali saat booking dibuat.
- **N+1:** list search/home harus pakai batch loader.
- **Input tahunan:** season per-tahun harus diinput admin tiap tahun (terutama Nyepi).
- **Mock test:** query season baru di engine memaksa update mock Prisma di test.

## Open items

- Konfirmasi MEDIUM (UAC) = HIGH (data).
- Struktur kolom dari attachment tiket belum dilihat; kolom di atas diasumsikan dari data season.
- Boat selain Wahana: butuh `fareMatrix` (atau keputusan baru, mis. multiplier) sebelum season berlaku untuk mereka.
