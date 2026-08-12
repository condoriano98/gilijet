import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan | Wahana Virendra Fast Boat",
  description:
    "Syarat dan Ketentuan pemesanan tiket fast boat Wahana Virendra — rute Bali, Gili Trawangan, Nusa Penida, Lembongan, Sanur, Padang Bai, Serangan.",
  alternates: { canonical: "/legal/wahana-virendra" },
};

// Standalone, self-branded merchant-verification page for Wahana Virendra
// (a sibling brand of gilifast.com — both operated by CV Hi Bali Nusa
// Tenggara). Ported verbatim from the supplied document so the public
// URL matches what payment-gateway merchant verification expects. All
// styles are scoped under `.wv-page` so the document's global reset does
// not leak into the rest of the site.

const STYLES = `
.wv-page, .wv-page * { box-sizing: border-box; margin: 0; padding: 0; }

.wv-page {
  font-family: 'Segoe UI', Arial, sans-serif;
  background: #f7f8fa;
  color: #1a1a1a;
  line-height: 1.7;
  font-size: 15px;
  min-height: 100vh;
}

/* HEADER */
.wv-page .header {
  background: linear-gradient(135deg, #0a5c9e 0%, #1a8fd1 100%);
  color: white;
  padding: 32px 20px 28px;
  text-align: center;
}
.wv-page .header .logo-text {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.wv-page .header .logo-sub {
  font-size: 13px;
  opacity: 0.85;
  margin-bottom: 16px;
}
.wv-page .header h1 {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 6px;
}
.wv-page .header .eff-date {
  font-size: 12px;
  opacity: 0.75;
  margin-top: 4px;
}

/* ROUTE PILLS */
.wv-page .routes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  padding: 14px 20px;
  background: #e8f4fd;
  border-bottom: 1px solid #c5dff0;
}
.wv-page .route-pill {
  background: white;
  border: 1px solid #1a8fd1;
  color: #0a5c9e;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 99px;
}

/* MAIN CONTENT */
.wv-page .container {
  max-width: 720px;
  margin: 0 auto;
  padding: 20px 16px 60px;
}

/* NOTICE BOX */
.wv-page .notice {
  background: #fff8e1;
  border-left: 4px solid #f59e0b;
  border-radius: 6px;
  padding: 12px 16px;
  font-size: 13px;
  color: #78450a;
  margin: 20px 0;
  line-height: 1.6;
}

/* SECTION */
.wv-page .section {
  background: white;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  margin-bottom: 14px;
  overflow: hidden;
}
.wv-page .section-header {
  background: #0a5c9e;
  color: white;
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
}
.wv-page .section-num {
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}
.wv-page .section-body {
  padding: 16px 18px;
}
.wv-page .section-body p {
  margin-bottom: 10px;
  font-size: 14px;
  color: #333;
}
.wv-page .section-body p:last-child { margin-bottom: 0; }
.wv-page .section-body ul {
  padding-left: 18px;
  margin: 8px 0;
}
.wv-page .section-body ul li {
  font-size: 14px;
  color: #333;
  margin-bottom: 6px;
  line-height: 1.6;
}
.wv-page .section-body strong { color: #0a5c9e; }

/* REFUND TABLE */
.wv-page .refund-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin: 10px 0;
}
.wv-page .refund-table th {
  background: #e8f4fd;
  color: #0a5c9e;
  font-weight: 700;
  padding: 9px 10px;
  text-align: left;
  border: 1px solid #c5dff0;
}
.wv-page .refund-table td {
  padding: 9px 10px;
  border: 1px solid #e5e7eb;
  vertical-align: top;
}
.wv-page .refund-table tr:nth-child(even) td { background: #f8fafc; }
.wv-page .badge-green {
  display: inline-block;
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
}
.wv-page .badge-red {
  display: inline-block;
  background: #fee2e2;
  color: #991b1b;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
}
.wv-page .badge-amber {
  display: inline-block;
  background: #fef9c3;
  color: #713f12;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
}

/* CONTACT CARD */
.wv-page .contact-card {
  background: linear-gradient(135deg, #0a5c9e, #1a8fd1);
  border-radius: 10px;
  padding: 20px 18px;
  color: white;
  margin-top: 20px;
  text-align: center;
}
.wv-page .contact-card h3 {
  font-size: 16px;
  margin-bottom: 12px;
}
.wv-page .contact-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  margin-bottom: 8px;
  opacity: 0.95;
}
.wv-page .wa-btn {
  display: inline-block;
  margin-top: 14px;
  background: #25d366;
  color: white;
  font-weight: 700;
  font-size: 14px;
  padding: 10px 24px;
  border-radius: 99px;
  text-decoration: none;
}

/* BRAND LINKS */
.wv-page .brand-links {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 10px;
  flex-wrap: wrap;
}
.wv-page .brand-link {
  background: rgba(255,255,255,0.15);
  color: white;
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 99px;
  text-decoration: none;
  border: 1px solid rgba(255,255,255,0.3);
}

/* FOOTER */
.wv-page .footer {
  text-align: center;
  padding: 20px;
  font-size: 12px;
  color: #888;
  border-top: 1px solid #e5e7eb;
  margin-top: 30px;
}
.wv-page .footer a { color: #0a5c9e; text-decoration: none; }

@media (max-width: 480px) {
  .wv-page .header h1 { font-size: 20px; }
  .wv-page .refund-table { font-size: 12px; }
  .wv-page .refund-table th, .wv-page .refund-table td { padding: 7px 8px; }
}
`;

const BODY = `
<!-- HEADER -->
<div class="header">
  <div class="logo-text">🚤 WAHANA VIRENDRA FAST BOAT</div>
  <h1>Syarat &amp; Ketentuan</h1>
  <p style="font-size:13px;opacity:0.8;margin-top:4px;">Terms &amp; Conditions · Kebijakan Pemesanan &amp; Refund</p>
  <div class="eff-date">Berlaku sejak: Juni 2026 · Versi 1.0</div>
</div>

<!-- ROUTES -->
<div class="routes">
  <span class="route-pill">Bali (Sanur / Padang Bai / Serangan)</span>
  <span class="route-pill">Gili Trawangan</span>
  <span class="route-pill">Gili Air</span>
  <span class="route-pill">Gili Meno</span>
  <span class="route-pill">Bangsal (Lombok)</span>
  <span class="route-pill">Nusa Penida</span>
  <span class="route-pill">Nusa Lembongan</span>
</div>

<!-- MAIN -->
<div class="container">

  <div class="notice">
    ⚠️ <strong>Penting:</strong> Dengan melakukan pemesanan tiket melalui akun ini, WhatsApp, atau platform mitra kami (gilifast.com), Anda dianggap telah membaca dan menyetujui seluruh syarat dan ketentuan berikut.
  </div>

  <!-- 1. TENTANG KAMI -->
  <div class="section">
    <div class="section-header"><span class="section-num">1</span> Tentang Kami</div>
    <div class="section-body">
      <p><strong>Wahana Virendra Fast Boat</strong> adalah penyedia layanan pemesanan tiket kapal cepat (fast boat / speedboat) yang melayani rute antar pulau di wilayah Bali, Lombok, Gili, dan sekitarnya.</p>
      <p>Kami beroperasi sebagai agen tiket resmi dan berkolaborasi dengan operator kapal berlisensi dari Direktorat Jenderal Perhubungan Laut. Layanan pemesanan online juga tersedia melalui platform mitra kami:</p>
      <ul>
        <li>🌐 <strong>gilifast.com</strong> — platform ticketing fast boat Bali, Gili &amp; sekitarnya</li>
      </ul>
      <p>Kontak: <strong>+62 859-5376-4142</strong> (WhatsApp) · Instagram: <strong>@wahanavirendrafastboat</strong></p>
    </div>
  </div>

  <!-- 2. PEMESANAN -->
  <div class="section">
    <div class="section-header"><span class="section-num">2</span> Pemesanan Tiket</div>
    <div class="section-body">
      <p><strong>2.1</strong> Pemesanan dapat dilakukan melalui WhatsApp, Instagram Direct Message, atau platform online kami. Pemesanan dianggap <em>terkonfirmasi</em> setelah pembayaran penuh diterima dan tiket/bukti booking dikirimkan.</p>
      <p><strong>2.2</strong> Saat melakukan pemesanan, Anda wajib memberikan informasi yang akurat meliputi: nama lengkap sesuai identitas, tanggal keberangkatan, rute, dan jumlah penumpang. Kami tidak bertanggung jawab atas kesalahan akibat data yang tidak tepat.</p>
      <p><strong>2.3</strong> Harga tiket yang berlaku adalah harga yang tertera pada saat konfirmasi pemesanan. Harga dapat berubah sewaktu-waktu sebelum konfirmasi diberikan.</p>
      <p><strong>2.4</strong> Tiket yang telah diterbitkan bersifat personal (tidak dapat dipindahtangankan) kecuali atas persetujuan tertulis dari kami.</p>
    </div>
  </div>

  <!-- 3. PEMBAYARAN -->
  <div class="section">
    <div class="section-header"><span class="section-num">3</span> Pembayaran</div>
    <div class="section-body">
      <p><strong>3.1</strong> Pembayaran dapat dilakukan melalui:</p>
      <ul>
        <li>Transfer bank (BCA, BNI, BRI, Mandiri, dan bank lainnya)</li>
        <li>QRIS (scan QR, berlaku untuk semua e-wallet dan m-banking)</li>
        <li>Kartu kredit/debit (melalui platform online gilifast.com)</li>
        <li>Tunai (khusus pemesanan langsung di lokasi)</li>
      </ul>
      <p><strong>3.2</strong> Bukti pembayaran harus dikirimkan melalui WhatsApp untuk konfirmasi. Pemesanan yang belum dikonfirmasi pembayarannya dalam waktu <strong>2 jam</strong> akan dianggap batal secara otomatis.</p>
      <p><strong>3.3</strong> Seluruh harga yang tertera dalam mata uang Rupiah Indonesia (IDR). Untuk pembayaran menggunakan kartu internasional, biaya konversi mata uang ditanggung oleh pembeli.</p>
    </div>
  </div>

  <!-- 4. CHECK-IN & BOARDING -->
  <div class="section">
    <div class="section-header"><span class="section-num">4</span> Check-in &amp; Keberangkatan</div>
    <div class="section-body">
      <p><strong>4.1</strong> Penumpang wajib hadir di dermaga keberangkatan <strong>paling lambat 30 menit sebelum jam keberangkatan</strong> yang tertera di tiket.</p>
      <p><strong>4.2</strong> Wajib membawa tiket/bukti pemesanan (cetak atau digital) dan kartu identitas yang masih berlaku (paspor untuk WNA, KTP/SIM untuk WNI).</p>
      <p><strong>4.3</strong> Keterlambatan hadir di dermaga adalah tanggung jawab penumpang sepenuhnya. Kami tidak memberikan refund untuk penumpang yang terlambat (no-show / late arrival).</p>
      <p><strong>4.4</strong> Operator kapal berhak menolak penumpang yang dinilai membahayakan keselamatan perjalanan. Dalam kondisi ini, refund tidak diberikan.</p>
    </div>
  </div>

  <!-- 5. PEMBATALAN & REFUND -->
  <div class="section">
    <div class="section-header"><span class="section-num">5</span> Pembatalan &amp; Kebijakan Refund</div>
    <div class="section-body">
      <p>Permintaan pembatalan harus disampaikan secara tertulis melalui <strong>WhatsApp ke +62 859-5376-4142</strong>. Ketentuan refund berdasarkan waktu pembatalan sebelum jadwal keberangkatan:</p>

      <table class="refund-table">
        <thead>
          <tr>
            <th>Waktu Pembatalan</th>
            <th>Refund</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lebih dari 7 hari (168 jam) sebelum berangkat</td>
            <td><span class="badge-green">100%</span></td>
            <td>Dikurangi biaya admin transfer jika ada</td>
          </tr>
          <tr>
            <td>48 jam – 7 hari sebelum berangkat</td>
            <td><span class="badge-amber">50%</span></td>
            <td>Setengah nilai tiket hangus</td>
          </tr>
          <tr>
            <td>Kurang dari 48 jam sebelum berangkat</td>
            <td><span class="badge-red">Tidak ada</span></td>
            <td>Tiket hangus sepenuhnya</td>
          </tr>
          <tr>
            <td>No-show / Terlambat ke dermaga</td>
            <td><span class="badge-red">Tidak ada</span></td>
            <td>Tidak ada pengecualian</td>
          </tr>
          <tr>
            <td>Pembatalan oleh Operator / Cuaca Buruk</td>
            <td><span class="badge-green">100%</span></td>
            <td>Atau reschedule gratis ke jadwal berikutnya</td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top:12px;"><strong>Proses Refund:</strong> Dana dikembalikan ke rekening/metode bayar asal dalam waktu 3–7 hari kerja setelah permohonan disetujui.</p>
    </div>
  </div>

  <!-- 6. RESCHEDULE -->
  <div class="section">
    <div class="section-header"><span class="section-num">6</span> Reschedule / Perubahan Jadwal</div>
    <div class="section-body">
      <p><strong>6.1</strong> Penumpang dapat mengajukan perubahan jadwal keberangkatan dengan ketentuan:</p>
      <ul>
        <li>Permintaan disampaikan minimal <strong>48 jam</strong> sebelum jadwal asal (96 jam untuk musim ramai: Juli–Agustus dan 20 Desember–5 Januari)</li>
        <li>Reschedule pertama gratis, subject to ketersediaan kursi</li>
        <li>Reschedule kedua dan seterusnya dikenakan biaya administrasi <strong>Rp 50.000/orang</strong></li>
      </ul>
      <p><strong>6.2</strong> Permintaan reschedule disampaikan melalui WhatsApp ke <strong>+62 859-5376-4142</strong>.</p>
    </div>
  </div>

  <!-- 7. BAGASI -->
  <div class="section">
    <div class="section-header"><span class="section-num">7</span> Bagasi &amp; Barang Bawaan</div>
    <div class="section-body">
      <p><strong>7.1</strong> Setiap penumpang diizinkan membawa bagasi maksimal <strong>25 kg</strong> (2 koper/tas) dan 1 tas kabin kecil.</p>
      <p><strong>7.2</strong> Kelebihan bagasi dikenakan biaya tambahan yang dibayarkan langsung ke operator kapal di pelabuhan.</p>
      <p><strong>7.3</strong> Kami dan operator kapal tidak bertanggung jawab atas kehilangan atau kerusakan barang bawaan selama perjalanan. Penumpang disarankan membawa asuransi perjalanan.</p>
      <p><strong>7.4</strong> Barang-barang terlarang: bahan mudah terbakar, bahan peledak, senjata, narkotika, dan segala barang yang dilarang hukum Indonesia tidak diperbolehkan di atas kapal.</p>
    </div>
  </div>

  <!-- 8. KESELAMATAN -->
  <div class="section">
    <div class="section-header"><span class="section-num">8</span> Keselamatan &amp; Kondisi Laut</div>
    <div class="section-body">
      <p><strong>8.1</strong> Keselamatan penumpang adalah prioritas utama. Seluruh operator kapal mitra kami memiliki izin resmi dari Direktorat Jenderal Perhubungan Laut Kementerian Perhubungan RI.</p>
      <p><strong>8.2</strong> Jadwal keberangkatan dapat berubah, ditunda, atau dibatalkan berdasarkan kondisi cuaca dan keputusan kapten kapal atau otoritas pelabuhan. Keputusan ini bersifat final demi keselamatan.</p>
      <p><strong>8.3</strong> Penumpang dengan kondisi kesehatan tertentu (ibu hamil, lansia, bayi, kondisi jantung) disarankan berkonsultasi dengan dokter sebelum melakukan perjalanan laut. Kami tidak bertanggung jawab atas kondisi medis yang terjadi selama perjalanan.</p>
      <p><strong>8.4</strong> Penumpang wajib mengikuti semua instruksi keselamatan yang diberikan oleh awak kapal, termasuk pemakaian jaket pelampung jika diminta.</p>
    </div>
  </div>

  <!-- 9. PRIVASI -->
  <div class="section">
    <div class="section-header"><span class="section-num">9</span> Privasi Data</div>
    <div class="section-body">
      <p><strong>9.1</strong> Data pribadi yang Anda berikan (nama, nomor HP, nomor identitas) hanya digunakan untuk keperluan pemesanan tiket, penerbitan tiket, dan komunikasi terkait perjalanan Anda.</p>
      <p><strong>9.2</strong> Data Anda tidak akan dijual atau dibagikan kepada pihak ketiga di luar operator kapal yang terlibat dalam layanan Anda.</p>
      <p><strong>9.3</strong> Kami mengolah data pribadi sesuai dengan Undang-Undang Nomor 27 Tahun 2022 tentang Perlindungan Data Pribadi (UU PDP).</p>
    </div>
  </div>

  <!-- 10. TANGGUNG JAWAB -->
  <div class="section">
    <div class="section-header"><span class="section-num">10</span> Batasan Tanggung Jawab</div>
    <div class="section-body">
      <p><strong>10.1</strong> Kami bertindak sebagai agen pemesanan tiket. Tanggung jawab atas operasional kapal, ketepatan jadwal, dan keselamatan perjalanan berada pada operator kapal mitra.</p>
      <p><strong>10.2</strong> Kami tidak bertanggung jawab atas kerugian tidak langsung yang timbul akibat keterlambatan atau pembatalan keberangkatan, termasuk tiket pesawat, pemesanan hotel, atau aktivitas wisata yang telah dipesan.</p>
      <p><strong>10.3</strong> Tanggung jawab maksimal kami terbatas pada nilai tiket yang dibayarkan.</p>
    </div>
  </div>

  <!-- 11. HUKUM -->
  <div class="section">
    <div class="section-header"><span class="section-num">11</span> Hukum yang Berlaku</div>
    <div class="section-body">
      <p>Syarat dan Ketentuan ini tunduk pada hukum yang berlaku di Negara Kesatuan Republik Indonesia. Setiap perselisihan akan diselesaikan secara musyawarah mufakat terlebih dahulu. Apabila tidak tercapai kesepakatan, perselisihan diselesaikan melalui Pengadilan Negeri yang berwenang di wilayah Nusa Tenggara Barat.</p>
    </div>
  </div>

  <!-- CONTACT -->
  <div class="contact-card">
    <h3>📞 Hubungi Kami</h3>
    <div class="contact-item">📍 <span style="text-align:left;"><strong>Gili Trawangan:</strong> Jl. Pantai Gili Indah, Gili Trawangan, Pemenang, Lombok, NTB 83351</span></div>
    <div class="contact-item">📍 <span style="text-align:left;"><strong>Mataram:</strong> Jl. Swakarya No.5B, Kel. Kekalik Jaya, Kec. Sekarbela, Kota Mataram, NTB</span></div>
    <div class="contact-item">📍 <span style="text-align:left;"><strong>Denpasar:</strong> Kompleks Purnama Hotel-Dynata, Jl. Cokroaminoto No.70, Kel. Pemecutan Kaja, Kec. Denpasar Utara, Kota Denpasar, Bali</span></div>
    <div class="contact-item" style="margin-top:4px;">📱 +62 859-5376-4142 (WhatsApp)</div>
    <div class="contact-item">📸 @wahanavirendrafastboat</div>
    <a href="https://wa.me/6285953764142?text=Halo%20Wahana%20Virendra%2C%20saya%20ingin%20pesan%20tiket%20fast%20boat" class="wa-btn">💬 Chat WhatsApp Sekarang</a>
    <div class="brand-links" style="margin-top:16px;">
      <a href="https://gilifast.com" class="brand-link">🌐 gilifast.com</a>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p>© 2026 Wahana Virendra Fast Boat · Bagian dari ekosistem <a href="https://gilifast.com">gilifast.com</a></p>
    <p style="margin-top:4px;">Dikelola oleh <strong>CV Hi Bali Nusa Tenggara</strong> · Berlaku sejak Juni 2026</p>
    <p style="margin-top:4px;color:#aaa;font-size:11px;">Kantor Mataram: Jl. Swakarya No.5B, Kekalik Jaya, Sekarbela, Mataram, NTB &nbsp;|&nbsp; Kantor Denpasar: Jl. Cokroaminoto No.70, Pemecutan Kaja, Denpasar Utara, Bali</p>
    <p style="margin-top:8px;color:#aaa;font-size:11px;">Halaman ini merupakan dokumen resmi Syarat &amp; Ketentuan yang dapat dijadikan referensi verifikasi merchant.</p>
  </div>

</div>
`;

export default function WahanaVirendraTermsPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="wv-page" dangerouslySetInnerHTML={{ __html: BODY }} />
    </>
  );
}
