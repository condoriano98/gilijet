# Bug List: Round Trip (QC GIL-28)

**Created:** 2026-10-09
**Source:** QC GIL-28 (2026-10-08, code review) + temuan saat investigasi
**Scope:** Bug fitur Return / Round Trip di staging. Satu tempat untuk semua tiket bug + follow-up.

**Kondisi per 2026-10-14:** kelima bug sudah fixed, ter-commit, dan ada di `origin/staging` (rilis **v1.1.0** di `CHANGELOG.md`; staging Vercel `gilijet.vercel.app`). Belum di production: `main` belum menerima merge dari `staging`. Path `lib/…`, `app/…`, `components/…` di dokumen ini adalah struktur lama; sekarang `src/features/…`, `src/app/…`, `src/shared/…` (lihat `STRUCTURE.md`).

Status: ✅ Fixed, di staging · 🔴 Open · ⚠️ Follow-up (belum jadi tiket)

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Search Return error, daftar Outbound/Return tidak tampil | Blocker | ✅ Fixed (`e0bdf98`), terverifikasi live lokal dan di Vercel staging |
| 2 | Check-in leg pulang ditolak "Already checked in" | Blocker | ✅ Fixed (`be2abc0`), terverifikasi live lokal dan di Vercel staging |
| 3 | Penumpang Return tidak muncul di manifest operator & departure admin | Blocker | ✅ Fixed (`fece18d`), terverifikasi live lokal dan di Vercel staging |
| 4 | Pembatalan departure tidak membatalkan, me-refund, atau menotifikasi booking Return | Blocker | ✅ Fixed (`fece18d` + `28dbe1d`), terverifikasi live lokal dan di Vercel staging |
| 5 | WhatsApp round-trip hanya mengirim 1 boarding pass (outbound) dan pembatalan tidak menyebut kedua leg | Krusial | ✅ Fixed (`1d16552`), terverifikasi live di gilijet.vercel.app |

---

## 1. Search Return error (serializer)

**Gejala:** `/search?...&returnDate=...` menampilkan "Something went wrong". Vercel runtime log: `Functions cannot be passed directly to Client Components ... {constructor: function i, s: 1, e: 5, d: ...}`.

**Root cause:** `lib/serialize-decimals.ts` mendeteksi Decimal lewat `obj.constructor.name === 'Decimal'`. Di build Prisma nama class di-minify jadi `i`, jadi Decimal disalin sebagai objek biasa beserta properti `constructor` (function). `Date` juga berubah jadi `{}` (tidak punya properti enumerable). Unit test memakai fake Decimal bernama `'Decimal'` dan malah mengunci perilaku `Date → {}`, jadi test tetap hijau.

**Fix (`e0bdf98`, staging, deployment READY):**
- `serializeDecimals` pakai `Prisma.Decimal.isDecimal()`; `Date` dilewatkan apa adanya.
- Test pakai `new Prisma.Decimal(...)` asli; test Date sekarang memastikan Date tetap `Date`.
- `search/page.tsx`: rating lookup juga mencakup schedule dari return legs; `ratingsByScheduleId` dikirim sebagai plain object.

**Acceptance Criteria:**
- [x] Search Return di staging menampilkan Outbound dan Return dengan jam & harga benar — _diverifikasi live 2026-10-09, putaran 2_
- [x] Tidak ada error baru di Vercel runtime log — _runtime log deployment yang diverifikasi bersih, putaran 2 dan 3_
- [x] Unit test serializer mencakup Date + Decimal

**Sisa:** `type LegForClient = any` di `components/customer/round-trip-leg-selector.tsx` belum diganti tipe yang benar.

---

## 2. Check-in leg pulang ditolak ALREADY_CHECKED_IN

**Gejala:** Penumpang round-trip check-in di leg outbound sukses, scan di leg return ditolak `ALREADY_CHECKED_IN`.

**Terverifikasi di kode:**
- `lib/ticket-issuer.ts`: 1 tiket per penumpang per booking, status/`checkedInAt` hanya satu.
- `app/api/operator/checkin/route.ts`: menolak jika `ticket.status === 'CHECKED_IN'` di level tiket.
- QR sudah per-leg lewat tanggal (HMAC `ticketCode + tanggal`; PDF return memakai tanggal leg return). Jadi QR outbound tidak bisa dipakai di leg return dan sebaliknya; yang rusak hanya status check-in.

**Fix (`be2abc0`):** tabel `TicketCheckin(ticketId, legId, checkedInAt, checkedInBy)` dengan unique `(ticketId, legId)`.
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
- [x] Uji nyata di staging — _putaran 2 (2026-10-09): `QR_HMAC_SECRET` staging sudah dibuat, tiket baru diterbitkan lewat UI admin, check-in outbound lalu return, scan ulang dan QR silang ditolak_

**Catatan:** `QR_HMAC_SECRET` hanya ada di target `production` di Vercel (dicek 2026-10-09: tidak ada entri untuk custom environment "staging"). Harus ditambahkan untuk environment staging sebelum uji check-in QR.

---

## 3. Penumpang Return tidak muncul di manifest / departure admin

**Gejala:** Booking round-trip menyimpan `legId = null`; semua query per leg memakai `leg.bookings` (relasi one-way), jadi penumpang round-trip tidak muncul. Relasi `outboundBookings` / `returnBookings` tidak dipakai di mana pun.

**Fix (`fece18d`):**
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
- [x] Verifikasi manual di staging — _putaran 2; yang diperiksa teks/DOM, bukan tampilan visual_

---

## 4. Pembatalan departure tidak membatalkan / refund / notifikasi booking Return

**Gejala:** Operator/admin membatalkan leg A atau B, booking Return tetap `CONFIRMED`: tidak dibatalkan, tidak ada Refund, tiket tidak di-void, customer tidak diberi tahu. `cancelLeg` (`lib/legs.ts`) mencari `where: { legId, status: 'CONFIRMED' }`, padahal round-trip menyimpan `legId = null`.

**Sudah:**
- (`fece18d`) `cancelLeg` memakai `bookingsOnLegWhere`: leg mana pun dibatalkan, booking round-trip jadi `CANCELLED_BY_OPERATOR`, tiket `REFUNDED`, 1 Refund 100% `totalAmount`, semua dalam satu `$transaction`. Guard hapus/nonaktifkan schedule ikut menghitung booking round-trip.
- (`28dbe1d`) **Notifikasi:** `cancelLeg` mengembalikan `cancelled: [{bookingId, refundAmount}]`; admin `cancelDeparture` dan aksi cancel operator memanggil `notifyLegCancelled` (email + WhatsApp via `notifyOperatorUnavailable`, round-trip menyebut kedua leg) setelah transaksi commit. Kegagalan kirim ditelan per booking.
- (`28dbe1d`) **Leg lain sudah lewat:** booking round-trip yang leg satunya `SAILED` atau sudah lewat tanggalnya tidak dibatalkan; dikembalikan di `skipped` dan ditampilkan sebagai peringatan di halaman admin dan operator untuk ditangani manual. (Aturan ini usulan, belum dikonfirmasi bisnis.)
- (`28dbe1d`) Unit test: cancel via leg outbound dan via leg return dengan one-way + round-trip sekaligus (status booking, tiket, jumlah Refund), skip leg lewat, refund existing, dan `notifyLegCancelled`. Total 839 unit test lolos.

**Acceptance Criteria:**
- [x] Cancel leg outbound / return → booking Return batal penuh, refund 100% (secara kode; belum diuji DB nyata)
- [x] Notifikasi email + WhatsApp menyebut kedua leg (unit test; belum diuji kirim nyata)
- [x] Booking Return yang leg satunya sudah lewat tidak terdampak secara salah
- [x] Guard nonaktifkan jadwal memblokir jika ada booking round-trip aktif
- [x] Unit test cancel leg one-way + round-trip
- [x] Alur one-way tidak berubah

**Keputusan pending (bisnis):** aturan "leg satunya sudah lewat → serahkan ke admin" belum dikonfirmasi.

**Alasan pembatalan (selesai di v1.1.1, 2026-10-14):** alasan yang diisi admin di form pembatalan departure sekarang masuk ke email ("Reason: …", di-escape) dan WhatsApp ("Alasan: …", maks. 200 karakter). `notifyLegCancelled` dan `notifyOperatorUnavailable` menerima `reason` opsional; admin `cancelDeparture` mengirimkannya. **Ditunda:** aksi cancel di halaman operator belum meneruskan alasan (operator ditunda dulu), dan konfirmasi-tidak-tersedia (`/admin/confirmations`) memang tanpa alasan.

---

## 5. WhatsApp round-trip: hanya 1 boarding pass, pembatalan tidak menyebut kedua leg

**Ditemukan:** 2026-10-09, dari runtime log Vercel saat verifikasi live (bukan dari tiket QC).

**Gejala:**
- Booking round-trip menghasilkan 2 PDF boarding pass (outbound dan return, masing-masing QR sendiri). Email melampirkan keduanya, tetapi WhatsApp hanya mengirim `attachments[0]` (outbound) dengan teks rute/tanggal leg berangkat saja. Customer yang mengandalkan WhatsApp tidak menerima pass pulang dan tidak tahu ia membeli 2 tiket.
- WhatsApp pembatalan (`sendOperatorUnavailableWhatsapp`) bersifat generik dan tidak menyebut kedua leg, padahal acceptance criteria #4 meminta email + WhatsApp menyebut kedua leg.

**Expected (konfirmasi user):** WhatsApp dan email sama-sama menyampaikan 2 tiket untuk round-trip.

**Fix (`1d16552`):**
- `notifyBoardingPassIssued`: satu dokumen WhatsApp per PDF, berurutan (outbound dulu), tiap caption menyebut "boarding pass berangkat/pulang Anda terlampir (1 dari 2)" beserta rute dan waktu leg tersebut dan bahwa pemesanan ini 2 boarding pass. Kegagalan kirim satu pass tidak menghentikan pass lain. Email tetap 1 email dengan 2 PDF.
- Fallback teks (PDF gagal dibuat) kini menuliskan kedua leg dan menyebut 2 boarding pass.
- WhatsApp pembatalan: untuk round-trip menyebut "dibatalkan seluruhnya (kedua perjalanan)" beserta leg berangkat dan pulang.
- One-way tidak berubah (caption dan teks identik, satu dokumen). Kedua pesan ini session message biasa (bukan template WATI), jadi tidak butuh persetujuan template.
- Tes: 12 unit test baru (urutan dan isi dua dokumen, kegagalan parsial, one-way tidak berubah, fallback teks, teks pembatalan). Total 851 unit test lolos.

**Acceptance Criteria:**
- [x] Round-trip: WhatsApp mengirim 2 boarding pass (berangkat dan pulang), tiap pass menyebut legnya
- [x] Round-trip: email tetap 1 email dengan 2 PDF dan detail kedua leg
- [x] WhatsApp pembatalan menyebut kedua leg
- [x] One-way tidak berubah
- [x] Unit test
- [x] Verifikasi live di staging (mode mock: teks dicek di runtime log Vercel, 2026-10-09)

**Catatan:** session message WhatsApp hanya sampai bila customer menghubungi bisnis dalam 24 jam terakhir (batasan WATI yang sudah ada, tidak diubah di sini); pengiriman nyata belum diuji karena staging tanpa kunci WATI.

---

## Verifikasi live (2026-10-09)

### Putaran 1: lokal terhadap DB staging
`next dev` (port 3100) terhadap DB Supabase staging (project `asymnwikxyhipoezoggp`, dipakai `.env.staging`; production memakai `viluiajknccclsogyogv`), akun QA yang sudah ada, email/WhatsApp/pembayaran mock. Tabel `TicketCheckin` di-apply ke DB staging lewat `prisma db push` (additive, tanpa `--accept-data-loss`). **38/38 cek lolos.**

### Putaran 2: gilijet.vercel.app (Vercel staging, commit `3d2fcac`, redeploy setelah `QR_HMAC_SECRET` staging dibuat)
Akses lewat share link sementara Vercel (situs di balik Deployment Protection). Booking dibuat lewat jalur aplikasi di DB staging; **tiket diterbitkan lewat UI admin di gilijet**, QR diambil dari endpoint manifest operator di gilijet (ditandatangani secret staging). **39/39 cek lolos**, runtime log Vercel untuk deployment itu: nol error/fatal.
- **#1** URL repro dari tiket tidak lagi error; route QA menampilkan Outbound + Return dengan jam dan harga.
- **`QR_HMAC_SECRET` staging** bekerja: konfirmasi admin menerbitkan tiket dan mengirim boarding pass (email mock melampirkan PDF outbound + return untuk round-trip).
- **#3** Manifest JSON/CSV/print, halaman leg operator, Admin Departure detail di kedua leg memuat penumpang round-trip dengan badge.
- **#2** Check-in outbound lalu return untuk penumpang yang sama; scan ulang ditolak per leg; QR silang ditolak (`INVALID_QR`); status per leg di manifest benar; one-way tidak berubah.
- **#4** Cancel via leg return dan via leg outbound dari UI admin: booking dibatalkan, tiket `REFUNDED`, 1 refund 100%; round-trip dengan leg lain `SAILED` tidak dibatalkan dan memunculkan peringatan. Runtime log: email pembatalan + WhatsApp (mock) tercatat untuk booking yang dibatalkan dan tidak untuk yang dilewati.

### Temuan dari log putaran 2
WhatsApp round-trip hanya mengirim 1 boarding pass dan WhatsApp pembatalan tidak menyebut kedua leg: dicatat dan diperbaiki sebagai bug #5.

### Putaran 3: verifikasi bug #5 di gilijet.vercel.app (commit `c2b5005`, deployment `dpl_9iEC…`)
Booking `VERIFY3` dikonfirmasi lewat UI admin gilijet, satu round-trip dibatalkan lewat leg return; isi pesan dibaca dari runtime log Vercel (mode mock), nol error/fatal.
- **Round-trip, 2 penumpang (P-RT):** WhatsApp mengirim 2 dokumen berurutan: "boarding pass berangkat Anda terlampir (1 dari 2)" (Sanur → Nusa Penida, 15 Nov 08:00) lalu "boarding pass pulang Anda terlampir (2 dari 2)" (Nusa Penida → Sanur, 17 Nov 16:00), keduanya menyebut "Pemesanan pulang-pergi: 2 boarding pass (berangkat dan pulang), masing-masing dengan QR code sendiri". Email: 1 email, 2 tiket, 2 PDF (outbound + return).
- **One-way (P-OW):** 1 WhatsApp dan 1 PDF, caption lama tanpa penanda leg (tidak berubah).
- **Pembatalan round-trip (P-CX):** WhatsApp memuat "Pemesanan pulang-pergi dibatalkan seluruhnya (kedua perjalanan)" beserta leg berangkat dan pulang, plus email pembatalan; booking `CANCELLED_BY_OPERATOR`, 1 refund 500000/500000.

### Putaran 4: perbaikan follow-up, v1.1.1 (2026-10-14, lokal terhadap DB staging)

Dev server lokal, DB staging; kunci WATI, Resend, DOKU dan PayPal dikosongkan di proses (env lokal berisi kunci production), tidak ada pembayaran maupun pesan nyata. Yang dikerjakan: alasan pembatalan di email/WhatsApp, penolakan reschedule ke hari OFF di server, dan satu bug yang ditemukan saat menulis E2E-nya. Yang operator dan hapus-kapal ditunda.

| Pemeriksaan | Hasil |
|---|---|
| `pnpm typecheck` (app + e2e), `pnpm lint` | Bersih, 0 error (1 warning lama di `postcss.config.mjs`) |
| `pnpm vitest run`, shell bersih | 881/881, 52 file |
| Unit baru: `messaging/email.test.ts` (alasan tampil, tidak tampil tanpa alasan, HTML di-escape dan dipotong 200 karakter), `whatsapp.test.ts` (3 kasus alasan), `booking/notifications.test.ts` (alasan diteruskan ke email dan WhatsApp) | Lolos |
| E2E baru `reschedule-season.spec.ts` (3): pemilih tanggal menampilkan hari buka dan menyembunyikan hari OFF; request ke leg OFF yang dipaksa lewat form yang diubah ditolak server ("Selected departure is unavailable", 0 `RescheduleRequest`); request ke leg buka tetap berhasil | 3/3 |
| Suite E2E penuh, 2 worker | 21 lolos, 4 di-skip lama, 0 gagal |
| Suite E2E penuh, 5 worker | 1 gagal: `admin-seasons` timeout 60 dtk menunggu field email di `/admin/login`. Lolos saat spec dijalankan sendiri dan di run 2 worker. Dugaan beban dev server saat banyak worker; penyebab pasti tidak dibuktikan |
| Fixture E2E di staging setelah run | 0 sisa; season asli tetap 8 baris |

**Bug baru yang ditemukan: permintaan reschedule customer selalu gagal.** Form tidak punya field `customerNote`, jadi `formData.get('customerNote')` bernilai `null`, dan schema Zod menolak `null` ("Invalid input"). Berlaku sebelum perubahan ini; diperbaiki dengan `?? undefined`. Test ke-3 di atas membuktikan request yang valid sekarang tersimpan (`PENDING`).

Tidak diuji: pengiriman email/WhatsApp nyata (hanya pembuatan isi pesan lewat unit test), pembayaran, dan tampilan visual.

### Belum tercakup
- Notifikasi diuji mode mock (staging tidak punya kunci Resend/WATI): tidak ada pesan nyata terkirim.
- Aksi cancel di halaman operator tidak dijalankan (hanya cancel lewat admin); lihat follow-up 7.
- Tampilan visual tidak diperiksa manual (hanya teks/DOM).

### Data uji tertinggal di DB staging
- Putaran 1: 5 booking `VERIFY` (BK-2026-10-AJBU5Q, -VRJ9E9, -BZK3AJ, -PT4Z6H, -RCZMDP); leg uji QA Boats 14-16, 20-22, 26-28 Okt (3 dibatalkan, 1 `SAILED`).
- Putaran 3: 3 booking `VERIFY3` (BK-2026-10-J5CZLJ, -PPEBUU, -6BF99S); leg uji QA Boats 15-17 dan 21-23 Nov (2 leg dibatalkan); 1 Refund `PENDING`; leg QA Boats diperpanjang sampai +75 hari.
- Putaran 2: 5 booking `VERIFY2` (BK-2026-10-GLTZYP, -GJ5WC4, -3LKCU7, -RHCG2E, -FQRW3V); leg uji QA Boats 4-6, 10-12, 16-18 Nov (3 dibatalkan, 1 `SAILED`).
- Total 4 Refund `PENDING`, dan 132 leg QA Boats baru (10 Okt sampai 22 Nov) hasil `generateLegsForSchedule`.

---

## Follow-up (belum jadi tiket)

1. ⏸ **`collectBoatSubtree` di `src/features/operators/purge.ts`** mencari booking hanya lewat `legId`, jadi buta terhadap booking round-trip. **Ditunda.** Dicek ulang 2026-10-14: fungsi ini tidak dipanggil di mana pun (yang dipakai `collectOperatorSubtree`, yang aman) dan semua FK `Booking` → `Leg` adalah `onDelete: Restrict`, jadi database menolak penghapusan yang masih terhubung. Tidak ada dampak sekarang; perbaiki (cocokkan juga `outboundLegId`/`returnLegId`) sebelum fungsi ini dipakai.
2. ✅ **Manual check-in** di `app/operator/legs/[id]/page.tsx`: sudah diaktifkan lagi untuk round-trip lewat helper per-leg yang sama dengan bug #2.
3. ⏸ **Jalur cuaca** di halaman leg operator: blok khusus `WEATHER` mencari booking `CONFIRMED` setelah `cancelLeg` sudah membatalkan semuanya, jadi tidak menemukan apa pun. **Ditunda (operator).** Uang tidak terpengaruh (refund dibuat oleh `cancelLeg`); yang mungkin hilang hanya pencatatan alasan cuaca di refund dan audit log.
4. ⚠️ **E2E round-trip** (`round-trip-booking.spec.ts`) di-skip, jadi regresi alur search → booking tidak tertangkap otomatis.
5. ⚠️ **`QR_HMAC_SECRET`:** sudah dibuat di staging Vercel (dipakai pada verifikasi putaran 2). Di env lokal (`.env`/`.env.local`/`.env.staging`) nilainya kurang dari 32 karakter, sehingga `/b/<reference>` untuk booking ber-tiket error saat development (ditemukan 2026-10-14 saat QC versioning). Test masih me-mock `qr`.
6. ⚠️ **`CRON_SECRET`:** dicek 2026-10-14 (hanya nama variabel) di project Vercel `gilifast`: **tidak ada sama sekali**, baik production, preview, maupun environment custom. Route `/api/cron/*` menolak 401 tanpa kunci ini (sejak 2026-05-20), jadi `topup-legs`, `refresh-fx`, dan `retry-webhooks` kemungkinan tidak pernah berjalan, termasuk di production. Perlu ditambahkan oleh owner (production, string acak ≥ 32 karakter) lalu redeploy. Catatan terkait: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` dan `WATI_*` juga tidak terlihat di project itu; perlu dikonfirmasi apakah notifikasi production memakai mock. Project `gilifast-staging` tidak terlihat di akun yang terhubung; staging tampaknya environment custom di project `gilifast` (README menyebut dua project).
7. ⏸ **Aksi cancel di `src/app/operator/legs/[id]/page.tsx`** memanggil `redirect()` di dalam `try` yang `catch`-nya ikut menangkap `NEXT_REDIRECT`, sehingga cancel yang sukses redirect ke `?error=NEXT_REDIRECT` (dikonfirmasi dari kode 2026-10-14; belum dicoba di runtime). **Ditunda (operator).** Bertentangan dengan konvensi `CLAUDE.md` (re-throw `NEXT_REDIRECT`).
