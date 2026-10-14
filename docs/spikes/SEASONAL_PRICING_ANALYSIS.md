# Seasonal Pricing — Analysis & Plan

**Status:** Implemented (commit `8106454`, rilis **v1.1.0**), ada di `origin/staging`, dan schema + RLS + seed sudah diterapkan ke DB staging (2026-10-13). QC kode selesai. Belum ke production. Cek manual oleh owner dan konfirmasi deploy staging Vercel masih pending.
**Created:** 2026-09-28 · **Revised:** 2026-10-13
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
2. **RLS:** `prisma/sql/season-rls.sql` (public `SELECT` hanya baris aktif & belum dihapus, tanpa policy tulis). `db push` tidak membuat policy, jadi diapply manual **setelah** push dengan `prisma db execute --file prisma/sql/season-rls.sql` memakai env target. Supabase MCP *tidak* dipakai: project staging tidak terdaftar di MCP. RLS hanya melindungi akses PostgREST langsung; "admin write" ditegakkan `requireSuperAdmin` di app.
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

## Status implementasi (2026-10-13)

| Langkah | Status |
|---|---|
| 1. Schema (`Season`, `SeasonType`, `Leg.priceOverridden`, `Booking.seasonSnapshot`, `SEASON` audit) | Done, applied ke staging |
| 2. RLS | Done, applied ke staging (1 policy, RLS aktif) |
| 3. Resolver `src/features/pricing/seasons.ts` | Done (`resolveSeason`, `legPricingInputs`, `withSeasonPrice`, `adultFareFromSnapshot`) |
| 4. Engine: harga dari resolver, OFF → `LEG_CLOSED`, tulis `seasonSnapshot` | Done |
| 5. Override: `adjustDeparturePrice` set `priceOverridden` | Done |
| 6. Display: search (+badge High/Peak), round-trip selector, book page, `b/[reference]`, reschedule, home, connection-search, POS, email round trip | Done |
| 7. Admin CRUD `/admin/console/seasons` (super admin, soft-delete, audit) | Done, belum dicoba di browser |
| 8. Seed `pnpm seed:seasons` (8 baris 2026/27) | Done, di-seed ke staging |

Sengaja tidak diubah: `src/mcp/tools.ts` dan halaman admin/operator yang menampilkan `basePrice` mentah (itu harga dasar leg, bukan harga customer).

### Keputusan yang diambil saat implementasi

- Enum final **HIGH** (UAC menulis MEDIUM).
- Leg dengan override manual di schedule ber-`fareMatrix`: harga anak/bayi sekarang = multiplier × harga override (sebelumnya sel low matrix).
- Email round trip menghitung harga per leg dari season di `seasonSnapshot`, bukan kalender saat email dikirim.
- Tidak ada form edit season: hapus lalu tambah ulang.
- Leg dengan override manual: badge dan `seasonSnapshot` mencatat `season: null` (harganya bukan dari season), tapi hari OFF tetap menutup penjualan.
- Wahana: tarif anak di `fareMatrix` sama dengan dewasa (data operator, bukan bug resolver).

### Verifikasi

- **Unit:** 868 test lolos (`seasons.test.ts`: resolver, precedence, WITA day key, `withSeasonPrice`, `legPricingInputs`, `adultFareFromSnapshot`; test engine one-way: OFF ditolak, harga PEAK, snapshot; mock tx diperbarui).
- **E2E baru, 9 test lolos:**
  - `tests/e2e/seasonal-pricing.spec.ts` (6): fixture sendiri di 2099 (schedule, leg, `Season`) dan dihapus lagi. Tanpa season, LOW, HIGH, PEAK menang atas HIGH, override manual, OFF tersembunyi dan tidak bisa dibuka di book page. Search = baris Total di book page. Tidak membuat booking.
  - `tests/e2e/admin-seasons.spec.ts` (3): `/admin/console/seasons` tidak bisa dibuka tanpa login; super admin tambah, ditolak saat end < start (divalidasi server), deactivate, soft-delete + audit log; `adjustDeparturePrice` lewat UI men-set `priceOverridden` dan harga di search ikut berubah sementara leg tetangga tetap mengikuti season.
- **QC engine terhadap DB staging** (script sementara, sudah dihapus; 18 cek lolos): total one-way untuk tanpa season/LOW/HIGH/PEAK/override sesuai hitungan manual (adult+child+infant), payment amount = total dan `PENDING_PAYMENT`, `seasonSnapshot` benar, OFF ditolak `LEG_CLOSED` tanpa baris booking, round-trip HIGH+PEAK = 525.000 dengan 2 entri snapshot, round-trip dengan return OFF ditolak, booking lama tidak berubah saat season dinonaktifkan, booking baru kembali ke harga normal saat season dinonaktifkan/di-soft-delete. Booking dan fixture uji dihapus; staging bersih.
- **Render sweep:** home, search (normal, round-trip, koneksi), reschedule, `/operator/pos`, `/operator/schedules` tanpa error.
- **Live di staging** (`/search` Padang Bai → Gili Trawangan): 1 Des 2026 Rp 500.000 + badge High; 25 Des Rp 700.000 + badge Peak; 27 Mar 2027 (Nyepi) tidak ada keberangkatan; 26 Mar Rp 450.000.
- **Tidak diuji (disengaja):** pembayaran sukses, penerbitan tiket, email/WA boarding pass. Env staging memakai DOKU dan PayPal **production** (`*_IS_PRODUCTION="true"`) beserta kunci WATI/Resend asli. Untuk QC, semua kunci itu dikosongkan di proses dev server/script (mode mock) dan booking hanya dibuat sampai `PENDING_PAYMENT`.
- Test E2E booking lama (customer, round-trip, admin refund) masih di-skip sejak sebelumnya; alur booking sampai bayar belum diuji E2E.

### Temuan QC di luar scope season

- `/b/<reference>` untuk booking ber-tiket error di env ini: `QR_HMAC_SECRET` < 32 karakter (log `[env] Invalid or missing variables`), tanda tangan QR gagal di `qr.ts`. Perbaiki secret di env staging. Akibatnya tampilan saran return leg di halaman itu belum terlihat visual (query-nya sudah jalan tanpa error sebelum crash).
- `operator-manifest.spec.ts` memakai `waitForURL(/\/operator(\/|$)/)` yang juga cocok dengan `/operator/login`, jadi bisa lolos tanpa benar-benar login.
- Harga season di POS tidak terlihat saat QC karena tidak ada keberangkatan dalam 8 jam; logikanya sama dengan yang diuji di engine.

### Belum

- Cek manual owner di browser: alur booking sampai halaman bayar (jangan bayar; DOKU/PayPal di env ini production), tampilan tab Seasons, badge di kartu search.
- ~~Reschedule customer belum menolak leg tujuan di hari OFF di server~~ — selesai di v1.1.1: `submitRescheduleAction` memakai `legPricingInputs(...).closed`. E2E: `tests/e2e/reschedule-season.spec.ts`.
- `take` pada departing-soon (home) dan kandidat reschedule dipotong sebelum leg OFF dibuang, jadi di hari OFF hasil bisa sedikit kurang dari limit.
- Boat selain Wahana: butuh `fareMatrix` (atau keputusan baru, mis. multiplier) sebelum season berlaku untuk mereka.
- Kalender season harus diisi admin tiap tahun (terutama Nyepi); seed hanya mencakup 2026/27.
- Struktur kolom dari attachment tiket belum dilihat; kolom `Season` diasumsikan dari data. Cocokkan sebelum prod.

### Deploy / prod

- `pnpm build` menjalankan `scripts/db-push-if-configured.mjs` (`prisma db push`, tanpa `--accept-data-loss`) di setiap build Vercel memakai env build itu. Merge ke branch prod otomatis menerapkan perubahan schema ini ke DB prod (additive). Tahan merge sampai siap, atau set `SKIP_DB_PUSH=1` di env prod.
- Setelah schema ada di prod: jalankan `prisma/sql/season-rls.sql` dan `pnpm seed:seasons` dengan env prod, secara sadar.
- DB lokal (`.env`, `.env.local`) dan `.env.staging` menunjuk project Supabase yang sama (staging), sehingga `pnpm seed:qa` / `test:e2e` dari mesin dev menulis ke staging.
