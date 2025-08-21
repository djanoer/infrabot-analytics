/**
 * @file Utama.js
 * @author Djanoer Team
 * @date 2025-07-28
 * @version 2.0.0
 *
 * @description
 * Titik masuk (entry point) utama untuk webhook Telegram. Bertindak sebagai
 * pengendali lalu lintas yang menerima, memvalidasi, dan mendelegasikan semua
 * permintaan masuk. File ini adalah lapisan terluar yang berinteraksi langsung
 * dengan API Telegram.
 *
 * @section FUNGSI UTAMA
 * - doPost(e): Fungsi webhook utama yang menerima semua update dari Telegram.
 * - _handleRequest(e): Fungsi internal yang berisi seluruh logika pemrosesan
 * setelah validasi awal, mendelegasikan tugas ke commandHandlers atau state machine.
 * - commandHandlers: Objek yang memetakan perintah teks stateless ke fungsi
 * handler-nya, seperti /laporanharian atau /info.
 *
 * @section ARSITEKTUR & INTERAKSI
 * - Berinteraksi dengan `Konfigurasi.js` untuk token validasi.
 * - Memanggil `Utilitas.js` (`getBotState`) untuk otorisasi pengguna.
 * - Meneruskan kontrol ke `Interaksi.js` atau `StateMachine.js` untuk alur kompleks.
 */

/**
 * [REFACTORED v4.3.1] Handler untuk semua perintah bot.
 * Memperbaiki alur untuk /history, /cekhistory, dan /distribusi_vm.
 */
const commandHandlers = {
  [KONSTANTA.PERINTAH_BOT.LAPORAN]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("⏳ Membuat laporan harian...", config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      const pesanLaporan = buatLaporanHarianVM(config); // Menggunakan const untuk nilai yang tidak berubah
      editMessageText(pesanLaporan, null, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, `Perintah: /laporan-harian`, config, userDataAuth);
      if (statusMessageId) {
        editMessageText("❌ Gagal membuat laporan harian.", null, chatId, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.SYNC_LAPORAN]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    let statusMessageId = null; // Variabel untuk menyimpan ID pesan

    try {
      // 1. Kirim pesan status awal
      const timestamp = new Date().toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit" });
      const commandName = KONSTANTA.PERINTAH_BOT.SYNC_LAPORAN;
      let pesanAwal = `<b>Permintaan diterima pada pukul ${timestamp} (dari Perintah <code>${commandName}</code>)</b>\n\n⏳ Sinkronisasi penuh & pembuatan laporan telah ditambahkan ke antrean...`;

      // Kirim pesan dan simpan hasilnya untuk mendapatkan message_id
      const sentMessage = kirimPesanTelegram(pesanAwal, config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id; // Simpan ID pesan "tunggu"
      }

      // 2. Buat tiket pekerjaan (job)
      const jobData = {
        jobType: "sync_and_report",
        config: config,
        chatId: chatId,
        userData: userDataAuth,
        statusMessageId: statusMessageId, // Sertakan ID pesan di dalam data pekerjaan
      };

      // 3. Tambahkan pekerjaan ke antrean
      const jobKey = `job_manual_sync_${Date.now()}`;
      tambahTugasKeAntreanDanPicu(jobKey, jobData);

      // 4. Fungsi utama selesai di sini, bot tetap responsif.
    } catch (e) {
      handleCentralizedError(e, `Perintah: /sync (Gagal Antre)`, config, userDataAuth);
      // Jika gagal saat antre, edit pesan "tunggu" menjadi pesan error
      if (statusMessageId) {
        editMessageText("❌ Gagal menambahkan tugas ke antrean.", null, chatId, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.PROVISIONING]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("📊 Menganalisis laporan provisioning...", config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // --- PERBAIKAN DITERAPKAN DI SINI ---
      // Mengambil data dari Repositori sesuai arsitektur yang benar.
      const { headers, dataRows } = RepositoriData.getSemuaVm(config);
      // --- AKHIR PERBAIKAN ---

      // Menyalurkan data yang sudah siap ke fungsi laporan
      const laporan = generateProvisioningReport(config, dataRows, headers);

      editMessageText(laporan, null, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, `Perintah: ${KONSTANTA.PERINTAH_BOT.PROVISIONING}`, config, userDataAuth);
      if (statusMessageId) {
        editMessageText(
          `❌ Gagal membuat laporan provisioning.\n\n<b>Penyebab:</b>\n<pre>${escapeHtml(e.message)}</pre>`,
          null,
          chatId,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.CEK_TIKET]: (update, config, userDataAuth) => {
    // 1. Ambil ID chat yang benar dari pesan masuk
    const chatId = update.message.chat.id;
    let statusMessageId = null;

    try {
      // 2. Kirim pesan "tunggu" ke chat yang benar
      const sentMessage = kirimPesanTelegram("⏳ Menyiapkan laporan tiket...", config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      } else {
        throw new Error("Gagal mengirim pesan awal ke chat target.");
      }

      // 3. Buat tampilan ringkasan (logika ini tidak berubah)
      const { text, keyboard } = generateSummaryView(config);

      // 4. Edit pesan di chat yang benar
      editMessageText(text, keyboard, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, "Perintah: /cektiket", config, userDataAuth);
      if (statusMessageId) {
        // Edit pesan error di chat yang benar
        editMessageText("❌ Gagal membuat laporan tiket.", null, chatId, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.MIGRASI_CHECK]: (update, config, userDataAuth) => {
    const userId = String(update.message.from.id);
    const cacheKey = `rate_limit_migrasi_${userId}`;
    const cache = CacheService.getUserCache();

    if (cache.get(cacheKey)) {
      kirimPesanTelegram(
        "⏳ Perintah ini baru saja dijalankan. Harap tunggu beberapa saat sebelum mencoba lagi.",
        config,
        "HTML",
        null,
        update.message.chat.id
      );
      return;
    }

    // Set batasan untuk 2 menit (120 detik)
    cache.put(cacheKey, "true", 120);

    let statusMessageId = null;
    const chatId = update.message.chat.id;
    try {
      const sentMessage = kirimPesanTelegram(
        "🔬 Menganalisis rekomendasi migrasi datastore...",
        config,
        "HTML",
        null,
        chatId
      );
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // 1. Kumpulkan semua data yang diperlukan sekali. Fungsi ini sekarang ada di Analisis.js
      const { allDatastores, allVms, vmHeaders, migrationConfig } = _gatherMigrationDataSource(config);

      // 2. Suntikkan semua data ke dalam fungsi. Fungsi ini sekarang tidak mengembalikan apa-apa,
      // karena pengiriman pesan sudah ditangani di dalamnya.
      jalankanRekomendasiMigrasi(config, allDatastores, allVms, vmHeaders, migrationConfig);

      // Pesan "selesai" tidak lagi diperlukan karena pesan laporan sudah langsung dikirim.
      // Kita bisa langsung menghapus pesan "tunggu" jika mau.
      if (statusMessageId) {
        callTelegramApi("deleteMessage", { chat_id: chatId, message_id: statusMessageId }, config);
      }
    } catch (e) {
      handleCentralizedError(e, "Perintah: /migrasicheck", config, userDataAuth, userDataAuth);
      if (statusMessageId) {
        editMessageText(
          `❌ Gagal menjalankan analisis migrasi.\n\nPenyebab: <code>${escapeHtml(e.message)}</code>`,
          null,
          chatId,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.EXPORT]: (update, config) => {
    if (update.message.text.split(" ").length > 1) {
      kirimPesanTelegram(
        `❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.EXPORT}</code> tanpa argumen tambahan.`,
        config,
        "HTML"
      );
    } else {
      kirimMenuEkspor(config);
    }
  },
  [KONSTANTA.PERINTAH_BOT.CEK_VM]: (update, config, userData) => {
    // Memanggil handler baru yang benar
    handleVmSearch(update, config, userData);
  },
  [KONSTANTA.PERINTAH_BOT.CEK_CLUSTER]: (update, config, userData) => {
    const chatId = update.message.chat.id;
    const clusterName = update.message.text.split(" ").slice(1).join(" ");

    if (!clusterName) {
      kirimPesanTelegram(`Gunakan format: <code>/cekcluster [nama_cluster]</code>`, config, "HTML", null, chatId);
      return;
    }

    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram(
        `⏳ Menganalisis cluster <b>${escapeHtml(clusterName)}</b>...`,
        config,
        "HTML",
        null,
        chatId
      );
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // 1. Ambil data sekali dari cache/sheet
      const { headers: vmHeaders, dataRows: allVmData } = getVmData(config);

      // 2. Saring data di memori
      const clusterHeader = config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_CLUSTER];
      const clusterIndex = vmHeaders.indexOf(clusterHeader);
      const vmsInCluster = allVmData.filter(
        (row) => String(row[clusterIndex] || "").toLowerCase() === clusterName.toLowerCase()
      );

      if (vmsInCluster.length === 0) {
        editMessageText(
          `ℹ️ Tidak ditemukan VM di cluster "<b>${escapeHtml(clusterName)}</b>".`,
          null,
          chatId,
          statusMessageId,
          config
        );
        return;
      }

      // 3. Delegasikan analisis dan pemformatan
      const analysisResult = generateClusterAnalysis(clusterName, vmsInCluster, vmHeaders, config);
      const { pesan, keyboard } = formatClusterDetail(analysisResult, vmsInCluster, vmHeaders, config);

      // 4. Tampilkan hasil akhir
      editMessageText(pesan, keyboard, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, `Perintah: /cekcluster`, config, userData);
      if (statusMessageId) {
        editMessageText(
          `❌ Gagal menganalisis cluster.\n\nPenyebab: <code>${escapeHtml(e.message)}</code>`,
          null,
          chatId,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.HISTORY]: (update, config, userDataAuth) => {
    const pk = update.message.text.split(" ")[1] ? update.message.text.split(" ")[1].trim() : null;
    if (!pk) {
      kirimPesanTelegram(
        `Gunakan format: <code>${KONSTANTA.PERINTAH_BOT.HISTORY} [PK]</code>`,
        config,
        "HTML",
        null,
        update.message.chat.id
      );
      return;
    }
    const mockUpdate = {
      callback_query: {
        from: update.message.from,
        message: update.message,
        sessionData: { pk: pk, page: 1 },
      },
    };
    handleHistoryInteraction(mockUpdate, "show", config, userDataAuth);
  },
  [KONSTANTA.PERINTAH_BOT.CEK_HISTORY]: (update, config, userDataAuth) => {
    const mockUpdate = {
      callback_query: {
        from: update.message.from,
        message: update.message,
        sessionData: { timeframe: "today", page: 1 },
      },
    };
    handleHistoryInteraction(mockUpdate, "show", config, userDataAuth);
  },
  [KONSTANTA.PERINTAH_BOT.ARSIPKAN_LOG]: (update, config) => {
    let statusMessageId = null;
    const chatId = update.message.chat.id;

    try {
      // 1. Kirim pesan "sedang bekerja" dan simpan ID pesannya
      const sentMessage = kirimPesanTelegram(
        "⏳ Memulai proses pengarsipan... Ini mungkin memerlukan beberapa saat.",
        config,
        "HTML",
        null,
        chatId
      );

      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // 2. Jalankan pekerjaan beratnya secara langsung
      const resultLogPerubahan = cekDanArsipkanLogJikaPenuh(config);
      const resultLogStorage = cekDanArsipkanLogStorageJikaPenuh(config);

      // 3. Susun laporan hasil akhir
      let finalReport = "<b>Laporan Hasil Pengarsipan Manual</b>\n\n";
      finalReport += `• <b>Log Perubahan VM & DS:</b>\n  └ <i>${resultLogPerubahan}</i>\n\n`;
      finalReport += `• <b>Log Storage Historis:</b>\n  └ <i>${resultLogStorage}</i>`;

      // 4. Edit pesan awal dengan laporan hasil akhir
      if (statusMessageId) {
        editMessageText(finalReport, null, chatId, statusMessageId, config);
      } else {
        // Fallback jika pengiriman pesan awal gagal, kirim sebagai pesan baru
        kirimPesanTelegram(finalReport, config, "HTML", null, chatId);
      }
    } catch (e) {
      const errorMessage = `🔴 Terjadi kesalahan kritis saat menjalankan pengarsipan: ${e.message}`;
      // Jika terjadi error, edit pesan status untuk menampilkan error
      if (statusMessageId) {
        editMessageText(errorMessage, null, chatId, statusMessageId, config);
      } else {
        handleCentralizedError(e, `Perintah: /arsipkanlog`, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.CLEAR_CACHE]: (update, config) => {
    const isCleared = clearBotStateCache();
    kirimPesanTelegram(
      isCleared
        ? "✅ Cache state bot (konfigurasi & hak akses) telah berhasil dibersihkan."
        : "❌ Gagal membersihkan cache.",
      config
    );
  },
  [KONSTANTA.PERINTAH_BOT.DISTRIBUSI_VM]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram(
        "📊 Menganalisis laporan distribusi aset...",
        config,
        "HTML",
        null,
        chatId
      );
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // Mengganti panggilan ke getVmData() dengan RepositoriData.getSemuaVm()
      const { headers, dataRows } = RepositoriData.getSemuaVm(config);

      // Menyalurkan data yang sudah siap ke fungsi laporan
      const laporan = generateAssetDistributionReport(config, dataRows, headers);
      editMessageText(laporan, null, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, `Perintah: /laporan-aset`, config, userDataAuth);
      if (statusMessageId) {
        editMessageText("❌ Gagal membuat laporan distribusi.", null, chatId, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.INFO]: (update, config, userDataAuth) => {
    kirimPesanInfo(update, config, userDataAuth);
  },
  [KONSTANTA.PERINTAH_BOT.SIMULASI]: (update, config, userDataAuth) => {
    const args = update.message.text.split(" ");
    const subCommand = (args[1] || "").toLowerCase();
    const parameter = args.slice(2).join(" ");
    const chatId = update.message.chat.id;

    // Validasi input untuk memastikan formatnya benar
    if (!subCommand || !parameter || (subCommand !== "cleanup" && subCommand !== "migrasi")) {
      const K = KONSTANTA.PERINTAH_BOT;
      const errorMessage =
        "Format perintah tidak valid. Gunakan:\n" +
        `<code>${K.SIMULASI} cleanup [nama_cluster]</code>\n` +
        `<code>${K.SIMULASI} migrasi [nama_host_sumber]</code>`;
      kirimPesanTelegram(errorMessage, config, "HTML", null, chatId);
      return;
    }

    try {
      // Membuat "tiket tugas" dengan format standar dan data yang relevan
      const jobData = {
        jobType: "simulation", // Tipe pekerjaan yang akan dikenali oleh prosesor antrean
        context: {
          subCommand: subCommand,
          parameter: parameter,
        },
        config: config,
        chatId: chatId,
        // Sertakan informasi pengguna yang meminta untuk tujuan logging atau notifikasi
        userData: {
          firstName: update.message.from.first_name,
          userId: String(update.message.from.id),
        },
      };

      // Membuat kunci pekerjaan yang unik
      const jobKey = `job_simulation_${Date.now()}`;

      // Menggunakan fungsi pembantu cerdas untuk menambahkan pekerjaan dan "membangunkan" antrean
      tambahTugasKeAntreanDanPicu(jobKey, jobData);

      // Mengirim pesan konfirmasi yang jelas kepada pengguna
      const confirmationMessage =
        `✅ Permintaan simulasi <b>${escapeHtml(subCommand)}</b> diterima.\n\n` +
        "Proses kalkulasi berjalan di antrean utama. Anda akan menerima hasilnya sesaat lagi.";
      kirimPesanTelegram(confirmationMessage, config, "HTML", null, chatId);
    } catch (e) {
      // Konteks error sekarang dinamis sesuai dengan sub-perintah yang dijalankan
      const commandContext = `Perintah /simulasi ${subCommand} (Membuat Tugas)`;
      handleCentralizedError(e, commandContext, config, userDataAuth);
    }
  },
  [KONSTANTA.PERINTAH_BOT.GRAFIK]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    const args = update.message.text.split(" ");
    const tipeGrafik = (args[1] || "").toLowerCase();

    if (!tipeGrafik || (tipeGrafik !== "kritikalitas" && tipeGrafik !== "environment")) {
      kirimPesanTelegram(
        "Format perintah tidak valid. Gunakan:\n" +
          "<code>/grafik kritikalitas</code>\n" +
          "<code>/grafik environment</code>",
        config,
        "HTML",
        null,
        chatId
      );
      return;
    }

    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("🎨 Membuat grafik, harap tunggu...", config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      const chartBlob = buatGrafikDistribusi(tipeGrafik, config);
      const caption = `Berikut adalah grafik distribusi VM berdasarkan <b>${tipeGrafik}</b>.`;

      const photoSent = kirimFotoTelegram(chartBlob, caption, config, chatId);

      // Hapus pesan "tunggu" setelah foto berhasil terkirim
      if (photoSent && photoSent.ok) {
        if (statusMessageId) {
          callTelegramApi("deleteMessage", { chat_id: chatId, message_id: statusMessageId }, config);
        }
      } else {
        throw new Error("Gagal mengirim gambar grafik ke Telegram.");
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah /grafik`, config, userDataAuth);
      if (statusMessageId) {
        editMessageText(
          `❌ <b>Gagal membuat grafik.</b>\n\n<b>Penyebab:</b>\n<pre>${escapeHtml(e.message)}</pre>`,
          null,
          chatId,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.LOG_REPORT]: (update, config) => {
    const repliedToMessage = update.message.reply_to_message;
    if (!repliedToMessage || !repliedToMessage.text) {
      kirimPesanTelegram(
        "❌ Perintah ini harus digunakan dengan cara me-reply (membalas) pesan laporan storage yang ingin Anda catat.",
        config,
        "HTML"
      );
      return;
    }

    const textBlock = repliedToMessage.text;
    try {
      // 1. Jalankan prosesnya terlebih dahulu
      const result = processAndLogReport(textBlock, config);

      if (result.success) {
        const successMessage = `✅ Data untuk storage <b>${escapeHtml(result.storageName)}</b> telah berhasil dicatat.`;
        // 2. Kirim satu pesan konfirmasi setelah berhasil
        kirimPesanTelegram(successMessage, config, "HTML", null, update.message.chat.id);
      }
    } catch (e) {
      // Penanganan error sekarang mengirim pesan error langsung
      handleCentralizedError(e, `Perintah /catatlaporanstorage`, config);
      kirimPesanTelegram(
        `⚠️ Gagal memproses laporan.\n\nPenyebab: <i>${e.message}</i>`,
        config,
        "HTML",
        null,
        update.message.chat.id
      );
    }
  },
  [KONSTANTA.PERINTAH_BOT.REKOMENDASI_SETUP]: (update, config, userDataAuth) => {
    mulaiPercakapanRekomendasi(update.message.chat.id, String(update.message.from.id), config);
  },
  [KONSTANTA.PERINTAH_BOT.CEK_STORAGE]: (update, config, userData) => {
    const chatId = update.message.chat.id;
    const storageType = update.message.text.split(" ").slice(1).join(" ");

    // Jika TIDAK ada argumen, jalankan perilaku lama (laporan ringkasan)
    if (!storageType) {
      let statusMessageId = null;
      try {
        const sentMessage = kirimPesanTelegram("📊 Menganalisis utilisasi storage...", config, "HTML", null, chatId);
        if (sentMessage && sentMessage.ok) {
          statusMessageId = sentMessage.result.message_id;
        }
        const report = generateStorageUtilizationReport(config); // Memanggil fungsi lama
        editMessageText(report, null, chatId, statusMessageId, config);
      } catch (e) {
        handleCentralizedError(e, `Perintah /cekstorage (ringkasan)`, config, userData);
        if (statusMessageId) {
          editMessageText(
            `❌ Gagal membuat laporan utilisasi storage.\n\nPenyebab: <code>${escapeHtml(e.message)}</code>`,
            null,
            chatId,
            statusMessageId,
            config
          );
        }
      }
      return;
    }

    // Jika ADA argumen, mulai alur kerja interaktif yang baru
    handleStorageExplorer(update, "start", config, userData);
  },
  [KONSTANTA.PERINTAH_BOT.STATUS]: (update, config) => {
    // Tambahkan blok ini
    const pesanStatus = jalankanPemeriksaanKesehatan();
    kirimPesanTelegram(pesanStatus, config, "HTML");
  },
  [KONSTANTA.PERINTAH_BOT.MANAGE_CONFIG]: (update, config, userData) => {
    // Memulai alur kerja interaktif untuk manajemen konfigurasi
    handleConfigManager(update, "start", config, userData);
  },
  [KONSTANTA.PERINTAH_BOT.HEALTH_REPORT]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    const userId = String(update.message.from.id);
    let statusMessageId = null;
    const args = update.message.text.split(" ");
    const subCommand = (args[1] || "").toLowerCase();

    try {
      // Skenario 1: Pengguna meminta laporan skor kesehatan VM (/health vm)
      if (subCommand === "vm") {
        const cachedReport = CacheService.getScriptCache().get("health_report_cache");

        if (cachedReport) {
          // Jika cache ada, langsung tampilkan laporan
          const top10 = JSON.parse(cachedReport);
          let reportMessage = "🏥 <b>Laporan Kesehatan VM (Top 10 Paling Berisiko)</b>\n";
          reportMessage += "<i>Data diperbarui secara berkala oleh sistem.</i>\n\n";

          if (top10.length === 0) {
            reportMessage += "✅ Semua VM dalam kondisi optimal dan tidak teridentifikasi memiliki risiko.";
          } else {
            top10.forEach((vm, index) => {
              reportMessage += `<b>${index + 1}. ${escapeHtml(vm.name)}</b>\n`;
              reportMessage += `   └ Skor Risiko: <code>${vm.score}/100</code>\n`;
              reportMessage += `   └ <i>Penyebab: ${escapeHtml(vm.reasons)}</i>\n\n`;
            });
          }
          kirimPesanTelegram(reportMessage, config, "HTML", null, chatId);
        } else {
          // Jika cache kosong, tawarkan untuk memulai kalkulasi
          const message =
            "ℹ️ Laporan skor kesehatan VM sedang tidak tersedia.\n\nApakah Anda ingin memulai proses kalkulasi sekarang? (Mungkin memerlukan beberapa menit)";
          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: "✅ Ya, Mulai Kalkulasi Sekarang",
                  callback_data: CallbackHelper.build(
                    "health_machine",
                    "trigger_calc",
                    { requesterId: userId },
                    config
                  ),
                },
                {
                  text: "❌ Batal",
                  callback_data: CallbackHelper.build("health_machine", "cancel", {}, config),
                },
              ],
            ],
          };
          kirimPesanTelegram(message, config, "HTML", keyboard, chatId);
        }
      } else {
        // Skenario 2: Perintah default (/health), menjalankan Laporan Kondisi Umum
        const sentMessage = kirimPesanTelegram(
          "🔬 Memulai pemeriksaan kondisi sistem...",
          config,
          "HTML",
          null,
          chatId
        );
        if (sentMessage && sentMessage.ok) {
          statusMessageId = sentMessage.result.message_id;
        }

        const { pesan, keyboard } = jalankanPemeriksaanAmbangBatas(config);

        if (statusMessageId) {
          editMessageText(pesan, keyboard, chatId, statusMessageId, config);
        } else {
          kirimPesanTelegram(pesan, config, "HTML", keyboard, chatId);
        }
      }
    } catch (e) {
      const commandContext = `Perintah: /health ${subCommand}`.trim();
      handleCentralizedError(e, commandContext, config, userDataAuth);
      if (statusMessageId) {
        editMessageText("❌ Gagal menjalankan pemeriksaan kondisi.", null, chatId, statusMessageId, config);
      }
    }
  },
};

// djanoer/infrabot-analytics/infrabot-analytics-c2ee3769cab1b649c1c5aa43c9e5759fc9c4e2bc/Utama.js

/**
 * [VERSI PRODUKSI FINAL - SUPER ROBUST] Catch-all super tangguh dengan pembacaan properti yang aman.
 * Mampu menangani kegagalan bahkan saat getBotState() gagal total.
 */
function doPost(e) {
  try {
    // Jalankan logika utama pemrosesan permintaan
    _handleRequest(e);
  } catch (err) {
    // --- BLOK PENANGANAN ERROR DARURAT ---
    console.error("--- SEBUAH ERROR KRITIS TERJADI DI doPost (LEVEL TERTINGGI) ---");
    console.error(`PESAN ERROR ASLI: ${err.message}`);
    console.error(`STACK TRACE: ${err.stack}`);

    try {
      // Jangan bergantung pada getBotState() yang mungkin gagal.
      // Baca langsung dari PropertiesService sebagai upaya terakhir.
      const properties = PropertiesService.getScriptProperties();
      const botToken = properties.getProperty("TELEGRAM_BOT_TOKEN");

      // Karena config gagal dimuat, kita tidak tahu environment-nya.
      // Kirim notifikasi ke kedua chat ID (DEV dan PROD) untuk memastikan pesan sampai.
      const prodChatId = properties.getProperty("TELEGRAM_CHAT_ID");
      const devChatId = properties.getProperty("TELEGRAM_CHAT_ID_DEV");
      const targetChatIds = [...new Set([prodChatId, devChatId])].filter(Boolean); // Hapus duplikat & nilai kosong

      if (botToken && targetChatIds.length > 0) {
        const errorMessage =
          `🔴 <b>Peringatan Kritis di Level Tertinggi</b>\n\n` +
          `Bot mengalami error fatal yang tidak tertangani saat inisialisasi awal. Ini kemungkinan besar disebabkan oleh masalah pada sheet "Konfigurasi" atau "Hak Akses".\n\n` +
          `<i>Pesan Error:</i>\n<pre>${escapeHtml(err.message)}</pre>\n\n` +
          `Mohon segera periksa log eksekusi Apps Script untuk detail lengkap.`;

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        targetChatIds.forEach((chatId) => {
          const payload = {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify({
              chat_id: String(chatId),
              text: errorMessage,
              parse_mode: "HTML",
            }),
          };
          UrlFetchApp.fetch(url, payload);
        });
      }
    } catch (notificationError) {
      // Jika bahkan notifikasi darurat pun gagal, catat di log.
      console.error("GAGAL TOTAL: Tidak dapat mengirim notifikasi error kritis. " + notificationError.message);
    }
  } finally {
    // Selalu kembalikan respons OK ke Telegram untuk mencegah pengiriman ulang.
    return HtmlService.createHtmlOutput("OK");
  }
}

/**
 * [BARU] Fungsi internal yang berisi seluruh logika pemrosesan permintaan.
 * Memisahkan logika dari penanganan error utama di doPost.
 */
function _handleRequest(e) {
  if (!e || !e.postData || !e.postData.contents) {
    console.warn("Menerima permintaan webhook kosong atau tidak valid dari Telegram.");
    return;
  }

  // Ambil state sekali di awal
  const { config, userAccessMap } = getBotState();

  if (!e.parameter.token || e.parameter.token !== config.WEBHOOK_BOT_TOKEN) {
    console.error("PERINGATAN KEAMANAN: Permintaan ke webhook ditolak karena token tidak valid.");
    return;
  }

  const update = JSON.parse(e.postData.contents);

  // === PENANGANAN CALLBACK QUERY ===
  if (update.callback_query) {
    const userEvent = update.callback_query;

    // Gerbang validasi paling awal
    if (!userEvent || !userEvent.id || !userEvent.from || !userEvent.from.id) {
      console.error("Menerima callback query yang tidak lengkap. Mengabaikan. Isi:", JSON.stringify(update));
      if (userEvent && userEvent.id) {
        answerCallbackQuery(userEvent.id, config, "Gagal: callback tidak lengkap.");
      }
      return;
    }

    const callbackQueryId = userEvent.id;
    const callbackData = userEvent.data;

    if (!userEvent.message) {
      console.warn("Diterima callback query tanpa objek 'message'. Mengabaikan.");
      answerCallbackQuery(callbackQueryId, config);
      return;
    }

    const userData = userAccessMap.get(String(userEvent.from.id));
    if (!userData) {
      const firstName = userEvent.from.first_name;
      const userMentionText = firstName ? escapeHtml(firstName) : "Anda";

      let message = `❌ Maaf ${userMentionText}, Anda tidak memiliki hak akses untuk fitur ini.\n\n`;
      message += `Jika Anda seharusnya memiliki akses, silakan hubungi administrator atau gunakan perintah:\n<code>${KONSTANTA.PERINTAH_BOT.DAFTAR} email.anda@domain.com</code>`;

      kirimPesanTelegram(message, config, "HTML", null, userEvent.message.chat.id);
      answerCallbackQuery(callbackQueryId, config);
      return;
    }
    userData.firstName = userEvent.from.first_name;
    userData.userId = String(userEvent.from.id);

    const parts = callbackData.split(":");
    const machineName = parts[0];
    const action = parts[1];
    const sessionId = parts[2];

    if (machineName && action && sessionId) {
      const sessionData = getCallbackSession(sessionId, config);
      if (sessionData) {
        userEvent.sessionData = sessionData;

        switch (machineName) {
          case "search_machine":
            searchMachine(update, action, config, userData);
            break;
          case "history_machine":
            handleHistoryInteraction(update, action, config, userData);
            break;
          case "note_machine":
            noteMachine(update, action, config);
            break;
          case "export_machine":
            exportMachine(update, config, userData);
            break;
          case "rekomendasi_machine":
            rekomendasiMachine(update, action, config);
            break;
          case "ticket_machine":
            ticketMachine(update, action, config);
            break;
          case "registration_machine":
            registrationMachine(update, action, config);
            break;
          case "storage_explorer_machine":
            handleStorageExplorer(update, action, config, userData);
            break;
          case "config_machine":
            handleConfigManager(update, action, config, userData);
            break;
          case "kondisi_machine":
            kondisiMachine(update, action, config, userData);
            break;
          case "health_machine":
            healthMachine(update, action, config, userData);
            break;
          default:
            console.warn(`Mesin tidak dikenal: ${machineName}`);
        }
      } else {
        const errorMessage =
          "⚠️ <b>Sesi Tidak Ditemukan</b>\n\nTombol ini mungkin sudah kedaluwarsa atau tidak valid. Hal ini sering terjadi jika skrip diedit dan disimpan setelah tombol dibuat.\n\nSilakan jalankan kembali perintah awal.";
        editMessageText(errorMessage, null, userEvent.message.chat.id, userEvent.message.message_id, config);
        answerCallbackQuery(callbackQueryId, config, "Sesi tidak valid. Harap jalankan ulang perintah.");
      }
    } else {
      console.warn("Menerima callback dengan format yang tidak dikenal:", callbackData);
      answerCallbackQuery(callbackQueryId, config, "Aksi ini menggunakan format lama dan tidak didukung.");
    }

    if (!callbackData.includes("export_machine")) {
      answerCallbackQuery(callbackQueryId, config);
    }

    // === PENANGANAN PESAN TEKS ===
  } else if (update.message && update.message.text) {
    const userEvent = update.message;
    const text = userEvent.text;
    const userId = String(userEvent.from.id);

    const userState = getUserState(userId);
    if (userState && userState.action) {
      routeToStateMachineByState(update, userState, config, userAccessMap);
      return;
    }

    if (!text.startsWith("/")) {
      return;
    }

    const commandParts = text.split(" ");
    const command = commandParts[0].toLowerCase().split("@")[0];

    if (command === KONSTANTA.PERINTAH_BOT.DAFTAR) {
      const existingUserData = userAccessMap.get(String(userEvent.from.id));
      if (existingUserData && existingUserData.email) {
        kirimPesanTelegram(
          `Halo ${escapeHtml(userEvent.from.first_name)}, Anda sudah terdaftar.`,
          config,
          "HTML",
          null,
          userEvent.chat.id
        );
        return HtmlService.createHtmlOutput("OK");
      }
      const email = commandParts[1];
      if (!email || !email.includes("@") || !email.includes(".")) {
        kirimPesanTelegram(
          `Format salah. Gunakan:\n<code>/daftar email.anda@domain.com</code>`,
          config,
          "HTML",
          null,
          userEvent.chat.id
        );
        return HtmlService.createHtmlOutput("OK");
      }
      const sessionData = {
        userId: userEvent.from.id,
        firstName: userEvent.from.first_name,
        username: userEvent.from.username || "N/A",
        email: email,
      };
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "✅ Setujui User",
              callback_data: CallbackHelper.build("registration_machine", "approve_user", sessionData, config),
            },
            {
              text: "👑 Jadikan Admin",
              callback_data: CallbackHelper.build("registration_machine", "approve_admin", sessionData, config),
            },
          ],
          [
            {
              text: "❌ Tolak",
              callback_data: CallbackHelper.build("registration_machine", "reject", sessionData, config),
            },
          ],
        ],
      };
      let notifPesan = `<b>🔔 Permintaan Pendaftaran Baru</b>\n\n`;
      notifPesan += `<b>Nama:</b> ${escapeHtml(sessionData.firstName)}\n`;
      notifPesan += `<b>Username:</b> @${sessionData.username}\n`;
      notifPesan += `<b>User ID:</b> <code>${sessionData.userId}</code>\n`;
      notifPesan += `<b>Email:</b> <code>${escapeHtml(sessionData.email)}</code>`;
      kirimPesanTelegram(notifPesan, config, "HTML", keyboard);
      kirimPesanTelegram(
        `Terima kasih, ${escapeHtml(sessionData.firstName)}. Permintaan Anda telah diteruskan...`,
        config,
        "HTML",
        null,
        userEvent.chat.id
      );
      return HtmlService.createHtmlOutput("OK");
    }

    const userDataAuth = userAccessMap.get(userId);
    if (!userDataAuth || !userDataAuth.email) {
      const firstName = userEvent.from.first_name;
      const userMentionText = firstName
        ? `<a href="tg://user?id=${userEvent.from.id}">${escapeHtml(firstName)}</a>`
        : "Anda";

      let message = `❌ Maaf ${userMentionText}, Anda tidak memiliki hak akses untuk menggunakan bot ini.\n\n`;
      message += `Jika Anda seharusnya memiliki akses, silakan hubungi administrator atau gunakan perintah:\n<code>${KONSTANTA.PERINTAH_BOT.DAFTAR} email.anda@domain.com</code>`;

      kirimPesanTelegram(message, config, "HTML");
      return;
    }
    userDataAuth.firstName = userEvent.from.first_name;
    userDataAuth.userId = userEvent.from.id;

    const commandFunction = commandHandlers[command];
    if (commandFunction) {
      const isAdminCommand = (KONSTANTA.PERINTAH_ADMIN || []).includes(command);
      const userRole = userDataAuth.role || "User";
      if (isAdminCommand && userRole.toLowerCase() !== "admin") {
        kirimPesanTelegram(
          `❌ Maaf, perintah <code>${escapeHtml(command)}</code> hanya dapat diakses oleh Admin.`,
          config,
          "HTML"
        );
      } else {
        commandFunction(update, config, userDataAuth);
      }
    } else {
      const closestCommand = findClosestCommand(command);
      let errorMessage = `❓ Perintah <code>${escapeHtml(command)}</code> tidak ditemukan.`;
      if (closestCommand) {
        errorMessage += `\n\nMungkin maksud Anda: <b>${closestCommand}</b>`;
      } else {
        errorMessage += `\n\nGunakan ${KONSTANTA.PERINTAH_BOT.INFO} untuk melihat daftar perintah yang valid.`;
      }
      kirimPesanTelegram(errorMessage, config, "HTML");
    }
  }
}

/**
 * [REVISI FINAL] Mengirim pesan bantuan (/help) yang dinamis dan sadar peran.
 */
function kirimPesanInfo(update, config, userData) {
  const K = KONSTANTA.PERINTAH_BOT;
  const chatId = update.message.chat.id;

  let infoPesan =
    "<b>Infrabot Help Desk</b>\n\n" +
    "Berikut adalah daftar perintah yang tersedia:\n\n" +
    "📊 <b>Reports & Analysis</b>\n" +
    `<code>${K.LAPORAN}</code> - Laporan operasional harian.\n` +
    `<code>${K.PROVISIONING}</code> - Laporan detail alokasi sumber daya.\n` +
    `<code>${K.DISTRIBUSI_VM}</code> - Laporan distribusi aset VM.\n` +
    `<code>${K.CEK_KONDISI}</code> - Analisis anomali sistem (default).\n` +
    `<code>${K.HEALTH_REPORT} vm</code> - Menampilkan laporan skor kesehatan VM.\n` +
    `<code>${K.CEK_STORAGE}</code> - Analisis utilisasi storage.\n` +
    `<code>${K.MIGRASI_CHECK}</code> - Analisis & rekomendasi migrasi.\n\n` +
    "🔍 <b>Search & History</b>\n" +
    `<code>${K.CEK_VM} [Nama/IP/PK]</code> - Cari detail VM.\n` +
    `<code>${K.HISTORY} [PK]</code> - Lacak riwayat lengkap sebuah VM.\n` +
    `<code>${K.CEK_HISTORY}</code> - Lihat log perubahan hari ini.\n` +
    `<code>${K.CEK_CLUSTER} [nama]</code> - Analisis mendalam sebuah cluster.\n\n` +
    "⚙️ <b>Interactive & Actions</b>\n" +
    `<code>${K.REKOMENDASI_SETUP}</code> - Panduan rekomendasi setup VM baru.\n` +
    `<code>${K.CEK_TIKET}</code> - Buka menu monitoring tiket.\n` +
    `<code>${K.GRAFIK} [tipe]</code> - Tampilkan data dalam bentuk grafik.\n` +
    `<code>${K.SIMULASI} [tipe]</code> - Jalankan skenario perencanaan.\n` +
    `<code>${K.LOG_REPORT}</code> - (Reply) Catat laporan storage manual.\n\n` +
    "🛠️ <b>Utilities</b>\n" +
    `<code>${K.EXPORT}</code> - Buka menu ekspor data ke Google Sheet.\n` +
    `<code>${K.STATUS}</code> - Pemeriksaan kesehatan teknis bot.\n` +
    `<code>${K.DAFTAR} [email]</code> - Minta hak akses untuk menggunakan bot.\n` +
    `<code>${K.INFO}</code> - Tampilkan pesan bantuan ini.`;

  const userRole = userData && userData.role ? userData.role.toLowerCase() : "user";
  if (userRole === "admin") {
    infoPesan +=
      "\n\n" +
      "🛡️ <b>Administrative Commands</b>\n" +
      `<code>${K.SYNC_LAPORAN}</code> - Sinkronisasi data & laporan lengkap.\n` +
      `<code>${K.ARSIPKAN_LOG}</code> - Jalankan pengarsipan semua log manual.\n` +
      `<code>${K.CLEAR_CACHE}</code> - Bersihkan cache hak akses & konfigurasi.\n` +
      `<code>${K.MANAGE_CONFIG}</code> - Kelola konfigurasi bot secara interaktif.`;
  }

  kirimPesanTelegram(infoPesan, config, "HTML", null, chatId);
}

/**
 * [FINAL v1.3.1] Membuat menu kustom di UI Spreadsheet saat dibuka.
 * Versi ini menambahkan sub-menu khusus "Menu Admin" untuk perintah-perintah
 * yang bersifat administratif dan pemeliharaan.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚙️ Menu Bot")
    // Menu untuk pengguna umum atau tes cepat
    .addItem("1. Jalankan Laporan Migrasi Saja", "jalankanLaporanMigrasiDariMenu")
    .addSeparator()

    // Sub-menu khusus untuk Administrator Bot
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu("⚙️ Menu Admin")
        .addItem("Jalankan Sinkronisasi & Laporan Penuh", "runDailyJobsWithUiFeedback")
        .addItem("Jalankan Pengarsipan Log Perubahan VM & DS", "runChangeLogArchivingWithUiFeedback")
        .addItem("Jalankan Pengarsipan Log Storage", "runStorageLogArchivingWithUiFeedback")
        .addItem("Bersihkan Cache Bot (State & Akses)", "clearBotStateCacheWithUiFeedback")
    )
    .addSeparator()

    // Sub-menu untuk setup dan diagnostik
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu("🛠️ Setup & Diagnostik")
        .addItem("Tes Koneksi ke Telegram", "tesKoneksiTelegram")
        .addItem("SETUP: Set Token (Interaktif)", "setupSimpanTokenInteraktif")
        .addItem("Hapus Webhook Saat Ini", "hapusWebhook")
        .addSeparator() // Tambahkan pemisah agar rapi
        .addItem("Jalankan Pengujian Unit", "jalankanSemuaTes")
    )
    .addToUi();
}

// === FUNGSI-FUNGSI WRAPPER UNTUK UI FEEDBACK ===

/**
 * [REFACTORED V.1.1] Mendelegasikan pekerjaan sinkronisasi penuh ke antrean
 * untuk menghindari timeout saat dijalankan dari menu.
 */
function runDailyJobsWithUiFeedback() {
  const { config } = getBotState();

  SpreadsheetApp.getUi().alert(
    "Permintaan Diterima",
    "Sinkronisasi penuh dan pembuatan laporan telah ditambahkan ke antrean dan akan diproses di latar belakang. Anda akan menerima laporan di Telegram setelah selesai.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  const targetChatId = config.ENVIRONMENT === "DEV" ? config.TELEGRAM_CHAT_ID_DEV : config.TELEGRAM_CHAT_ID;
  let statusMessageId = null;

  const timestamp = new Date().toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit" });
  let pesanAwal = `<b>Permintaan diterima pada pukul ${timestamp} (dari Menu Spreadsheet)</b>\n\n⏳ Sinkronisasi penuh & pembuatan laporan telah ditambahkan ke antrean...`;

  const sentMessage = kirimPesanTelegram(pesanAwal, config, "HTML", null, targetChatId);
  if (sentMessage && sentMessage.ok) {
    statusMessageId = sentMessage.result.message_id;
  }

  const jobData = {
    jobType: "sync_and_report",
    config: config,
    chatId: targetChatId,
    statusMessageId: statusMessageId,
    userData: { firstName: "Menu Spreadsheet" },
  };

  const jobKey = `job_manual_sync_${Date.now()}`;
  tambahTugasKeAntreanDanPicu(jobKey, jobData);
}

/**
 * [WRAPPER] Mengganti nama agar lebih spesifik untuk Log Perubahan.
 */
function runChangeLogArchivingWithUiFeedback() {
  SpreadsheetApp.getUi().alert(
    "Memulai Proses...",
    "Pengecekan dan pengarsipan Log Perubahan sedang berjalan...",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  try {
    const resultMessage = cekDanArsipkanLogJikaPenuh(); // Fungsi lama
    SpreadsheetApp.getUi().alert("Proses Selesai", resultMessage, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Gagal!", `Terjadi kesalahan: ${e.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * [WRAPPER BARU v1.6.0] Menjalankan pengarsipan Log Storage dan memberikan feedback ke UI.
 */
function runStorageLogArchivingWithUiFeedback() {
  SpreadsheetApp.getUi().alert(
    "Memulai Proses...",
    "Pengecekan dan pengarsipan Log Storage sedang berjalan...",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  try {
    const resultMessage = cekDanArsipkanLogStorageJikaPenuh();
    SpreadsheetApp.getUi().alert("Proses Selesai", resultMessage, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Gagal!", `Terjadi kesalahan: ${e.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * [WRAPPER] Menjalankan clearBotStateCache dan memberikan feedback ke UI.
 */
function clearBotStateCacheWithUiFeedback() {
  const isCleared = clearBotStateCache();
  if (isCleared) {
    SpreadsheetApp.getUi().alert(
      "Sukses!",
      "Cache state bot (konfigurasi & hak akses) telah berhasil dibersihkan.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } else {
    SpreadsheetApp.getUi().alert(
      "Gagal!",
      "Gagal membersihkan cache. Periksa log untuk detail.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * [WRAPPER] Menjalankan laporan migrasi dan memberikan feedback ke UI.
 * (Fungsi ini sudah ada sebelumnya, hanya dipindahkan agar berkelompok)
 */
function jalankanLaporanMigrasiDariMenu() {
  SpreadsheetApp.getUi().alert(
    "Memulai Proses...",
    "Analisis rekomendasi migrasi sedang berjalan di latar belakang...",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  try {
    const laporan = jalankanRekomendasiMigrasi();
    kirimPesanTelegram(laporan, getBotState().config, "HTML");
    SpreadsheetApp.getUi().alert(
      "Terkirim!",
      "Laporan analisis migrasi telah dikirim ke Telegram.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert(
      "Gagal!",
      `Gagal membuat laporan migrasi. Error: ${e.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

function kirimMenuEkspor(config) {
  const message = "<b>Pusat Laporan Ekspor</b>\n\nSilakan pilih data yang ingin Anda ekspor:";

  const createExportCallback = (exportType) => {
    // Menggunakan CallbackHelper untuk membuat callback yang stateful
    return CallbackHelper.build("export_machine", "run", { type: exportType }, config);
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "--- Log Perubahan ---", callback_data: "ignore" }],
      [
        { text: "📄 Log Hari Ini", callback_data: createExportCallback("log_today") },
        { text: "📅 Log 7 Hari", callback_data: createExportCallback("log_7_days") },
      ],
      [{ text: "🗓️ Log 30 Hari", callback_data: createExportCallback("log_30_days") }],
      [{ text: "--- VM berdasarkan Uptime ---", callback_data: "ignore" }],
      [
        { text: "⚙️ < 1 Thn", callback_data: createExportCallback("uptime_cat_1") },
        { text: "⚙️ 1-2 Thn", callback_data: createExportCallback("uptime_cat_2") },
      ],
      [
        { text: "⚙️ 2-3 Thn", callback_data: createExportCallback("uptime_cat_3") },
        { text: "⚙️ > 3 Thn", callback_data: createExportCallback("uptime_cat_4") },
      ],
      [{ text: "❓ Uptime Tdk Valid", callback_data: createExportCallback("uptime_invalid") }],
      [{ text: "--- Data Master VM ---", callback_data: "ignore" }],
      [
        { text: "📄 Semua VM", callback_data: createExportCallback("all_vms") },
        { text: "🏢 VM di VC01", callback_data: createExportCallback("vms_vc01") },
        { text: "🏢 VM di VC02", callback_data: createExportCallback("vms_vc02") },
      ],
    ],
  };
  kirimPesanTelegram(message, config, "HTML", keyboard);
}
