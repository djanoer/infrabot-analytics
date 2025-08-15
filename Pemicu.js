/**
 * @file Pemicu.js
 * @author Djanoer Team
 * @date 2025-07-28
 * @version 2.0.0
 *
 * @description
 * Mengelola semua fungsi yang dirancang untuk dieksekusi oleh pemicu (trigger)
 * berbasis waktu dari Google Apps Script. Bertindak sebagai penjadwal untuk
 * proses latar belakang yang berjalan secara periodik.
 *
 * @section FUNGSI UTAMA
 * - runDailyJobs(): Pemicu harian utama yang mendelegasikan sinkronisasi ke antrean.
 * - picuKalkulasiHealthScore(): Pemicu ringan yang memulai rantai pekerjaan kalkulasi
 * Health Score secara asinkron.
 * - runCleanupAndArchivingJobs(): Menjalankan semua pekerjaan pemeliharaan seperti
 * pembersihan file dan pengarsipan log.
 *
 * @section ARSITEKTUR & INTERAKSI
 * - Tidak dipanggil oleh bot, melainkan oleh layanan Google Triggers.
 * - Berinteraksi dengan `AntreanTugas.js` dengan cara membuat "tiket pekerjaan"
 * baru di `PropertiesService`.
 */

function runDailyJobs() {
  console.log("Memulai pendelegasian pekerjaan harian via trigger...");
  const { config } = getBotState();

  const targetChatId = config.ENVIRONMENT === "DEV" ? config.TELEGRAM_CHAT_ID_DEV : config.TELEGRAM_CHAT_ID;

  const jobData = {
    jobType: "sync_and_report",
    chatId: targetChatId,
    statusMessageId: null,
    userData: { firstName: "Trigger Harian" },
    config: config,
    stage: 1,
  };

  const jobKey = `job_daily_sync_${Date.now()}`;
  // --- PERBAIKAN DI SINI ---
  tambahTugasKeAntreanDanPicu(jobKey, jobData);
  // --- AKHIR PERBAIKAN ---

  console.log(`Pekerjaan sinkronisasi harian '${jobKey}' berhasil ditambahkan ke antrean.`);

  try {
    const { pesan, keyboard } = jalankanPemeriksaanAmbangBatas(config);
    if (keyboard) {
      kirimPesanTelegram(pesan, config, "HTML", keyboard, targetChatId);
    }
  } catch (e) {
    console.error(`Gagal menjalankan pemeriksaan ambang batas saat pemicu harian: ${e.message}`);
  }
}

/**
 * [PINDAH] Menjalankan pembuatan laporan tren mingguan.
 */
function runWeeklyReport() {
  console.log("Memulai laporan mingguan via trigger...");
  buatLaporanPeriodik("mingguan");
  console.log("Laporan mingguan via trigger selesai.");
}

/**
 * [PINDAH] Menjalankan pembuatan laporan tren bulanan.
 */
function runMonthlyReport() {
  console.log("Memulai laporan bulanan via trigger...");
  buatLaporanPeriodik("bulanan");
  console.log("Laporan bulanan via trigger selesai.");
}

/**
 * [PINDAH] Menjalankan semua pekerjaan pembersihan dan pengarsipan.
 */
function runCleanupAndArchivingJobs() {
  console.log("Memulai pekerjaan pembersihan dan arsip via trigger...");
  const { config } = getBotState();
  bersihkanFileEksporTua(config);
  cekDanArsipkanLogJikaPenuh(config);
  cekDanArsipkanLogStorageJikaPenuh(config);
  console.log("Pekerjaan pembersihan dan arsip via trigger selesai.");
}

/**
 * [PINDAH] Menjalankan sinkronisasi data tiket.
 */
function runTicketSync() {
  console.log("Memulai sinkronisasi data tiket via trigger...");
  try {
    syncTiketDataForTrigger();
  } catch (e) {
    console.error(`Sinkronisasi tiket via trigger gagal: ${e.message}`);
  }
}

/**
 * [REVISI] Menjalankan proses 'cache warming' secara berkala dengan pola yang benar.
 * Tugasnya adalah menyalin data baru, menginvalidasi cache lama, dan memuat ulang.
 */
function runCacheWarming() {
  console.log("Memulai pekerjaan 'Cache Warming' via trigger...");
  try {
    const { config } = getBotState();
    const sumberId = config[KONSTANTA.KUNCI_KONFIG.ID_SUMBER];
    const sheetVmName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];

    // LANGKAH 1: Salin data terbaru dari spreadsheet sumber ke sheet operasional.
    salinDataSheet(sheetVmName, sumberId);

    // LANGKAH 2: Bersihkan semua cache yang relevan. Ini akan menghapus data VM yang lama.
    // Fungsi clearBotStateCache sudah ada di Utilitas.js untuk tujuan ini.
    clearBotStateCache();

    // LANGKAH 3 (Opsional tapi direkomendasikan): Panggil getter dari Repositori.
    // Ini akan menemukan cache kosong, membaca data baru dari sheet, dan
    // secara otomatis mengisi kembali cache (warming).
    RepositoriData.getSemuaVm(config);

    console.log("Cache Warming berhasil: Data VM telah diperbarui di cache.");
  } catch (e) {
    console.error(`Pekerjaan 'Cache Warming' gagal: ${e.message}`);
  }
}
