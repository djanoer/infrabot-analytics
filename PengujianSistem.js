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
      return this;
    },
    getProperty: function (key) {
      return this._props[key];
    },
    setProperty: function (key, value) {
      this._props[key] = value;
    },
    deleteProperty: function (key) {
      delete this._props[key];
    },
    getKeys: function () {
      return Object.keys(this._props);
    },
  },
};

/**
 * FUNGSI UTAMA: Jalankan fungsi ini dari editor untuk memulai semua pengujian sistem.
 */
function jalankanSemuaTesSistem() {
  console.log("🚀 Memulai Pengujian Sistem End-to-End...");

  const originalServices = {
    UrlFetchApp: typeof UrlFetchApp !== "undefined" ? UrlFetchApp : undefined,
    CacheService: typeof CacheService !== "undefined" ? CacheService : undefined,
    SpreadsheetApp: typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp : undefined,
    PropertiesService: typeof PropertiesService !== "undefined" ? PropertiesService : undefined,
    exportResultsToSheet: typeof exportResultsToSheet !== "undefined" ? exportResultsToSheet : undefined,
  };

  UrlFetchApp = MockServices.UrlFetchApp;
  CacheService = MockServices.CacheService;
  SpreadsheetApp = MockServices.SpreadsheetApp;
  PropertiesService = MockServices.PropertiesService;

  try {
    testAlurCekVmDanDetail();
    testAlurEksporLengkap(); // <-- Menambahkan skenario pengujian baru

    console.log("\n🎉 SEMUA SKENARIO PENGUJIAN SISTEM LULUS!");
  } catch (e) {
    console.error(`\n🔥 PENGUJIAN GAGAL PADA SALAH SATU SKENARIO: ${e.message}\n${e.stack}`);
  } finally {
    UrlFetchApp = originalServices.UrlFetchApp;
    CacheService = originalServices.CacheService;
    SpreadsheetApp = originalServices.SpreadsheetApp;
    PropertiesService = originalServices.PropertiesService;
    exportResultsToSheet = originalServices.exportResultsToSheet;

    console.log("✅ Pengujian Sistem Selesai.");
  }
}

// =================================================================
// SKENARIO PENGUJIAN
// =================================================================

function testAlurCekVmDanDetail() {
  console.log("\n🧪 MENGUJI: Alur /carivm -> Detail VM");

  // Setup lingkungan uji
  MockServices.UrlFetchApp.clear();
  MockServices.CacheService.clear();
  MockServices.SpreadsheetApp.clear();
  MockServices.PropertiesService._props = {};
  botState = null;

  const mockConfigData = [
    ["Kunci", "Nilai"],
    ["NAMA_SHEET_DATA_UTAMA", "Data VM Uji"],
    ["HEADER_VM_PK", "Primary Key"],
    ["HEADER_VM_NAME", "Virtual Machine"],
    ["HEADER_VM_IP", "IP Address"],
    ["HEADER_VM_STATE", "State"],
    ["HEADER_VM_UPTIME", "Uptime"],
    ["HEADER_VM_CPU", "CPU"],
    ["HEADER_VM_MEMORY", "Memory"],
    ["HEADER_VM_PROV_GB", "Provisioned (GB)"],
    ["HEADER_VM_CLUSTER", "Cluster"],
    ["HEADER_VM_DATASTORE_COLUMN", "Datastore"],
    ["HEADER_VM_KRITIKALITAS", "Kritikalitas"],
    ["HEADER_VM_KELOMPOK_APP", "Aplikasi BIA"],
    ["HEADER_VM_DEV_OPS", "DEV/OPS"],
    ["HEADER_VM_GUEST_OS", "Guest OS"],
    ["HEADER_VM_VCENTER", "vCenter"],
    ["HEADER_VM_NO_TIKET", "No Tiket"],
    ["HEADER_VM_HOSTS", "Host"],
    ["HEADER_VM_TANGGAL_SETUP", "Tanggal Setup"],
    ["SUMBER_SPREADSHEET_ID", "fake_sumber_id"],
    ["FOLDER_ID_ARSIP", "fake_folder_arsip"],
    ["NAMA_SHEET_TIKET", "Tiket Uji Coba"],
    ["WEBHOOK_BOT_TOKEN", "fake_webhook_token"],
  ];
  MockServices.SpreadsheetApp.setSheetData("Konfigurasi", mockConfigData);

  const mockVmData = [
    [
      "Primary Key",
      "Virtual Machine",
      "IP Address",
      "State",
      "Uptime",
      "CPU",
      "Memory",
      "Provisioned (GB)",
      "Cluster",
      "Datastore",
      "Kritikalitas",
      "Aplikasi BIA",
      "DEV/OPS",
      "Guest OS",
      "vCenter",
      "No Tiket",
      "Host",
      "Tanggal Setup",
    ],
    [
      "VM-001-VC01",
      "WEB_SERVER_PROD",
      "10.10.1.5",
      "poweredOn",
      "100",
      "8",
      "16",
      "100",
      "PROD-CLUSTER-A",
      "DS_PROD_01",
      "CRITICAL",
      "Portal Web",
      "John Doe",
      "Linux",
      "VC01",
      "TICKET-123",
      "HOST-01",
      new Date(),
    ],
  ];
  MockServices.SpreadsheetApp.setSheetData("Data VM Uji", mockVmData);

  MockServices.SpreadsheetApp.setSheetData("Hak Akses", [
    ["User ID", "Nama", "Email", "Role"],
    ["1", "Tester", "test@example.com", "Admin"],
  ]);
  MockServices.SpreadsheetApp.setSheetData("Catatan VM", [["VM Primary Key", "Isi Catatan"]]);
  MockServices.SpreadsheetApp.setSheetData("Tiket Uji Coba", [["Nama VM", "Status"]]);
  MockServices.PropertiesService.setProperty("TELEGRAM_BOT_TOKEN", "fake_telegram_token");
  MockServices.PropertiesService.setProperty("WEBHOOK_BOT_TOKEN", "fake_webhook_token");

  console.log("   - Setup: Lingkungan steril disiapkan.");

  // Eksekusi
  const updateCekVm = {
    message: { from: { id: 1, first_name: "Tester" }, chat: { id: -1001 }, text: "/carivm VM-001" },
  };
  doPost({ postData: { contents: JSON.stringify(updateCekVm) }, parameter: { token: "fake_webhook_token" } });

  // Verifikasi
  let lastRequest = MockServices.UrlFetchApp.getLastRequest();
  assertTrue(lastRequest, "Bot seharusnya mengirimkan pesan balasan");
  let payload = JSON.parse(lastRequest.params.payload);

  assertTrue(payload.text.includes("Detail Virtual Machine"), "Pesan Detail VM harus muncul");
  assertTrue(payload.text.includes("WEB_SERVER_PROD"), "Nama VM yang benar harus ada di detail");
  console.log("     -> ✅ LULUS: Pesan detail VM berhasil dikirim.");
}

/**
 * [BARU] Mensimulasikan seluruh alur ekspor dari klik tombol hingga eksekusi di antrean.
 */
function testAlurEksporLengkap() {
  console.log("\n🧪 MENGUJI: Alur Ekspor Lengkap (Menu -> Antrean -> Hasil)");

  // Setup
  MockServices.UrlFetchApp.clear();
  MockServices.CacheService.clear();
  MockServices.SpreadsheetApp.clear();
  MockServices.PropertiesService._props = {};
  botState = null;

  const mockConfigData = [
    ["Kunci", "Nilai"],
    ["NAMA_SHEET_DATA_UTAMA", "Data VM Uji"],
    ["SUMBER_SPREADSHEET_ID", "id_sumber_palsu"], // <-- Kunci yang hilang ditambahkan
    ["FOLDER_ID_ARSIP", "id_arsip_palsu"], // <-- Kunci yang hilang ditambahkan
    ["HEADER_LOG_ACTION", "Aksi"],
    ["HEADER_LOG_TIMESTAMP", "Timestamp"],
    ["FOLDER_EKSPOR", "folder_id_palsu"],
    ["WEBHOOK_BOT_TOKEN", "fake_webhook_token"],
  ];
  MockServices.SpreadsheetApp.setSheetData("Konfigurasi", mockConfigData);
  MockServices.SpreadsheetApp.setSheetData("Log Perubahan", [
    ["Timestamp", "Aksi"],
    [new Date(), "MODIFIKASI"],
  ]);
  MockServices.SpreadsheetApp.setSheetData("Hak Akses", [
    ["User ID", "Nama", "Email", "Role"],
    ["1", "Tester", "tester@example.com", "Admin"],
  ]);
  MockServices.PropertiesService.setProperty("TELEGRAM_BOT_TOKEN", "fake_token");
  MockServices.PropertiesService.setProperty("WEBHOOK_BOT_TOKEN", "fake_token");

  const state = getBotState();

  // Langkah 1: Simulasi pengguna menekan tombol ekspor
  console.log("   - Langkah 1: Pengguna menekan tombol ekspor 'Log Hari Ini'");
  const updatePalsu = {
    callback_query: {
      id: "query123",
      from: { id: 1, first_name: "Tester" },
      message: { chat: { id: "chat123" }, message_id: "msg123" },
      data: CallbackHelper.build("export_machine", "run", { type: "log_today" }, state.config),
    },
  };
  doPost({ postData: { contents: JSON.stringify(updatePalsu) }, parameter: { token: state.config.WEBHOOK_BOT_TOKEN } });

  // Verifikasi pekerjaan ditambahkan ke antrean
  const antrean = MockServices.PropertiesService._props;
  const kunciPekerjaan = Object.keys(antrean).find((k) => k.startsWith("job_"));
  assertTrue(kunciPekerjaan, "Pekerjaan seharusnya ditambahkan ke antrean");
  console.log("     -> ✅ LULUS: Pekerjaan berhasil ditambahkan ke antrean.");

  // Langkah 2: Simulasi pemicu antrean berjalan
  console.log("   - Langkah 2: Pemicu antrean memproses pekerjaan");

  let exportCalled = false;
  // Ganti fungsi asli dengan mock untuk mencegah pengiriman file nyata
  exportResultsToSheet = () => {
    exportCalled = true;
  };

  prosesAntreanTugas(); // Jalankan prosesor antrean

  assertTrue(exportCalled, "Fungsi exportResultsToSheet seharusnya dipanggil");
  console.log("     -> ✅ LULUS: Fungsi ekspor inti berhasil dipanggil oleh prosesor antrean.");
}

// =================================================================
// FUNGSI PEMBANTU PENGUJIAN
// =================================================================

function assertTrue(condition, testName) {
  if (!condition) {
    throw new Error(`GAGAL: ${testName}`);
  }
}
