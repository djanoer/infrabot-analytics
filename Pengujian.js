/**
 * @file Pengujian.js
 * @description
 * Berisi suite pengujian unit (Unit Tests). Bertujuan untuk memverifikasi
 * fungsionalitas dari fungsi-fungsi individual secara terisolasi untuk
 * memastikan setiap komponen kecil bekerja sesuai harapan.
 */

// ==================================================================
// KERANGKA KERJA PENGUJIAN UNIT
// ==================================================================

/**
 * [REVISI DENGAN TOLERANSI FLOATING-POINT] Fungsi pembantu utama untuk memvalidasi hasil tes.
 * Sekarang dapat menangani perbandingan angka desimal (float) dengan toleransi presisi.
 * @param {*} expected - Nilai atau objek yang diharapkan.
 * @param {*} actual - Nilai atau objek aktual yang dihasilkan oleh fungsi yang diuji.
 * @param {string} testName - Nama deskriptif untuk pengujian.
 */
function assertEquals(expected, actual, testName) {
  let isEqual = false;

  // Cek jika kedua nilai adalah angka untuk perbandingan floating-point
  if (typeof expected === "number" && typeof actual === "number") {
    const epsilon = 1e-9; // Menetapkan toleransi yang sangat kecil
    isEqual = Math.abs(expected - actual) < epsilon;
  } else {
    // Gunakan perbandingan string untuk semua tipe data lain (objek, string, dll.)
    isEqual = JSON.stringify(expected) === JSON.stringify(actual);
  }

  if (!isEqual) {
    console.error(`❌ GAGAL: ${testName}.`);
    console.error(`   - Diharapkan: ${JSON.stringify(expected)}`);
    console.error(`   - Hasil:      ${JSON.stringify(actual)}`);
  } else {
    console.log(`✅ LULUS: ${testName}`);
  }
}

/**
 * Runner utama untuk mengeksekusi semua suite pengujian unit.
 * Jalankan fungsi ini dari editor Apps Script.
 */
function jalankanSemuaTes() {
  console.log("🚀 Memulai Pengujian Unit...");

  // Jalankan setiap suite tes
  tesFungsiUtilitas();
  tesFungsiValidasi();
  tesFungsiParsing();
  tesFungsiAnalisis();
  tesFungsiPenyimpanan();
  tesFungsiRekomendasi(); // <-- TAMBAHKAN PEMANGGILAN INI

  console.log("\n🏁 Pengujian Unit Selesai.");
}

// ==================================================================
// SUITE PENGUJIAN
// ==================================================================

/**
 * Suite tes untuk fungsi-fungsi pembantu di Utilitas.js.
 */
function tesFungsiUtilitas() {
  console.log("\n--- Menguji File: Utilitas.js ---");

  // Tes untuk fungsi normalizePrimaryKey
  assertEquals("VM-123", normalizePrimaryKey("VM-123-VC01"), "normalizePrimaryKey: Hapus sufiks -VC01");
  assertEquals("VM-ABC", normalizePrimaryKey("VM-ABC-VC10"), "normalizePrimaryKey: Hapus sufiks -VC10");
  assertEquals("VM-TANPA-SUFIKS", normalizePrimaryKey("VM-TANPA-SUFIKS"), "normalizePrimaryKey: Tanpa perubahan");
  assertEquals("", normalizePrimaryKey(null), "normalizePrimaryKey: Input null harus mengembalikan string kosong");
}

/**
 * [BARU - FASE 2] Suite tes untuk fungsi validasi keamanan di Utilitas.js.
 */
function tesFungsiValidasi() {
  console.log("\n--- Menguji File: Utilitas.js (Fungsi Keamanan) ---");

  // Tes Positif (Input yang seharusnya diterima)
  assertEquals(true, isValidInput("VM ini perlu di-patch besok."), "isValidInput: Teks normal harus valid.");
  assertEquals(
    true,
    isValidInput("Catatan: CPU load tinggi pada jam 10."),
    "isValidInput: Teks dengan angka dan titik dua harus valid."
  );

  // Tes Negatif (Input yang harus ditolak)
  assertEquals(false, isValidInput("=SUM(A1:B2)"), "isValidInput: Input dimulai dengan '=' harus ditolak.");
  assertEquals(false, isValidInput("+C1+C2"), "isValidInput: Input dimulai dengan '+' harus ditolak.");
  assertEquals(false, isValidInput("-D1-D2"), "isValidInput: Input dimulai dengan '-' harus ditolak.");
  assertEquals(false, isValidInput("@E1"), "isValidInput: Input dimulai dengan '@' harus ditolak.");
  assertEquals(false, isValidInput(""), "isValidInput: String kosong harus ditolak.");
  assertEquals(false, isValidInput("   "), "isValidInput: String berisi spasi saja harus ditolak.");
  assertEquals(false, isValidInput(null), "isValidInput: Input null harus ditolak.");
}

/**
 * Suite tes untuk fungsi-fungsi parsing di Parser.js.
 */
function tesFungsiParsing() {
  console.log("\n--- Menguji File: Parser.js ---");

  // Tes untuk parseAlletraReport
  const laporanAlletra = `MA-STORAGE : HPE STORAGE ALLETRA A\nUsage : 41.0 TiB\nTotal Capacity : 247.5 TiB\nSnapshot Usage : 1.0 TiB`;
  const hasilAlletra = parseAlletraReport(laporanAlletra);
  assertEquals(41.0, hasilAlletra.usage.value, "parseAlletraReport: Ekstrak nilai Usage");
  assertEquals("TiB", hasilAlletra.usage.unit, "parseAlletraReport: Ekstrak unit Usage");
  assertEquals(247.5, hasilAlletra.totalCapacity.value, "parseAlletraReport: Ekstrak nilai Total Capacity");

  // Tes untuk parseVspReport
  const laporanVsp = `Storage VSP E790 A\nPool Used : 75.5 TiB\nIOPS : 5,000 Operations/s\nMP Utilization : 20 %`;
  const hasilVsp = parseVspReport(laporanVsp);
  assertEquals(75.5, hasilVsp.usage.value, "parseVspReport: Ekstrak nilai Pool Used");
  assertEquals("TiB", hasilVsp.usage.unit, "parseVspReport: Ekstrak unit Pool Used");
  assertEquals(5000, hasilVsp.iops.value, "parseVspReport: Ekstrak nilai IOPS dengan koma");
}

/**
 * Suite tes untuk fungsi-fungsi analitis di Analisis.js.
 */
function tesFungsiAnalisis() {
  console.log("\n--- Menguji File: Analisis.js ---");

  // Mock config sederhana untuk skoring
  const mockConfig = {
    SKOR_KRITIKALITAS: {
      CRITICAL: 5,
      HIGH: 4,
      MEDIUM: 3,
      LOW: 2,
      "NON-CRITICAL": 1,
    },
  };

  // Tes untuk calculateMigrationScore
  const vmMati = { state: "poweredOff" };
  assertEquals(
    99,
    calculateMigrationScore(vmMati, mockConfig),
    "calculateMigrationScore: VM mati harus memiliki skor sangat tinggi"
  );

  const vmUnused = { name: "server-decom-01", state: "poweredOn" };
  assertEquals(
    99,
    calculateMigrationScore(vmUnused, mockConfig),
    "calculateMigrationScore: VM 'decom' harus memiliki skor sangat tinggi"
  );

  const vmKritis = { name: "prod-db-01", state: "poweredOn", criticality: "CRITICAL" };
  assertEquals(
    90,
    calculateMigrationScore(vmKritis, mockConfig),
    "calculateMigrationScore: VM Kritis aktif harus memiliki skor lebih rendah (95-5=90)"
  );

  const vmNonKritis = { name: "test-web-01", state: "poweredOn", criticality: "NON-CRITICAL" };
  assertEquals(
    94,
    calculateMigrationScore(vmNonKritis, mockConfig),
    "calculateMigrationScore: VM Non-Kritis aktif harus memiliki skor tinggi (95-1=94)"
  );
}

/**
 * Suite tes untuk fungsi-fungsi di Penyimpanan.js.
 */
function tesFungsiPenyimpanan() {
  console.log("\n--- Menguji File: Penyimpanan.js ---");

  // Tes untuk convertUnit
  assertEquals(1.099511627776, convertUnit(1, "TiB", "TB"), "convertUnit: Konversi TiB ke TB");
  assertEquals(1073.741824, convertUnit(1000, "GiB", "GB"), "convertUnit: Konversi GiB ke GB");
  // Ekspektasi sekarang menggunakan nilai yang benar-benar presisi
  assertEquals(1073.741824, convertUnit(1, "GiB/s", "MB/s"), "convertUnit: Konversi GiB/s ke MB/s");
  assertEquals(50, convertUnit(50, "TB", "TB"), "convertUnit: Satuan sama tidak boleh berubah");
}

/**
 * [BARU] Suite tes untuk fungsi-fungsi inti di dalam mesin rekomendasi.
 */
function tesFungsiRekomendasi() {
  console.log("\n--- Menguji File: Rekomendasi.js ---");

  // --- Skenario 1: Pengujian Logika Penilaian Skor ---
  const mockCandidates = [{ dsName: "DS_TEST_01", clusterName: "CLUSTER_A" }];
  const mockClusterLoad = new Map([["CLUSTER_A", { cpu: 300, memory: 5000 }]]);
  const mockClusterPolicies = new Map([
    ["CLUSTER_A", { physicalcpucores: 100, cpuovercommitratio: 4, physicalmemorytb: 8, memoryovercommitratio: 1.5 }],
  ]);
  // Mock getDatastoreDetails agar tidak perlu memanggil sheet asli
  const mockDatastoreDetailsMap = new Map([["DS_TEST_01", { freeGb: 500, capacityGb: 1000, usagePercent: 50 }]]);

  // Panggil fungsi yang diuji
  const hasilSkor = skorLokasiKandidat(
    mockCandidates,
    {},
    mockClusterLoad,
    mockClusterPolicies,
    mockDatastoreDetailsMap
  );

  // Kalkulasi manual yang diharapkan:
  // Skor Datastore: freePercent = 50%, skor = (50/50) * 60 = 60
  // Skor Cluster: maxCpu = 100*4=400. util = (300/400)*100 = 75%.
  //               skor = (1 - ((75-60)/35)) * 40 = (1 - 0.428) * 40 = 22.88
  // Total = 60 + 22.88 = 82.88 -> dibulatkan jadi 82.9
  assertEquals(82.9, hasilSkor[0].skor.total, "skorLokasiKandidat: Kalkulasi skor gabungan harus akurat.");
  console.log("     -> ✅ LULUS: Logika penilaian skor bekerja sesuai ekspektasi.");

  // --- Skenario 2: Pengujian Pemilihan Aturan (Rule Finding) ---
  const mockRules = [
    { kritikalitas: "Default", ioprofile: "*", vcentertarget: "VC01" },
    { kritikalitas: "Critical", ioprofile: "High", vcentertarget: "VC02_VIP" },
    { namaaplikasi: ["BRImo", "QLola"], vcentertarget: "VC02_VIP_APPS" },
  ];

  // Tes 1: Harus memilih aturan spesifik aplikasi (Lapisan 1)
  let requirements = { namaAplikasi: "BRImo" };
  let a_rule = findApplicableRule(requirements, mockRules);
  assertEquals(
    "VC02_VIP_APPS",
    a_rule.vcentertarget,
    "findApplicableRule: Harus memprioritaskan aturan Nama Aplikasi."
  );

  // Tes 2: Harus memilih aturan kritikalitas (Lapisan 2)
  requirements = { kritikalitas: "Critical", io: "High" };
  a_rule = findApplicableRule(requirements, mockRules);
  assertEquals(
    "VC02_VIP",
    a_rule.vcentertarget,
    "findApplicableRule: Harus memilih aturan Kritikalitas jika nama aplikasi tidak cocok."
  );

  // Tes 3: Harus memilih aturan default (Jaring Pengaman)
  requirements = { kritikalitas: "Low" };
  a_rule = findApplicableRule(requirements, mockRules);
  assertEquals(
    "VC01",
    a_rule.vcentertarget,
    "findApplicableRule: Harus memilih aturan Default jika tidak ada yang cocok."
  );
  console.log("     -> ✅ LULUS: Logika pemilihan aturan dua lapis bekerja dengan benar.");
}

// File: Debugging.js (atau file lain pilihan Anda)

/**
 * Fungsi ini dirancang khusus untuk melakukan debugging end-to-end pada
 * alur kerja analisis rekomendasi migrasi dan provisi. Ia akan mencatat
 * setiap langkah kritis ke dalam log eksekusi.
 */
function debugMesinAnalisis() {
  // Logger.log() akan mencetak pesan ke dalam log eksekusi Apps Script.
  Logger.log("🚀 MEMULAI SESI DEBUGGING MESIN ANALISIS 🚀");

  try {
    // --- TAHAP 1: Memuat Konfigurasi ---
    Logger.log("\n--- FASE 1: Memuat Konfigurasi ---");
    const { config } = getBotState();
    if (!config || Object.keys(config).length === 0) {
      Logger.log("❌ GAGAL: Tidak dapat memuat konfigurasi (config). Proses dihentikan.");
      return;
    }
    Logger.log("✅ SUKSES: Konfigurasi (config) berhasil dimuat.");

    // --- TAHAP 2: Mengumpulkan Data Sumber ---
    Logger.log("\n--- FASE 2: Memanggil _gatherMigrationDataSource ---");
    // Kita panggil fungsi pengumpul data secara langsung untuk mengujinya.
    const { allDatastores, allVms, vmHeaders, migrationConfig } = _gatherMigrationDataSource(config);

    // Validasi hasil pengumpulan data
    Logger.log(`   - Ditemukan ${allDatastores.length} datastore.`);
    Logger.log(`   - Ditemukan ${allVms.length} VM.`);
    Logger.log(`   - Ditemukan ${migrationConfig.size} aturan migrasi.`);

    if (allDatastores.length === 0 || allVms.length === 0) {
      Logger.log("❌ GAGAL: Salah satu data sumber (VM atau Datastore) kosong. Proses dihentikan.");
      return;
    }
    Logger.log("✅ SUKSES: Pengumpulan semua data sumber berhasil.");

    // --- TAHAP 3: Menjalankan Mesin Analisis Utama ---
    Logger.log("\n--- FASE 3: Memanggil jalankanRekomendasiMigrasi ---");
    Logger.log("   - Memanggil mesin analisis dengan semua data yang sudah terkumpul...");

    // Kita panggil fungsi utama dengan semua data yang sudah kita validasi.
    // Karena fungsi ini langsung mengirim ke Telegram, kita tidak perlu menangkap hasilnya.
    jalankanRekomendasiMigrasi(config, allDatastores, allVms, vmHeaders, migrationConfig);

    Logger.log("✅ SUKSES: Eksekusi jalankanRekomendasiMigrasi selesai tanpa menimbulkan error fatal.");
    Logger.log("\n🏁 SESI DEBUGGING SELESAI. Periksa log di atas dan pesan di Telegram untuk hasilnya.");
  } catch (e) {
    // Ini adalah bagian terpenting. Jika ada error di mana pun, ia akan ditangkap di sini.
    Logger.log(`🔥🔥🔥 ERROR KRITIS TERDETEKSI SELAMA DEBUGGING 🔥🔥🔥`);
    Logger.log(`Pesan Error: ${e.message}`);
    Logger.log(`Nama File: ${e.fileName}`);
    Logger.log(`Nomor Baris: ${e.lineNumber}`);
    Logger.log(`Jejak Tumpukan (Stack Trace): \n${e.stack}`);
    Logger.log("🏁 SESI DEBUGGING DIHENTIKAN KARENA ERROR.");
  }
}

// File: Debugging.js (atau file lain pilihan Anda)

/**
 * [BARU & TEPAT SASARAN] Fungsi ini dirancang khusus untuk melakukan debugging
 * end-to-end pada alur kerja rekomendasi provisi (/provision).
 */
function debugMesinProvisi() {
  Logger.log("🚀 MEMULAI SESI DEBUGGING MESIN REKOMENDASI PROVISI 🚀");

  try {
    // --- TAHAP 1: Menyiapkan Skenario Uji Coba ---
    Logger.log("\n--- FASE 1: Menyiapkan Skenario Uji Coba ---");
    const { config } = getBotState();
    if (!config) {
      Logger.log("❌ GAGAL: Tidak dapat memuat konfigurasi (config).");
      return;
    }

    // Simulasikan permintaan pengguna untuk VM 'Critical' dengan I/O 'High'
    const requirements = {
      kritikalitas: "Critical",
      io: "High",
      cpu: 8,
      memory: 16,
      disk: 100,
    };
    Logger.log(`   - Mensimulasikan permintaan: ${JSON.stringify(requirements)}`);
    Logger.log("✅ SUKSES: Skenario uji coba siap.");

    // --- TAHAP 2: Menjalankan Mesin Rekomendasi ---
    Logger.log("\n--- FASE 2: Memanggil dapatkanRekomendasiPenempatan ---");
    Logger.log("   - Memulai analisis...");

    const hasilRekomendasi = dapatkanRekomendasiPenempatan(requirements, config);

    Logger.log("✅ SUKSES: Eksekusi dapatkanRekomendasiPenempatan selesai tanpa error fatal.");
    Logger.log("\n--- HASIL AKHIR REKOMENDASI ---");
    Logger.log(hasilRekomendasi); // Cetak hasil akhir yang seharusnya dikirim ke Telegram

    Logger.log("\n🏁 SESI DEBUGGING SELESAI.");
  } catch (e) {
    // Jika ada error di mana pun, ia akan ditangkap di sini.
    Logger.log(`🔥🔥🔥 ERROR KRITIS TERDETEKSI SELAMA DEBUGGING 🔥🔥🔥`);
    Logger.log(`Pesan Error: ${e.message}`);
    Logger.log(`Nama File: ${e.fileName}`);
    Logger.log(`Nomor Baris: ${e.lineNumber}`);
    Logger.log(`Jejak Tumpukan (Stack Trace): \n${e.stack}`);
    Logger.log("🏁 SESI DEBUGGING DIHENTIKAN KARENA ERROR.");
  }
}
