/**
 * @file Rekomendasi.js
 * @author Djanoer Team
 * @date 2023-07-20
 *
 * @description
 * Mengelola alur percakapan terpandu dan mesin rekomendasi untuk penempatan VM baru.
 * Menangani interaksi multi-langkah dengan pengguna untuk mengumpulkan
 * kebutuhan dan kemudian mencarikan lokasi terbaik berdasarkan aturan yang ada.
 */

/**
 * [REVISI TOTAL - TAHAN BANTING & STRATEGIS] Fungsi orkestrator utama untuk mendapatkan rekomendasi.
 * Dilengkapi dengan validasi data, penanganan risiko, dan logika pengurutan strategis.
 */
function dapatkanRekomendasiPenempatan(requirements, config) {
  try {
    // --- LAPIS PERTAHANAN 1: Validasi data sumber ---
    const { headers: vmHeaders, dataRows: allVmData } = RepositoriData.getSemuaVm(config);
    const { headers: dsHeaders, dataRows: allDsData } = RepositoriData.getSemuaDatastore(config);
    const allRules = RepositoriData.getAturanPenempatan();
    const clusterPolicies = RepositoriData.getKebijakanCluster();

    if (!allVmData || allVmData.length === 0) throw new Error("Data VM tidak ditemukan atau kosong.");
    if (!allDsData || allDsData.length === 0) throw new Error("Data Datastore tidak ditemukan atau kosong.");
    if (!allRules || allRules.length === 0)
      throw new Error("Aturan penempatan di 'Rule Provisioning' tidak ditemukan.");
    if (!clusterPolicies || clusterPolicies.size === 0)
      throw new Error("Kebijakan overcommit cluster tidak ditemukan.");

    const vmCountByDatastore = new Map();
    const vmDsIndex = vmHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER]);
    if (vmDsIndex !== -1) {
      allVmData.forEach((vmRow) => {
        const dsName = vmRow[vmDsIndex];
        if (dsName) {
          vmCountByDatastore.set(dsName, (vmCountByDatastore.get(dsName) || 0) + 1);
        }
      });
    }

    const datastoreDetailsMap = new Map();
    const migrationConfig = getMigrationConfig(
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.LOGIKA_MIGRASI])
    );

    allDsData.forEach((dsRow) => {
      const dsNameIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
      const dsName = dsRow[dsNameIndex];
      if (dsName) {
        const capacityGb = parseLocaleNumber(
          dsRow[dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_DS_CAPACITY_GB])]
        );
        const provisionedGb = parseLocaleNumber(
          dsRow[dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_DS_PROV_DS_GB])]
        );
        const dsInfo = getDsInfo(dsName, migrationConfig);

        datastoreDetailsMap.set(dsName, {
          name: dsName,
          ...dsInfo,
          environment: getEnvironmentFromDsName(dsName, config[KONSTANTA.KUNCI_KONFIG.MAP_ENV]),
          capacityGb: capacityGb,
          provisionedGb: provisionedGb,
          freeGb: capacityGb - provisionedGb,
          usagePercent: capacityGb > 0 ? (provisionedGb / capacityGb) * 100 : 0,
          vmCount: vmCountByDatastore.get(dsName) || 0,
        });
      }
    });

    const clusterLoadData = calculateClusterLoad(allVmData, vmHeaders, config);
    const applicableRule = findApplicableRule(requirements, allRules);
    if (!applicableRule) {
      return `ℹ️ Tidak ditemukan aturan penempatan yang cocok untuk Kritikalitas "${requirements.kritikalitas}".`;
    }

    const dsToClusterMap = buildDatastoreToClusterMap(allVmData, vmHeaders, config);
    const { validCandidates, rejected } = filterLokasiByPolicy(
      requirements,
      applicableRule,
      config,
      allVmData,
      allDsData,
      dsHeaders,
      vmHeaders,
      clusterPolicies,
      dsToClusterMap,
      clusterLoadData,
      datastoreDetailsMap
    );

    // ==================== LOGIKA CERDAS BARU DIMULAI DI SINI ====================
    if (validCandidates.length === 0) {
      if (rejected.length > 0) {
        // Jika tidak ada kandidat ideal, kita analisis kandidat yang ditolak.
        const kandidatBeresiko = skorLokasiKandidat(
          rejected,
          clusterLoadData,
          clusterPolicies,
          datastoreDetailsMap,
          config,
          true // Tandai sebagai kandidat berisiko
        );
        // Urutkan untuk menemukan yang "paling tidak buruk"
        kandidatBeresiko.sort((a, b) => b.skor.total - a.skor.total);
        // Kirim ke formatter khusus untuk rekomendasi berisiko
        return formatPesanRekomendasi(
          kandidatBeresiko.slice(0, 1), // Tampilkan hanya 1 opsi terbaik dari yang terburuk
          requirements,
          [],
          applicableRule,
          clusterPolicies,
          datastoreDetailsMap,
          config,
          true // Tandai sebagai rekomendasi berisiko
        );
      }
      // Jika tidak ada kandidat valid DAN tidak ada yg ditolak, baru tampilkan pesan gagal.
      return formatPesanGagal(requirements, rejected, applicableRule);
    }
    // ==================== AKHIR LOGIKA CERDAS BARU ====================

    const kandidatDenganSkor = skorLokasiKandidat(
      validCandidates,
      clusterLoadData,
      clusterPolicies,
      datastoreDetailsMap,
      config
    );

    const strategi = config[KONSTANTA.KUNCI_KONFIG.STRATEGI_PENEMPATAN_OPTIMAL] || "BALANCE";

    kandidatDenganSkor.sort((a, b) => {
      const dsDetailsA = datastoreDetailsMap.get(a.dsName);
      const dsDetailsB = datastoreDetailsMap.get(b.dsName);

      if (strategi === "DENSITY_FIRST") {
        if (b.skor.total !== a.skor.total) {
          return b.skor.total - a.skor.total;
        }
        const vmCountA = dsDetailsA?.vmCount || Infinity;
        const vmCountB = dsDetailsB?.vmCount || Infinity;
        return vmCountA - vmCountB; 
      } else if (strategi === "FILL_UP") {
        const freeGBA = dsDetailsA?.freeGb || -Infinity;
        const freeGBB = dsDetailsB?.freeGb || -Infinity;
        if (freeGBA !== freeGBB) {
          return freeGBA - freeGBB; 
        }
        return b.skor.total - a.skor.total;
      } else {
        return b.skor.total - a.skor.total;
      }
    });

    return formatPesanRekomendasi(
      kandidatDenganSkor.slice(0, 3),
      requirements,
      rejected,
      applicableRule,
      clusterPolicies,
      datastoreDetailsMap,
      config
    );
  } catch (e) {
    console.error(`Gagal mendapatkan rekomendasi: ${e.message}\nStack: ${e.stack}`);
    return `❌ <b>Terjadi Kesalahan Kritis saat Analisis</b>\n\nPenyebab:\n<pre>${escapeHtml(e.message)}</pre>`;
  }
}

/**
 * [REVISI] Membangun peta hubungan Datastore -> Cluster dengan lebih aman.
 */
function buildDatastoreToClusterMap(allVmData, vmHeaders, config) {
  const dsToClusterMap = new Map();
  const K = KONSTANTA.KUNCI_KONFIG;
  const dsIndex = vmHeaders.indexOf(config[K.VM_DS_COLUMN_HEADER]);
  const clusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
  // --- LAPIS PERTAHANAN 2 ---
  if (dsIndex === -1 || clusterIndex === -1) {
    console.warn("Header Datastore atau Cluster tidak ditemukan di sheet VM. Peta hubungan tidak dapat dibangun.");
    return dsToClusterMap;
  }

  allVmData.forEach((row) => {
    const dsName = row[dsIndex];
    const clusterName = row[clusterIndex];
    // Hanya petakan jika keduanya ada
    if (dsName && clusterName && !dsToClusterMap.has(dsName)) {
      dsToClusterMap.set(dsName, clusterName);
    }
  });
  return dsToClusterMap;
}

/**
 * Menghitung total beban alokasi AKTIF (VM 'poweredOn' & bukan 'unused') di setiap cluster.
 */
function calculateClusterLoad(allVmData, vmHeaders, config) {
  const clusterLoad = new Map();
  const K = KONSTANTA.KUNCI_KONFIG;
  const clusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
  const cpuIndex = vmHeaders.indexOf(config[K.HEADER_VM_CPU]);
  const memoryIndex = vmHeaders.indexOf(config[K.HEADER_VM_MEMORY]);
  const stateIndex = vmHeaders.indexOf(config[K.HEADER_VM_STATE]);
  const nameIndex = vmHeaders.indexOf(config[K.HEADER_VM_NAME]);

  allVmData.forEach((vmRow) => {
    const clusterName = vmRow[clusterIndex];
    const state = String(vmRow[stateIndex] || "").toLowerCase();
    const vmName = String(vmRow[nameIndex] || "").toLowerCase();
    const isExcluded = state.includes("off") || vmName.includes("unused");

    if (clusterName && !isExcluded) {
      if (!clusterLoad.has(clusterName)) clusterLoad.set(clusterName, { cpu: 0, memory: 0 });
      const load = clusterLoad.get(clusterName);
      load.cpu += parseInt(vmRow[cpuIndex], 10) || 0;
      load.memory += parseFloat(vmRow[memoryIndex]) || 0;
    }
  });
  return clusterLoad;
}

/**
 * [REVISI] Menyaring lokasi kandidat, kini dengan logika pengecualian datastore.
 */
function filterLokasiByPolicy(
  req,
  rule,
  config,
  allVmData,
  allDsData,
  dsHeaders,
  vmHeaders,
  clusterPolicies,
  dsToClusterMap,
  clusterLoadData,
  datastoreDetailsMap
) {
  const validCandidates = [];
  const rejected = [];
  const allTargetClusters = getAllTargetClusters(rule, allVmData, vmHeaders, config);
  const K = KONSTANTA.KUNCI_KONFIG;

  // ==================== PERBAIKAN #1: Ambil Daftar Pengecualian ====================
  const excludedKeywords = (config[K.DS_KECUALI] || []).map((k) => k.toUpperCase());
  // ======================= AKHIR PERBAIKAN =======================

  for (const clusterName of allTargetClusters) {
    const policy = clusterPolicies.get(clusterName);
    if (!policy) {
      rejected.push({ cluster: clusterName, reason: "kebijakan_tidak_ada" });
      continue;
    }

    const maxMemory =
      (parseFloat(policy["physicalmemorytb"]) || 0) * 1024 * (parseFloat(policy["memoryovercommitratio"]) || 1);
    const maxCpu = (parseInt(policy["physicalcpucores"], 10) || 0) * (parseInt(policy["cpuovercommitratio"], 10) || 1);
    const currentLoad = clusterLoadData.get(clusterName) || { cpu: 0, memory: 0 };

    if (currentLoad.cpu + req.cpu > maxCpu) {
      rejected.push({
        cluster: clusterName,
        reason: "overcommit_cpu",
        current: currentLoad.cpu,
        max: maxCpu,
        ratio: `${policy["cpuovercommitratio"]}:1`,
      });
      continue;
    }
    if (currentLoad.memory + req.memory > maxMemory) {
      rejected.push({
        cluster: clusterName,
        reason: "overcommit_memori",
        current: currentLoad.memory,
        max: maxMemory,
        ratio: `${policy["memoryovercommitratio"]}:1`,
      });
      continue;
    }

    const dsNameIndex = dsHeaders.indexOf(config[K.DS_NAME_HEADER]);
    const p1Storage = getRuleAsArray(rule, "storageprioritas1");
    const p2Storage = getRuleAsArray(rule, "storageprioritas2");

    const filterByStorageTier = (dsName, tiers) => {
      if (!tiers || tiers.length === 0 || tiers.includes("*")) return true;
      if (!dsName) return false;
      return tiers.some((tier) => dsName.toUpperCase().includes(tier.toUpperCase()));
    };

    const getValidDatastores = (dsPool, tiers) => {
      return dsPool
        .filter((dsRow) => {
          const dsName = dsRow[dsNameIndex];
          if (!dsName) return false;

          // ==================== PERBAIKAN #1: Terapkan Filter Pengecualian ====================
          const dsNameUpper = dsName.toUpperCase();
          if (excludedKeywords.some((exc) => dsNameUpper.includes(exc))) {
            return false; // Jika nama mengandung kata kunci terlarang, abaikan.
          }
          // ======================= AKHIR PERBAIKAN =======================

          const details = datastoreDetailsMap.get(dsName);
          if (!details) return false;

          const hasEnoughSpace = details.freeGb >= req.disk;
          return dsToClusterMap.get(dsName) === clusterName && filterByStorageTier(dsName, tiers) && hasEnoughSpace;
        })
        .map((dsRow) => ({
          vcenter: rule["vcentertarget"],
          dsName: dsRow[dsNameIndex],
        }));
    };

    let datastoresInCluster = getValidDatastores(allDsData, p1Storage);
    if (datastoresInCluster.length === 0 && p2Storage.length > 0) {
      datastoresInCluster = getValidDatastores(allDsData, p2Storage);
    }

    if (datastoresInCluster.length > 0) {
      validCandidates.push(...datastoresInCluster.map((ds) => ({ ...ds, clusterName: clusterName })));
    } else {
      rejected.push({ cluster: clusterName, reason: "kapasitas_disk_tidak_cukup" });
    }
  }
  return { validCandidates, rejected };
}

/**
 * Mencari datastore di dalam cluster yang lolos filter kapasitas dan tipe storage.
 */
function findDatastoresInCluster(clusterName, req, rule, config, allDsData, dsHeaders, dsToClusterMap) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const dsNameIndex = dsHeaders.indexOf(config[K.DS_NAME_HEADER]);
  const dsCapGbIndex = dsHeaders.indexOf(config[K.HEADER_DS_CAPACITY_GB]);
  const dsProvGbIndex = dsHeaders.indexOf(config[K.HEADER_DS_PROV_DS_GB]);

  const p1Storage = getRuleAsArray(rule, "storageprioritas1");
  const p2Storage = getRuleAsArray(rule, "storageprioritas2");

  const filterByStorageTier = (dsName, tiers) => {
    if (!tiers || tiers.length === 0 || tiers.includes("*")) return true;
    // ==================== PERBAIKAN PENTING #3: Defensive Coding ====================
    if (!dsName) return false; // Jangan proses jika nama datastore kosong
    return tiers.some((tier) => dsName.toUpperCase().includes(tier.toUpperCase()));
    // ======================= AKHIR PERBAIKAN =======================
  };

  const checkCapacity = (dsRow) => {
    const freeSpace = (parseFloat(dsRow[dsCapGbIndex]) || 0) - (parseFloat(dsRow[dsProvGbIndex]) || 0);
    return freeSpace >= req.disk;
  };

  const getValidDatastores = (dsPool, tiers) => {
    return dsPool
      .filter((dsRow) => {
        const dsName = dsRow[dsNameIndex];
        return dsToClusterMap.get(dsName) === clusterName && filterByStorageTier(dsName, tiers) && checkCapacity(dsRow);
      })
      .map((dsRow) => ({
        vcenter: rule["vcentertarget"],
        dsName: dsRow[dsNameIndex],
        freeSpaceGB: (parseFloat(dsRow[dsCapGbIndex]) || 0) - (parseFloat(dsRow[dsProvGbIndex]) || 0),
      }));
  };

  let kandidat = getValidDatastores(allDsData, p1Storage);
  if (kandidat.length === 0 && p2Storage.length > 0) {
    kandidat = getValidDatastores(allDsData, p2Storage);
  }
  return kandidat;
}

/**
 * [REVISI DUA LAPIS] Mencari aturan yang berlaku dari sheet.
 * Prioritas 1: Mencari aturan berdasarkan nama aplikasi.
 * Prioritas 2: Jika tidak ada, mencari berdasarkan kritikalitas (fallback).
 */
function findApplicableRule(requirements, allRules) {
  // --- LAPIS 1: PENCARIAN BERDASARKAN NAMA APLIKASI (PRIORITAS TERTINGGI) ---
  if (requirements.namaAplikasi) {
    const appNameLower = requirements.namaAplikasi.toLowerCase();
    const rule = allRules.find((r) =>
      getRuleAsArray(r, "namaaplikasi").some((app) => app.toLowerCase() === appNameLower)
    );
    if (rule) return rule;
  }

  // --- LAPIS 2: PENCARIAN BERDASARKAN KRITIKALITAS (JIKA LAPIS 1 GAGAL) ---
  if (requirements.kritikalitas) {
    const reqKritikalitasLower = requirements.kritikalitas.toLowerCase();
    let rule = allRules.find(
      (r) => String(r["kritikalitas"]).toLowerCase() === reqKritikalitasLower && !r["namaaplikasi"]
    );
    if (rule) return rule;
  }

  // --- JARING PENGAMAN: KEMBALIKAN ATURAN DEFAULT ---
  return allRules.find((r) => String(r["kritikalitas"]).toLowerCase() === "default");
}

/**
 * Mendapatkan semua cluster target dari sebuah aturan, termasuk menangani 'all_others'.
 */
function getAllTargetClusters(rule, allVmData, vmHeaders, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const p1 = getRuleAsArray(rule, "prioritas1(cluster)");
  const vcenterTarget = rule["vcentertarget"];
  const vmClusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
  const vmVCenterIndex = vmHeaders.indexOf(config[K.HEADER_VM_VCENTER]);

  if (p1.includes("all_others")) {
    const allClustersInVCenter = [
      ...new Set(
        allVmData
          .filter((vm) => vm[vmVCenterIndex] === vcenterTarget)
          .map((vm) => vm[vmClusterIndex])
          .filter(Boolean)
      ),
    ];
    const exceptionClusters = getRuleAsArray(rule, "clusterdikecualikan");
    return allClustersInVCenter.filter((c) => !exceptionClusters.includes(c));
  }

  const p2 = getRuleAsArray(rule, "prioritas2(cluster)");
  const p3 = getRuleAsArray(rule, "prioritas3(cluster)");
  return [...new Set([...p1, ...p2, ...p3])];
}

/**
 * Helper untuk membaca nilai dari aturan sebagai array yang bersih.
 */
function getRuleAsArray(rule, ruleName) {
  const value = rule[ruleName];
  if (!value) return [];
  return Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * [REVISI PROFESIONAL V4 - ELEGAN] Memberikan skor pada kandidat dengan logika penalti berjenjang
 * yang lebih halus dan menambahkan faktor kepadatan VM.
 */
function skorLokasiKandidat(kandidat, clusterLoadData, clusterPolicies, datastoreDetailsMap, config) {
  const ambangSkor = config[KONSTANTA.KUNCI_KONFIG.AMBANG_BATAS_SKOR_KELAYAKAN] || { ideal: 90, baik: 75, kompromi: 60 };
  const ambangKepadatan = config[KONSTANTA.KUNCI_KONFIG.AMBANG_BATAS_KEPADATAN_VM] || { low: 15, medium: 40 };

  return kandidat.map((lokasi) => {
    let totalScore = 100;
    let penalties = []; // Lacak semua penalti untuk transparansi

    const dsDetails = datastoreDetailsMap.get(lokasi.dsName);
    const policy = clusterPolicies.get(lokasi.clusterName);

    // 1. Penalti Kapasitas Datastore (Bobot: 20 poin)
    let dsUsagePercent = 0;
    if (dsDetails && dsDetails.capacityGb > 0) {
      dsUsagePercent = dsDetails.usagePercent;
      if (dsUsagePercent > 75) {
        const penalty = (dsUsagePercent - 75) * 0.8; // Penalti 0.8 poin untuk setiap % di atas 75%
        totalScore -= penalty;
        penalties.push(`Kapasitas DS waspada (${dsUsagePercent.toFixed(1)}%)`);
      }
    }

    // 2. Penalti Kepadatan VM (Bobot: 10 poin)
    const vmCount = dsDetails ? dsDetails.vmCount : 0;
    if (vmCount > ambangKepadatan.medium) {
        totalScore -= 10;
        penalties.push(`Kepadatan VM tinggi (${vmCount} VM)`);
    } else if (vmCount > ambangKepadatan.low) {
        totalScore -= 5;
        penalties.push(`Kepadatan VM medium (${vmCount} VM)`);
    }

    // 3. Penalti Beban Cluster (Bobot: 70 poin)
    let cpuUtilEffective = 0, memUtilEffective = 0;
    let statusBeban = "Rendah";
    if (policy) {
      const currentLoad = clusterLoadData.get(lokasi.clusterName) || { cpu: 0, memory: 0 };
      const maxCpu = (parseInt(policy["physicalcpucores"], 10) || 1) * (parseInt(policy["cpuovercommitratio"], 10) || 1);
      if (maxCpu > 0) cpuUtilEffective = (currentLoad.cpu / maxCpu) * 100;
      const maxMemory = (parseInt(policy["physicalmemorytb"], 10) || 1) * 1024 * (parseInt(policy["memoryovercommitratio"], 10) || 1);
      if (maxMemory > 0) memUtilEffective = (currentLoad.memory / maxMemory) * 100;
      const highestUtil = Math.max(cpuUtilEffective, memUtilEffective);

      if (highestUtil > 90) { // Kritis
        totalScore -= 40;
        statusBeban = "Kritis";
        penalties.push(`Beban cluster kritis (${highestUtil.toFixed(1)}%)`);
      } else if (highestUtil > 75) { // Waspada
        totalScore -= 20;
        statusBeban = "Waspada";
        penalties.push(`Beban cluster waspada (${highestUtil.toFixed(1)}%)`);
      } else if (highestUtil > 60) { // Cukup
        totalScore -= 10;
        statusBeban = "Cukup";
        penalties.push(`Beban cluster cukup (${highestUtil.toFixed(1)}%)`);
      }
    }

    let statusKelayakan = "Pilihan Kompromi";
    if (totalScore >= ambangSkor.ideal) statusKelayakan = "Pilihan Ideal";
    else if (totalScore >= ambangSkor.baik) statusKelayakan = "Pilihan Baik";

    lokasi.skor = { total: Math.max(0, parseFloat(totalScore.toFixed(1))), status: statusKelayakan };
    lokasi.detail = { dsUsagePercent, clusterCpuUtil: cpuUtilEffective, clusterMemUtil: memUtilEffective, clusterLoadStatus: statusBeban, penalties };
    return lokasi;
  });
}

/**
 * [REVISI FINAL V9 - Profesional Indonesia] Memformat pesan rekomendasi
 * dengan gaya bahasa yang natural, konsisten, dan detail teknis yang jelas.
 */
function formatPesanRekomendasi(
  kandidatTerbaik,
  req,
  rejected,
  rule,
  clusterPolicies,
  datastoreDetailsMap,
  config,
  isRiskRecommendation = false
) {
  const strategi = config[KONSTANTA.KUNCI_KONFIG.STRATEGI_PENEMPATAN_OPTIMAL] || "BALANCE";
  const TampilkanAturan = req.namaAplikasi ? `Aplikasi (${req.namaAplikasi})` : `Kritikalitas (${req.kritikalitas})`;

  let pesan;
  if (isRiskRecommendation) {
    // PERBAIKAN BAHASA 3: Menggunakan Bahasa Indonesia
    pesan = `⚠️ <b>Tidak Ada Lokasi Ideal Ditemukan</b>\n\nSemua lokasi yang ada melanggar kebijakan penempatan utama. Berikut adalah <b>opsi kompromi terbaik</b> yang tersedia, lengkap dengan analisis risiko:\n\n`;
  } else {
    pesan = `💡 <b>Rekomendasi Penempatan VM</b>\n\n`;
  }

  // PERBAIKAN FORMAT 1: Mengubah format ringkasan permintaan
  pesan += ` • <b>Spesifikasi:</b> ${req.cpu} vCPU, ${req.memory} GB RAM, ${req.disk} GB Disk\n`;
  pesan += ` • <b>Aplikasi/Kritikalitas:</b> ${TampilkanAturan}\n`;
  pesan += ` • <b>Profil I/O:</b> ${escapeHtml(req.io)}\n`;
  pesan += ` • <b>Strategi Penempatan:</b> ${strategi}\n`;
  pesan += "\n" + KONSTANTA.UI_STRINGS.SEPARATOR + "\n";

  if (kandidatTerbaik.length === 0 && !isRiskRecommendation) {
      return formatPesanGagal(req, rejected, rule);
  }

  kandidatTerbaik.forEach((lokasi, index) => {
    const policy = clusterPolicies.get(lokasi.clusterName);
    const cpuRatio = policy ? `${policy["cpuovercommitratio"]}:1` : "N/A";
    const memRatio = policy ? `${policy["memoryovercommitratio"]}:1` : "N/A";
    const dsDetails = datastoreDetailsMap.get(lokasi.dsName);
    const vmCount = dsDetails ? dsDetails.vmCount : 0;

    let statusEmoji = "✅";
    // PERBAIKAN BAHASA 2: Menggunakan istilah Bahasa Indonesia
    let statusText = lokasi.skor.status;
    if (statusText === "Pilihan Baik") {
        statusEmoji = "🟡";
        statusText = "Pilihan Baik";
    }
    if (statusText === "Pilihan Kompromi") {
        statusEmoji = "⚠️";
        statusText = "Pilihan Kompromi";
    }
    if (isRiskRecommendation) {
        statusEmoji = "🔴";
        statusText = "Pilihan Kompromi";
    }

    pesan += `\n<b>${index + 1}. Cluster: <code>${lokasi.clusterName}</code></b>\n`;
    pesan += `   └ Datastore: <code>${lokasi.dsName}</code>\n\n`;

    pesan += `   ${statusEmoji} <b>${statusText} (Skor: ${lokasi.skor.total}/100)</b>\n\n`;

    // PERTAHANKAN FORMAT 4: Key Metrics & Analysis dalam Bahasa Inggris
    pesan += `   <b>Key Metrics:</b>\n`;
    pesan += `   • Cluster CPU Load: <code>${lokasi.detail.clusterCpuUtil.toFixed(1)}%</code>\n`;
    pesan += `   • Cluster Memory Load: <code>${lokasi.detail.clusterMemUtil.toFixed(1)}%</code>\n`;
    pesan += `   • Datastore Provisioned: <code>${lokasi.detail.dsUsagePercent.toFixed(1)}%</code>\n`;
    pesan += `   • VM Count in Datastore: <code>${vmCount} VM</code>\n\n`;

    pesan += `   <b>Analysis & Context:</b>\n`;
    if (isRiskRecommendation) {
        pesan += `   • <i>Opsi darurat karena akan <b>${getReasonText(lokasi).toLowerCase()}</b>. Lanjutkan dengan hati-hati.</i>\n`;
    } else if (lokasi.skor.status === "Pilihan Kompromi") {
        pesan += `   • <i>Dapat digunakan, namun perhatikan ${lokasi.detail.penalties.join(', ')}.</i>\n`;
    } else if (lokasi.skor.status === "Pilihan Baik") {
        pesan += `   • <i>Pilihan yang solid dengan keseimbangan yang baik antara kapasitas dan beban kerja.</i>\n`;
    } else {
        pesan += `   • <i>Lokasi terbaik dengan beban rendah dan kapasitas lega untuk pertumbuhan.</i>\n`;
    }

    pesan += `   • <i>CPU Overcommit Policy: ${cpuRatio}</i>\n`;
    pesan += `   • <i>Memory Overcommit Policy: ${memRatio}</i>\n`;
  });

  if (rejected && rejected.length > 0) {
    pesan += `\n<i>(Info: ${rejected.length} cluster lain diabaikan karena tidak memenuhi syarat)</i>`;
  }
  return pesan;
}

/**
 * Memformat pesan saat tidak ada lokasi yang cocok ditemukan.
 */
function formatPesanGagal(req, rejected, rule) {
  let pesan = `ℹ️ <b>Analisis Penempatan Tidak Berhasil</b>\n\n`;
  pesan += `Tidak ditemukan lokasi yang memenuhi syarat untuk spesifikasi:\n`;
  pesan += ` • CPU: ${req.cpu}, Memori: ${req.memory} GB, Disk: ${req.disk} GB\n\n`;
  if (rejected && rejected.length > 0) {
    pesan += `<b>Alasan Penolakan Cluster yang Dievaluasi:</b>\n`;
    rejected.forEach((c) => {
      pesan += ` • <code>${c.cluster}</code>: <i>${getReasonText(c)}</i>\n`;
    });
  } else {
    pesan += `Tidak ada cluster target yang cocok dengan aturan di sheet "Rule Provisioning".`;
  }
  return pesan;
}

/**
 * Menerjemahkan kode alasan penolakan menjadi teks yang mudah dipahami.
 */
function getReasonText(rejection) {
  switch (rejection.reason) {
    case "kebijakan_tidak_ada":
      return "Tidak memiliki kebijakan overcommit.";
    case "overcommit_cpu":
      return `Akan melanggar kebijakan overcommit CPU (${rejection.ratio}).`;
    case "overcommit_memori":
      return `Akan melanggar kebijakan overcommit Memori (${rejection.ratio}).`;
    case "kapasitas_disk_tidak_cukup":
      return "Tidak ada datastore yang memenuhi syarat kapasitas disk/tipe.";
    default:
      return "Alasan tidak diketahui.";
  }
}
