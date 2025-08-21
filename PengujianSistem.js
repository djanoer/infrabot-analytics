/**
 * @file PengujianSistem.js
 * @description
 * Pusat untuk semua pengujian sistem dan integrasi (End-to-End).
 * File ini mensimulasikan interaksi pengguna nyata dan memverifikasi
 * alur kerja lengkap dari awal hingga akhir.
 */

// =================================================================================
// BAGIAN 1: KERANGKA KERJA PENGUJIAN & MOCKS
// =================================================================================

const MockServices = {
  UrlFetchApp: {
    _requests: [],
    fetch: function (url, params) {
      this._requests.push({ url, params });
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ ok: true, result: { message_id: 12345 } }),
      };
    },
    getLastRequest: function () {
      return this._requests[this._requests.length - 1];
    },
    clear: function () {
      this._requests = [];
    },
  },
  CacheService: {
    _cache: {},
    getScriptCache: function () {
      return this;
    },
    get: function (key) {
      return this._cache[key] || null;
    },
    put: function (key, value, exp) {
      this._cache[key] = value;
    },
    remove: function (key) {
      delete this._cache[key];
    },
    removeAll: function (keys) {
      keys.forEach((key) => delete this._cache[key]);
    },
    clear: function () {
      this._cache = {};
    },
  },
  SpreadsheetApp: {
    _sheets: {},
    getActiveSpreadsheet: function () {
      return this;
    },
    getSheetByName: function (name) {
      return this._sheets[name] || null;
    },
    setSheetData: function (sheetName, data) {
      this._sheets[sheetName] = {
        _data: JSON.parse(JSON.stringify(data)),
        getName: () => sheetName,
        getLastRow: function () {
          return this._data.length;
        },
        getLastColumn: function () {
          return this._data[0] ? this._data[0].length : 0;
        },
        getDataRange: function () {
          return { getValues: () => JSON.parse(JSON.stringify(this._data)) };
        },
        getRange: function (row, col, numRows, numCols) {
          if (typeof row === "string") {
            if (row.toUpperCase() === "A:B") return { getValues: () => this._data.map((r) => r.slice(0, 2)) };
          }
          const self = this;
          return {
            getValues: function () {
              const slicedData = self._data.slice(row - 1, row - 1 + numRows);
              return slicedData.map((r) => r.slice(col - 1, col - 1 + numCols));
            },
          };
        },
      };
    },
    clear: function () {
      this._sheets = {};
    },
  },
  PropertiesService: {
    _props: {},
    getScriptProperties: function () {
      // PENTING: Saat pengujian, kita akan membaca dari properties asli
      // untuk memastikan konfigurasi benar, tetapi tidak akan pernah menulis.
      return PropertiesService.getScriptProperties();
    },
  },
};

/**
 * [REVISI AMAN] FUNGSI UTAMA: Jalankan fungsi ini dari editor untuk memulai semua pengujian.
 * Fungsi ini hanya akan menjalankan pengujian unit yang aman dan tidak akan mengubah properties.
 */
function jalankanSemuaTesSistem() {
  console.log("🚀 Memulai Pengujian...");

  const originalServices = {
    UrlFetchApp: typeof UrlFetchApp !== "undefined" ? UrlFetchApp : undefined,
    CacheService: typeof CacheService !== "undefined" ? CacheService : undefined,
    SpreadsheetApp: typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp : undefined,
    PropertiesService: typeof PropertiesService !== "undefined" ? PropertiesService : undefined,
    exportResultsToSheet: typeof exportResultsToSheet !== "undefined" ? exportResultsToSheet : undefined,
  };

  // Ganti layanan yang berinteraksi dengan dunia luar
  UrlFetchApp = MockServices.UrlFetchApp;
  CacheService = MockServices.CacheService;
  SpreadsheetApp = MockServices.SpreadsheetApp;
  // PropertiesService TIDAK diganti untuk membaca konfigurasi nyata, tetapi tidak akan ditulis.

  try {
    console.log("\n--- Menjalankan Pengujian Unit (Aman) ---");
    // Jalankan hanya pengujian unit dari file Pengujian.js yang tidak mengubah state eksternal.
    jalankanSemuaTes();

    console.log("\n--- Status Pengujian Sistem Otomatis ---");
    console.log(
      "Pengujian sistem otomatis yang mengubah properties telah dinonaktifkan sesuai permintaan untuk keamanan."
    );
    console.log("Silakan lanjutkan dengan pengujian manual di Telegram.");

    console.log("\n🎉 SEMUA SKENARIO PENGUJIAN OTOMATIS YANG AMAN LULUS!");
  } catch (e) {
    console.error(`\n🔥 PENGUJIAN GAGAL PADA SALAH SATU SKENARIO: ${e.message}\n${e.stack}`);
  } finally {
    // Kembalikan semua layanan ke kondisi semula
    UrlFetchApp = originalServices.UrlFetchApp;
    CacheService = originalServices.CacheService;
    SpreadsheetApp = originalServices.SpreadsheetApp;
    PropertiesService = originalServices.PropertiesService;
    exportResultsToSheet = originalServices.exportResultsToSheet;
    botState = null;
    console.log("\n✅ Pengujian Selesai.");
  }
}

// =================================================================
// FUNGSI PEMBANTU PENGUJIAN (jika diperlukan di masa depan)
// =================================================================

function assertTrue(condition, testName) {
  if (!condition) {
    throw new Error(`GAGAL: ${testName}`);
  }
}
