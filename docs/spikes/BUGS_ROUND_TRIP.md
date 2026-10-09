# Bug List: Round Trip (QC GIL-28)

**Created:** 2026-10-09
**Source:** QC GIL-28 (2026-10-08, code review) + temuan saat investigasi
**Scope:** Bug fitur Return / Round Trip di staging. Satu tempat untuk semua tiket bug + follow-up.

Status: ✅ Fixed & deployed · 🟡 Fixed di working tree (belum commit) · 🔴 Open · ⚠️ Follow-up (belum jadi tiket)

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Search Return error, daftar Outbound/Return tidak tampil | Blocker | ✅ Fixed (`e0bdf98`), terverifikasi live lokal; di Vercel staging sudah ke-deploy |
| 2 | Check-in leg pulang ditolak "Already checked in" | Blocker | ✅ Fixed (`be2abc0`), terverifikasi live lokal; belum di-push |
| 3 | Penumpang Return tidak muncul di manifest operator & departure admin | Blocker | ✅ Fixed (`fece18d`), terverifikasi live lokal; belum di-push |
| 4 | Pembatalan departure tidak membatalkan, me-refund, atau menotifikasi booking Return | Blocker | ✅ Fixed (`fece18d` + `28dbe1d`), terverifikasi live lokal; belum di-push |

---|-----|----------|--------|
| 1 | Search Return error, daftar Outbound/Return tidak tampil | Blocker | ✅ Fixed (`e0bdf98`), verifikasi staging pending |
| 2 | Check-in leg pulang ditolak "Already checked in" | Blocker | 🟡 Fixed di working tree; tabel baru ter-apply saat deploy (`db push`) |
| 3 | Penumpang Return tidak muncul di manifest operator & departure admin | Blocker | 🟡 Fixed di working tree |
| 4 | Pembatalan departure tidak membatalkan, me-refund, atau menotifikasi booking Return | Blocker | 🟡 Fixed di working tree (cancel/refund/guard di `fece18d`; notifikasi + aturan leg lewat belum commit) |

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

**Sudah:**
- (`fece18d`) `cancelLeg` memakai `bookingsOnLegWhere`: leg mana pun dibatalkan, booking round-trip jadi `CANCELLED_BY_OPERATOR`, tiket `REFUNDED`, 1 Refund 100% `totalAmount`, semua dalam satu `$transaction`. Guard hapus/nonaktifkan schedule ikut menghitung booking round-trip.
- (working tree) **Notifikasi:** `cancelLeg` mengembalikan `cancelled: [{bookingId, refundAmount}]`; admin `cancelDeparture` dan aksi cancel operator memanggil `notifyLegCancelled` (email + WhatsApp via `notifyOperatorUnavailable`, round-trip menyebut kedua leg) setelah transaksi commit. Kegagalan kirim ditelan per booking.
- (working tree) **Leg lain sudah lewat:** booking round-trip yang leg satunya `SAILED` atau sudah lewat tanggalnya tidak dibatalkan; dikembalikan di `skipped` dan ditampilkan sebagai peringatan di halaman admin dan operator untuk ditangani manual. (Aturan ini usulan, belum dikonfirmasi bisnis.)
- (working tree) Unit test: cancel via leg outbound dan via leg return dengan one-way + round-trip sekaligus (status booking, tiket, jumlah Refund), skip leg lewat, refund existing, dan `notifyLegCancelled`. Total 839 unit test lolos.

**Acceptance Criteria:**
- [x] Cancel leg outbound / return → booking Return batal penuh, refund 100% (secara kode; belum diuji DB nyata)
- [x] Notifikasi email + WhatsApp menyebut kedua leg (unit test; belum diuji kirim nyata)
- [x] Booking Return yang leg satunya sudah lewat tidak terdampak secara salah
- [x] Guard nonaktifkan jadwal memblokir jika ada booking round-trip aktif
- [x] Unit test cancel leg one-way + round-trip
- [x] Alur one-way tidak berubah

**Keputusan pending (bisnis):** aturan "leg satunya sudah lewat → serahkan ke admin" belum dikonfirmasi.

**Belum:** alasan pembatalan yang diisi admin/operator ("Shown to affected customers" di form admin) belum masuk ke email/WhatsApp; `sendCancellationEmail` dan `sendOperatorUnavailableWhatsapp` tidak punya parameter alasan.

---

## Verifikasi live (2026-10-09)

Aplikasi dijalankan lokal (`next dev`, port 3100) terhadap DB Supabase staging (project `asymnwikxyhipoezoggp`, dipakai `.env.staging`; production memakai `viluiajknccclsogyogv`), dengan akun QA yang sudah ada. Email, WhatsApp, dan pembayaran dalam mode mock (kunci dikosongkan). Tabel `TicketCheckin` di-apply ke DB staging lewat `prisma db push` (additive, tanpa `--accept-data-loss`). Data uji memakai prefiks `VERIFY` pada booking dan operator QA Boats (Sanur ↔ Nusa Penida).

**Hasil: 38/38 cek lolos** (Playwright + cek DB langsung):
- **#1** Search Return: tanpa halaman error, daftar Outbound dan Return tampil dengan jam dan harga.
- **#3** Manifest JSON/CSV/print dan halaman leg operator di kedua leg memuat penumpang round-trip dengan tag trip; Admin Departure detail di kedua leg memuat booking round-trip; list departure admin render.
- **#2** Penumpang yang sama check-in di outbound lalu return; scan ulang di tiap leg ditolak `ALREADY_CHECKED_IN`; QR outbound ditolak di leg return dan sebaliknya (`INVALID_QR`); tiket separuh boarding tetap `ISSUED`, penuh jadi `CHECKED_IN` (2 baris `TicketCheckin`); status manifest per leg benar; one-way tidak berubah.
- **#4** Cancel via leg return membatalkan round-trip (tiket `REFUNDED`, 1 Refund = `totalAmount`) tanpa menyentuh one-way di leg lain; cancel via leg outbound membatalkan one-way; round-trip yang leg outbound-nya `SAILED` tidak dibatalkan dan memunculkan peringatan; email + WhatsApp (mock) tercatat untuk tiap booking yang dibatalkan dan tidak untuk yang dilewati.

**Belum tercakup:**
- Hanya dijalankan lokal; deployment Vercel staging belum menjalankan commit #2 sampai #4 dan belum punya `QR_HMAC_SECRET`.
- Notifikasi diuji dalam mode mock (tidak ada pesan nyata terkirim); isi email round-trip (kedua leg) hanya tercakup unit test.
- Aksi cancel di halaman operator tidak dijalankan (hanya cancel lewat admin); lihat follow-up 7.
- Tampilan visual tidak diperiksa manual (hanya teks/DOM).

**Data uji tertinggal di DB staging:** 5 booking `VERIFY` (BK-2026-10-AJBU5Q, -VRJ9E9, -BZK3AJ, -PT4Z6H, -RCZMDP) beserta pembayaran, tiket, dan 2 Refund `PENDING`; 3 leg dibatalkan dan 1 leg `SAILED` (leg uji QA Boats 20, 22, 26, 28 Okt); 132 leg QA Boats baru (10 Okt sampai 22 Nov) hasil `generateLegsForSchedule`.

---

## Follow-up (belum jadi tiket)

1. ⚠️ **`collectBoatSubtree` di `lib/operator-purge.ts`** mencari booking hanya lewat `legId`. Guard financial-chain (Payment/Refund/Ticket) buta terhadap booking round-trip pada purge boat. Jalur destruktif; perlu tiket sendiri. (`collectOperatorSubtree` aman karena juga mencocokkan `operatorId`.)
2. ⚠️ **Manual check-in** di `app/operator/legs/[id]/page.tsx` nyaring `booking.legId`, jadi gagal untuk round-trip. Tombolnya disembunyikan untuk baris round-trip sampai #2 selesai.
3. ⚠️ **Jalur cuaca** di halaman yang sama (cari booking `CONFIRMED` setelah `cancelLeg`) tampaknya sudah tidak pernah menemukan apa pun karena `cancelLeg` sudah mengubah statusnya. Pre-existing; perilaku tidak diubah.
4. ⚠️ **E2E round-trip** (`round-trip-booking.spec.ts`) di-skip, jadi regresi alur search → booking tidak tertangkap otomatis.
5. ⚠️ **`QR_HMAC_SECRET`** tidak ada di environment staging (hanya production) maupun env test (test me-mock `lib/qr`).
6. ⚠️ **`CRON_SECRET`** tidak muncul di daftar env Vercel (dicek 2026-10-09). README mewajibkan ada di staging supaya cron tidak 401. Belum diperiksa lebih jauh; di luar scope bug round-trip.
7. ⚠️ **Aksi cancel di `app/operator/legs/[id]/page.tsx`** memanggil `redirect()` di dalam `try` yang `catch`-nya ikut menangkap `NEXT_REDIRECT`, sehingga cancel yang sukses kemungkinan besar malah redirect ke `?error=NEXT_REDIRECT`. Belum dicoba di runtime; pre-existing, bertentangan dengan konvensi CLAUDE.md (re-throw `NEXT_REDIRECT`).
