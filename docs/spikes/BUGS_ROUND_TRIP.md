# Bug List: Round Trip (QC GIL-28)

**Created:** 2026-10-09
**Source:** QC GIL-28 (2026-10-08, code review) + temuan saat investigasi
**Scope:** Bug fitur Return / Round Trip di staging. Satu tempat untuk semua tiket bug + follow-up.

Status: ✅ Fixed & deployed · 🟡 Fixed di working tree (belum commit) · 🔴 Open · ⚠️ Follow-up (belum jadi tiket)

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Search Return error, daftar Outbound/Return tidak tampil | Blocker | ✅ Fixed (`e0bdf98`), verifikasi staging pending |
| 2 | Check-in leg pulang ditolak "Already checked in" | Blocker | 🟡 Fixed di working tree; tabel baru ter-apply saat deploy (`db push`) |
| 3 | Penumpang Return tidak muncul di manifest operator & departure admin | Blocker | 🟡 Fixed di working tree |
| 4 | Pembatalan departure tidak membatalkan, me-refund, atau menotifikasi booking Return | Blocker | 🟡 Sebagian: cancel/refund/guard fixed (`fece18d`), notifikasi belum |

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

**Fix (working tree, belum commit):** tabel `TicketCheckin(ticketId, legId, checkedInAt, checkedInBy)` dengan unique `(ticketId, legId)`.
- `lib/leg-checkin.ts`: `boardedLegIds`, `ticketStatusOnLeg`, `checkedInAtOnLeg`, `recordLegCheckin`. Gate-nya `createMany(skipDuplicates)` pada unique row (aman dari race antar scanner, tidak meng-abort transaksi Postgres).
- `checkin/route.ts`: "already checked in" dicek per leg. `Ticket.status` jadi `CHECKED_IN` hanya setelah semua leg boarded (1 untuk one-way, 2 untuk round-trip), jadi refund (yang menyasar `ISSUED`) tetap benar untuk tiket yang baru separuh dipakai.
- Manifest JSON/CSV/print dan halaman leg operator membaca status per leg. Manual check-in diaktifkan lagi untuk round-trip (memakai helper yang sama).
- Tiket lama yang sudah `CHECKED_IN` tanpa row dianggap sudah boarding leg pertama (outbound); tidak perlu backfill.
- `ticketCode`, QR, dan PDF tidak berubah. QR sudah per-leg lewat tanggal.
- Tes: helper, alur route dua leg (in-memory), manifest per leg. Total 831 unit test lolos.

**Deploy:** repo ini tanpa migration file; setiap build Vercel menjalankan `prisma db push` (tanpa `--accept-data-loss`) ke Supabase yang terkonfigurasi. Tabel baru bersifat additive, jadi ter-apply otomatis saat branch di-push. `.env` lokal menunjuk ke Supabase remote, jadi `db push` tidak dijalankan dari lokal.

**Acceptance Criteria:**
- [x] Check-in outbound lalu return berhasil (unit test route)
- [x] Scan dua kali di leg yang sama tetap ditolak
- [x] QR outbound tidak bisa boarding leg return, dan sebaliknya
- [x] Unit test check-in dua leg
- [x] One-way tidak terdampak (test one-way)
- [ ] Uji nyata di staging (butuh `QR_HMAC_SECRET` terisi di environment staging dan tabel `TicketCheckin` sudah ter-apply; terbitkan tiket baru setelahnya)

**Catatan:** `QR_HMAC_SECRET` hanya ada di target `production` di Vercel (dicek 2026-10-09: tidak ada entri untuk custom environment "staging"). Harus ditambahkan untuk environment staging sebelum uji check-in QR.

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

## 4. Pembatalan departure tidak membatalkan / refund / notifikasi booking Return

**Gejala:** Operator/admin membatalkan leg A atau B, booking Return tetap `CONFIRMED`: tidak dibatalkan, tidak ada Refund, tiket tidak di-void, customer tidak diberi tahu. `cancelLeg` (`lib/legs.ts`) mencari `where: { legId, status: 'CONFIRMED' }`, padahal round-trip menyimpan `legId = null`.

**Sudah (`fece18d`, belum di-push):**
- `cancelLeg` memakai `bookingsOnLegWhere`: leg mana pun dibatalkan, booking round-trip jadi `CANCELLED_BY_OPERATOR`, tiket `REFUNDED`, 1 Refund 100% `totalAmount`, semua dalam satu `$transaction` (atomik).
- Guard hapus/nonaktifkan schedule (`actions.ts`) ikut menghitung booking round-trip.
- Filter di jalur weather halaman operator diganti ke helper (jalurnya sendiri sudah mati, lihat follow-up 3).
- Unit test: lookup `cancelLeg` mencakup one-way + outbound + return.

**Belum:**
- **Notifikasi email + WhatsApp ke customer.** Tidak ada pemanggil `cancelLeg` (admin `cancelDeparture`, halaman operator) yang mengirim notifikasi. Ini gap lama, berlaku juga untuk one-way. `notifyOperatorUnavailable` (`lib/booking-notifications.ts`) sudah mendukung round-trip (menyebut kedua leg) dan bisa dipakai; perlu dipanggil per booking setelah transaksi commit.
- **Leg pulang yang sudah lewat:** booking Return yang salah satu legnya sudah SAILED tidak boleh terdampak secara salah. Perilaku `cancelLeg` untuk kasus ini belum didefinisikan/diuji.
- **Unit test skenario lengkap:** cancel leg dengan booking one-way + round-trip sekaligus (status booking, tiket, jumlah Refund), cancel via leg outbound dan via leg return.

**Keputusan pending (bisnis):** usulan: jika salah satu leg booking Return sudah `SAILED`, `cancelLeg` tidak membatalkan booking tsb dan diserahkan ke penanganan manual admin (refund 100% atas perjalanan yang sebagian sudah dipakai bisa salah). Belum dikonfirmasi.

**Acceptance Criteria:**
- [x] Cancel leg outbound / return → booking Return batal penuh, refund 100% (secara kode; belum diuji DB nyata)
- [ ] Notifikasi terkirim (email + WhatsApp, menyebut kedua leg)
- [ ] Booking Return yang leg pulangnya sudah lewat tidak terdampak secara salah
- [x] Guard nonaktifkan jadwal memblokir jika ada booking round-trip aktif
- [ ] Unit test cancel leg one-way + round-trip (baru sebagian)
- [x] Alur one-way tidak berubah

---

## Follow-up (belum jadi tiket)

1. ⚠️ **`collectBoatSubtree` di `lib/operator-purge.ts`** mencari booking hanya lewat `legId`. Guard financial-chain (Payment/Refund/Ticket) buta terhadap booking round-trip pada purge boat. Jalur destruktif; perlu tiket sendiri. (`collectOperatorSubtree` aman karena juga mencocokkan `operatorId`.)
2. ⚠️ **Manual check-in** di `app/operator/legs/[id]/page.tsx` nyaring `booking.legId`, jadi gagal untuk round-trip. Tombolnya disembunyikan untuk baris round-trip sampai #2 selesai.
3. ⚠️ **Jalur cuaca** di halaman yang sama (cari booking `CONFIRMED` setelah `cancelLeg`) tampaknya sudah tidak pernah menemukan apa pun karena `cancelLeg` sudah mengubah statusnya. Pre-existing; perilaku tidak diubah.
4. ⚠️ **E2E round-trip** (`round-trip-booking.spec.ts`) di-skip, jadi regresi alur search → booking tidak tertangkap otomatis.
5. ⚠️ **`QR_HMAC_SECRET`** tidak ada di environment staging (hanya production) maupun env test (test me-mock `lib/qr`).
6. ⚠️ **`CRON_SECRET`** tidak muncul di daftar env Vercel (dicek 2026-10-09). README mewajibkan ada di staging supaya cron tidak 401. Belum diperiksa lebih jauh; di luar scope bug round-trip.
