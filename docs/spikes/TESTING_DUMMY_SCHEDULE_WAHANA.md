# Testing: Dummy Schedule Data for E2E Payment Testing

**Status:** Ready for Implementation  
**Created:** 2026-09-30  
**Owner:** QA / Testing Team  
**Priority:** High (blocking payment E2E tests)

---

## 📌 Overview

Buat data dummy jadwal kapal Wahana untuk keperluan end-to-end testing alur pembayaran real di gilifast.com — mulai dari search, booking, pembayaran, hingga e-tiket.

Data ini bersifat **temporary** untuk testing & harus dibersihkan setelah test selesai.

---

## 👤 Use Case

```
Sebagai QA tester,
Saya ingin punya jadwal kapal dengan harga test (Rp 1.000),
Agar bisa melakukan end-to-end testing pembayaran tanpa khawatir nominal besar
dan bisa di-search di frontend dengan mudah.
```

---

## 🎯 Spesifikasi Data Dummy

| Field | Value |
|-------|-------|
| **Operator** | PT Wahana Virendra Group |
| **Kapal** | Cantika 09 |
| **Rute** | Padang Bai → Gili Trawangan |
| **Tanggal** | 1 Desember 2027 |
| **Jam Keberangkatan** | 08:30 |
| **Harga** | Rp 1.000 per passenger |
| **Durasi** | 90 menit |
| **Tipe** | Public / Direct |

---

## ⚠️ Constraint & Catatan Penting

### Isolasi Harga
- Harga Rp 1.000 **HANYA BERLAKU untuk jadwal spesifik ini** (kapal ini, tanggal ini, jam ini)
- Tidak boleh mempengaruhi jadwal atau rute lain
- Tidak boleh overwrite data produksi

### Sifat Data
- **Bersifat temporary** untuk testing saja
- Setelah test selesai, harga perlu dikembalikan ke harga normal **atau jadwal ini dihapus**
- Jangan biarkan dummy data tetap di database selamanya

### Verifikasi
- Harus visible di frontend saat customer search rute Padang Bai → Gili Trawangan pada tanggal 1 Des 2027
- Booking flow harus bisa lanjut hingga pembayaran tanpa error

---

## 📊 Data Model Reference

### Tabel yang Dimodifikasi
- `Schedule` — record jadwal kapal baru
- `Legs` — auto-generate dari schedule (via `generateLegsForSchedule`)
- `Pricing` (atau pricing logic) — set harga Rp 1.000 untuk leg ini saja

### Relasi
```
Schedule (Wahana, Cantika 09, 2027-12-01 08:30)
  ↓
Legs (Padang Bai → Gili Trawangan, 1 Des 2027 08:30)
  ↓
Pricing (Rp 1.000 per passenger)
```

---

## ✅ Acceptance Criteria

- [ ] Jadwal 08:30 Padang Bai → Gili Trawangan tanggal 1 Des 2027 muncul di hasil search frontend
- [ ] Harga yang tampil adalah **Rp 1.000** untuk jadwal ini
- [ ] Jadwal lain pada rute & tanggal yang sama **tidak terpengaruh harganya**
- [ ] Proses booking bisa dilanjutkan hingga halaman **pembayaran**
- [ ] **Setelah test selesai:** tandai ticket Done dan koordinasi untuk menghapus/reset data dummy

---

## 🔄 Implementation Flow

### 1. Insert Schedule Data
```sql
INSERT INTO "Schedule" (
  operatorId,
  boatId,
  departurePortId,
  arrivalPortId,
  departureTime,
  arrivalTime,
  dayOfWeek,
  capacity,
  pricePerPassenger,
  createdAt,
  deletedAt
) VALUES (
  '<WAHANA_OPERATOR_ID>',
  '<CANTIKA_09_BOAT_ID>',
  '<PADANG_BAI_PORT_ID>',
  '<GILI_TRAWANGAN_PORT_ID>',
  '2027-12-01T08:30:00+08:00',  -- WITA timezone
  '2027-12-01T10:00:00+08:00',  -- +90 min
  1,  -- or relevant day mapping
  50,  -- capacity
  1000,  -- Rp 1.000
  NOW(),
  NULL
);
```

### 2. Verify Legs Generation
```sql
-- Via lib/legs.ts generateLegsForSchedule()
-- Should auto-generate leg for 2027-12-01
SELECT * FROM "Leg" 
WHERE scheduleId = '<SCHEDULE_ID>' 
AND departureTime = '2027-12-01T08:30:00+08:00';
```

### 3. Frontend Search Verification
- Open gilifast.com
- Search: Padang Bai → Gili Trawangan
- Date: 1 Des 2027
- Verify jadwal 08:30 muncul dengan harga Rp 1.000
- Verify jadwal lain tidak terpengaruh

### 4. E2E Booking Test
- Search & select jadwal dummy
- Enter passenger data
- Proceed to checkout
- Verify total price = Rp 1.000 × passengers
- Proceed to payment
- ✅ Test complete

### 5. Cleanup (Post-Test)
Option A: Soft-delete schedule
```sql
UPDATE "Schedule" 
SET deletedAt = NOW() 
WHERE id = '<SCHEDULE_ID>';
```

Option B: Hard-delete (if no bookings linked)
```sql
DELETE FROM "Schedule" 
WHERE id = '<SCHEDULE_ID>' 
AND NOT EXISTS (
  SELECT 1 FROM "Booking" 
  WHERE legId IN (
    SELECT id FROM "Leg" WHERE scheduleId = '<SCHEDULE_ID>'
  )
);
```

---

## 📋 Files & Systems to Touch

### Database
- Direct Supabase insert atau via seed script
- Prefer: Add to `scripts/seed-qa.ts` untuk reproducibility (run `pnpm seed:qa`)

### Frontend (No Changes Needed)
- Search, booking, payment flows already generic
- Should auto-render once data in DB

### Verification
- Manual browser test (see Frontend Verification step above)
- Or: Add E2E test if automated payment testing planned

---

## 🚀 Execution Checklist

1. **Identify IDs**
   - [ ] Get `operatorId` for PT Wahana Virendra Group
   - [ ] Get `boatId` for Cantika 09
   - [ ] Get `departurePortId` for Padang Bai
   - [ ] Get `arrivalPortId` for Gili Trawangan

2. **Insert Data**
   - [ ] Insert Schedule record with Rp 1.000 price
   - [ ] Verify Legs auto-generated

3. **Frontend Verification**
   - [ ] Search renders jadwal with Rp 1.000
   - [ ] Other schedules on same route/date unaffected
   - [ ] Booking flow works end-to-end

4. **Notify Stakeholder**
   - [ ] Inform Oetic data is ready for payment test

5. **Post-Test Cleanup**
   - [ ] Soft-delete or hard-delete schedule
   - [ ] Mark task Done

---

## ⚡ Quick Start (Seed Script Approach)

Best practice: Add this to `scripts/seed-qa.ts`:

```typescript
// Seed dummy Wahana schedule for payment E2E testing
const wahanaSchedule = await prisma.schedule.create({
  data: {
    operatorId: '<WAHANA_ID>',
    boatId: '<CANTIKA_09_ID>',
    departurePortId: '<PADANG_BAI_ID>',
    arrivalPortId: '<GILI_TRAWANGAN_ID>',
    departureTime: new Date('2027-12-01T08:30:00+08:00'),
    arrivalTime: new Date('2027-12-01T10:00:00+08:00'),
    dayOfWeek: 1, // or mapping
    capacity: 50,
    pricePerPassenger: 1000, // Rp 1.000
  },
});

// Auto-generate legs
await generateLegsForSchedule(wahanaSchedule.id);
```

Then run:
```bash
pnpm seed:qa
```

---

## 📌 Notes

- Tanggal 1 Des 2027 dipilih agar jauh di masa depan, tidak bentrok dengan test data lain
- Harga Rp 1.000 dipilih agar mudah dikenali dan tidak membingungkan dengan harga real
- Pastikan `WITA` timezone diterapkan consistently (via `lib/datetime.ts`)
- Jika ada multiple test scenarios nanti, pertimbangkan expand data ini ke multiple timeslots/dates

---

## 🤝 Stakeholder Communication

**Kepada:** Oetic (QA Lead)

**Pesan:** Data dummy jadwal Wahana sudah siap di:
- Route: Padang Bai → Gili Trawangan
- Date: 1 Des 2027
- Time: 08:30
- Price: Rp 1.000 per passenger

**Bisa mulai payment test sekarang.** Jangan lupa koordinasi cleanup setelah test selesai.

---

## 📅 Rough Effort Estimate

| Task | Time |
|------|------|
| Identify IDs + Setup | 15 min |
| Insert Schedule Data | 10 min |
| Frontend Verification | 20 min |
| E2E Booking Test | 15 min |
| **Total** | **~1 hour** |

---

## ✅ Definition of Done

- [x] Data dummy inserted & visible di frontend
- [x] Booking flow works without errors
- [x] Oetic notified & ready to test
- [x] Post-test cleanup plan documented
