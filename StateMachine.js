/**
 * @file StateMachine.js
 * @author Djanoer Team
 * @date 2023-09-05
 *
 * @description
 * Mengelola alur interaksi pengguna yang kompleks dan multi-langkah melalui
 * implementasi "Mesin Keadaan" (State Machines). File ini merutekan callback
 * dari tombol inline ke fungsi yang tepat berdasarkan konteks dan aksi.
 *
 * @section FUNGSI UTAMA
 * - searchMachine(...): Menangani semua interaksi terkait pencarian, detail, dan daftar VM.
 * - noteMachine(...): Mengelola alur untuk menambah, mengedit, dan menghapus catatan VM.
 * - rekomendasiMachine(...): Menavigasi alur percakapan terpandu untuk rekomendasi setup VM.
 * - ticketMachine(...): Mengendalikan interaksi untuk menu monitoring tiket utilisasi.
 */

/**
 * [FINAL] Mesin Keadaan untuk semua interaksi yang berhubungan dengan pencarian,
 * detail, dan daftar VM (baik dari hasil pencarian maupun dari cluster/datastore).
 * Versi ini telah disederhanakan dan tidak lagi menggunakan PAGINATION_ACTIONS.
 */
function searchMachine(update, action, config, userData) {
    const userEvent = update.callback_query;
    const sessionData = userEvent.sessionData;
    const chatId = userEvent.message.chat.id;
    const messageId = userEvent.message.message_id;

    // Logika Router yang sudah disederhanakan
    if (action === 'show_list' || action === 'navigate_list' || action === 'export_list') {
        const explicitAction = action === 'export_list' ? 'export' : 'navigate';
        handlePaginatedVmList(update, explicitAction, config, userData);

    } else if (action === 'navigate_search_results' || action === 'export_search_results') {
        const explicitAction = action === 'export_search_results' ? 'export' : 'navigate';
        handleVmSearchResults(update, explicitAction, config, userData);

    } else if (action === 'back_to_detail') {
        const pk = sessionData.pk;
        const { headers, results } = searchVmOnSheet(pk, config);
        if (results.length > 0) {
            const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
            editMessageText(pesan, keyboard, chatId, messageId, config);
        } else {
            editMessageText(`❌ VM dengan PK <code>${escapeHtml(pk)}</code> tidak lagi ditemukan.`, null, chatId, messageId, config);
        }
    } else {
        console.warn("Aksi tidak dikenal di searchMachine:", action);
    }
}

/**
 * [BARU] Mesin Keadaan untuk semua interaksi yang berhubungan dengan catatan VM.
 */
function noteMachine(update, action, config) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const chatId = userEvent.message.chat.id;
  const messageId = userEvent.message.message_id;
  const userId = String(userEvent.from.id);
  const pk = sessionData.pk;
  
  if (action === 'prompt_add') {
    // Simpan state pengguna, menandakan bot sedang menunggu input teks untuk catatan
    setUserState(userId, { action: "AWAITING_NOTE_INPUT", pk: pk, messageId: messageId });
    
    const promptMessage = `✏️ Silakan kirimkan teks catatan untuk VM dengan PK: <code>${escapeHtml(pk)}</code>.\n\nKirim "batal" untuk membatalkan.`;
    editMessageText(promptMessage, null, chatId, messageId, config);

  } else if (action === 'prompt_delete') {
    const confirmationText = `❓ Yakin ingin menghapus catatan untuk VM <code>${escapeHtml(pk)}</code>?`;
    const confirmationSessionId = createCallbackSession({ pk: pk }, config);
    const confirmationKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Ya, Hapus", callback_data: `note_machine:confirm_delete:${confirmationSessionId}` },
          { text: "❌ Batal", callback_data: `search_machine:back_to_detail:${confirmationSessionId}` },
        ],
      ],
    };
    editMessageText(confirmationText, confirmationKeyboard, chatId, messageId, config);

  } else if (action === 'confirm_delete') {
    if (deleteVmNote(pk)) {
      // Refresh tampilan detail VM setelah berhasil hapus
      const { headers, results } = searchVmOnSheet(pk, config);
      if (results.length > 0) {
        const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
        editMessageText("✅ Catatan berhasil dihapus.\n\n" + pesan, keyboard, chatId, messageId, config);
      } else {
        editMessageText(`✅ Catatan berhasil dihapus.`, null, chatId, messageId, config);
      }
    } else {
      editMessageText(`❌ Gagal menghapus catatan.`, null, chatId, messageId, config);
    }
  } else {
    console.warn("Aksi tidak dikenal di noteMachine:", action);
  }
}

function mulaiPercakapanRekomendasi(chatId, userId, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const kritikalitasOptions = (config[K.KATEGORI_KRITIKALITAS] || "Critical,High,Medium,Low").split(",").map(item => item.trim());

  const keyboardRows = kritikalitasOptions.map(opt => {
    const sessionData = { step: 'io', requirements: { kritikalitas: opt } };
    return [{ 
      text: opt, 
      callback_data: CallbackHelper.build('rekomendasi_machine', 'handle_step', sessionData, config) 
    }];
  });

  keyboardRows.push([{ 
    text: "❌ Batal", 
    callback_data: CallbackHelper.cancel('rekomendasi_machine', config) 
  }]);

  const pesan = "<b>Langkah 1 dari 3:</b> Silakan pilih tingkat kritikalitas VM:";
  const sentMessage = kirimPesanTelegram(pesan, config, "HTML", { inline_keyboard: keyboardRows }, chatId);

  if (sentMessage && sentMessage.ok) {
    setUserState(userId, { 
        action: "AWAITING_REKOMENDASI_KRITIKALITAS", 
        messageId: sentMessage.result.message_id, 
        chatId: chatId, 
        requirements: {} 
    });
  }
}

function tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements) {
  const ioOptions = ["High", "Normal"];

  const keyboardRows = ioOptions.map(opt => {
      const sessionData = { step: 'spek', requirements: { ...requirements, io: opt.toLowerCase() } };
      return [{ 
        text: opt, 
        callback_data: CallbackHelper.build('rekomendasi_machine', 'handle_step', sessionData, config) 
      }];
  });

  keyboardRows.push([{ 
    text: "❌ Batal", 
    callback_data: CallbackHelper.cancel('rekomendasi_machine', config) 
  }]);

  const pesan = `✅ Kritikalitas: <b>${escapeHtml(requirements.kritikalitas)}</b>\n\n<b>Langkah 2 dari 3:</b> Sekarang, pilih profil I/O:`;
  editMessageText(pesan, { inline_keyboard: keyboardRows }, chatId, messageId, config);

  setUserState(userId, { 
      action: "AWAITING_REKOMENDASI_IO", 
      messageId: messageId, 
      chatId: chatId, 
      requirements: requirements 
  });
}

function tampilkanPertanyaanSpek(userId, messageId, chatId, config, requirements) {
  const keyboard = { 
    inline_keyboard: [[{ 
      text: "❌ Batal", 
      callback_data: CallbackHelper.cancel('rekomendasi_machine', config) 
    }]] 
  };

  const pesan = `✅ Kritikalitas: <b>${escapeHtml(requirements.kritikalitas)}</b>\n` +
                `✅ Profil I/O: <b>${escapeHtml(requirements.io)}</b>\n\n` +
                `<b>Langkah 3 dari 3:</b> Terakhir, silakan masukkan kebutuhan CPU, RAM (GB), dan Disk (GB) dalam format:\n\n` +
                `<code>CPU RAM DISK</code>\n\n` +
                `Contoh: <code>8 16 100</code>`;
  editMessageText(pesan, keyboard, chatId, messageId, config);

  setUserState(userId, { 
      action: "AWAITING_REKOMENDASI_SPEK", 
      messageId: messageId, 
      chatId: chatId, 
      requirements: requirements 
  });
}

/**
 * [REVISI DENGAN PENERUSAN CONFIG YANG BENAR] Mesin Keadaan untuk semua interaksi tiket.
 */
function ticketMachine(update, action, config) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const chatId = userEvent.message.chat.id;
  const messageId = userEvent.message.message_id;

  if (action === "show_summary") {
    // 'config' sudah tersedia dari parameter utama
    const { text, keyboard } = generateSummaryView(config);
    editMessageText(text, keyboard, chatId, messageId, config);
  } else if (action === "show_list") {
    const { category, page = 1 } = sessionData;
    // Pastikan 'config' diteruskan ke generateTicketListView
    const { text, keyboard } = generateTicketListView(category, page, config);
    editMessageText(text, keyboard, chatId, messageId, config);
  } else if (action === "show_detail") {
    const { ticketId, fromCategory } = sessionData;
    // Pastikan 'config' diteruskan ke generateDetailView
    const { text, keyboard } = generateDetailView(ticketId, fromCategory, config);
    editMessageText(text, keyboard, chatId, messageId, config);
  } else if (action === "cancel_view") {
    callTelegramApi("deleteMessage", { chat_id: chatId, message_id: messageId }, config);
  }
}

/**
 * [BARU] Mesin Keadaan untuk alur percakapan rekomendasi setup VM.
 */
function rekomendasiMachine(update, action, config) {
    const userEvent = update.callback_query;
    const sessionData = userEvent.sessionData;
    const chatId = userEvent.message.chat.id;
    const messageId = userEvent.message.message_id;
    const userId = String(userEvent.from.id);

    if (action === 'cancel') {
        editMessageText("ℹ️ Proses rekomendasi setup telah dibatalkan.", null, chatId, messageId, config);
        clearUserState(userId); // Hapus state jika ada
        return;
    }

    if (action === 'handle_step') {
        const { step, requirements } = sessionData;
        if (step === 'io') {
            // Pastikan 'config' diteruskan ke fungsi berikutnya
            tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements);
        } else if (step === 'spek') {
            // Pastikan 'config' diteruskan ke fungsi berikutnya
            tampilkanPertanyaanSpek(userId, messageId, chatId, config, requirements);
        }
        return;
    }
}

/**
 * [BARU] Router utama untuk pesan teks yang merupakan bagian dari percakapan.
 * Menerima update dan state, lalu mendelegasikannya ke handler yang tepat.
 */
function routeToStateMachineByState(update, userState, config, userAccessMap) {
  const action = userState.action;

  if (action.startsWith("AWAITING_REKOMENDASI_")) {
    handleRekomendasiTextInput(update, userState, config);
  } else if (action === "AWAITING_NOTE_INPUT") {
    handleNoteTextInput(update, userState, config, userAccessMap);
  } else if (action === "AWAITING_CONFIG_INPUT") {
    handleConfigTextInput(update, userState, config, userAccessMap);
  }
  // Tambahkan 'else if' lain di sini jika ada alur percakapan baru di masa depan
}

/**
 * [PINDAHAN DARI doPost] Menangani semua input teks untuk alur rekomendasi setup.
 * Logika untuk semua langkah, termasuk KRITIKALITAS, telah dipulihkan sepenuhnya.
 */
function handleRekomendasiTextInput(update, userState, config) {
    const userEvent = update.message;
    const text = userEvent.text;
    const userId = String(userEvent.from.id);
    const { messageId, chatId, requirements } = userState;

    if (text.toLowerCase() === "batal") {
        editMessageText("ℹ️ Proses rekomendasi setup telah dibatalkan.", null, chatId, messageId, config);
        clearUserState(userId);
        return;
    }

    // --- LOGIKA YANG DIPULIHKAN ---
    if (userState.action === "AWAITING_REKOMENDASI_KRITIKALITAS") {
        requirements.kritikalitas = text;
        tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements);
        return; // Selesai untuk langkah ini
    }
    // --- AKHIR LOGIKA YANG DIPULIHKAN ---

    if (userState.action === "AWAITING_REKOMENDASI_SPEK") {
        const specs = text.split(/\s+/);
        if (specs.length !== 3 || isNaN(parseInt(specs[0])) || isNaN(parseInt(specs[1])) || isNaN(parseInt(specs[2]))) {
            const errorMessage = "Format spesifikasi tidak valid. Harap masukkan lagi dalam format: `CPU RAM DISK` (contoh: `8 16 100`).\n\nKirim \"batal\" untuk membatalkan.";
            kirimPesanTelegram(errorMessage, config, "HTML", null, chatId);
            setUserState(userId, userState); 
        } else {
            requirements.cpu = parseInt(specs[0], 10);
            requirements.memory = parseInt(specs[1], 10);
            requirements.disk = parseInt(specs[2], 10);
            clearUserState(userId);
            const resultMessage = dapatkanRekomendasiPenempatan(requirements, config);
            editMessageText(resultMessage, null, chatId, messageId, config);
        }
    }
}

/**
 * [PINDAHAN DARI doPost] Menangani semua input teks untuk alur penambahan catatan.
 */
function handleNoteTextInput(update, userState, config, userAccessMap) {
    const userEvent = update.message;
    const text = userEvent.text;
    const userId = String(userEvent.from.id);
    const { pk, messageId: originalMessageId } = userState;

    if (text.toLowerCase() === "batal") {
        const { headers, results } = searchVmOnSheet(pk, config);
        if (results.length > 0) {
            const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
            editMessageText(pesan, keyboard, userEvent.chat.id, originalMessageId, config);
        } else {
            editMessageText(`✅ Aksi dibatalkan.`, null, userEvent.chat.id, originalMessageId, config);
        }
        clearUserState(userId);
        return;
    }

    if (!text || text.trim().length === 0 || text.length > 100) {
        const reason = !text || text.trim().length === 0 ? "tidak boleh kosong" : "terlalu panjang (maks 100 karakter)";
        const errorMessage = `❌ Catatan ${reason}. Silakan coba lagi.\n\nKirim "batal" untuk membatalkan.`;
        kirimPesanTelegram(errorMessage, config, "HTML", null, userEvent.chat.id);
        setUserState(userId, userState);
        return;
    }

    const userData = userAccessMap.get(userId) || {};
    userData.firstName = userEvent.from.first_name;

    if (saveOrUpdateVmNote(pk, text, userData)) {
        const { headers, results } = searchVmOnSheet(pk, config);
        if (results.length > 0) {
            const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
            const successMessage = "✅ Catatan berhasil disimpan.\n\n" + pesan;
            editMessageText(successMessage, keyboard, userEvent.chat.id, originalMessageId, config);
        } else {
            editMessageText(`✅ Catatan berhasil disimpan.`, null, userEvent.chat.id, originalMessageId, config);
        }
    } else {
        editMessageText(`❌ Gagal menyimpan catatan karena terjadi kesalahan internal.`, null, userEvent.chat.id, originalMessageId, config);
    }

    clearUserState(userId);
}

/**
 * [REVISI DENGAN FORMAT PESAN HTML] Menangani input teks untuk alur manajemen konfigurasi.
 * Memastikan pesan error dikirim dengan format yang benar dan konsisten.
 */
function handleConfigTextInput(update, userState, config, userAccessMap) {
  const userEvent = update.message;
  const text = userEvent.text;
  const userId = String(userEvent.from.id);
  const { key, category, originalMessageId } = userState;

  if (text.toLowerCase() === "batal") {
    clearUserState(userId);
    const mockUpdate = {
      callback_query: { ...userEvent, message: { ...userEvent, message_id: originalMessageId }, sessionData: { category: category } },
    };
    handleConfigManager(mockUpdate, "show_category", config, userAccessMap.get(userId));
    return;
  }

  const skema = KONSTANTA.SKEMA_KONFIG || {};
  const tipeDiharapkan = skema[key];
  let isValid = true;
  let errorMessage = "";

  if (tipeDiharapkan === 'number' && isNaN(parseFloat(text))) {
    isValid = false;
    // Menggunakan format HTML
    errorMessage = `❌ <b>Input Tidak Valid</b>\nNilai untuk <code>${escapeHtml(key)}</code> harus berupa angka.`;
  } else if (tipeDiharapkan === 'json') {
    try {
      JSON.parse(text);
    } catch (e) {
      isValid = false;
      // Menggunakan format HTML
      errorMessage = `❌ <b>Input Tidak Valid</b>\nNilai untuk <code>${escapeHtml(key)}</code> harus berupa format JSON yang benar.\n\n<i>Detail Error:</i> <pre>${escapeHtml(e.message)}</pre>`;
    }
  }

  if (!isValid) {
    // Mengubah parse_mode menjadi "HTML"
    kirimPesanTelegram(errorMessage, config, "HTML", null, userEvent.chat.id);
    setUserState(userId, userState);
    return;
  }

  clearUserState(userId);

  const adminUserData = userAccessMap.get(userId);
  adminUserData.firstName = userEvent.from.first_name;
  
  const result = updateConfiguration(key, text, adminUserData);

  if (result.success) {
    kirimPesanTelegram(`✅ Konfigurasi <code>${escapeHtml(key)}</code> berhasil diperbarui.`, config, "HTML", null, userEvent.chat.id);
    const refreshedConfig = getBotState(true).config;
    const mockUpdate = {
      callback_query: { ...userEvent, message: { ...userEvent, message_id: originalMessageId }, sessionData: { category: category } },
    };
    handleConfigManager(mockUpdate, "show_category", refreshedConfig, adminUserData);
  } else {
    kirimPesanTelegram(`❌ Gagal memperbarui konfigurasi. Silakan periksa log untuk detail.`, config, "HTML", null, userEvent.chat.id);
  }
}

/**
 * [BARU] State machine untuk menangani interaksi dari menu /cekkesehatan.
 */
function kondisiMachine(update, action, config, userData) {
  const userEvent = update.callback_query;
  const chatId = userEvent.message.chat.id;
  let statusMessageId = null;

  try {
    if (action === 'export_alerts') {
      // Beri notifikasi singkat bahwa tombol sudah ditekan
      answerCallbackQuery(userEvent.id, config, `Memproses permintaan ekspor...`);

      const waitMessage = `⏳ Harap tunggu, sedang memproses permintaan ekspor Anda untuk "<b>Laporan Peringatan VM</b>"...`;
      const sentMessage = kirimPesanTelegram(waitMessage, config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // Buat tiket tugas untuk dieksekusi di latar belakang
      const jobData = {
        jobType: "export_menu", // Kita bisa gunakan kembali jobType yang sudah ada
        context: { 
          // Gunakan tipe internal yang sudah kita definisikan di Peringatan.js
          exportType: KONSTANTA.TIPE_INTERNAL.EKSPOR_PERINGATAN_VM 
        },
        config: config,
        userData: userData,
        chatId: chatId,
        statusMessageId: statusMessageId,
      };

      // Gunakan fungsi pembantu yang sudah cerdas
      const jobKey = `job_${userEvent.from.id}_${Date.now()}`;
      tambahTugasKeAntreanDanPicu(jobKey, jobData);
    }
  } catch (e) {
    handleCentralizedError(e, `Mesin Kondisi (${action})`, config, userData);
    if (statusMessageId) {
      editMessageText(`⚠️ Terjadi kesalahan saat menambahkan tugas ekspor ke antrean.`, null, chatId, statusMessageId, config);
    }
  }
}

/**
 * [REVISI FINAL] State machine untuk menangani interaksi dari menu kesehatan,
 * termasuk memulai proses kalkulasi di latar belakang.
 */
function healthMachine(update, action, config, userData) {
  const userEvent = update.callback_query;
  const chatId = userEvent.message.chat.id;
  const messageId = userEvent.message.message_id;
  const sessionData = userEvent.sessionData;

  if (action === 'cancel') {
    editMessageText("Baik, permintaan dibatalkan.", null, chatId, messageId, config);
    return;
  }

  if (action === 'trigger_calc') {
    try {
      answerCallbackQuery(userEvent.id, config);

      // Menghapus pekerjaan lama yang mungkin macet untuk mencegah duplikasi
      const properties = PropertiesService.getScriptProperties();
      const allKeys = properties.getKeys();
      allKeys.forEach(key => {
        if (key.startsWith("job_health_score_")) {
          properties.deleteProperty(key);
        }
      });

      // Membuat tiket pekerjaan untuk tahap pertama
      const jobData = {
        jobType: "health_score_calculation",
        stage: "gather_data",
        context: {}
      };
      const jobKey = `job_health_score_${Date.now()}`;
      
      // Menggunakan fungsi pembantu cerdas untuk menambahkan pekerjaan dan "membangunkan" antrean
      tambahTugasKeAntreanDanPicu(jobKey, jobData);
      
      if(sessionData.requesterId){
          CacheService.getScriptCache().put('health_report_requester', sessionData.requesterId, 3600); // Simpan selama 1 jam
      }

      editMessageText("✅ Baik, proses kalkulasi telah dimulai di latar belakang. Anda akan menerima notifikasi jika laporan sudah siap.", null, chatId, messageId, config);
    } catch (e) {
      editMessageText("❌ Gagal memulai proses kalkulasi. Silakan hubungi admin.", null, chatId, messageId, config);
      handleCentralizedError(e, "health_machine:trigger_calc", config, userData);
    }
  }
}

