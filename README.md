# Smart Kitchen Safety — Platform Web Monitoring & Analytics

**Tahap 1: dashboard + backend API + penyimpanan PostgreSQL cloud.** Proyek ini dibuat khusus untuk NodeMCU-32S (ESP32), sesuai kode awal `smart_kitchen.ino` pengguna. Tidak menggunakan Blynk/ThingSpeak. Dashboard dan API dibuat sendiri menggunakan Node.js + HTML/CSS/JavaScript; Supabase hanya menjadi penyedia database PostgreSQL.

## Isi proyek

- `server.js`: API HTTP buatan sendiri, autentikasi dashboard dan autentikasi perangkat.
- `public/`: dashboard mobile-friendly, pembacaan terbaru, tabel, grafik SVG, statistik, dan log peristiwa.
- `lib/storage.js`: database PostgreSQL dan **mode latihan lokal terpisah**.
- `sql/schema.sql`: tabel `telemetry` dan `device_events` serta indeks waktu.
- `lib/telegram.js`: dukungan notifikasi otomatis Telegram (opsional).
- `scripts/kirim_demo.mjs`: generator **data SIMULASI** untuk latihan.
- `tests/e2e.test.mjs`: uji API end-to-end menggunakan penyimpanan lokal.
- `firmware_original/smart_kitchen.ino`: **salinan kode ESP32 asli dari unggahan pengguna**, belum diubah untuk Wi-Fi/API. Jangan meng-upload ulang sebelum wiring MQ-2 AO aman.

## A. Menjalankan latihan lokal terlebih dahulu

Memerlukan Node.js versi **20.11 atau lebih baru** (direkomendasikan Node.js 22).

1. Buka folder proyek di VS Code, kemudian terminal.
2. Salin `.env.example` menjadi `.env`.
3. Ubah nilai rahasia `DEVICE_API_KEY`, `DASHBOARD_USER` dan `DASHBOARD_PASSWORD` sesuai pilihanmu (masing-masing minimal 8 karakter). Jangan upload `.env` ke repo publik.
4. Biarkan `DEMO_LOCAL=1` dan jangan isi `DATABASE_URL` dulu.
5. Jalankan:

   ```bash
   npm install
   node --env-file=.env server.js
   ```

6. Buka `http://localhost:3000` di browser. Masuk menggunakan `DASHBOARD_USER` dan `DASHBOARD_PASSWORD` yang diisi tadi. Saat ini dashboard masih kosong karena belum ada data.
7. Dari **terminal kedua** jalankan skrip pengirim data simulasi:

   **Windows PowerShell**:

   ```powershell
   $env:DEVICE_API_KEY="ISI_KUNCI_SAMA_SEPERTI_DI_ENV"
   node scripts/kirim_demo.mjs
   ```

   **macOS / Linux**:

   ```bash
   DEVICE_API_KEY="ISI_KUNCI_SAMA_SEPERTI_DI_ENV" node scripts/kirim_demo.mjs
   ```

8. Refresh dashboard. Muncul data latihan dengan label **SIMULASI**. Ini **belum cloud** dan **bukan data sensor asli**. Nilai suhu pada skrip latihan bersifat ilustratif.

## B. Mengaktifkan database PostgreSQL cloud (Supabase)

1. Buat proyek PostgreSQL baru di https://supabase.com/ dan simpan kata sandi database di tempat aman.
2. Buka **SQL Editor** di proyek Supabase.
3. Salin isi `sql/schema.sql` dan jalankan. Dua tabel tersedia: `telemetry` untuk pembacaan berkala, `device_events` untuk perubahan status/aktuator.
4. Buka tombol **Connect**, pilih **Session pooler** jika hosting Node.js hanya mendukung IPv4, dan salin URL koneksi resmi dari sana. Jangan menebak hostname sendiri.
5. Edit `.env`: hapus/nonaktifkan `DEMO_LOCAL=1`, lalu isi `DATABASE_URL` dari Supabase. Pastikan password yang memuat karakter khusus di-URL-encode.
6. Pengaturan aplikasi meminta verifikasi sertifikat TLS (`rejectUnauthorized: true`). Jika penyedia koneksi memakai CA yang belum dikenal oleh Node.js, unduh CA melalui pengaturan proyek Supabase dan isi `DATABASE_SSL_CA` dengan jalur file sertifikat privat. **Jangan** menonaktifkan verifikasi sertifikat untuk menyelesaikan masalah koneksi.
7. Jalankan ulang `node --env-file=.env server.js`. Cek `http://localhost:3000/health`: `storage` harus berisi `POSTGRES_CLOUD`.
8. Kirim data simulasi seperti langkah A. Jika berhasil, lihat tabel `telemetry` dan `device_events` melalui Supabase Table Editor. Untuk data sensor asli, nanti ESP32 akan POST langsung ke API backend, **bukan** ke database.

**PENTING:** Supabase menyimpan data cloud, tetapi dashboard/API di laptop masih hanya dapat diakses dari laptop sampai dideploy. Untuk pengguna internet, hosting backend di Render atau penyedia web Node.js lainnya.

## C. Deploy backend + dashboard ke Render

1. Buat repository GitHub **privat** lalu upload folder proyek (jangan sertakan `.env`, `data/`, atau kunci rahasia).
2. Di https://dashboard.render.com, pilih **New → Web Service** lalu hubungkan repository.
3. Build command: `npm install`; Start command: `npm start`; Node.js >=20.
4. Tambahkan environment variables `DATABASE_URL`, `DEVICE_API_KEY`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD`, `DEVICE_ID`, dan opsional `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
5. Jika dibutuhkan, konfigurasi `DATABASE_SSL_CA` dengan cara yang didukung hosting dan file CA privat. Jangan taruh sertifikat kredensial di repo.
6. Buka domain HTTPS yang diberikan Render; cek `/health`. Kini dashboard dapat diakses dari internet dan data masuk ke PostgreSQL cloud.
7. Untuk produksi, gantilah semua token demo dengan token yang kuat; jangan mengirim token ke chat/screenshot. Di luar tugas kuliah, pertimbangkan autentikasi pengguna yang lebih lengkap.

> Hosting gratis dapat memiliki batas pemakaian, idle/sleep, dan kebijakan harga yang berubah. Periksa detail layanan pada saat membuat proyek.

## D. Endpoint API

**Untuk ESP32 / penguji data** (butuh header `X-Device-Key`):

`POST /api/v1/telemetry` dengan JSON seperti contoh berikut. Nilai `mq2_adc` harus `null` kalau sensor belum aman/siap, dan `mq2_status` wajib sesuai kondisi.

```json
{
  "sample_id": "demo-unik-000001",
  "device_id": "smart-kitchen-001",
  "temperature_c": 29.2,
  "humidity_pct": 61,
  "mq2_adc": null,
  "mq2_status": "OFFLINE",
  "gas_threshold_adc": 4000,
  "system_status": "TEST NORMAL",
  "mode": "SIMULASI",
  "servo_target_deg": 10,
  "led_red_on": false,
  "led_green_on": true,
  "buzzer_on": false,
  "alarm_active": false
}
```

`sample_id` opsional, tetapi sangat disarankan digunakan oleh ESP32 supaya pengiriman ulang data yang sama tidak membuat duplikasi. Server mengisi `recorded_at` saat menerima data. Tahap selanjutnya perlu menambah timestamp pengamatan di ESP32 dan antrean offline.

**Untuk dashboard** (HTTP Basic Auth menggunakan user/password):

- `GET /api/latest` — sampel terbaru.
- `GET /api/telemetry?span=24h` — 500 sampel terakhir dalam rentang 1h, 24h, atau 7d.
- `GET /api/events?span=24h` — perubahan status dan perintah aktuator.
- `GET /api/summary?span=24h` — statistik min/max/rata-rata suhu, kelembapan, MQ-2; jumlah alarm asli, demo dan perubahan aktuator.
- `GET /health` — status server/database.

**Tentang akurasi:** pengukuran MQ-2 berupa **ADC mentah**, bukan ppm. Angka servo adalah **sudut perintah**, bukan posisi mekanis yang sudah terverifikasi. Grafik dan analitik tidak mencampur nilai sensor asli dengan mode simulasi. Saat tidak ada data asli, grafik latihan ditandai jelas.

## E. Notifikasi Telegram (opsional, server-side)

1. Buat bot melalui @BotFather, ambil token, dan peroleh chat ID milikmu secara privat.
2. Isi variabel `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` pada `.env` atau Render environment.
3. Backend memanggil `sendMessage` hanya pada perubahan status (alarm dan pemulihan). Alarm simulasi diberi label **SIMULASI**.
4. Token tidak pernah dikirim ke browser ataupun disimpan di database.
5. Versi tahap 1 belum menyediakan perintah `/status` pada Telegram; fitur ini dapat ditambahkan berikutnya. Pengiriman notifikasi gagal belum memiliki antrean retry yang tahan restart server, jadi fitur ini belum layak digunakan sebagai pengaman utama.

## F. Mengintegrasikan source code ESP32

**Belum dilakukan pada Tahap 1.** Kode perangkat yang sudah berjalan ada pada `smart_kitchen.ino`; backend sudah menerima bentuk data yang dipetakan dari status, suhu, kelembapan, `MQ2_PIN=34`, LED merah GPIO25, LED hijau GPIO26, servo GPIO18, buzzer GPIO19. Pada Tahap 2 kita menambahkan `WiFi.h`, `HTTPClient.h`, sinkronisasi waktu, dan pengiriman HTTPS setiap sekitar 5–10 detik **tanpa mengganggu loop alarm lokal**. Untuk production, sertifikat HTTPS harus diverifikasi pada ESP32; jangan gunakan `setInsecure()`.

**Keselamatan:** sebelum menyalakan modul MQ-2 5V bersama ESP32, gunakan pembagi tegangan yang benar dan ukur tegangan pada titik tengah sebelum GPIO34 disambungkan. Threshold 4000 ADC adalah setelan latihan dan perlu kalibrasi ulang setelah pembagi tegangan terpasang. Proyek ini prototype demonstrasi, bukan sistem keselamatan gas bersertifikasi.

## G. Uji otomatis

```bash
npm test
```

Tes menjalankan server pada mode `DEMO_LOCAL`, lalu menguji autentikasi, validasi data, pencegahan duplikasi `sample_id`, pencatatan event, dan pengambilan statistik. Tes cloud Supabase dan perangkat ESP32 fisik perlu dilakukan terpisah setelah kredensial dan hardware siap.
