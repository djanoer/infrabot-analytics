/**
 * @file AntreanTugas.js
 * @author Djanoer Team
 * @date 2025-07-28
 * @version 2.0.0
 *
 * @description
 * Mengimplementasikan sistem antrean tugas (job queue) asinkron berbasis
 * PropertiesService. Komponen krusial ini memungkinkan bot untuk menangani
 * pekerjaan berat (long-running) tanpa terkena batasan timeout 6 menit.
 *
 * @section FUNGSI UTAMA
 * - prosesAntreanTugas(): Fungsi utama yang dipanggil trigger (setiap 1-5 menit)
 * untuk mengambil dan memproses satu tugas dari antrean.
 * - executeHealthScoreJob(jobData): State machine yang mengelola kalkulasi
 * Health Score secara bertahap (multi-stage).
 * - executeExportJob(jobData): Mengeksekusi permintaan ekspor data ke Google Sheets.
 *
 * @section ARSITEKTUR & INTERAKSI
 * - Dipanggil oleh trigger waktu yang sering.
 * - Membaca dan menulis `PropertiesService` untuk mengelola status antrean.
 * - Memanggil berbagai fungsi dari lapisan logika bisnis (`Analisis.js`, `Laporan.js`)
 * untuk menjalankan tugas yang sebenarnya.
 */

/**
 * [REVISI FINAL] Memproses tugas dari antrean secara dinamis dengan self-triggering.
 * Fungsi ini menghapus trigger yang menjalankannya, lalu membuat yang baru jika perlu.
 */
function prosesAntreanTugas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn("Eksekusi prosesAntreanTugas dilewati karena proses sebelumnya masih aktif.");
    return;
  }

  // Hapus semua trigger untuk fungsi ini. Ini memastikan hanya rantai yang aktif
  // yang akan menjadwalkan eksekusi berikutnya.
  _hapusTriggerYangAda('prosesAntreanTugas');

  try {
    const startTime = new Date();
    const timeLimit = 5 * 60 * 1000; // Batas waktu kerja 5 menit
    const properties = PropertiesService.getScriptProperties();

    while (new Date() - startTime < timeLimit) {
      const jobKeys = properties.getKeys().filter((key) => key.startsWith("job_"));

      if (jobKeys.length === 0) {
        console.log("Antrean kosong. Proses dihentikan.");
        return;
      }

      const currentJobKey = jobKeys[0];
      const jobDataString = properties.getProperty(currentJobKey);
      properties.deleteProperty(currentJobKey);

      if (jobDataString) {
        try {
          const jobData = JSON.parse(jobDataString);
          console.log(`Memproses pekerjaan: ${currentJobKey} (Tipe: ${jobData.jobType}, Tahap: ${jobData.stage})`);

          // Logika perutean untuk mengeksekusi jenis pekerjaan yang berbeda
          switch (jobData.jobType) {
            case "sync_and_report": executeSyncAndReportJob(jobData); break;
            case "export_menu": executeMenuExportJob(jobData); break;
            case "export": executeExportJob(jobData); break;
            case "simulation": executeSimulationJob(jobData); break;
            case "health_score_calculation": executeHealthScoreJob(jobData); break;
            default: console.warn(`Jenis pekerjaan tidak dikenal: ${jobData.jobType}`);
          }
        } catch (e) {
          // Blok Dead Letter Queue (DLQ) untuk menangani pekerjaan yang gagal
          console.error(`Gagal memproses pekerjaan ${currentJobKey}. Error: ${e.message}. Memindahkan ke DLQ.`);
          const failedJobKey = `failed_${currentJobKey}`;
          properties.setProperty(failedJobKey, jobDataString);

          try {
            const config = getBotState().config;
            const errorMessage = `🔴 <b>Peringatan Sistem: Pekerjaan Gagal</b> 🔴\n\n` +
                               `Sebuah pekerjaan di latar belakang gagal dieksekusi dan telah dipindahkan ke *Dead Letter Queue*.\n\n` +
                               `<b>Kunci Pekerjaan:</b>\n<code>${failedJobKey}</code>\n\n` +
                               `<b>Penyebab Kegagalan:</b>\n<pre>${escapeHtml(e.message)}</pre>\n\n` +
                               `<b>Stack Trace:</b>\n<pre>${escapeHtml(e.stack || 'Tidak tersedia')}</pre>\n\n` +
                               `Mohon periksa *PropertiesService* di proyek Apps Script untuk diagnosis lebih lanjut.`;
            
            kirimPesanTelegram(errorMessage, config, "HTML");
          } catch (notificationError) {
            console.error(`GAGAL MENGIRIM NOTIFIKASI DLQ: ${notificationError.message}`);
          }
        }
      }
    }
  } finally {
    // === LOGIKA PERBAIKAN KRUSIAL: Rantai Pemicu Otomatis ===
    // Setelah selesai bekerja, periksa apakah masih ada pekerjaan tersisa.
    const remainingJobs = PropertiesService.getScriptProperties().getKeys().filter(key => key.startsWith("job_"));
    if (remainingJobs.length > 0) {
      // Jika ya, buat pemicu baru untuk menjalankan fungsi ini lagi nanti guna melanjutkan pekerjaan.
      console.log(`Masih ada ${remainingJobs.length} pekerjaan. Menjadwalkan eksekusi berikutnya dalam 1 menit.`);
      ScriptApp.newTrigger('prosesAntreanTugas')
        .timeBased()
        .after(1 * 60 * 1000) // Atur jeda 1 menit sebelum siklus berikutnya
        .create();
    } else {
      // Jika tidak ada pekerjaan tersisa, rantai pemicu akan berhenti di sini.
      console.log("Semua pekerjaan selesai. Rantai trigger dihentikan.");
    }
    lock.releaseLock();
    // ================== AKHIR BLOK PERBAIKAN ==================
  }
}

/**
 * [HELPER] Menghapus semua trigger yang ada untuk sebuah fungsi.
 * @param {string} functionName - Nama fungsi yang trigger-nya akan dihapus.
 */
function _hapusTriggerYangAda(functionName) {
  const allTriggers = ScriptApp.getProjectTriggers();
  for (const trigger of allTriggers) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

/**
 * [REVISI DENGAN PRA-PEMROSESAN TIKET] Mesin state machine untuk menjalankan
 * kalkulasi Health Score secara bertahap, efisien, dan andal.
 * @param {object} jobData - Objek data pekerjaan dari antrean.
 */
function executeHealthScoreJob(jobData) {
  const BATCH_SIZE = 200; // Proses 200 VM per siklus untuk menghindari timeout
  const { stage, context } = jobData;
  const properties = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();
  const config = getBotState().config;

  try {
    if (stage === 'gather_data') {
      console.log("Health Score - Tahap 1: Mengumpulkan semua data...");
      const { headers, dataRows: allVms } = RepositoriData.getSemuaVm(config);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const { headers: logHeaders, data: recentLogs } = getCombinedLogs(ninetyDaysAgo, config);

      // Proses log riwayat
      const pkLogIndex = logHeaders.indexOf(config.HEADER_VM_PK);
      const actionLogIndex = logHeaders.indexOf(config.HEADER_LOG_ACTION);
      const historyMap = new Map();
      for (const log of recentLogs) {
        if (log[actionLogIndex] === "MODIFIKASI") {
          const pk = normalizePrimaryKey(log[pkLogIndex]);
          if (!historyMap.has(pk)) historyMap.set(pk, []);
          historyMap.get(pk).push(log);
        }
      }

      // --- BLOK BARU: Pra-pemrosesan Data Tiket ---
      const { headers: ticketHeaders, dataRows: allTickets } = RepositoriData.getSemuaTiket(config);
      const ticketVmNameIndex = ticketHeaders.indexOf(config.HEADER_TIKET_NAMA_VM);
      const ticketMap = new Map();
      const statusSelesai = (config[KONSTANTA.KUNCI_KONFIG.STATUS_TIKET_SELESAI] || []).map(s => s.toLowerCase());
      const statusTiketIndex = ticketHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_TIKET_STATUS]);

      if (ticketVmNameIndex !== -1 && statusTiketIndex !== -1) {
        for (const ticketRow of allTickets) {
          const ticketStatus = String(ticketRow[statusTiketIndex] || '').toLowerCase().trim();
          // Hanya proses tiket yang tidak berstatus selesai
          if (ticketStatus && !statusSelesai.includes(ticketStatus)) {
            const vmName = ticketRow[ticketVmNameIndex];
            if (vmName) {
              if (!ticketMap.has(vmName)) ticketMap.set(vmName, []);
              ticketMap.get(vmName).push({ /* data tiket sederhana */ });
            }
          }
        }
      }
      // --- AKHIR BLOK BARU ---

      // Simpan semua data mentah yang mahal untuk diproses ke cache
      saveLargeDataToCache('health_score_raw_vms', {headers, allVms}, 1800);
      saveLargeDataToCache('health_score_raw_history', Array.from(historyMap.entries()), 1800);
      saveLargeDataToCache('health_score_raw_tickets', Array.from(ticketMap.entries()), 1800); // <-- Simpan data tiket

      // Jadwalkan tahap berikutnya
      const nextJobData = { ...jobData, stage: 'process_batch', context: { batchIndex: 0, allScores: [] } };
      tambahTugasKeAntreanDanPicu(`job_health_score_${Date.now()}`, nextJobData);
      console.log("Health Score - Tahap 1 Selesai. Menjadwalkan Tahap 2.");
    
    } else if (stage === 'process_batch') {
      const batchIndex = context.batchIndex || 0;
      console.log(`Health Score - Tahap 2: Memproses batch #${batchIndex}`);
      
      const rawVmsData = readLargeDataFromCache('health_score_raw_vms');
      const rawHistoryData = readLargeDataFromCache('health_score_raw_history');
      const rawTicketData = readLargeDataFromCache('health_score_raw_tickets'); // <-- Baca data tiket
      
      if (!rawVmsData || !rawHistoryData || !rawTicketData) throw new Error("Cache data mentah tidak ditemukan. Proses dibatalkan.");

      const { headers, allVms } = rawVmsData;
      const historyMap = new Map(rawHistoryData);
      const ticketMap = new Map(rawTicketData); // <-- Buat Map tiket
      
      const pkIndex = headers.indexOf(config.HEADER_VM_PK);
      const vmNameIndex = headers.indexOf(config.HEADER_VM_NAME);
      
      const startIndex = batchIndex * BATCH_SIZE;
      const endIndex = startIndex + BATCH_SIZE;
      const vmBatch = allVms.slice(startIndex, endIndex);

      if (vmBatch.length === 0) {
        const finalJobData = { ...jobData, stage: 'finalize', context: { allScores: context.allScores } };
        tambahTugasKeAntreanDanPicu(`job_health_score_${Date.now()}`, finalJobData);
        console.log("Health Score - Semua batch selesai. Menjadwalkan Tahap Final.");
        return;
      }

      const batchScores = vmBatch.map(vmRow => {
        const pk = normalizePrimaryKey(vmRow[pkIndex]);
        const vmName = vmRow[vmNameIndex];
        const vmHistory = historyMap.get(pk) || [];
        const vmTickets = ticketMap.get(vmName) || []; // <-- Ambil tiket dari Map (sangat cepat)
        
        const health = calculateVmHealthScore(vmRow, headers, config, vmHistory, vmTickets);
        return { name: vmName, score: health.score, reasons: health.reasons.join(', ') };
      });

      const updatedScores = context.allScores.concat(batchScores);

      const nextJobData = { ...jobData, stage: 'process_batch', context: { batchIndex: batchIndex + 1, allScores: updatedScores } };
      tambahTugasKeAntreanDanPicu(`job_health_score_${Date.now()}`, nextJobData);
    
    } else if (stage === 'finalize') {
      console.log("Health Score - Tahap Final: Menyelesaikan laporan...");
      let allScores = context.allScores;
      allScores = allScores.filter(vm => vm.score > 0);
      allScores.sort((a, b) => b.score - a.score);
      const top10 = allScores.slice(0, 10);
      
      cache.put('health_report_cache', JSON.stringify(top10), 21600);
      
      const requesterId = cache.get('health_report_requester');
      if (requesterId) {
        const notifMessage = `✅ Laporan Kesehatan VM yang Anda minta sekarang sudah siap.\n\nSilakan jalankan kembali perintah <code>${KONSTANTA.PERINTAH_BOT.HEALTH_REPORT} vm</code> untuk melihatnya.`;
        try {
          kirimPesanTelegram(notifMessage, config, "HTML", null, requesterId);
          cache.remove('health_report_requester');
        } catch (notifError) {
          console.error(`Gagal mengirim notifikasi penyelesaian Health Score ke user ID ${requesterId}: ${notifError.message}`);
        }
      }
      
      // Hapus semua cache data mentah
      removeLargeDataFromCache('health_score_raw_vms');
      removeLargeDataFromCache('health_score_raw_history');
      removeLargeDataFromCache('health_score_raw_tickets'); // <-- Hapus cache tiket
      console.log("Health Score - Proses Selesai. Laporan final disimpan ke cache.");
    }
  } catch (e) {
    console.error(`Gagal mengeksekusi Health Score tahap '${stage}': ${e.message}`);
  }
}

/**
 * [HELPER] Mengeksekusi pekerjaan ekspor yang berasal dari menu /export.
 * Versi ini telah diperbaiki untuk menggunakan 'exportType' string yang benar.
 */
function executeMenuExportJob(jobData) {
  const { config, userData, chatId, context, statusMessageId } = jobData;
  const { exportType } = context;
  let title = exportType.replace(/_/g, " ").toUpperCase(); // Judul default

  try {
    let headers,
      data,
      highlightColumn = null;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const K = KONSTANTA.KUNCI_KONFIG;

    switch (exportType) {
      // ... (semua case dari 'log_today' hingga 'uptime_invalid' tetap sama) ...
      case "log_today":
      case "log_7_days":
      case "log_30_days": {
        const now = new Date();
        let startDate = new Date();
        if (exportType === "log_today") {
          startDate.setHours(0, 0, 0, 0);
          title = "Log Perubahan Hari Ini (Termasuk Arsip)";
        } else if (exportType === "log_7_days") {
          startDate.setDate(now.getDate() - 7);
          title = "Log Perubahan 7 Hari Terakhir (Termasuk Arsip)";
        } else {
          startDate.setDate(now.getDate() - 30);
          title = "Log Perubahan 30 Hari Terakhir (Termasuk Arsip)";
        }
        const combinedLogResult = getCombinedLogs(startDate, config);
        headers = combinedLogResult.headers;
        data = combinedLogResult.data;
        highlightColumn = config[K.HEADER_LOG_ACTION];
        break;
      }

      case "all_vms":
      case "vms_vc01":
      case "vms_vc02": {
        const { headers: vmHeaders, dataRows: allVmData } = RepositoriData.getSemuaVm(config);
        headers = vmHeaders;

        if (exportType === "all_vms") {
          data = allVmData;
          title = "Semua Data VM";
        } else {
          const vcenterHeaderName = config[K.HEADER_VM_VCENTER];
          const vcenterIndex = headers.indexOf(vcenterHeaderName);
          if (vcenterIndex === -1) throw new Error(`Kolom '${vcenterHeaderName}' tidak ditemukan.`);

          const vcenter = exportType.split("_").pop().toUpperCase();
          data = allVmData.filter((row) => String(row[vcenterIndex]).toUpperCase() === vcenter);
          title = `Data VM di ${vcenter}`;
        }
        highlightColumn = config[K.HEADER_VM_VCENTER];
        break;
      }

      case "uptime_cat_1":
      case "uptime_cat_2":
      case "uptime_cat_3":
      case "uptime_cat_4":
      case "uptime_invalid": {
        const result = processUptimeExport(exportType, config);
        if (result) {
          headers = result.headers;
          data = result.data;
          title = result.title;
          highlightColumn = config[K.HEADER_VM_UPTIME];
        }
        break;
      }

      case KONSTANTA.TIPE_INTERNAL.EKSPOR_PERINGATAN_VM: {
        const { headers: vmHeaders, dataRows: vmData } = RepositoriData.getSemuaVm(config);
        
        // Jalankan kembali logika pemeriksaan untuk mengumpulkan data peringatan
        const uptimeAlerts = cekUptimeVmKritis(config, vmHeaders, vmData);
        const vmMatiAlerts = cekVmKritisMati(config, vmHeaders, vmData);
        const semuaPeringatan = [...uptimeAlerts, ...vmMatiAlerts];

        // Ubah format data agar sesuai untuk ekspor ke sheet
        headers = ["Tipe Peringatan", "Nama VM", "Detail", "Kritikalitas"];
        data = semuaPeringatan.map(alert => [
          alert.tipe,
          alert.item,
          alert.detailRaw, // Gunakan detail mentah untuk data yang bersih
          alert.kritikalitas
        ]);
        
        title = "Laporan Detail Peringatan VM";
        highlightColumn = "Tipe Peringatan";
        break;
      }
      default:
        throw new Error(`Tipe ekspor menu tidak dikenal: ${exportType}`);
    }

    if (data && headers && headers.length > 0) {
      if (data.length > 0) {
        exportResultsToSheet(headers, data, title, config, userData, highlightColumn);
        // Edit pesan "tunggu" menjadi pesan sukses
        if (statusMessageId) {
          const successMessage = `✅ Laporan "<b>${title}</b>" telah berhasil dibuat dan dikirimkan.`;
          editMessageText(successMessage, null, chatId, statusMessageId, config);
        }
      } else {
        const noDataMessage = `ℹ️ Tidak ada data yang dapat diekspor untuk kategori "<b>${title}</b>".`;
        if (statusMessageId) {
          editMessageText(noDataMessage, null, chatId, statusMessageId, config);
        } else {
          kirimPesanTelegram(noDataMessage, config, "HTML", null, chatId);
        }
      }
    } else {
      throw new Error("Gagal mengumpulkan data atau header untuk ekspor.");
    }
  } catch (e) {
    handleCentralizedError(e, `executeMenuExportJob`, config, userData);
    // Jika terjadi error, edit pesan "tunggu" menjadi pesan gagal
    if (statusMessageId) {
      const errorMessage = `❌ Gagal memproses ekspor "<b>${title}</b>".\n\n<i>Penyebab: ${e.message}</i>`;
      editMessageText(errorMessage, null, chatId, statusMessageId, config);
    }
  }
}

/**
 * [HELPER] Mengeksekusi pekerjaan simulasi.
 */
function executeSimulationJob(jobData) {
  try {
    const { config, context, chatId } = jobData;
    let resultMessage = "";

    if (context.subCommand === "cleanup") {
      resultMessage = jalankanSimulasiCleanup(context.parameter, config);
    } else if (context.subCommand === "migrasi") {
      resultMessage = jalankanSimulasiMigrasi(context.parameter, config);
    }

    kirimPesanTelegram(resultMessage, config, "HTML", null, chatId);
  } catch (e) {
    handleCentralizedError(e, `executeSimulationJob`, jobData.config, userData || null);
  }
}

/**
 * [REVISI DENGAN STAGING] Bertindak sebagai state machine untuk alur sinkronisasi.
 * Menjalankan satu tahap, lalu menjadwalkan tahap berikutnya.
 */
function executeSyncAndReportJob(jobData) {
  const { config, chatId, userData } = jobData;
  const stage = jobData.stage || 1; // Mulai dari tahap 1 jika belum ada

  try {
    console.log(`Menjalankan pekerjaan sync_and_report, Tahap: ${stage}`);

    switch (stage) {
      case 1: // Salin Data VM
        salinDataSheet(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM], config[KONSTANTA.KUNCI_KONFIG.ID_SUMBER]);
        _lanjutkanKeTahapBerikutnya(jobData, 2);
        break;

      case 2: // Proses Perubahan VM
        processDataChanges(
          config,
          config[KONSTANTA.KUNCI_KONFIG.SHEET_VM],
          KONSTANTA.NAMA_FILE.ARSIP_VM,
          config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_PK],
          (config[KONSTANTA.KUNCI_KONFIG.KOLOM_PANTAU] || []).map((n) => ({ nama: n })),
          KONSTANTA.NAMA_ENTITAS.VM
        );
        _lanjutkanKeTahapBerikutnya(jobData, 3);
        break;

      case 3: // Salin Data Datastore
        salinDataSheet(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS], config[KONSTANTA.KUNCI_KONFIG.ID_SUMBER]);
        _lanjutkanKeTahapBerikutnya(jobData, 4);
        break;

      case 4: // Proses Perubahan Datastore
        processDataChanges(
          config,
          config[KONSTANTA.KUNCI_KONFIG.SHEET_DS],
          KONSTANTA.NAMA_FILE.ARSIP_DS,
          config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER],
          (config[KONSTANTA.KUNCI_KONFIG.KOLOM_PANTAU_DS] || []).map((n) => ({ nama: n })),
          KONSTANTA.NAMA_ENTITAS.DATASTORE
        );
        _lanjutkanKeTahapBerikutnya(jobData, 5);
        break;

      case 5: // Buat dan Kirim Laporan
        const pesanLaporan = buatLaporanHarianVM(config);
        kirimPesanTelegram(pesanLaporan, config, "HTML", null, chatId);
        console.log("Alur sinkronisasi multi-tahap selesai.");
        break;
    }
  } catch (e) {
    handleCentralizedError(e, `executeSyncAndReportJob (Tahap ${stage})`, config, userData);
    // Hentikan rantai jika ada error
  }
}

// Fungsi helper baru untuk ditambahkan di file yang sama
function _lanjutkanKeTahapBerikutnya(jobDataLama, tahapBerikutnya) {
  const jobDataBaru = { ...jobDataLama, stage: tahapBerikutnya };
  const jobKey = `job_sync_stage_${tahapBerikutnya}_${Date.now()}`;
  PropertiesService.getScriptProperties().setProperty(jobKey, JSON.stringify(jobDataBaru));
  console.log(`Menjadwalkan tahap berikutnya: ${tahapBerikutnya}`);
}
