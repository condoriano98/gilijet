# Bug List: Round Trip (QC GIL-28)

**Created:** 2026-10-09
**Source:** QC GIL-28 (2026-10-08, code review) + temuan saat investigasi
**Scope:** Bug fitur Return / Round Trip di staging. Satu tempat untuk semua tiket bug + follow-up.

Status: ✅ Fixed & deployed · 🟡 Fixed di working tree (belum commit) · 🔴 Open · ⚠️ Follow-up (belum jadi tiket)

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Search Return error, daftar Outbound/Return tidak tampil | Blocker | ✅ Fixed (`e0bdf98`), verifikasi staging pending |
| 2 | Check-in leg pulang ditolak "Already checked in" | Blocker | 🔴 Open, belum dikerjakan |
| 3 | Penumpang Return tidak muncul di manifest operator & departure admin | Blocker | 🟡 Fixed di working tree |
| 4 | Cancel leg tidak membatalkan/refund booking Return | Blocker | 🟡 Fixed bareng #3 |

---

## 1. Search Return error (serializer)

**Gejala:** `/search?...&returnDate=...` menampilkan "Something went wrong". Vercel runtime log: `Functions cannot be passed directly to Client Components ... {constructor: function i, s: 1, e: 5, d: ...}`.

**Root cause:** `lib/serialize-decimals.ts` mendeteksi Decimal lewat `obj.constructor.name === 'Decimal'`. Di build Prisma nama class di-minify jadi `i`, jadi Decimal disalin sebagai objek biasa beserta properti `constructor` (function). `Date` juga berubah jadi `{}` (tidak punya properti enumerable). Unit test memakai fake Decimal bernama `'Decimal'` dan malah mengunci perilaku `Date → {}`, jadi test tetap hijau.

**Fix (`e0bdf98`, staging, deployment READY):**
- `serializeDecimals` pakai `Prisma.Decimal.isDecimal()`; `Date` dilewatkan apa adanya.
- Test pakai `new Prisma.Decimal(...)` asli; test Date sekarang memastikan Date tetap `Date`.
- `search/page.tsx`: rating lookup juga mencakup schedule dari return legs; `ratingsByScheduleId` dikirim sebagai plain object.

**Acceptance Criteria:**
- [ ] Search Return di staging menampilkan Outbound dan Return dengan jam & harga benar (belum diverifikasi manual di staging)
- [ ] Tidak ada error baru di Vercel runtime log route `/search` (belum dicek)
- [x] Unit test serializer mencakup Date + Decimal

**Sisa:** `type LegForClient = any` di `components/customer/round-trip-leg-selector.tsx` belum diganti tipe yang benar.

---

## 2. Check-in leg pulang ditolak ALREADY_CHECKED_IN

**Gejala:** Penumpang round-trip check-in di leg outbound sukses, scan di leg return ditolak `ALREADY_CHECKED_IN`.

**Terverifikasi di kode:**
- `lib/ticket-issuer.ts`: 1 tiket per penumpang per booking, status/`checkedInAt` hanya satu.
- `app/api/operator/checkin/route.ts`: menolak jika `ticket.status === 'CHECKED_IN'` di level tiket.
- QR sudah per-leg lewat tanggal (HMAC `ticketCode + tanggal`; PDF return memakai tanggal leg return). Jadi QR outbound tidak bisa dipakai di leg return dan sebaliknya; yang rusak hanya status check-in.

**Rekomendasi:** tabel `TicketCheckin(ticketId, legId, checkedInAt, checkedInBy)` dengan unique `(ticketId, legId)`.
- `ticketCode`, PDF, dan jumlah tiket tidak berubah; tidak perlu backfill.
- Refund tetap satu `REFUNDED` per tiket, otomatis kena kedua leg.
- Perlu dicek: pembaca `ticket.status` / `checkedInAt` (manifest, no-show) harus per leg.
- Menyentuh schema, perlu migrasi.

**Acceptance Criteria:**
- [ ] Check-in outbound lalu return berhasil
- [ ] Scan dua kali di leg yang sama tetap ditolak
- [ ] QR outbound tidak bisa boarding leg return, dan sebaliknya
- [ ] Unit test check-in dua leg
- [ ] One-way tidak terdampak

**Catatan:** `QR_HMAC_SECRET` belum di-set di env staging; harus diisi manual di Vercel sebelum uji check-in QR.

---

## 3. Penumpang Return tidak muncul di manifest / departure admin

**Gejala:** Booking round-trip menyimpan `legId = null`; semua query per leg memakai `leg.bookings` (relasi one-way), jadi penumpang round-trip tidak muncul. Relasi `outboundBookings` / `returnBookings` tidak dipakai di mana pun.

**Fix (working tree, belum commit):**
- Helper `bookingsOnLegWhere(legId)` + `legRoleForBooking` di `lib/booking-helpers.ts`.
- Dipakai di: manifest JSON, CSV (kolom "Trip"), print manifest, `getOperatorLeg` (halaman leg operator), Admin Departure detail, hitungan list departure (`/admin/operations`), guard hapus schedule.
- Badge "Round trip · outbound/return" di halaman operator dan admin.
- Tes: helper, `getOperatorLeg`, `cancelLeg`, route manifest JSON/CSV (one-way + round-trip). Total unit test 810/810.

**Acceptance Criteria:**
- [x] Manifest operator (halaman + CSV) leg outbound menampilkan penumpang round-trip
- [x] Manifest leg return menampilkan penumpang yang sama
- [x] Departure detail admin menampilkan booking round-trip di kedua leg
- [x] Hitungan per leg memuat booking round-trip (tidak ada seat accounting; `booking-engine` memang tanpa capacity check)
- [x] Unit test manifest one-way + round-trip
- [ ] Verifikasi manual di browser / staging

---

## 4. Cancel leg tidak menangani booking Return

**Gejala:** `cancelLeg` (`lib/legs.ts`) memakai `where: { legId, status: 'CONFIRMED' }`, jadi booking round-trip tidak ikut dibatalkan dan tidak di-refund; tiketnya tetap `ISSUED`.

**Fix (working tree, bareng #3):** pakai `bookingsOnLegWhere`. Mengikuti aturan MVP: leg mana pun dibatalkan, booking round-trip batal penuh dengan refund 100%. Ada unit test lookup `cancelLeg`.

**Belum teruji:** alur penuh cancel → refund untuk round-trip di DB nyata.

---

## Follow-up (belum jadi tiket)

1. ⚠️ **`collectBoatSubtree` di `lib/operator-purge.ts`** mencari booking hanya lewat `legId`. Guard financial-chain (Payment/Refund/Ticket) buta terhadap booking round-trip pada purge boat. Jalur destruktif; perlu tiket sendiri. (`collectOperatorSubtree` aman karena juga mencocokkan `operatorId`.)
2. ⚠️ **Manual check-in** di `app/operator/legs/[id]/page.tsx` nyaring `booking.legId`, jadi gagal untuk round-trip. Tombolnya disembunyikan untuk baris round-trip sampai #2 selesai.
3. ⚠️ **Jalur cuaca** di halaman yang sama (cari booking `CONFIRMED` setelah `cancelLeg`) tampaknya sudah tidak pernah menemukan apa pun karena `cancelLeg` sudah mengubah statusnya. Pre-existing; perilaku tidak diubah.
4. ⚠️ **E2E round-trip** (`round-trip-booking.spec.ts`) di-skip, jadi regresi alur search → booking tidak tertangkap otomatis.
5. ⚠️ **`QR_HMAC_SECRET`** tidak ada di env test dan staging (lihat #2).
