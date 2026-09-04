# Meta WhatsApp Cloud API — setup

Gilifast WhatsApp sends flow through `lib/whatsapp.ts`, which supports two
transports: **WATI** and **Meta WhatsApp Cloud API**. With neither configured,
every message lands in the local sandbox inbox at
`/admin/diagnostics/whatsapp-inbox` so the whole booking flow stays exercisable
locally. Dropping in the Meta credentials below switches the same code paths
live — no code changes.

## 1. Create the WhatsApp app

1. Go to <https://developers.facebook.com/apps> → **Create App** → type
   **Business**.
2. In the app, **Add Product** → **WhatsApp**.
3. Note the test phone number Meta shows under **API Setup → Send and receive
   messages** (the sandbox number ending in your own country code). Use it as
   the recipient while developing.

## 2. Get the token and phone number ID

1. Open **WhatsApp → API Setup** in the app dashboard.
2. Copy the **Temporary access token** (or create a permanent one in
   **Business Settings → System users**: give the user the app, grant the
   `whatsapp_business_messaging` permission, generate a never-expiring token).
3. Copy the **Phone number ID** and the **WhatsApp Business Account ID**.
4. Add each real recipient number (admin, operator, your own phone) to
   **API Setup → Recipient phone numbers** and verify it — otherwise sends to
   that number are rejected.

## 3. Configure the app

Set in `.env` (see `.env.example`):

```
META_WHATSAPP_TOKEN="<system-user token>"
META_WHATSAPP_PHONE_NUMBER_ID="<phone number id>"
META_WHATSAPP_TEMPLATE_LANGUAGE="id"
```

`whatsappProvider()` prefers Meta whenever these two are set. Verify at
`/admin/diagnostics` — it reports the live provider.

## 4. Create and submit the templates

WhatsApp only lets a business open a conversation with a **pre-approved
template**. Create each template under
**WhatsApp → Message templates** in the app dashboard, category **Utility**,
language **Bahasa Indonesia (id)**. The name must match the constant in
`lib/whatsapp-templates.ts` exactly; body parameters are positional, in the
order below.

### Operator — new paid booking

Name: `gilifast_operator_booking_paid`

```
Halo, ada pemesanan baru yang sudah dibayar untuk kapal Anda.
Rute: {{1}}
Berangkat: {{2}}
Kapal: {{3}}
Penumpang: {{4}}
Pelanggan: {{5}}
Kode booking: {{6}}
Total: {{7}}
Tim Gilifast akan menghubungi Anda untuk konfirmasi ketersediaan.
```

### Operator — booking confirmed

Name: `gilifast_operator_booking_confirmed`

```
Halo, pemesanan sudah dikonfirmasi dan boarding pass sudah diterbitkan.
Rute: {{1}}
Berangkat: {{2}}
Kapal: {{3}}
Penumpang: {{4}}
Kode booking: {{5}}
Manifest Anda sudah diperbarui. Terima kasih — Gilifast
```

### Customer — departure reminder (day before)

Name: `gilifast_customer_departure_reminder`

```
Halo {{1}}, pengingat: kapal Anda berangkat besok.
Rute: {{2}}
Kapal: {{3}}
Berangkat: {{4}}
Kode booking: {{5}}
Tiket & QR code: {{6}}
Tiba di dermaga 30 menit sebelum berangkat. — Gilifast
```

### Admin — booking alert

This one's name is configurable: set `ADMIN_ALERT_TEMPLATE` (env) or the
template name at `/admin/console/alerts`. Create it with the name you choose:

```
*{{1}}*
Booking: {{2}}
Rute: {{3}}
Berangkat: {{4}}
Kapal: {{5}}
Pelanggan: {{6}}
Penumpang: {{7}}
Total: {{8}}
Tindakan: {{9}}
```

## 5. Which sends are session messages vs templates

- **Session messages** (plain text / document, within the 24 h window the
  customer opened): payment received, boarding pass, operator unavailable.
  These work immediately with no template.
- **Templates** (business-initiated, any time): admin alerts, operator alerts,
  departure reminders. These need the approval in step 4.

## 6. Verify

1. Book a trip in dev with the sandbox number as the customer phone.
2. Check `/admin/diagnostics/whatsapp-inbox` for the customer sends, operator
   alert (paid → confirmed) and admin alert.
3. With Meta keys set, the same messages go to real WhatsApp; failures are
   logged with `[whatsapp] Meta failed <status>` and never block the booking.
