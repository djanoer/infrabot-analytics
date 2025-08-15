# Infrabot V2.0

Infrabot adalah chatbot Telegram yang dirancang untuk membantu tim infrastruktur dalam memantau, mengelola, dan menganalisis lingkungan virtual machine (VM) dan storage secara proaktif.

## Arsitektur

Versi 2.0 mengadopsi arsitektur yang tangguh dan terukur dengan beberapa fitur utama:

- **Sistem Antrean Tugas Asinkron**: Pekerjaan yang memakan waktu lama (seperti ekspor data dan kalkulasi berat) diproses di latar belakang untuk mencegah _timeout_ dan memastikan bot tetap responsif.

- **Kalkulasi Multi-Tahap**: Tugas yang sangat besar (seperti kalkulasi Skor Kesehatan) secara otomatis dipecah menjadi beberapa tahap kecil untuk menangani volume data yang masif, memastikan keandalan bahkan dengan ribuan data VM.

- **Manajemen Konfigurasi Terpusat**: Semua logika bisnis membaca konfigurasi dari Google Sheet, yang dapat dikelola secara interaktif dan aman langsung melalui perintah admin di Telegram.

- **Skor Kesehatan Proaktif**: Bot secara berkala menganalisis semua VM berdasarkan berbagai faktor risiko (uptime, tiket aktif, frekuensi modifikasi) untuk memberikan skor kesehatan, memungkinkan tim untuk melakukan tindakan pencegahan sebelum masalah terjadi.

## Pengujian

Proyek ini dilengkapi dengan suite pengujian sistem _end-to-end_. Untuk menjalankannya:

1.  Buka proyek di editor Google Apps Script.
2.  Buka file `PengujianSistem.js`.
3.  Dari menu dropdown fungsi, pilih `jalankanSemuaTesSistem`.
4.  Klik "Run" dan periksa hasilnya di log eksekusi (Ctrl+Enter).

## Deployment

1.  Pastikan semua konfigurasi di sheet "Konfigurasi" sudah benar.
2.  Pastikan `PropertiesService` telah diisi dengan `TELEGRAM_BOT_TOKEN` dan `WEBHOOK_BOT_TOKEN`.
3.  Buat _deployment_ baru dari menu "Deploy" > "New deployment".
4.  Pilih tipe "Web app".
5.  Atur "Execute as" ke "Me" dan "Who has access" ke "Anyone".
6.  Salin URL Web app yang dihasilkan dan atur sebagai _webhook_ untuk bot Telegram Anda menggunakan API Telegram.
