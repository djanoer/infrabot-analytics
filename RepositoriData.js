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
     * [BARU] Membaca aturan penempatan dinamis dari sheet.
     * @returns {Array<object>} Array berisi objek aturan.
     */
    getAturanPenempatan: function () {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KONSTANTA.NAMA_SHEET.RULE_PROVISIONING);
      const rules = [];

      if (!sheet || sheet.getLastRow() < 2) {
        console.error("Sheet 'Rule Provisioning' tidak ditemukan atau kosong.");
        return rules;
      }

      const data = sheet.getDataRange().getValues();
      const headers = data.shift().map((h) => h.toLowerCase().replace(/\s+/g, ""));

      data.forEach((row) => {
        if (row.every((cell) => cell === "")) return;
        const rule = {};
        headers.forEach((header, index) => {
          const cellValue = row[index];
          if (typeof cellValue === "string" && cellValue.includes(",")) {
            rule[header] = cellValue
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
          } else {
            rule[header] = cellValue;
          }
        });
        rules.push(rule);
      });

      return rules;
    },

    /**
     * [BARU] Membaca kebijakan overcommit cluster dari sheet.
     * @returns {Map<string, object>} Peta berisi kebijakan per cluster.
     */
    getKebijakanCluster: function () {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KONSTANTA.NAMA_SHEET.KEBIJAKAN_OVERCOMMIT_CLUSTER);
      const policies = new Map();

      if (!sheet || sheet.getLastRow() < 2) {
        console.error("Sheet 'Kebijakan Overcommit Cluster' tidak ditemukan atau kosong.");
        return policies;
      }

      const data = sheet.getDataRange().getValues();
      const headers = data.shift().map((h) => h.toLowerCase().replace(/\s+/g, "")); // Normalisasi header

      const clusterNameIndex = headers.indexOf("clustername");
      if (clusterNameIndex === -1) {
        console.error("Header 'Cluster Name' tidak ditemukan di sheet Kebijakan.");
        return policies;
      }

      data.forEach((row) => {
        const clusterName = row[clusterNameIndex];
        if (clusterName) {
          const policy = {};
          headers.forEach((header, index) => {
            policy[header] = row[index];
          });
          policies.set(clusterName, policy);
        }
      });

      return policies;
    },

    /**
     * [BARU] Mengambil semua catatan VM dari sheet.
     * @returns {Map<string, object>} Peta berisi data catatan per Primary Key.
     */
    getSemuaCatatan: function() {
      const sheetName = KONSTANTA.NAMA_SHEET.CATATAN_VM;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      const catatanMap = new Map();

      if (!sheet || sheet.getLastRow() <= 1) {
        return catatanMap;
      }

      const data = sheet.getDataRange().getValues();
      const headers = data.shift();
      const pkIndex = headers.indexOf("VM Primary Key");
      if (pkIndex === -1) {
        console.error("Header 'VM Primary Key' tidak ditemukan di sheet Catatan VM.");
        return catatanMap;
      }

      data.forEach(row => {
        const pk = row[pkIndex];
        if (pk) {
          const noteData = {};
          headers.forEach((header, index) => {
            noteData[header] = row[index];
          });
          catatanMap.set(pk, noteData);
        }
      });

      return catatanMap;
    },

    /**
     * [BARU] Menyimpan (Create/Update) sebuah catatan VM di sheet.
     * @param {string} vmPrimaryKey - Primary key dari VM.
     * @param {string} noteText - Isi catatan.
     * @param {object} userData - Objek data pengguna yang menyimpan.
     * @returns {boolean} True jika berhasil.
     */
    simpanAtauPerbaruiCatatan: function(vmPrimaryKey, noteText, userData) {
      const sheetName = KONSTANTA.NAMA_SHEET.CATATAN_VM;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return false;

      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const pkIndex = headers.indexOf("VM Primary Key");

      let rowIndexToUpdate = -1;
      for (let i = 1; i < data.length; i++) {
        if (data[i][pkIndex] === vmPrimaryKey) {
          rowIndexToUpdate = i + 1;
          break;
        }
      }

      const timestamp = new Date();
      const userName = userData.firstName || "Pengguna";
      const sanitizedNoteText = "'" + noteText;

      try {
        if (rowIndexToUpdate > -1) {
          sheet.getRange(rowIndexToUpdate, pkIndex + 2, 1, 3).setValues([[sanitizedNoteText, timestamp, userName]]);
        } else {
          sheet.appendRow([vmPrimaryKey, sanitizedNoteText, timestamp, userName]);
        }
        return true;
      } catch (e) {
        console.error(`Gagal menyimpan catatan untuk VM ${vmPrimaryKey}. Error: ${e.message}`);
        return false;
      }
    },

    /**
     * [BARU] Menghapus sebuah catatan VM dari sheet.
     * @param {string} vmPrimaryKey - Primary key dari VM.
     * @returns {boolean} True jika berhasil.
     */
    hapusCatatan: function(vmPrimaryKey) {
      const sheetName = KONSTANTA.NAMA_SHEET.CATATAN_VM;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);

      if (!sheet || sheet.getLastRow() <= 1) return false;

      const data = sheet.getDataRange().getValues();
      const pkIndex = data[0].indexOf("VM Primary Key");

      for (let i = 1; i < data.length; i++) {
        if (data[i][pkIndex] === vmPrimaryKey) {
          try {
            sheet.deleteRow(i + 1);
            return true;
          } catch (e) {
            console.error(`Gagal menghapus baris ${i + 1}. Error: ${e.message}`);
            return false;
          }
        }
      }
      return false;
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

    /**
     * [BARU] Menambahkan data pengguna baru ke sheet "Hak Akses".
     * @param {string} userId - ID pengguna Telegram.
     * @param {string} firstName - Nama depan pengguna.
     * @param {string} email - Email pengguna.
     * @param {string} role - Peran pengguna (User/Admin).
     * @returns {boolean} True jika berhasil, false jika duplikat.
     */
    tambahPenggunaBaru: function(userId, firstName, email, role) {
      try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KONSTANTA.NAMA_SHEET.HAK_AKSES);
        
        // Cek duplikat
        const data = sheet.getDataRange().getValues();
        const idColumnIndex = data[0].indexOf("User ID");
        if (idColumnIndex === -1) {
            console.error("Header 'User ID' tidak ditemukan di sheet Hak Akses.");
            return false; // Gagal jika struktur sheet salah
        }

        const existingIds = data.slice(1).map(row => String(row[idColumnIndex]));
        if (existingIds.includes(String(userId))) {
          console.warn(`Upaya mendaftarkan User ID duplikat: ${userId}`);
          return false;
        }

        // Tambahkan baris baru
        sheet.appendRow([userId, firstName, email, role]);
        return true;
      } catch (e) {
        console.error(`Gagal menambahkan pengguna ke sheet: ${e.message}`);
        return false;
      }
    },
  };
})();
