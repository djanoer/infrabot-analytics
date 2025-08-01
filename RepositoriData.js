/**
 * @file RepositoriData.js
 * @author Djanoer Team
 * @date 2025-07-28
 * @version 2.0.0
 *
 * @description
 * Bertindak sebagai lapisan abstraksi data (Data Abstraction Layer). Ini adalah
 * satu-satunya komponen dalam sistem yang diizinkan untuk berinteraksi langsung
 * dengan Google Sheets untuk tujuan pengambilan data.
 *
 * @section FUNGSI UTAMA
 * - getSemuaVm(config): Mengambil semua data VM, menerapkan strategi cache-first
 * untuk meminimalkan panggilan ke Spreadsheet dan memaksimalkan performa.
 * - getSemuaDatastore(config): Mengambil semua data Datastore dari sheet.
 * - getSemuaTiket(config): Mengambil semua data Tiket dari sheet.
 *
 * @section ARSITEKTUR & INTERAKSI
 * - Dipanggil oleh semua file di lapisan logika bisnis (`Analisis.js`, `Laporan.js`, dll.).
 * - Berinteraksi dengan `CacheService` dan `SpreadsheetApp`.
 * - Menggunakan fungsi chunking dari `ManajemenVM.js` untuk cache data besar.
 */

const RepositoriData = (function () {
  /**
   * Helper internal terpusat untuk mengambil data dari sheet manapun.
   * @param {string} sheetName - Nama sheet yang akan dibaca.
   * @returns {{headers: Array<string>, dataRows: Array<Array<any>>}} Objek berisi header dan baris data.
   */
  function _ambilDataSheet(sheetName) {
    if (!sheetName) return { headers: [], dataRows: [] };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 1) return { headers: [], dataRows: [] };

    const allData = sheet.getDataRange().getValues();
    const headers = allData.shift() || [];
    return { headers: headers, dataRows: allData };
  }

  return {
    /**
     * Mengambil data VM dengan strategi Cache-First.
     * Ini adalah satu-satunya sumber kebenaran untuk data VM.
     * @param {object} config - Objek konfigurasi.
     * @returns {{headers: Array<string>, dataRows: Array<Array<any>>}}
     */
    getSemuaVm: function (config) {
      let allDataWithHeaders = readLargeDataFromCache("vm_data");

      if (allDataWithHeaders) {
        // console.log("Data VM berhasil diambil dari cache.");
        const headers = allDataWithHeaders.shift();
        return { headers: headers, dataRows: allDataWithHeaders };
      }

      console.log("Cache VM kosong, membaca dari Spreadsheet...");
      const { headers, dataRows } = _ambilDataSheet(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);

      if (dataRows.length > 0) {
        saveLargeDataToCache("vm_data", [headers, ...dataRows], 21600);
      }

      return { headers, dataRows };
    },

    /**
     * Mengambil semua data Datastore.
     * @param {object} config - Objek konfigurasi.
     * @returns {{headers: Array<string>, dataRows: Array<Array<any>>}}
     */
    getSemuaDatastore: function (config) {
      const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_DS];
      return _ambilDataSheet(sheetName);
    },

    /**
     * Mengambil semua data tiket dari sheet lokal.
     * @param {object} config - Objek konfigurasi.
     * @returns {{headers: Array<string>, dataRows: Array<Array<any>>}}
     */
    getSemuaTiket: function (config) {
      const sheetName = config[KONSTANTA.KUNCI_KONFIG.NAMA_SHEET_TIKET];
      return _ambilDataSheet(sheetName);
    },
  };
})();
