# Bug: konfirmasi pembayaran DOKU, status tetap "awaiting confirmation"

**Status (2026-10-16):** Rencana A diimplementasi (v1.3.1): kode, unit test (963 lulus), e2e `admin-webhooks.spec.ts` (4 lulus, staging), lint, typecheck. **Belum:** verifikasi production (off-limits tanpa izin), commit + tag `v1.3.1` (menunggu go-ahead, rule 5), rilis ke `main`. Pertanyaan terbuka di bawah belum dijawab; Rencana A dijalankan atas instruksi "lanjut implementasi".

**Terkait:** `docs/spikes/BUG_PAYMENT_STATUS_WEBHOOK.md` (v1.3.0, sudah di `staging`, belum di `main`).

## Laporan

Tiket "Konfirmasi Pembayaran":

1. Sistem menangkap status callback/webhook dari payment gateway (sukses/gagal).
2. Setelah status "sukses" diterima, sistem mengubah status booking dari pending → paid. **Saat ini masih "awaiting confirmation"** (pelapor sudah mencoba pembayaran sungguhan). Dugaan pelapor: tidak nyambung dengan webhook payment gateway.
3. Halaman/pop-up "Pembayaran Berhasil" tampil otomatis setelah status ter-update, tanpa refresh manual. **Sudah DONE** menurut pelapor.

Yang perlu diperbaiki hanya poin 2 (dan poin 1 sejauh poin 2 bergantung padanya).

## Temuan awal (dari kode, belum diverifikasi di production)

1. **Pembayaran sungguhan hanya bisa terjadi di production.** Staging menjalankan DOKU dalam mode mock (`README.md` "DOKU has no sandbox account"; `docs/spikes/DOKU_ONE_RUPIAH_STAGING.md` "Blocker"). Jadi tes "real" pelapor hampir pasti di gilibali.com, yang menjalankan `main`.
2. **Di mode live, satu-satunya jalan DOKU dari `PENDING_PAYMENT` ke `AWAITING_CONFIRMATION` adalah webhook yang tervalidasi.** `recordPaymentAwaitingConfirmation` dipanggil dari: webhook DOKU/PayPal (`webhook-processor.ts`), capture PayPal di return URL (`psp.ts`), penyelamatan PayPal saat expiry (`expiry.ts`), dan dummy checkout (hanya saat mock, `checkout/[reference]/page.tsx`). Tidak ada polling status ke DOKU. Artinya: **kalau booking DOKU berstatus `AWAITING_CONFIRMATION`, webhook-nya sudah masuk dan diproses.** Kalau webhook gagal, booking akan tetap `PENDING_PAYMENT` lalu `EXPIRED`.
3. **"Awaiting confirmation" adalah status yang memang dituju setelah bayar, bukan tanda gagal.** Aturan payment → ticket gate (`CLAUDE.md`, `src/features/tickets/ticket-issuer.ts`): uang masuk hanya memindahkan booking ke `AWAITING_CONFIRMATION`; tiket terbit setelah admin menelepon operator di `/admin/confirmations`. Tidak ada status `PAID` di enum `BookingStatus`. Flow ini sudah dikonfirmasi tetap dipakai (sesi 2026-10-16, tiket sebelumnya).
4. **Yang dilihat pelapor kemungkinan besar label enum mentah.**
   - Halaman customer `/b/[reference]` menampilkan badge `booking.status.replace(/_/g, ' ')` → **"AWAITING CONFIRMATION"** (`src/app/(customer)/[locale]/b/[reference]/page.tsx:293-294`), padahal kartu di bawahnya sudah bilang "Payment received — we're confirming your seat". Badge ini belum disentuh v1.3.0.
   - Admin `/admin/bookings`: v1.3.0 sudah mengganti label menjadi "Paid · awaiting confirmation", tapi baru di `staging`. Production (`main`, commit `88d0781`) masih jauh di belakang `staging` (belum ada v1.1.1 s.d. v1.3.0), jadi admin production masih melihat "AWAITING CONFIRMATION".
5. **Production juga belum punya perbaikan webhook v1.3.0**: log `/admin/webhooks`, retry cron untuk DOKU/PayPal, pencatatan callback yang ditolak, 413/503. Kalau ada webhook yang benar-benar gagal di production, saat ini tidak ada yang mencoba ulang dan tidak ada tempat melihatnya.

**Kesimpulan sementara:** webhook DOKU kemungkinan besar sudah jalan; masalahnya label "awaiting confirmation" yang terbaca seperti "belum dibayar", ditambah ekspektasi status "paid" yang tidak ada di desain. Ini perlu dibuktikan dengan data production (lihat Verifikasi), bukan diasumsikan.

## Verifikasi yang dibutuhkan (production, perlu izin eksplisit)

Semua di bawah ini menyentuh production, jadi off-limits sampai user mengizinkan (`CLAUDE.md` rule 1). Semuanya **read-only**.

1. Minta ke pelapor: booking reference tes pembayarannya, waktu bayar, metode (QRIS/VA/kartu), dan screenshot halaman tempat dia melihat "awaiting confirmation" (customer `/b/...` atau admin).
2. Cek row booking + `Payment` di DB production: `Payment.status` harus `SUCCESSFUL`, `paidAt` dan `gatewayReference` terisi. Kalau iya → webhook sukses, temuan 2 terbukti.
3. Cek Vercel runtime logs production untuk `POST /api/webhooks/doku` di sekitar waktu bayar: status 200 vs 401 (signature/URL notifikasi salah), 409 (amount mismatch), 5xx.
4. Cek tabel `WebhookEvent` production untuk reference itu (tabel sudah ada; hanya UI-nya yang belum di production).

Kalau hasilnya ternyata booking masih `PENDING_PAYMENT`/`EXPIRED` padahal DOKU bilang sukses, ini bug webhook sungguhan dan rencana berubah ke "Rencana B".

## Rencana A — webhook terbukti jalan (dugaan utama)

1. **Badge customer** `/b/[reference]`: ganti enum mentah dengan label yang jelas, misalnya `AWAITING_CONFIRMATION` → "Paid · confirming your seat" / "Pembayaran diterima" (ikut i18n locale yang ada), `PENDING_PAYMENT` → "Awaiting payment", dst. Buat `customerBookingStatusLabel` di `src/features/booking/status-label.ts` di samping `adminBookingStatusLabel`, satu sumber label.
2. **Cari tempat lain yang menampilkan enum mentah** ke customer: email/WhatsApp (`src/features/booking/notifications.ts`), halaman akun customer (`/account`), PDF/CSV. `git grep "status.replace"` dan `git grep "AWAITING_CONFIRMATION"` di `src/app/(customer)` dan `src/features/messaging`.
3. **Rilis ke production**: PR `staging` → `main` supaya v1.3.0 (label admin, log webhook, retry DOKU/PayPal) + perbaikan ini sampai ke gilibali.com. Perhatian: production tertinggal banyak versi, termasuk migration Prisma; build production menjalankan `prisma migrate deploy` (rule 9, `docs/RELEASING.md`).
4. **Jelaskan ke pelapor**: "Paid" itu otomatis dari webhook (status `AWAITING_CONFIRMATION` = sudah dibayar); "Confirmed" + tiket tetap manual lewat admin. Kalau bisnis ingin tiket terbit langsung tanpa telepon operator, itu perubahan flow (lihat Rencana C), bukan bug.

Versi: perbaikan label → PATCH (v1.3.1).

## Rencana B — webhook memang gagal di production

Tergantung hasil log:
- **401**: URL notifikasi di DOKU Back Office tidak persis `{APP_BASE_URL}/api/webhooks/doku`, atau `DOKU_SECRET_KEY`/client id production salah. Perbaikan di konfigurasi DOKU/Vercel, bukan kode. Setelah v1.3.0 di production, callback ini tercatat di tab "Rejected callbacks".
- **409 amount mismatch**: cek pembulatan `totalAmount` vs `order.amount` DOKU (mis. service fee/promo).
- **Tidak ada request sama sekali**: notification URL belum di-set di DOKU Back Office.
- **5xx**: baca error, perbaiki di `webhook-processor.ts`; retry cron v1.3.0 akan memproses ulang.

Pemulihan booking yang terlanjur tidak ter-update: Retry di `/admin/webhooks` (setelah v1.3.0 live) — perlu izin karena menulis ke DB production.

## Rencana C — bisnis ingin status "paid" terpisah atau tiket otomatis (bukan bug)

Hanya kalau pelapor/owner memang meminta perubahan flow:
- C1: status baru `PAID` di enum → migration + ubah semua tempat yang membaca `AWAITING_CONFIRMATION`. Kami tidak merekomendasikan: secara makna sama dengan `AWAITING_CONFIRMATION`, cukup labelnya.
- C2: tiket langsung terbit setelah bayar (lewati telepon operator) → melanggar payment → ticket gate di `CLAUDE.md`; butuh keputusan owner dan update `CLAUDE.md`.

## Pertanyaan terbuka

1. Di mana pelapor melihat "awaiting confirmation": halaman customer `/b/...`, admin bookings, atau email/WhatsApp?
2. Booking reference tes pembayaran sungguhan itu apa, dan boleh dicek read-only di production (DB + Vercel logs)?
3. Yang diharapkan "paid" itu cukup label (Rencana A), atau memang status/flow berbeda (Rencana C)?
4. Poin 3 tiket ("pop-up Pembayaran Berhasil, DONE"): di mana itu diimplementasikan? Di repo ini tidak ditemukan polling status di halaman customer (`/b/[reference]` adalah server component tanpa auto-refresh). Kalau dibuat di branch/repo lain, perlu tahu supaya tidak bentrok.

## Checklist (setelah pertanyaan terjawab)

- [ ] Verifikasi production read-only (dengan izin) — belum, jadi dugaan "webhook sudah jalan" belum terbukti
- [x] Pilih Rencana A
- [x] `customerBookingStatusLabel` di `status-label.ts`; dipakai di `/b/[reference]` dan `/account` (langkah 1)
- [x] Unit test `tests/unit/features/booking/status-label.test.ts`
- [x] E2E: test baru di `tests/e2e/admin-webhooks.spec.ts` (booking `AWAITING_CONFIRMATION` fixture tahun 2090, cek badge `/b/[ref]`; fixture dibersihkan)
- [x] Docs + `CHANGELOG.md` 1.3.1 + `package.json` (rule 7, 8)
- [ ] Commit/tag/push `staging` dengan konfirmasi (rule 5); PR ke `main` dengan dua peringatan (rule 9)

## QC

- `pnpm lint` 0 error (1 warning lama di `postcss.config.mjs`); `pnpm typecheck` bersih; `pnpm vitest run` 963 lulus (62 file).
- `pnpm exec playwright test tests/e2e/admin-webhooks.spec.ts`: 4 lulus terhadap DB staging (`asymnwikxyhipoezoggp`), termasuk test baru yang memuat `/b/BK-2090-06-WHKPD1` dan melihat "Paid · confirming your seat", tanpa "AWAITING CONFIRMATION". Fixture dihapus oleh `afterAll`.

**Tidak diverifikasi:** klik manual di browser (hanya Playwright), halaman `/account` secara visual (hanya typecheck; labelnya dites di unit test), bahasa selain Inggris (halaman tidak memakai i18n untuk badge status), email/WhatsApp (tidak ditemukan yang menampilkan enum mentah), halaman operator `/operator/penjualan` (masih enum mentah; operator tidak memakai app), production (off-limits) sehingga dugaan bahwa webhook DOKU sudah jalan belum terbukti. Server log e2e menampilkan peringatan lama "Decimal objects are not supported" dari halaman admin; bukan dari perubahan ini.
