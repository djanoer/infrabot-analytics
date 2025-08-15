/**
 * @file Utilitas.js
 * @author Djanoer Team
 * @date 2023-01-02
 *
 * @description
 * Kumpulan fungsi pembantu (helper/utility) generik yang digunakan di
 * berbagai bagian dalam proyek. Menyediakan fungsi yang dapat digunakan kembali
 * untuk tugas umum seperti manajemen sesi, parsing, dan penanganan error.
 *
 * @section FUNGSI UTAMA
 * - normalizePrimaryKey(pk): Membersihkan Primary Key dari sufiks lokasi.
 * - handleCentralizedError(...): Pusat penanganan error untuk logging dan notifikasi.
 * - createPaginatedView(...): Membuat tampilan interaktif dengan navigasi halaman.
 * - getBotState(): Mengambil konfigurasi dan hak akses dari cache atau spreadsheet.
 * - clearBotStateCache(): Membersihkan semua cache bot yang relevan secara tuntas.
 * - setUserState/getUserState: Mengelola status percakapan multi-langkah pengguna.
 */

function escapeHtml(text) {
  if (typeof text !== "string") text = String(text);
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * [BARU - FASE 2] Memvalidasi input teks untuk mencegah karakter awal yang berbahaya.
 * Mencegah potensi formula injection di Google Sheets.
 * @param {string} text - Teks input dari pengguna.
 * @returns {boolean} True jika input dianggap aman, false jika sebaliknya.
 */
function isValidInput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return false; // Menolak input non-string atau yang hanya berisi spasi.
  }
  // Regex untuk memeriksa apakah string dimulai dengan karakter =, +, -, atau @.
  const dangerousStartChars = /^[=+\-@]/;
  return !dangerousStartChars.test(text);
}

/**
 * [REFAKTOR - FASE 3] Membuat "sidik jari" (hash) dari sebuah objek data VM
 * hanya berdasarkan kolom yang ditentukan untuk dilacak.
 * @param {object} vmObject - Objek yang berisi data satu baris VM.
 * @param {Array<string>} columnsToTrack - Array berisi nama-nama kolom yang akan dimasukkan dalam hash.
 * @returns {string} Hash MD5 dari data yang relevan.
 */
function computeVmHash(vmObject, columnsToTrack) {
  if (!vmObject || !columnsToTrack || columnsToTrack.length === 0) return "";

  // Urutkan nama kolom untuk memastikan konsistensi hash
  const sortedKeys = [...columnsToTrack].sort();

  const dataString = sortedKeys
    .map((key) => {
      const value = vmObject[key];
      // Normalisasi nilai: #N/A dan null/undefined dianggap string kosong
      return String(value || "").trim() === "#N/A" ? "" : value;
    })
    .join("||");

  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, dataString);
  return digest.map((byte) => (byte + 0x100).toString(16).substring(1)).join("");
}

/**
 * [FUNGSI HELPER BARU] Mengekstrak informasi dari nama datastore.
 * @param {string} dsName - Nama datastore yang akan di-parse.
 * @param {Map} migrationConfig - Objek konfigurasi dari sheet Logika Migrasi.
 * @returns {object} Objek berisi { cluster: '...', type: '...' }.
 */
function getDsInfo(dsName, migrationConfig) {
  if (typeof dsName !== "string") return { cluster: null, type: null };
  const clusterMatch = dsName.match(/(CL\d+)/i);
  const cluster = clusterMatch ? clusterMatch[1].toUpperCase() : null;
  let type = null;
  const knownTypes = Array.from(migrationConfig.keys()).sort((a, b) => b.length - a.length);
  for (const knownType of knownTypes) {
    if (dsName.includes(knownType)) {
      const rule = migrationConfig.get(knownType);
      type = rule.alias || knownType;
      break;
    }
  }
  return { cluster: cluster, type: type };
}

/**
 * [FUNGSI HELPER BARU] Menampilkan alert di UI jika tersedia, jika tidak catat di log.
 */
function showUiFeedback(title, message) {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (e) {
    console.log(`UI Feedback (Alert Skipped): ${title} - ${message}`);
  }
}

/**
 * [DIROMBAK] Mengekstrak lingkungan dari nama Datastore berdasarkan kamus di Konfigurasi.
 * @param {string} dsName Nama datastore.
 * @param {object} environmentMap Objek pemetaan dari Konfigurasi.
 * @returns {string|null} Nama lingkungan atau null.
 */
function getEnvironmentFromDsName(dsName, environmentMap) {
  if (typeof dsName !== "string" || !environmentMap) return null;
  const keywords = Object.keys(environmentMap).sort((a, b) => b.length - a.length);
  for (const keyword of keywords) {
    if (dsName.includes(keyword)) {
      return environmentMap[keyword];
    }
  }
  return null;
}

/**
 * Menghapus sufiks lokasi dari Primary Key untuk perbandingan yang konsisten.
 * Contoh: "VM-001-VC01" menjadi "VM-001".
 * @param {string} pk - Primary Key lengkap yang mungkin mengandung sufiks.
 * @returns {string} Primary Key yang sudah bersih tanpa sufiks lokasi.
 */
function normalizePrimaryKey(pk) {
  if (typeof pk !== "string" || !pk) return "";
  return pk.replace(/-VC\d+$/i, "").trim();
}

/**
 * [REVISI DENGAN PENANGANAN BENTUK OBJEK GANDA] Penanganan Error Terpusat.
 * Versi ini dimodifikasi untuk dapat menangani objek pengguna dari Telegram (dengan .id)
 * dan objek pengguna internal dari cache (dengan .userId) secara aman.
 */
function handleCentralizedError(errorObject, context, config, userData = null) {
  // Cek secara aman untuk ID dan nama, mengakomodasi kedua bentuk objek.
  const userId = userData ? userData.id || userData.userId || "Unknown" : "System/Unknown";
  const userFirstName = userData ? userData.firstName || userData.first_name || "" : "";

  const userIdentifier = `[User: ${userId} | ${userFirstName}]`.trim();
  const errorMessageTechnical = `[ERROR di ${context}] ${userIdentifier} ${errorObject.message}\nStack: ${
    errorObject.stack || "Tidak tersedia"
  }`;

  console.error(errorMessageTechnical);

  if (config) {
    let userFriendlyMessage = `🔴 Maaf, terjadi kesalahan saat memproses permintaan Anda.\n\n`;
    userFriendlyMessage += `<b>Konteks:</b> ${context}\n`;
    userFriendlyMessage += `<b>Detail Error:</b>\n<pre>${escapeHtml(errorObject.message)}</pre>\n\n`;
    userFriendlyMessage += `<i>Administrator telah diberitahu mengenai masalah ini.</i>`;

    // Logika ini membaca properti 'ENVIRONMENT' dari objek config.
    const targetChatId = config.ENVIRONMENT === "DEV" ? config.TELEGRAM_CHAT_ID_DEV : config.TELEGRAM_CHAT_ID;

    if (targetChatId) {
      kirimPesanTelegram(userFriendlyMessage, config, "HTML", null, targetChatId);
    }
  }
}

/**
 * [REFACTOR FINAL STATE-DRIVEN] Membuat tampilan berhalaman secara generik.
 * Versi ini menghasilkan callback yang stateful, kompatibel dengan router mesin,
 * dan dapat secara dinamis menambahkan tombol ekspor.
 */
function createPaginatedView(allItems, page, title, headerContent, formatEntryCallback, callbackInfo, config) {
  const entriesPerPage = (config.SYSTEM_LIMITS && config.SYSTEM_LIMITS.PAGINATION_ENTRIES) || 15;
  const totalEntries = allItems.length;
  if (totalEntries === 0) {
    let emptyText = `ℹ️ ${title}\n\n`;
    if (headerContent) emptyText = headerContent + `\n` + emptyText;
    emptyText += `Tidak ada data yang ditemukan.`;
    return { text: emptyText, keyboard: null };
  }
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  page = Math.max(1, Math.min(page, totalPages));
  const startIndex = (page - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);
  const pageEntries = allItems.slice(startIndex, endIndex);
  const listContent = pageEntries
    .map((item, index) => `${startIndex + index + 1}. ${formatEntryCallback(item)}`)
    .join("\n\n");
  let text = `${headerContent ? headerContent + "\n" : ""}`;
  text += `<i>Menampilkan <b>${
    startIndex + 1
  }-${endIndex}</b> dari <b>${totalEntries}</b> hasil | Halaman <b>${page}/${totalPages}</b></i>\n`;
  text += `------------------------------------\n\n${listContent}\u200B`;

  const keyboardRows = [];
  const navigationButtons = [];

  if (page > 1) {
    navigationButtons.push({
      text: "⬅️ Prev",
      callback_data: CallbackHelper.build(
        callbackInfo.machine,
        callbackInfo.action,
        { ...callbackInfo.context, page: page - 1 },
        config
      ),
    });
  }
  if (totalPages > 1) {
    navigationButtons.push({ text: `📄 ${page}/${totalPages}`, callback_data: "ignore" });
  }
  if (page < totalPages) {
    navigationButtons.push({
      text: "Next ➡️",
      callback_data: CallbackHelper.build(
        callbackInfo.machine,
        callbackInfo.action,
        { ...callbackInfo.context, page: page + 1 },
        config
      ),
    });
  }

  if (navigationButtons.length > 0) keyboardRows.push(navigationButtons);

  // --- PERUBAHAN UTAMA DI SINI ---
  if (callbackInfo.exportAction) {
    keyboardRows.push([
      {
        text: `📄 Ekspor Semua ${totalEntries} Hasil`,
        callback_data: CallbackHelper.build(
          callbackInfo.machine,
          callbackInfo.exportAction,
          callbackInfo.context,
          config
        ),
      },
    ]);
  }

  return { text, keyboard: { inline_keyboard: keyboardRows } };
}

/**
 * @const {object|null}
 * Variabel global untuk menyimpan state bot (konfigurasi & hak akses) selama eksekusi.
 * Ini mencegah pembacaan berulang dari cache atau sheet dalam satu siklus eksekusi.
 */
let botState = null;

/**
 * [FUNGSI BARU - STATE MANAGER, DIPERBAIKI]
 * Mendapatkan state bot (konfigurasi dan hak akses) dari cache atau membacanya dari sheet jika perlu.
 * Versi ini melempar error jika sheet krusial tidak ditemukan.
 *
 * @returns {{config: object, userAccessMap: Map}} Objek yang berisi konfigurasi dan peta hak akses.
 */
function getBotState() {
  if (botState) return botState;
  const cache = CacheService.getScriptCache();
  const CACHE_KEY = "BOT_STATE_V2";
  const cachedStateJSON = cache.get(CACHE_KEY);
  if (cachedStateJSON) {
    try {
      const cachedState = JSON.parse(cachedStateJSON);
      cachedState.userAccessMap = new Map(cachedState.userAccessMap);
      botState = cachedState;
      return botState;
    } catch (e) {
      console.warn("Gagal mem-parsing state dari cache.", e);
    }
  }
  console.log("Membaca state dari Spreadsheet...");
  const config = bacaKonfigurasi();
  const userAccessMap = new Map();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetHakAkses = ss.getSheetByName(KONSTANTA.NAMA_SHEET.HAK_AKSES);

  // --- BLOK PERBAIKAN UTAMA ---
  if (!sheetHakAkses) {
    // Jika sheet Hak Akses tidak ada, ini adalah error fatal. Hentikan eksekusi.
    throw new Error(`Sheet krusial "${KONSTANTA.NAMA_SHEET.HAK_AKSES}" tidak ditemukan.`);
  }
  // --- AKHIR BLOK PERBAIKAN ---

  if (sheetHakAkses.getLastRow() > 1) {
    const dataAkses = sheetHakAkses.getRange(2, 1, sheetHakAkses.getLastRow() - 1, 4).getValues();
    dataAkses.forEach((row) => {
      if (row[0] && row[2]) userAccessMap.set(String(row[0]), { email: row[2], role: row[3] });
    });
  }
  const newState = { config: config, userAccessMap: userAccessMap };
  const stateToCache = { ...newState, userAccessMap: Array.from(newState.userAccessMap.entries()) };
  cache.put(CACHE_KEY, JSON.stringify(stateToCache), 21600);
  botState = newState;
  return botState;
}

/**
 * [REFACTORED V.1.3 - TAHAN BANTING] Menghapus SEMUA kemungkinan cache bot
 * dengan pendekatan "brute force" untuk memastikan keandalan.
 * Fungsi ini tidak lagi bergantung pada manifest yang bisa rusak.
 */
function clearBotStateCache() {
  try {
    const cache = CacheService.getScriptCache();
    const keysToRemove = [];

    // 1. Tambahkan kunci cache state yang pasti
    keysToRemove.push("BOT_STATE_V2");
    keysToRemove.push("vm_data_manifest");

    // 2. Pendekatan "Brute Force" untuk cache data VM yang terfragmentasi.
    // Kita mencoba menghapus hingga 50 potongan (mencakup ~5MB data),
    // yang seharusnya lebih dari cukup. Ini akan menghapus semua potongan
    // yang ada tanpa perlu membaca manifest terlebih dahulu.
    for (let i = 0; i < 50; i++) {
      keysToRemove.push(`vm_data_chunk_${i}`);
    }

    // 3. Hapus semua kunci yang teridentifikasi sekaligus
    cache.removeAll(keysToRemove);

    // 4. Reset state di memori untuk sesi eksekusi saat ini
    botState = null;

    console.log(
      `PEMBERSIHAN CACHE TUNTAS: Upaya penghapusan untuk ${keysToRemove.length} kunci cache telah dijalankan.`
    );
    return true;
  } catch (e) {
    console.error(`Gagal menjalankan pembersihan cache total: ${e.message}`);
    return false;
  }
}

/**
 * [MODIFIKASI v3.5.0 - FINAL & ROBUST] Fungsi pembantu yang lebih tangguh untuk mem-parse
 * string angka, kini dapat menangani format standar dan internasional dengan benar
 * tanpa merusak nilai desimal.
 * @param {string | number} numberString - String angka yang akan di-parse.
 * @returns {number} Angka dalam format float.
 */
function parseLocaleNumber(numberString) {
  if (typeof numberString === "number") return numberString;
  if (typeof numberString !== "string") numberString = String(numberString);
  let cleaned = numberString.replace(/[^0-9.,-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > -1 && lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  return parseFloat(cleaned) || 0;
}

/**
 * [FUNGSI BARU v3.3.0] Menyimpan status sementara untuk seorang pengguna.
 * Digunakan untuk interaksi multi-langkah, seperti menunggu input catatan.
 * @param {string} userId - ID unik dari pengguna Telegram.
 * @param {object} stateObject - Objek yang berisi status, contoh: { action: 'AWAITING_NOTE_INPUT', pk: 'VM-XYZ' }
 */
function setUserState(userId, stateObject) {
  const cache = CacheService.getScriptCache();
  // Simpan status untuk pengguna ini selama 10 menit.
  cache.put(`user_state_${userId}`, JSON.stringify(stateObject), 600);
}

/**
 * [FUNGSI BARU v3.3.0] Mengambil dan menghapus status sementara seorang pengguna.
 * @param {string} userId - ID unik dari pengguna Telegram.
 * @returns {object|null} Objek status jika ada, atau null jika tidak.
 */
function getUserState(userId) {
  const cache = CacheService.getScriptCache();
  const stateKey = `user_state_${userId}`;
  const stateJSON = cache.get(stateKey);

  if (stateJSON) {
    // Setelah status diambil, langsung hapus agar tidak digunakan lagi.
    cache.remove(stateKey);
    return JSON.parse(stateJSON);
  }
  return null;
}

/**
 * [FINAL v1.8.1] Membuat sesi callback sementara di cache.
 * Menggunakan durasi timeout dari konfigurasi terpusat.
 */
function createCallbackSession(dataToStore, config) {
  const cache = CacheService.getScriptCache();
  const sessionId = Utilities.getUuid().substring(0, 8);
  const timeout = (config.SYSTEM_LIMITS && config.SYSTEM_LIMITS.SESSION_TIMEOUT_SECONDS) || 900;
  cache.put(`session_${sessionId}`, JSON.stringify(dataToStore), timeout);
  return sessionId;
}

/**
 * [FUNGSI BARU v3.7.0] Mengambil dan menghapus sesi callback dari cache.
 * @param {string} sessionId - ID unik dari sesi yang akan diambil.
 * @returns {object|null} Objek data yang tersimpan, atau null jika sesi tidak ditemukan/kedaluwarsa.
 */
function getCallbackSession(sessionId) {
  const cache = CacheService.getScriptCache();
  const sessionKey = `session_${sessionId}`;
  const sessionJSON = cache.get(sessionKey);
  if (sessionJSON) {
    cache.remove(sessionKey);
    return JSON.parse(sessionJSON);
  }
  return null;
}

/**
 * [BARU v1.4.0] Menghitung Jarak Levenshtein antara dua string.
 * Semakin kecil hasilnya, semakin mirip kedua string tersebut.
 * @param {string} a String pertama.
 * @param {string} b String kedua.
 * @returns {number} Jarak antara dua string.
 */
function getLevenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * [BARU v1.4.0] Mencari perintah yang paling mirip dengan input yang salah dari pengguna.
 * @param {string} wrongCommand - Perintah salah yang diketik oleh pengguna.
 * @returns {string|null} Perintah yang paling mirip, atau null jika tidak ada yang cukup mirip.
 */
function findClosestCommand(wrongCommand) {
  const allCommands = Object.values(KONSTANTA.PERINTAH_BOT);
  let closestCommand = null;
  let minDistance = 3; // Batas toleransi, jangan sarankan jika terlalu beda

  allCommands.forEach((command) => {
    const distance = getLevenshteinDistance(wrongCommand, command);
    if (distance < minDistance) {
      minDistance = distance;
      closestCommand = command;
    }
  });

  return closestCommand;
}

/**
 * [FINAL v3.0.3 - KRUSIAL] Fungsi khusus untuk mendapatkan info storage dari nama datastore.
 * Versi ini menggunakan Regular Expression yang lebih cerdas dan fleksibel untuk
 * mengekstrak nama cluster dengan berbagai format secara andal.
 * @param {string} dsName - Nama datastore yang akan di-parse.
 * @param {object} aliasMap - Objek pemetaan dari Konfigurasi (MAP_ALIAS_STORAGE).
 * @returns {object} Objek berisi { cluster: '...', storageType: '...' }.
 */
function getStorageInfoFromDsName(dsName, aliasMap) {
  if (typeof dsName !== "string" || !aliasMap) return { cluster: null, storageType: null };

  // === AWAL BLOK PERBAIKAN UTAMA ===
  // Regex baru yang lebih fleksibel: mencari pola kata-kata yang diakhiri dengan CL##
  // Contoh: akan cocok dengan "TBN-COM-LNV-CL02" dan juga "COM-CL01"
  const clusterMatch = dsName.match(/((?:\w+-)*CL\d+)/i);
  const cluster = clusterMatch ? clusterMatch[0].toUpperCase() : null;
  // === AKHIR BLOK PERBAIKAN UTAMA ===

  // Cari alias storage yang cocok
  let storageType = null;
  // Urutkan kunci dari yang terpanjang agar tidak salah cocok (misal: "VSPA" sebelum "VSP")
  const storageKeys = Object.keys(aliasMap).sort((a, b) => b.length - a.length);

  for (const key of storageKeys) {
    const aliases = aliasMap[key];
    const isMatch = aliases.some((alias) => dsName.toUpperCase().includes(alias.toUpperCase()));
    if (isMatch) {
      // Gunakan alias pertama sebagai tipe storage utama
      storageType = aliases[0];
      break;
    }
  }
  return { cluster: cluster, storageType: storageType };
}

/**
 * [BARU v3.1.2 - KRUSIAL] Menghapus state (status percakapan) seorang pengguna dari cache.
 * Fungsi ini dipanggil setelah sebuah percakapan selesai atau dibatalkan.
 * @param {string} userId - ID pengguna yang state-nya akan dihapus.
 */
function clearUserState(userId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `user_state_${userId}`;
  cache.remove(cacheKey);
  console.log(`State untuk pengguna ${userId} telah berhasil dihapus.`);
}

/**
 * [REVISI v1.1.0 - ROBUST] Membuat progress bar visual berbasis teks.
 * Kini mampu menangani nilai persentase negatif tanpa menyebabkan error.
 */
function createProgressBar(percentage, barLength = 10) {
  // --- PERBAIKAN UTAMA DI SINI ---
  // Memastikan persentase dibatasi antara 0 dan 100 sebelum kalkulasi.
  const safePercentage = Math.max(0, Math.min(percentage, 100));
  // --- AKHIR PERBAIKAN ---

  const filledCount = Math.round((safePercentage / 100) * barLength);
  const emptyCount = barLength - filledCount;
  const filledPart = "█".repeat(filledCount);
  const emptyPart = "░".repeat(emptyCount);
  return `[${filledPart}${emptyPart}]`;
}

/**
 * [BARU] Menghitung dan memformat durasi waktu relatif dari tanggal tertentu hingga sekarang.
 * @param {Date | string} date - Tanggal mulai.
 * @returns {string} String yang diformat seperti "(sekitar 2 tahun yang lalu)".
 */
function formatRelativeTime(date) {
  if (!date) return "";

  const startDate = new Date(date);
  if (isNaN(startDate.getTime())) return "";

  const now = new Date();
  const diffSeconds = Math.round((now - startDate) / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);
  const diffMonths = Math.round(diffDays / 30.44);
  const diffYears = Math.round(diffDays / 365.25);

  if (diffYears > 0) {
    return `(sekitar ${diffYears} tahun yang lalu)`;
  } else if (diffMonths > 0) {
    return `(sekitar ${diffMonths} bulan yang lalu)`;
  } else if (diffDays > 0) {
    return `(sekitar ${diffDays} hari yang lalu)`;
  } else if (diffHours > 0) {
    return `(sekitar ${diffHours} jam yang lalu)`;
  } else {
    return `(beberapa saat yang lalu)`;
  }
}

function pancingOtorisasi() {
  // Fungsi ini sengaja memanggil layanan eksternal
  // untuk memicu kotak dialog perizinan dari Google.
  UrlFetchApp.fetch("https://www.google.com");
  Logger.log("Otorisasi berhasil dipancing.");
}

/**
 * [BARU] Menghapus data besar yang disimpan dengan teknik chunking dari cache.
 * @param {string} keyPrefix - Awalan unik untuk kunci cache yang akan dihapus.
 */
function removeLargeDataFromCache(keyPrefix) {
  try {
    const cache = CacheService.getScriptCache();
    const manifestKey = `${keyPrefix}_manifest`;
    const manifestJSON = cache.get(manifestKey);

    if (manifestJSON) {
      const manifest = JSON.parse(manifestJSON);
      const keysToRemove = [manifestKey];
      for (let i = 0; i < manifest.totalChunks; i++) {
        keysToRemove.push(`${keyPrefix}_chunk_${i}`);
      }
      cache.removeAll(keysToRemove);
      console.log(`Data cache chunked dengan prefix '${keyPrefix}' berhasil dihapus.`);
    }
  } catch (e) {
    console.warn(`Gagal menghapus data cache chunked untuk prefix '${keyPrefix}': ${e.message}`);
  }
}

/**
 * [FUNGSI DIAGNOSTIK] Memeriksa isi cache laporan kesehatan.
 * Jalankan secara manual dari editor.
 */
function cekCacheLaporanKesehatan() {
  const cache = CacheService.getScriptCache();
  const result = cache.get("health_report_cache");

  if (result) {
    console.log("✅✅✅ CACHE DITEMUKAN! ✅✅✅");
    console.log("Isi cache laporan kesehatan:");
    // JSON.parse dan stringify lagi untuk format yang rapi (pretty print)
    console.log(JSON.stringify(JSON.parse(result), null, 2));
  } else {
    console.log("❌❌❌ CACHE KOSONG. ❌❌❌");
    console.log("Proses kalkulasi di latar belakang mungkin gagal atau belum selesai.");
  }
}

/**
 * [FUNGSI DIAGNOSTIK] Menampilkan isi antrean tugas saat ini di log.
 */
function lihatAntreanTugas() {
  const properties = PropertiesService.getScriptProperties();
  const allKeys = properties.getKeys();
  const jobKeys = allKeys.filter(key => key.startsWith("job_"));

  if (jobKeys.length === 0) {
    console.log("--- Antrean Tugas KOSONG ---");
  } else {
    console.log(`--- Isi Antrean Tugas (${jobKeys.length} pekerjaan) ---`);
    jobKeys.forEach(key => {
      console.log(`Kunci: ${key}`);
    });
  }
}

/**
 * [REVISI FINAL & ANDAL] Menambahkan pekerjaan ke antrean dan secara proaktif
 * memicu prosesor HANYA JIKA antrean sebelumnya kosong.
 * @param {string} jobKey - Kunci unik untuk pekerjaan.
 * @param {object} jobData - Objek data pekerjaan.
 */
function tambahTugasKeAntreanDanPicu(jobKey, jobData) {
  const properties = PropertiesService.getScriptProperties();
  
  // 1. Periksa kondisi antrean SEBELUM menambahkan pekerjaan baru
  const jobKeysBefore = properties.getKeys().filter(key => key.startsWith("job_"));
  
  // 2. Simpan pekerjaan baru ke dalam antrean
  properties.setProperty(jobKey, JSON.stringify(jobData));
  
  // 3. Jika antrean SEBELUMNYA kosong, maka kita tahu prosesor sedang tidur
  //    dan perlu dibangunkan sekarang juga.
  if (jobKeysBefore.length === 0) {
    console.log("Antrean sebelumnya kosong. Membangunkan prosesor secara instan...");
    
    // Hapus trigger penjaga yang mungkin ada untuk mencegah konflik waktu.
    _hapusTriggerYangAda('prosesAntreanTugas');
    
    // Buat trigger instan yang baru untuk berjalan dalam 10 detik.
    ScriptApp.newTrigger('prosesAntreanTugas')
      .timeBased()
      .after(25 * 1000)
      .create();
  }
}
