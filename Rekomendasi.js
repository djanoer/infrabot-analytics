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
 * Fungsi orkestrator utama untuk mendapatkan rekomendasi penempatan VM.
 * Kini menggunakan perhitungan beban aktif dan menyuntikkan data kebijakan ke dalam hasil.
 */
function dapatkanRekomendasiPenempatan(requirements, config) {
  try {
    const { headers: vmHeaders, dataRows: allVmData } = RepositoriData.getSemuaVm(config);
    const { headers: dsHeaders, dataRows: allDsData } = RepositoriData.getSemuaDatastore(config);

    // ==================== OPTIMASI PERFORMA ====================
    // Langkah 1: Hitung jumlah VM per datastore sekali saja (Operasi O(N_VM)).
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

    // Langkah 2: Bangun peta detail datastore, suntikkan vmCount dari peta di atas (Operasi O(N_DS)).
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
    // ======================= AKHIR OPTIMASI =======================

    const allRules = RepositoriData.getAturanPenempatan();
    const clusterPolicies = RepositoriData.getKebijakanCluster();
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

    if (validCandidates.length === 0) {
      return formatPesanGagal(requirements, rejected, applicableRule);
    }

    const kandidatDenganSkor = skorLokasiKandidat(
      validCandidates,
      clusterLoadData,
      clusterPolicies,
      datastoreDetailsMap
    );
    kandidatDenganSkor.sort((a, b) => {
      if (a.detail.clusterUtilPercent < b.detail.clusterUtilPercent) return -1;
      if (a.detail.clusterUtilPercent > b.detail.clusterUtilPercent) return 1;
      return b.skor.total - a.skor.total; // Tie-breaker
    });
    //kandidatDenganSkor.sort((a, b) => b.skor.total - a.skor.total);

    return formatPesanRekomendasi(
      kandidatDenganSkor.slice(0, 3),
      requirements,
      rejected,
      applicableRule,
      clusterPolicies,
      clusterLoadData
    );
  } catch (e) {
    console.error(`Gagal mendapatkan rekomendasi: ${e.message}\nStack: ${e.stack}`);
    return `❌ <b>Terjadi Kesalahan Kritis saat Analisis</b>\n\nPenyebab:\n<pre>${escapeHtml(e.message)}</pre>`;
  }
}

/**
 * Membangun peta hubungan Datastore -> Cluster.
 */
function buildDatastoreToClusterMap(allVmData, vmHeaders, config) {
  const dsToClusterMap = new Map();
  const K = KONSTANTA.KUNCI_KONFIG;
  const dsIndex = vmHeaders.indexOf(config[K.VM_DS_COLUMN_HEADER]);
  const clusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
  if (dsIndex === -1 || clusterIndex === -1) return dsToClusterMap;

  allVmData.forEach((row) => {
    const dsName = row[dsIndex];
    const clusterName = row[clusterIndex];
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
  if (requirements.namaAplikasi) {
    const appNameLower = requirements.namaAplikasi.toLowerCase();
    const rule = allRules.find((r) =>
      getRuleAsArray(r, "namaaplikasi").some((app) => app.toLowerCase() === appNameLower)
    );
    if (rule) return rule;
  }
  if (requirements.kritikalitas) {
    const reqKritikalitasLower = requirements.kritikalitas.toLowerCase();
    let rule = allRules.find(
      (r) => String(r["kritikalitas"]).toLowerCase() === reqKritikalitasLower && !r["namaaplikasi"]
    );
    if (rule) return rule;
  }
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
 * [REVISI PROFESIONAL] Memberikan skor pada kandidat dengan logika baru yang
 * memprioritaskan kesehatan cluster dan sisa ruang provisioning.
 */
function skorLokasiKandidat(kandidat, clusterLoadData, clusterPolicies, datastoreDetailsMap) {
  return kandidat.map((lokasi) => {
    const dsDetails = datastoreDetailsMap.get(lokasi.dsName);
    let skorProvisioning = 0;
    let dsUsagePercent = 100;

    // ==================== LOGIKA SKOR BARU: PROVISIONING (Bobot 40) ====================
    if (dsDetails && dsDetails.capacityGb > 0) {
      dsUsagePercent = dsDetails.usagePercent;
      const freePercent = 100 - dsUsagePercent; // Menilai berdasarkan ruang kosong
      skorProvisioning = (freePercent / 100) * 40; // Skor proporsional dari 40 poin
    }
    // ======================= AKHIR PERBAIKAN =======================

    const policy = clusterPolicies.get(lokasi.clusterName);
    let skorCluster = 0;
    let effectiveUtilization = 100;
    let statusBeban = "Kritis";

    // ==================== LOGIKA SKOR BARU: BEBAN CLUSTER (Bobot 60) ====================
    if (policy) {
      const maxCpu =
        (parseInt(policy["physicalcpucores"], 10) || 1) * (parseInt(policy["cpuovercommitratio"], 10) || 1);
      const currentCpuLoad = clusterLoadData.get(lokasi.clusterName)?.cpu || 0;
      if (maxCpu > 0) effectiveUtilization = (currentCpuLoad / maxCpu) * 100;

      // Skor berbanding terbalik dengan utilisasi, dengan bobot 60 poin
      skorCluster = (1 - effectiveUtilization / 100) * 60;

      if (effectiveUtilization < 70) statusBeban = "Rendah";
      else if (effectiveUtilization <= 85) statusBeban = "Waspada";
    }
    // ======================= AKHIR PERBAIKAN =======================

    // Pastikan skor tidak di bawah nol
    skorCluster = Math.max(0, skorCluster);

    const totalScore = parseFloat((skorProvisioning + skorCluster).toFixed(1));

    let alasan = "";
    if (totalScore >= 80) {
      alasan = "Kondisi ideal. Kapasitas sangat lega dan beban cluster rendah.";
    } else if (totalScore >= 50) {
      alasan = "Pilihan yang baik. Kapasitas cukup dan beban cluster optimal.";
    } else {
      alasan = "Peringatan. Dipertimbangkan, namun perhatikan beban atau kapasitasnya.";
    }

    lokasi.skor = { total: totalScore };
    lokasi.detail = {
      dsUsagePercent: dsUsagePercent,
      clusterUtilPercent: effectiveUtilization,
      clusterLoadStatus: statusBeban,
    };
    lokasi.alasan = alasan;
    return lokasi;
  });
}

/**
 * [REVISI FINAL] Memformat pesan sukses dengan rincian yang lebih informatif,
 * termasuk status zona risiko dan rasio overcommit CPU yang berlaku.
 */
function formatPesanRekomendasi(kandidatTerbaik, req, rejected, rule, clusterPolicies, clusterLoadData) {
  let pesan = `💡 <b>Rekomendasi Penempatan VM Baru</b>\n\n`;
  pesan += `Berdasarkan spesifikasi:\n`;
  pesan += ` • CPU: ${req.cpu}, Memori: ${req.memory} GB, Disk: ${req.disk} GB\n`;
  const TampilkanAturan = req.namaAplikasi ? `Aplikasi (${req.namaAplikasi})` : `Kritikalitas (${req.kritikalitas})`;
  pesan += ` • Aturan: ${TampilkanAturan}, Profil I/O: ${escapeHtml(req.io)}\n\n`;
  pesan += `Berikut adalah <b>${kandidatTerbaik.length} lokasi terbaik</b> yang direkomendasikan:\n`;

  kandidatTerbaik.forEach((lokasi, index) => {
    const policy = clusterPolicies.get(lokasi.clusterName);
    const ratio = policy ? `${policy["cpuovercommitratio"]}:1` : "N/A";

    let statusEmoji = "✅";
    if (lokasi.detail.clusterLoadStatus === "Waspada") statusEmoji = "⚠️";
    if (lokasi.detail.clusterLoadStatus === "Kritis") statusEmoji = "🔥";

    pesan += `\n<b>${index + 1}. ${lokasi.vcenter} > Cluster: <code>${lokasi.clusterName}</code></b>\n`;
    pesan += `   • <b>Datastore:</b> <code>${lokasi.dsName}</code>\n`;
    pesan += `   • <b>Skor Kelayakan: ${lokasi.skor.total} / 100</b>\n`;
    pesan += `     └ 📊 <b>Provisioning Datastore:</b> <code>${lokasi.detail.dsUsagePercent.toFixed(
      1
    )}%</code> terpakai\n`;
    // ==================== PERBAIKAN DI SINI: Ganti "Aturan" menjadi "Rasio" ====================
    pesan += `     └ ${statusEmoji} <b>Beban CPU Cluster:</b> <code>${lokasi.detail.clusterUtilPercent.toFixed(
      1
    )}%</code> (Status: ${lokasi.detail.clusterLoadStatus}, Rasio: ${ratio})\n`;
    // =================================== AKHIR PERBAIKAN ===================================
    pesan += `   • <i>Alasan: ${lokasi.alasan}</i>\n`;
  });

  if (rejected && rejected.length > 0) {
    pesan += `\n<i>Catatan: Cluster berikut dievaluasi namun diabaikan: ${rejected
      .map((c) => `<code>${c.cluster}</code>`)
      .join(", ")}.</i>`;
  }
  pesan += `\n\n<i>*Perhitungan alokasi <b>tidak termasuk</b> VM 'Power Off' atau bernama 'unused'.</i>`;
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
