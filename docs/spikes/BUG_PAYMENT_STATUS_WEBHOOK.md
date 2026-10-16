# Bug: status booking tidak ter-update setelah pembayaran berhasil

**Status (2026-10-16):** selesai dan sudah di `staging` sebagai commit `7eb88f6`, tag `v1.3.0`. Belum di `main`/production. Migration index/unique `WebhookEvent` tidak diambil (keputusan user belum ada, rule 4). Lanjutan untuk badge customer: `BUG_DOKU_PAYMENT_CONFIRMATION.md` (v1.3.1).
**Created:** 2026-10-16
**Target versi:** 1.3.0 (MINOR: halaman log webhook baru + perbaikan)
**Tiket:** "[Bug] Status booking tidak ter-update setelah pembayaran berhasil di payment gateway". Contoh kasus `BK-2026-09-P6EXQV` (dilaporkan dari gilibali.com, yaitu production; tidak kita sentuh, `CLAUDE.md` rule 1).

## Laporan

Setelah pembayaran dikonfirmasi DOKU/PayPal, status booking di admin Bookings tidak ter-update otomatis dan tetap "Waiting Confirmation".

**Steps to reproduce**

1. Buka gilibali.com, booking sampai pembayaran selesai.
2. Pastikan pembayaran tercatat sukses di sisi payment gateway.
3. Login admin → Bookings.
4. Cek status booking yang baru dibayar.

**Expected:** status otomatis menjadi Paid/Confirmed setelah pembayaran sukses.
**Actual:** tetap "Waiting Confirmation" walau gateway sudah sukses.
**Dugaan pelapor:** webhook/callback tidak ter-trigger, atau endpoint callback gagal mengupdate DB.

**Acceptance criteria (dari tiket)**

- AC1: status booking ter-update otomatis menjadi Paid/Confirmed setelah gateway mengirim callback sukses.
- AC2: tidak perlu refresh manual oleh admin.
- AC3: log webhook tersedia untuk monitoring kalau callback gagal.

### Pemetaan AC ke rencana

| AC | Dipenuhi oleh | Catatan |
|----|---------------|---------|
| AC1 | Webhook sukses → `AWAITING_CONFIRMATION`, tampil sebagai "Paid · awaiting confirmation" (rencana 5). Callback yang gagal dipulihkan oleh retry cron yang diperbaiki (rencana 1–2). | "Confirmed" tetap menunggu admin di `/admin/confirmations` (Keputusan). Perlu disampaikan ke pelapor: "Paid" otomatis, "Confirmed" tidak. |
| AC2 | Halaman Bookings dinamis per request, plus `auto-refresh.tsx` (`router.refresh()` tiap 30 detik, dilewati saat tab tersembunyi). | Diimplementasikan 2026-10-16 dengan tafsiran "tanpa reload"; user belum mengonfirmasi tafsiran ini. |
| AC3 | Callback ditolak dicatat (rencana 3) + halaman `/admin/webhooks` dengan Retry (rencana 4) + hitungan `FAILED` 24 jam di diagnostics. | |

## Temuan

1. **"Waiting Confirmation" adalah perilaku yang disengaja.** `recordPaymentAwaitingConfirmation` (`src/features/tickets/ticket-issuer.ts`) memindahkan booking `PENDING_PAYMENT` → `AWAITING_CONFIRMATION` saat uang masuk. `CONFIRMED` dan tiket baru terbit setelah admin menelepon operator di `/admin/confirmations` (aturan "Payment → ticket gate" di `CLAUDE.md`). Admin menampilkan `status.replace(/_/g, ' ')` (`src/app/admin/(authed)/bookings/booking-row.tsx`), sehingga "sudah dibayar" tidak dibedakan dari "belum ada kabar". Booking yang webhook-nya benar-benar gagal tetap `PENDING_PAYMENT`.
2. **Retry cron tidak memulihkan pembayaran DOKU.** `src/app/api/cron/retry-webhooks/route.ts` memanggil `dispatchWebhookPayload`, yang hanya mengenali bentuk Xendit (`status=PAID`, `external_id`). Payload DOKU (`order.invoice_number`, `transaction.status`) jatuh ke `ignored`, lalu event ditandai `PROCESSED` tanpa memproses apa pun. Cron hanya memilih `provider: 'doku'`, jadi event PayPal tidak pernah di-retry. Cron baru bisa jalan sejak `CRON_SECRET` dipasang (2026-10-14).
3. **Callback yang ditolak tidak tercatat.** Signature salah (401), JSON invalid (400), booking tidak ditemukan (200 "ignored") dan amount mismatch (409) hanya menulis `console.error` atau tidak menulis apa-apa.
4. **Tidak ada UI untuk `WebhookEvent`.** Hanya route dan cron yang menyentuh tabelnya, jadi acceptance criteria "log webhook tersedia" belum terpenuhi.

## Keputusan

- Gate konfirmasi operator **dipertahankan** (diputuskan user 2026-10-16). Tidak ada auto-confirm.
- Tidak ada perubahan schema: `WebhookEventStatus` sudah punya `SKIPPED`, `errorMessage` dan `attempts`.

## Rencana

1. `src/features/payments/webhook-processor.ts`: ekstrak `processDokuPaymentSuccess` (dari route DOKU) dan `processPaypalEvent` (dari `handleEvent` di route PayPal). Ganti `dispatchWebhookPayload` dengan `dispatchWebhookEvent(event)` yang memilih berdasarkan `provider` + `eventType`. Memakai ulang `recordPaymentAwaitingConfirmation`, `notifyPaymentReceived`, `normalizePaymentMethod`.
2. `retry-webhooks`: ambil provider `doku` dan `paypal`; payload tak dikenal menjadi `FAILED` dengan pesan jelas, bukan `PROCESSED`.
3. Route DOKU dan PayPal mencatat callback yang ditolak ke `WebhookEvent` (signature, JSON, booking tak ditemukan = `SKIPPED`, amount mismatch). Payload dipotong ±4 KB karena endpoint publik; pencatatan di try/catch agar respons ke gateway tidak berubah.
4. Halaman `/admin/webhooks` (`requireAdmin()`): daftar event, filter provider/status/booking reference, waktu WITA, tombol Retry untuk `FAILED` (menulis `AuditLog`). Tautan di nav admin, hitungan `FAILED` 24 jam di `/admin/diagnostics`, entri di `feature-catalog.ts`.
5. Label status di admin Bookings lewat satu helper: `AWAITING_CONFIRMATION` = "Paid · awaiting confirmation", `PENDING_PAYMENT` = "Unpaid". Halaman tidak di-cache (sudah dinamis karena `searchParams`; tidak perlu `force-dynamic`).
6. Rilis: bump `package.json` ke 1.3.0, section dated + compare links di `CHANGELOG.md`; update `STRUCTURE.md`, README dan doc lain yang `git grep` temukan.

## Checklist

- [x] 1 processor + dispatcher (`webhook-processor.ts`, `webhook-events.ts`)
- [x] 2 retry cron
- [x] 3 pencatatan callback ditolak (rate limit 50 per 10 menit per provider, body dipotong 4 KB)
- [x] 4 halaman `/admin/webhooks` + diagnostics + feature catalog
- [x] 5 label status (`src/features/booking/status-label.ts`)
- [x] 5b auto-refresh Bookings (AC2), `bookings-auto-refresh.test.ts`
- [x] Unit test: `webhook-processor`, `webhook-events`, `status-label`, `retry-webhooks`, `webhooks-guard`
- [x] E2E ditulis: `tests/e2e/admin-webhooks.spec.ts` (belum dijalankan)
- [x] `pnpm lint` (0 error, 1 warning lama di `postcss.config.mjs`), `pnpm typecheck`, `pnpm test:unit`
- [x] `pnpm test:e2e` terhadap DB staging (project `asymnwikxyhipoezoggp`, dikonfirmasi user 2026-10-16): 32 lulus, 2 skip (DOKU live, opt-in). Fixture tahun 2090 terhapus (dicek read-only).
- [x] `security-auditor` dan `db-query-auditor` (2026-10-16). Diperbaiki: batas body 256 KB (413) di kedua route, try/catch verifikasi PayPal (503). Sisanya di Pertanyaan terbuka
- [x] QC lewat `pnpm dev` (otomatis lewat Playwright, bukan manual; lihat QC)
- [x] Versi 1.3.0, CHANGELOG, doc yang tersentuh (README, STRUCTURE, RELEASING, CLAUDE.md, security-auditor.md, catatan di TESTING_PLAN)
- [ ] Commit/tag/push (hanya dengan go-ahead user; user minta tidak ada perintah git sampai disuruh)

## Pertanyaan terbuka

- **AC2, arti "tanpa refresh manual".** Auto-refresh 30 detik sudah ditambahkan (tafsiran "tanpa reload"). Kalau user cukup dengan reload, hapus `auto-refresh.tsx` dan pemakaiannya di `bookings/page.tsx`.
- **Temuan audit yang butuh migration (rule 4, menunggu konfirmasi):** `@@index([provider, eventType, createdAt])` pada `WebhookEvent` (rate limit callback ditolak scan satu provider penuh), `@@index([createdAt])` untuk daftar default `/admin/webhooks`, dan `@@unique([provider, eventType, externalRef])` untuk menutup race find-then-create di `beginWebhookEvent` (perlu mengecualikan baris `signature.rejected`, dan baris duplikat lama memblokir migration). Dampak race hari ini kecil: `recordPaymentAwaitingConfirmation` idempotent.
- **Audit, tidak diambil:** cek umur `Request-Timestamp` DOKU (jendela retry DOKU berjam-jam, perlu cek dulu), `timingSafeEqual` untuk `CRON_SECRET`, pesan amount mismatch yang generik ke gateway, audit Retry saat booking tidak ketemu.
- **Komunikasi ke pelapor:** label "Paid · awaiting confirmation" menggantikan "Waiting Confirmation"; "Confirmed" tetap manual lewat `/admin/confirmations`.

## Eksekusi berikutnya (ditunda, 2026-10-16)

User minta eksekusi nanti. Urutan saat dilanjutkan:

1. Putuskan pertanyaan AC2 di atas; kalau perlu auto-refresh, tambahkan + unit/e2e test-nya.
2. `security-auditor` (diff menyentuh `src/app/api/webhooks/**`, `src/app/api/cron/**`) dan `db-query-auditor`.
3. `pnpm test:e2e` setelah user konfirmasi target DB (rule 4).
4. QC `pnpm dev`: kirim callback DOKU mock (sukses, signature salah, amount mismatch), cek label di `/admin/bookings`, log + Retry di `/admin/webhooks`, hitungan di `/admin/diagnostics`. Catat hasilnya di bagian QC.
5. `pnpm lint` + `pnpm typecheck` ulang, `git grep` doc (rule 7), lalu minta go-ahead commit + tag `v1.3.0` (rule 5).

## QC

- Unit: 961 tes lulus di 62 file (2026-10-16), termasuk tes baru di atas (lint 0 error, typecheck bersih). Semua dengan mock, tanpa DB.
- E2E (2026-10-16, dev server lokal + DB staging): suite penuh 32 lulus, 2 skip. `admin-webhooks.spec.ts` (3 tes) mencakup label "Paid · awaiting confirmation" di Bookings, log webhook (daftar, tab Rejected callbacks, filter, Retry yang menulis ulang status event dan attempts), dan auto-refresh (status booking diubah di DB, jam dimajukan 31 detik, baris berubah tanpa reload). Spec sempat salah mengharapkan baris "ditolak" di tab default; yang diperbaiki spec-nya, bukan halamannya.
- Tidak diverifikasi: callback DOKU/PayPal sungguhan atau bertanda tangan (staging mock mode, endpoint 401), jadi pemrosesan webhook hanya dicakup unit test; tidak ada klik manual di browser di luar Playwright; tombol Retry hanya diuji pada event `payment.success` yang disimulasikan; auto-refresh tidak diuji pada tab yang tersembunyi.
- Peringatan `Decimal objects are not supported` di log dev server berasal dari `BookingRow` (client component) yang menerima objek Prisma mentah; bukan dari perubahan ini dan tidak diubah.

## Catatan implementasi

- Event DOKU sekarang dibuat sebelum amount/booking diperiksa, jadi amount mismatch dan booking tak ditemukan muncul di log (`FAILED` / `SKIPPED`). Redelivery event `FAILED` memakai ulang barisnya (attempts + 1), bukan baris baru.
- Fungsi bentuk Xendit di `webhook-processor.ts` (`processInvoicePaid`, `processInvoiceExpired`, `processRefund*`, `dispatchWebhookPayload`) dihapus: tidak ada yang memanggilnya kecuali retry cron yang salah itu.
- Event yang tersangkut `PROCESSING` lebih dari 5 menit (`STUCK_PROCESSING_MS`) dibuka ulang saat gateway mengirim ulang. Cron dan tombol Retry mengklaim event lewat `updateMany` bersyarat status, jadi tidak diproses dua kali. `PAYMENT.CAPTURE.DENIED` tidak membalik payment yang sudah `SUCCESSFUL`.

## Tidak bisa diverifikasi

- Callback DOKU/PayPal live: staging berjalan di mock mode dan `/api/webhooks/doku` menjawab 401 di sana (README "Environments"). Jalur ini hanya dicakup unit test.
- `BK-2026-09-P6EXQV`: ada di production, tidak boleh dibaca. Dari kode tidak bisa dibedakan antara "webhook tidak datang" dan "gate normal". Cek status Payment-nya di production, atau lewat `/admin/webhooks` setelah rilis.
