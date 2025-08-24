/**
 * @file Konstanta.js
 * @author Djanoer Team
 * @date 2023-01-11
 *
 * @description
 * File terpusat untuk semua nilai konstan. Tujuannya untuk menghindari "magic strings"
 * dan memudahkan pemeliharaan dengan menyediakan satu sumber kebenaran untuk
 * nama sheet, kunci konfigurasi, nama perintah bot, dan lainnya.
 */

const KONSTANTA = {
  // Nama-nama sheet yang dibuat & dikelola oleh skrip
  NAMA_SHEET: {
    KONFIGURASI: "Konfigurasi",
    HAK_AKSES: "Hak Akses",
    LOG_PERUBAHAN: "Log Perubahan",
    LOGIKA_MIGRASI: "Logika Migrasi",
    CATATAN_VM: "Catatan VM",
    RULE_PROVISIONING: "Rule Provisioning",
    KEBIJAKAN_OVERCOMMIT_CLUSTER: "Kebijakan Overcommit Cluster",
  },

  // Kunci di sheet Konfigurasi
  KUNCI_KONFIG: {
    ID_SUMBER: "SUMBER_SPREADSHEET_ID",
    SHEET_VM: "NAMA_SHEET_DATA_UTAMA",
    SHEET_DS: "NAMA_SHEET_DATASTORE",
    SHEET_REPLIKASI: "NAMA_SHEET_DATA_REPLIKASI",
    TIKET_SPREADSHEET_ID: "TIKET_SPREADSHEET_ID",
    NAMA_SHEET_TIKET: "NAMA_SHEET_TIKET",
    FOLDER_ARSIP: "FOLDER_ID_ARSIP",
    FOLDER_EKSPOR: "FOLDER_ID_HASIL_EKSPOR",
    FOLDER_ARSIP_LOG: "FOLDER_ID_ARSIP_LOG",
    KOLOM_PANTAU: "KOLOM_YANG_DIPANTAU",
    MAP_ENV: "PEMETAAN_ENVIRONMENT",
    DS_KECUALI: "KATA_KUNCI_DS_DIKECUALIKAN",
    SHEET_LOGIKA_MIGRASI: "NAMA_SHEET_LOGIKA_MIGRASI",
    DS_NAME_HEADER: "HEADER_DATASTORE_NAME",
    VM_DS_COLUMN_HEADER: "HEADER_VM_DATASTORE_COLUMN",
    DS_PROV_GB_HEADER: "HEADER_DATASTORE_PROVISIONED_GB",
    THRESHOLD_DS_USED: "THRESHOLD_DS_USED_PERCENT",
    THRESHOLD_VM_UPTIME: "THRESHOLD_VM_UPTIME_DAYS",
    KRITIKALITAS_PANTAU: "KRITIKALITAS_VM_DIPANTAU",
    STATUS_TIKET_AKTIF: "STATUS_TIKET_AKTIF",
    STATUS_TIKET_SELESAI: "STATUS_TIKET_SELESAI",
    KATEGORI_KRITIKALITAS: "KATEGORI_KRITIKALITAS",
    KATEGORI_ENVIRONMENT: "KATEGORI_ENVIRONMENT",
    SKOR_KRITIKALITAS: "SKOR_KRITIKALITAS",
    KOLOM_PANTAU_DS: "KOLOM_PANTAU_DATASTORE",
    LOG_TOLERANCE_PROV_GB: "LOG_TOLERANCE_PROV_GB",
    FOLDER_ID_ARSIP_LOG_STORAGE: "FOLDER_ID_ARSIP_LOG_STORAGE",
    ATURAN_NAMA_DEFAULT: "ATURAN_NAMA_DEFAULT",
    KATA_KUNCI_DS_DIUTAMAKAN: "KATA_KUNCI_DS_DIUTAMAKAN",
    STRATEGI_PENEMPATAN_OPTIMAL: "STRATEGI_PENEMPATAN_OPTIMAL",

    HEADER_VM_PK: "HEADER_VM_PK",
    HEADER_VM_NAME: "HEADER_VM_NAME",
    HEADER_VM_IP: "HEADER_VM_IP",
    HEADER_VM_GUEST_OS: "HEADER_VM_GUEST_OS",
    HEADER_VM_STATE: "HEADER_VM_STATE",
    HEADER_VM_VCENTER: "HEADER_VM_VCENTER",
    HEADER_VM_CLUSTER: "HEADER_VM_CLUSTER",
    HEADER_VM_UPTIME: "HEADER_VM_UPTIME",
    HEADER_VM_CPU: "HEADER_VM_CPU",
    HEADER_VM_MEMORY: "HEADER_VM_MEMORY",
    HEADER_VM_PROV_GB: "HEADER_VM_PROV_GB",
    HEADER_VM_PROV_TB: "HEADER_VM_PROV_TB",
    HEADER_VM_KRITIKALITAS: "HEADER_VM_KRITIKALITAS",
    HEADER_VM_KELOMPOK_APP: "HEADER_VM_KELOMPOK_APP",
    HEADER_VM_DEV_OPS: "HEADER_VM_DEV_OPS",
    HEADER_VM_ENVIRONMENT: "HEADER_VM_ENVIRONMENT",
    HEADER_VM_NO_TIKET: "HEADER_VM_NO_TIKET",
    HEADER_VM_HOSTS: "HEADER_VM_HOSTS",
    HEADER_VM_TANGGAL_SETUP: "HEADER_VM_TANGGAL_SETUP",
    MAP_ALIAS_STORAGE: "MAP_ALIAS_STORAGE",
    MAP_KAPASITAS_STORAGE: "MAP_KAPASITAS_STORAGE",
    SYSTEM_LIMITS: "SYSTEM_LIMITS",
    STORAGE_UTILIZATION_THRESHOLDS: "STORAGE_UTILIZATION_THRESHOLDS",

    HEADER_DS_CAPACITY_GB: "HEADER_DS_CAPACITY_GB",
    HEADER_DS_CAPACITY_TB: "HEADER_DS_CAPACITY_TB",
    HEADER_DS_PROV_DS_GB: "HEADER_DS_PROV_DS_GB",
    HEADER_DS_PROV_DS_TB: "HEADER_DS_PROV_DS_TB",
    HEADER_DS_USED_PERCENT: "HEADER_DS_USED_PERCENT",

    HEADER_LOG_TIMESTAMP: "HEADER_LOG_TIMESTAMP",
    HEADER_LOG_ACTION: "HEADER_LOG_ACTION",
    HEADER_LOG_OLD_VAL: "HEADER_LOG_OLD_VAL",
    HEADER_LOG_NEW_VAL: "HEADER_LOG_NEW_VAL",
    HEADER_LOG_DETAIL: "HEADER_LOG_DETAIL",
    HEADER_LOG_TIPE_LOG: "HEADER_LOG_TIPE_LOG",

    HEADER_TIKET_NAMA_VM: "HEADER_TIKET_NAMA_VM",
    HEADER_TIKET_KRITIKALITAS: "HEADER_TIKET_KRITIKALITAS",
    HEADER_TIKET_LINK: "HEADER_TIKET_LINK",
    HEADER_TIKET_KATEGORI: "HEADER_TIKET_KATEGORI",
    HEADER_TIKET_TGL_CREATE: "HEADER_TIKET_TGL_CREATE",
    HEADER_TIKET_TGL_FU: "HEADER_TIKET_TGL_FU",
    HEADER_TIKET_STATUS: "HEADER_TIKET_STATUS",
    HEADER_TIKET_ACTION: "HEADER_TIKET_ACTION",
    HEADER_TIKET_TGL_DONE: "HEADER_TIKET_TGL_DONE",
    HEADER_TIKET_DEV_OPS: "HEADER_TIKET_DEV_OPS",
    HEADER_TIKET_KETERANGAN: "HEADER_TIKET_KETERANGAN",

    HEADER_PENGGUNA_ID: "User ID",
    HEADER_PENGGUNA_NAMA: "Nama Pengguna",
    HEADER_PENGGUNA_EMAIL: "Email Google",
    HEADER_PENGGUNA_ROLE: "Role",
  },

  // Nama file arsip
  NAMA_FILE: {
    ARSIP_VM: "archive_vm.json",
    ARSIP_DS: "archive_datastore.json",
  },

  // Nama-nama entitas untuk logging
  NAMA_ENTITAS: {
    VM: "VM",
    DATASTORE: "Datastore",
  },

  // Nama perintah bot
  PERINTAH_BOT: {
    // Reports & Analysis
    LAPORAN: "/daily",
    PROVISIONING: "/provisioning",
    DISTRIBUSI_VM: "/assets",
    CEK_KONDISI: "/health", // Menggabungkan /cekkesehatan dan /healthreport
    CEK_STORAGE: "/storage",
    MIGRASI_CHECK: "/migratecheck",
    HEALTH_REPORT: "/health", // Alias untuk CEK_KONDISI, menunjuk ke perintah yang sama

    // Search & History
    CEK_VM: "/vm",
    HISTORY: "/history",
    CEK_HISTORY: "/todaylog",
    CEK_CLUSTER: "/cluster",

    // Interactive & Actions
    CEK_TIKET: "/tickets",
    REKOMENDASI_SETUP: "/setup",
    GRAFIK: "/chart",
    SIMULASI: "/simulate",
    LOG_REPORT: "/logstorage",

    // Utilities
    EXPORT: "/export",
    INFO: "/help", // Mengganti /info menjadi /help
    STATUS: "/status",
    DAFTAR: "/register",

    // Administrative
    SYNC_LAPORAN: "/sync",
    ARSIPKAN_LOG: "/archive",
    CLEAR_CACHE: "/clearcache",
    MANAGE_CONFIG: "/manageconfig",
    MANAGE_USERS: "/users",
  },

  // String yang sering digunakan
  UI_STRINGS: {
    SEPARATOR: "--------------------------------------------------",
  },

  // Kumpulan pengenal internal yang digunakan dalam kode,
  // tidak untuk diubah oleh pengguna via sheet.
  TIPE_INTERNAL: {
    EKSPOR_PERINGATAN_VM: "all_vm_alerts",
  },

  // Perintah yang hanya bisa diakses oleh Admin
  PERINTAH_ADMIN: ["/sync", "/archive", "/clearcache", "/manageconfig", "/users"],

  /**
   * Mendefinisikan tipe data yang diharapkan untuk kunci konfigurasi.
   * Digunakan untuk validasi input pada fitur /manageconfig.
   */
  SKEMA_KONFIG: {
    THRESHOLD_DS_USED_PERCENT: "number",
    THRESHOLD_VM_UPTIME_DAYS: "number",
    LOG_TOLERANCE_PROV_GB: "number",
    KOLOM_YANG_DIPANTAU: "array",
    KOLOM_PANTAU_DATASTORE: "array",
    KATA_KUNCI_DS_DIKECUALIKAN: "array",
    STATUS_TIKET_AKTIF: "array",
    STATUS_TIKET_SELESAI: "array",
    SYSTEM_LIMITS: "json",
    MAP_ALIAS_STORAGE: "json",
    MAP_KAPASITAS_STORAGE: "json",
    SKOR_KRITIKALITAS: "json",
    PEMETAAN_ENVIRONMENT: "json",
    STORAGE_UTILIZATION_THRESHOLDS: "json",
    STRATEGI_PENEMPATAN_OPTIMAL: "string",
  },
};
