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
  if (typeof expected === 'number' && typeof actual === 'number') {
    const epsilon = 1e-9; // Menetapkan toleransi yang sangat kecil
    isEqual = Math.abs(expected - actual) < epsilon;
  } else {
    // Gunakan perbandingan string untuk semua tipe data lain (objek, string, dll.)
    isEqual = (JSON.stringify(expected) === JSON.stringify(actual));
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
  assertEquals(true, isValidInput("Catatan: CPU load tinggi pada jam 10."), "isValidInput: Teks dengan angka dan titik dua harus valid.");
  
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
      "CRITICAL": 5,
      "HIGH": 4,
      "MEDIUM": 3,
      "LOW": 2,
      "NON-CRITICAL": 1
    }
  };

  // Tes untuk calculateMigrationScore
  const vmMati = { state: 'poweredOff' };
  assertEquals(99, calculateMigrationScore(vmMati, mockConfig), "calculateMigrationScore: VM mati harus memiliki skor sangat tinggi");

  const vmUnused = { name: 'server-decom-01', state: 'poweredOn' };
  assertEquals(99, calculateMigrationScore(vmUnused, mockConfig), "calculateMigrationScore: VM 'decom' harus memiliki skor sangat tinggi");

  const vmKritis = { name: 'prod-db-01', state: 'poweredOn', criticality: 'CRITICAL' };
  assertEquals(90, calculateMigrationScore(vmKritis, mockConfig), "calculateMigrationScore: VM Kritis aktif harus memiliki skor lebih rendah (95-5=90)");
  
  const vmNonKritis = { name: 'test-web-01', state: 'poweredOn', criticality: 'NON-CRITICAL' };
  assertEquals(94, calculateMigrationScore(vmNonKritis, mockConfig), "calculateMigrationScore: VM Non-Kritis aktif harus memiliki skor tinggi (95-1=94)");
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