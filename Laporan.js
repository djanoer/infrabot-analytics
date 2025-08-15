/**
 * @file Laporan.js
 * @author Djanoer Team
 * @date 2023-02-22
 *
 * @description
 * Bertanggung jawab untuk MENGHITUNG dan MENGOLAH data untuk berbagai jenis
 * laporan teks yang dikirim ke Telegram. Fungsi di file ini menerima data yang
 * sudah siap dan mengubahnya menjadi ringkasan yang informatif.
 *
 * @section FUNGSI UTAMA
 * - buatLaporanHarianVM(config): Orkestrator utama untuk membuat laporan harian.
 * - generateProvisioningReport(...): Orkestrator untuk laporan alokasi sumber daya.
 * - generateAssetDistributionReport(...): Orkestrator untuk laporan distribusi aset VM.
 * - buatLaporanPeriodik(periode): Membuat laporan tren mingguan atau bulanan.
 */

// =================================================================================
// FUNGSI UTAMA PEMBUAT LAPORAN (ENTRY POINTS)
// =================================================================================

/**
 * [REFAKTORED] Orkestrator untuk membuat laporan harian.
 */
function buatLaporanHarianVM(config) {
  const { headers: vmHeaders, dataRows: vmData } = RepositoriData.getSemuaVm(config); // Diubah
  const reportData = _calculateLaporanHarianData(config, vmHeaders, vmData);
  return formatLaporanHarian(reportData);
}

/**
 * [REFAKTORED] Orkestrator untuk membuat laporan provisioning.
 */
function generateProvisioningReport(config, allVmData, headers) {
  const reportData = _calculateProvisioningReportData(config, allVmData, headers);
  return formatProvisioningReport(reportData, config);
}

/**
 * [REFAKTORED] Orkestrator untuk membuat laporan distribusi aset.
 */
function generateAssetDistributionReport(config, allVmData, headers) {
  const reportData = _calculateAssetDistributionData(config, allVmData, headers);
  return formatAssetDistributionReport(reportData, config);
}

/**
 * [REVISI DENGAN PENERUSAN DATA YANG BENAR] Menghasilkan laporan periodik.
 * Memperbaiki bug dengan meneruskan vmHeaders dan vmData ke generateVcenterSummary.
 */
function buatLaporanPeriodik(periode) {
  // Menggunakan getBotState untuk efisiensi
  const { config } = getBotState();
  const { headers: vmHeaders, dataRows: vmData } = RepositoriData.getSemuaVm(config); // Mengambil data VM dari Repositori

  const today = new Date();
  let startDate = new Date();
  let title;

  if (periode === "mingguan") {
    startDate.setDate(today.getDate() - 7);
    const tglMulai = startDate.toLocaleDateString("id-ID", { day: "2-digit", month: "long" });
    const tglSelesai = today.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    title = `📈 <b>Laporan Tren Mingguan</b>\n<i>Periode: ${tglMulai} - ${tglSelesai}</i>`;
  } else if (periode === "bulanan") {
    startDate.setMonth(today.getMonth() - 1);
    const tglMulai = startDate.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    const tglSelesai = today.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    title = `📈 <b>Laporan Tren Bulanan</b>\n<i>Periode: ${tglMulai} - ${tglSelesai}</i>`;
  } else {
    return;
  }

  const analisis = analisisTrenPerubahan(startDate, config);

  // --- PERBAIKAN DITERAPKAN DI SINI ---
  // Sekarang kita meneruskan vmHeaders dan vmData yang sudah diambil.
  const { vCenterMessage, uptimeMessage } = generateVcenterSummary(config, vmHeaders, vmData);

  const provisioningSummary = getProvisioningStatusSummary(config);

  let pesanLaporan = `${title}\n`;
  pesanLaporan += `\n<b>Kesimpulan Tren:</b>\n${analisis.trendMessage}\n`;
  if (analisis.anomalyMessage) {
    pesanLaporan += `\n${analisis.anomalyMessage}\n`;
  }
  pesanLaporan += `\n<i>Total Perubahan: ➕${analisis.counts.baru} ✏️${analisis.counts.dimodifikasi} ❌${analisis.counts.dihapus}</i>`;

  pesanLaporan += "\n" + KONSTANTA.UI_STRINGS.SEPARATOR + "\n";
  pesanLaporan += "<b>Ringkasan vCenter & Uptime:</b>\n" + vCenterMessage + "\n" + uptimeMessage;
  pesanLaporan += "\n" + KONSTANTA.UI_STRINGS.SEPARATOR + "\n";
  pesanLaporan += "<b>Status Provisioning:</b>\n" + provisioningSummary.message;
  pesanLaporan += `\n\nGunakan <code>${KONSTANTA.PERINTAH_BOT.EXPORT}</code> untuk melihat detail perubahan.`;

  kirimPesanTelegram(pesanLaporan, config, "HTML");
}

// =================================================================================
// FUNGSI KALKULASI DATA (LOGIKA INTI)
// =================================================================================

/**
 * [REFACTORED V.1.0] Menghitung data untuk laporan harian.
 * Menerima data VM sebagai parameter, tidak lagi mengambil sendiri.
 */
function _calculateLaporanHarianData(config, vmHeaders, vmData) {
  try {
    const K = KONSTANTA.KUNCI_KONFIG;
    const todayStartDate = new Date();
    todayStartDate.setHours(0, 0, 0, 0);
    const { headers, data: todaysLogs } = getCombinedLogs(todayStartDate, config);

    const counts = { baru: 0, dimodifikasi: 0, dihapus: 0 };
    if (todaysLogs.length > 0) {
      const actionHeader = config[K.HEADER_LOG_ACTION];
      const actionIndex = headers.indexOf(actionHeader);

      todaysLogs.forEach((log) => {
        const action = log[actionIndex];
        if (action.includes("PENAMBAHAN")) counts.baru++;
        else if (action.includes("MODIFIKASI")) counts.dimodifikasi++;
        else if (action.includes("PENGHAPUSAN")) counts.dihapus++;
      });
    }

    // Menyalurkan data VM yang sudah siap ke fungsi kalkulasi summary
    const summary = generateVcenterSummary(config, vmHeaders, vmData);
    const provisioningSummary = getProvisioningStatusSummary(config);

    return {
      todaysLogs,
      counts,
      vCenterSummary: summary.vCenterMessage,
      uptimeSummary: summary.uptimeMessage, // Menambahkan uptime summary
      provisioningSummary,
    };
  } catch (e) {
    throw new Error(`Gagal menghitung data Laporan Harian VM. Penyebab: ${e.message}`);
  }
}

/**
 * [REFACTORED V.1.0] Membuat ringkasan vCenter.
 * Menerima data sebagai parameter, tidak lagi memanggil _getSheetData.
 */
function generateVcenterSummary(config, headers, dataRows) {
  // <--- TAMBAHKAN 'headers' DAN 'dataRows'
  if (dataRows.length === 0) {
    return { vCenterMessage: "<i>Data VM tidak ditemukan untuk membuat ringkasan.</i>\n\n", uptimeMessage: "" };
  }

  const K = KONSTANTA.KUNCI_KONFIG;
  const vCenterIndex = headers.indexOf(config[K.HEADER_VM_VCENTER]);
  const stateIndex = headers.indexOf(config[K.HEADER_VM_STATE]);
  const uptimeIndex = headers.indexOf(config[K.HEADER_VM_UPTIME]);

  if (vCenterIndex === -1 || stateIndex === -1) {
    throw new Error(`Header '${config[K.HEADER_VM_VCENTER]}' atau '${config[K.HEADER_VM_STATE]}' tidak ditemukan.`);
  }

  const vCenterSummary = {};
  let totalGlobal = { on: 0, off: 0, total: 0 };
  const uptimeCategories = { "0_1": 0, "1_2": 0, "2_3": 0, over_3: 0, invalid: 0 };

  dataRows.forEach((row) => {
    const vCenter = row[vCenterIndex] || "Lainnya";
    if (!vCenterSummary[vCenter]) {
      vCenterSummary[vCenter] = { on: 0, off: 0, total: 0 };
    }
    const state = String(row[stateIndex] || "").toLowerCase();
    vCenterSummary[vCenter].total++;
    totalGlobal.total++;
    if (state.includes("on")) {
      vCenterSummary[vCenter].on++;
      totalGlobal.on++;
    } else {
      vCenterSummary[vCenter].off++;
      totalGlobal.off++;
    }
    if (uptimeIndex !== -1) {
      const uptimeValue = row[uptimeIndex];
      const uptimeDays = parseInt(uptimeValue, 10);
      if (uptimeValue !== "" && uptimeValue !== "-" && !isNaN(uptimeDays)) {
        if (uptimeDays <= 365) uptimeCategories["0_1"]++;
        else if (uptimeDays <= 730) uptimeCategories["1_2"]++;
        else if (uptimeDays <= 1095) uptimeCategories["2_3"]++;
        else uptimeCategories["over_3"]++;
      } else {
        uptimeCategories["invalid"]++;
      }
    }
  });

  let message = "";
  const vCenterOrder = Object.keys(vCenterSummary).sort();
  vCenterOrder.forEach((vc) => {
    if (vCenterSummary[vc]) {
      message += `🏢 <b>vCenter: ${vc}</b>\n`;
      message += `🟢 Power On: ${vCenterSummary[vc].on}\n`;
      message += `🔴 Power Off: ${vCenterSummary[vc].off}\n`;
      message += `Total: ${vCenterSummary[vc].total} VM\n\n`;
    }
  });
  message += `--- GRAND TOTAL ---\n`;
  message += `🟢 Power On: ${totalGlobal.on}\n`;
  message += `🔴 Power Off: ${totalGlobal.off}\n`;
  message += `Total: ${totalGlobal.total} VM\n\n`;

  let uptimeMessage = `📊 <b>Ringkasan Uptime</b> (dari total ${totalGlobal.total} VM)\n`;
  uptimeMessage += `- Di bawah 1 Tahun: ${uptimeCategories["0_1"]} VM\n`;
  uptimeMessage += `- 1 sampai 2 Tahun: ${uptimeCategories["1_2"]} VM\n`;
  uptimeMessage += `- 2 sampai 3 Tahun: ${uptimeCategories["2_3"]} VM\n`;
  uptimeMessage += `- Di atas 3 Tahun: ${uptimeCategories["over_3"]} VM\n`;
  uptimeMessage += `- Data Tidak Valid/Kosong: ${uptimeCategories["invalid"]} VM`;

  return { vCenterMessage: message, uptimeMessage: uptimeMessage };
}

/**
 * [REFAKTORED DENGAN REPOSITORI] Mengambil status provisioning dari data datastore.
 * Fungsi ini sekarang sepenuhnya terpisah dari SpreadsheetApp dan mengambil data dari repositori.
 */
function getProvisioningStatusSummary(config) {
  try {
    const K = KONSTANTA.KUNCI_KONFIG;

    // --- BAGIAN YANG DIPERBARUI DIMULAI DI SINI ---
    // Semua interaksi dengan SpreadsheetApp digantikan oleh satu baris ini.
    const { headers, dataRows: dsData } = RepositoriData.getSemuaDatastore(config);

    if (!dsData || dsData.length === 0) {
      // Mengembalikan status default jika tidak ada data dari repositori
      return {
        isOverProvisioned: false,
        message: "<i>Status provisioning tidak dapat diperiksa: Data datastore tidak ditemukan.</i>",
      };
    }
    // --- AKHIR BAGIAN YANG DIPERBARUI ---

    // Validasi header penting (logika ini tetap sama)
    const nameIndex = headers.indexOf(config[K.DS_NAME_HEADER]);
    const capGbIndex = headers.indexOf(config[K.HEADER_DS_CAPACITY_GB]);
    const provGbIndex = headers.indexOf(config[K.HEADER_DS_PROV_DS_GB]);

    if ([nameIndex, capGbIndex, provGbIndex].includes(-1)) {
      throw new Error(
        `Satu atau lebih header penting (Name, Capacity GB, Provisioned GB) tidak ditemukan di sheet Datastore.`
      );
    }

    let isOverProvisioned = false;

    // Logika kalkulasi inti (tidak berubah)
    for (const row of dsData) {
      const capacity = parseFloat(String(row[capGbIndex]).replace(/,/g, "")) || 0;
      const provisioned = parseFloat(String(row[provGbIndex]).replace(/,/g, "")) || 0;

      if (provisioned > capacity) {
        isOverProvisioned = true;
        break;
      }
    }

    // Mengembalikan objek status (tidak berubah)
    if (isOverProvisioned) {
      return {
        isOverProvisioned: true,
        message: `❗️ Terdeteksi datastore over-provisioned.`,
      };
    }

    return {
      isOverProvisioned: false,
      message: "✅ Semua datastore dalam rasio aman (1:1).",
    };
  } catch (e) {
    console.error(`Gagal memeriksa status provisioning: ${e.message}`);
    // Melempar error agar bisa ditangani oleh handler utama
    throw new Error(`Gagal memeriksa status provisioning: ${e.message}`);
  }
}

/**
 * [REFACTOR FINAL] Menyusun laporan provisioning.
 * Fungsi ini sekarang menerima data VM sebagai parameter.
 */
function _calculateProvisioningReportData(config, allVmData, headers) {
  if (!allVmData || allVmData.length === 0) {
    throw new Error("Data VM tidak ditemukan atau kosong untuk laporan provisioning.");
  }

  const K = KONSTANTA.KUNCI_KONFIG;
  // 1. Definisikan semua header yang dibutuhkan di satu tempat.
  const requiredHeaders = {
    PK: config[K.HEADER_VM_PK],
    VM_NAME: config[K.HEADER_VM_NAME],
    VCENTER: config[K.HEADER_VM_VCENTER],
    STATE: config[K.HEADER_VM_STATE],
    CPU: config[K.HEADER_VM_CPU],
    MEMORY: config[K.HEADER_VM_MEMORY],
    PROV_TB: config[K.HEADER_VM_PROV_TB],
  };

  // 2. Lakukan validasi di awal, sebelum logika utama.
  const indices = {};
  for (const key in requiredHeaders) {
    const headerName = requiredHeaders[key];
    if (!headerName) {
      throw new Error(`Kunci konfigurasi untuk header '${key}' tidak ditemukan.`);
    }
    indices[key] = headers.indexOf(headerName);
    if (indices[key] === -1) {
      throw new Error(`Header provisioning penting '${headerName}' tidak ditemukan di sheet Data VM.`);
    }
  }

  try {
    // 3. Logika utama sekarang bisa berjalan dengan aman menggunakan indices.VCENTER, indices.CPU, dll.
    const reportData = { Top5: { cpu: [], memory: [], disk: [] } };
    const vCenters = new Set(allVmData.map((row) => row[indices.VCENTER] || "Lainnya"));

    ["Total", ...vCenters].forEach((vc) => {
      reportData[vc] = { vmCount: 0, cpuOn: 0, cpuOff: 0, memOn: 0, memOff: 0, disk: 0 };
    });

    for (const row of allVmData) {
      const vCenter = row[indices.VCENTER] || "Lainnya";
      const isPoweredOn = String(row[indices.STATE] || "")
        .toLowerCase()
        .includes("on");
      const cpu = parseInt(row[indices.CPU], 10) || 0;
      const memory = parseFloat(row[indices.MEMORY]) || 0;
      const disk = parseFloat(row[indices.PROV_TB]) || 0;

      reportData[vCenter].vmCount++;
      reportData["Total"].vmCount++;
      reportData[vCenter].disk += disk;
      reportData["Total"].disk += disk;

      if (isPoweredOn) {
        reportData[vCenter].cpuOn += cpu;
        reportData[vCenter].memOn += memory;
        reportData["Total"].cpuOn += cpu;
        reportData["Total"].memOn += memory;
      } else {
        reportData[vCenter].cpuOff += cpu;
        reportData[vCenter].memOff += memory;
        reportData["Total"].cpuOff += cpu;
        reportData["Total"].memOff += memory;
      }
      const vmInfo = { name: row[indices.VM_NAME], pk: row[indices.PK] };
      updateTop5(reportData.Top5.cpu, { ...vmInfo, value: cpu });
      updateTop5(reportData.Top5.memory, { ...vmInfo, value: memory });
      updateTop5(reportData.Top5.disk, { ...vmInfo, value: disk });
    }

    return reportData;
  } catch (e) {
    throw new Error(`Gagal membuat laporan provisioning: ${e.message}`);
  }
}

/**
 * [FINAL & STABIL] Fungsi pembantu untuk mengelola daftar top 5.
 */
function updateTop5(topArray, newItem) {
  if (!newItem || isNaN(newItem.value) || newItem.value <= 0) return;

  if (topArray.length < 5) {
    topArray.push(newItem);
  } else if (newItem.value > topArray[4].value) {
    topArray.pop();
    topArray.push(newItem);
  }
  topArray.sort((a, b) => b.value - a.value);
}

/**
 * [FINAL v1.8.1] Menganalisis tren perubahan dari log.
 * Menggunakan ambang batas aktivitas dari konfigurasi terpusat.
 */
function analisisTrenPerubahan(startDate, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const { headers, data: logs } = getCombinedLogs(startDate, config);

  if (logs.length === 0) {
    return {
      trendMessage: "Tidak ada aktivitas perubahan data yang signifikan pada periode ini.",
      anomalyMessage: null,
      counts: { baru: 0, dimodifikasi: 0, dihapus: 0 },
    };
  }

  const actionIndex = headers.indexOf(config[K.HEADER_LOG_ACTION]);
  const timestampIndex = headers.indexOf(config[K.HEADER_LOG_TIMESTAMP]);
  if (actionIndex === -1 || timestampIndex === -1) {
    throw new Error("Header 'Action' atau 'Timestamp' tidak ditemukan di log.");
  }

  const counts = { PENAMBAHAN: 0, MODIFIKASI: 0, PENGHAPUSAN: 0 };
  const activityByDay = {};
  logs.forEach((log) => {
    const action = log[actionIndex];
    if (counts.hasOwnProperty(action)) {
      counts[action]++;
    }
    const date = new Date(log[timestampIndex]).toISOString().split("T")[0];
    activityByDay[date] = (activityByDay[date] || 0) + 1;
  });

  let trendMessage;
  const totalChanges = logs.length;
  if (totalChanges > 50) {
    trendMessage = "Aktivitas perubahan terpantau <b>sangat tinggi</b>.";
  } else if (totalChanges > 10) {
    trendMessage = "Aktivitas perubahan terpantau <b>moderat</b>.";
  } else {
    trendMessage = "Aktivitas perubahan terpantau <b>rendah</b>.";
  }

  let anomalyMessage = null;
  const days = Object.keys(activityByDay);
  if (days.length > 1) {
    const avgChanges = totalChanges / days.length;
    const highActivityThreshold = (config.SYSTEM_LIMITS && config.SYSTEM_LIMITS.HIGH_ACTIVITY_THRESHOLD) || 50;
    const highActivityDays = days.filter(
      (day) => activityByDay[day] > avgChanges * 2 && activityByDay[day] > highActivityThreshold
    );
    if (highActivityDays.length > 0) {
      anomalyMessage = `⚠️ Terdeteksi anomali aktivitas pada tanggal: <b>${highActivityDays.join(", ")}</b>.`;
    }
  }

  return {
    trendMessage: trendMessage,
    anomalyMessage: anomalyMessage,
    counts: {
      baru: counts["PENAMBAHAN"],
      dimodifikasi: counts["MODIFIKASI"],
      dihapus: counts["PENGHAPUSAN"],
    },
  };
}

/**
 * [REFACTORED v4.3.1] Menghitung data untuk laporan distribusi aset VM.
 * Fungsi ini sekarang menerima data sebagai parameter dan tidak membaca sheet secara langsung.
 * @param {object} config - Objek konfigurasi bot.
 * @param {Array<Array<any>>} allVmData - Data VM dari sheet (tidak termasuk header).
 * @param {Array<string>} headers - Header dari sheet VM.
 * @returns {object} Objek berisi data distribusi yang sudah dihitung.
 */
function _calculateAssetDistributionData(config, allVmData, headers) {
  const K = KONSTANTA.KUNCI_KONFIG;

  // Pengaman jika data yang masuk kosong, untuk mencegah error.
  if (!allVmData || allVmData.length === 0) {
    return { criticality: {}, environment: {}, totalVm: 0 };
  }

  // Validasi header penting untuk memastikan kalkulasi berjalan benar.
  const critIndex = headers.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
  const envIndex = headers.indexOf(config[K.HEADER_VM_ENVIRONMENT]);
  const stateIndex = headers.indexOf(config[K.HEADER_VM_STATE]);

  if ([critIndex, envIndex, stateIndex].includes(-1)) {
    throw new Error("Satu atau lebih header penting (Kritikalitas, Environment, State) tidak ditemukan di sheet VM.");
  }

  const report = {
    criticality: {},
    environment: {},
    totalVm: allVmData.length,
  };

  const recognizedCriticality = config.LIST_KRITIKALITAS || [];
  const recognizedEnvironment = config.LIST_ENVIRONMENT || [];

  // Logika kalkulasi inti tidak berubah, hanya memastikan sumber datanya benar.
  allVmData.forEach((row) => {
    let criticality = String(row[critIndex] || "").trim();
    if (!recognizedCriticality.includes(criticality) || criticality === "") {
      criticality = "Other";
    }
    report.criticality[criticality] = (report.criticality[criticality] || 0) + 1;

    let environment = String(row[envIndex] || "").trim();
    if (!recognizedEnvironment.includes(environment) || environment === "") {
      environment = "Other";
    }
    if (!report.environment[environment]) {
      report.environment[environment] = { total: 0, on: 0, off: 0 };
    }
    report.environment[environment].total++;

    if (
      String(row[stateIndex] || "")
        .toLowerCase()
        .includes("on")
    ) {
      report.environment[environment].on++;
    } else {
      report.environment[environment].off++;
    }
  });

  return report;
}

/**
 * [REVISI FINAL - FASE 4] Menghasilkan laporan utilisasi storage ringkas.
 * Logika pencocokan alias telah diperbaiki secara fundamental untuk memastikan
 * semua data log ditemukan dengan benar.
 */
function generateStorageUtilizationReport(config) {
  try {
    const K = KONSTANTA.KUNCI_KONFIG;
    const capacityMap = config[K.MAP_KAPASITAS_STORAGE];
    const aliasMap = config[K.MAP_ALIAS_STORAGE];

    if (!capacityMap || Object.keys(capacityMap).length === 0 || !aliasMap) {
      return "❌ <b>Gagal:</b> Konfigurasi `MAP_KAPASITAS_STORAGE` atau `MAP_ALIAS_STORAGE` tidak ditemukan atau kosong.";
    }

    const reportKeys = Object.keys(capacityMap);
    const thresholds = config[K.STORAGE_UTILIZATION_THRESHOLDS] || { warning: 75, critical: 90 };

    const { headers, data: logs } = getCombinedStorageLogs(config, 7);
    if (logs.length === 0) {
      return "ℹ️ Tidak ada data log storage yang ditemukan dalam 7 hari terakhir untuk dianalisis.";
    }

    const nameIndex = headers.indexOf("Storage Alias");
    const usageIndex = headers.indexOf("Usage (TB)");
    const timestampIndex = headers.indexOf("Timestamp");

    if ([nameIndex, usageIndex, timestampIndex].includes(-1)) {
      return "❌ <b>Gagal:</b> Header penting (Storage Alias, Usage (TB), Timestamp) tidak ditemukan di log storage.";
    }

    logs.sort((a, b) => new Date(b[timestampIndex]) - new Date(a[timestampIndex]));

    let reportMessage = formatReportHeader("Ringkasan Utilisasi Storage");
    reportMessage += "<i>Data berdasarkan catatan terakhir yang diterima untuk setiap tipe storage.</i>\n";

    reportKeys.forEach((reportKey) => {
      const totalCapacity = capacityMap[reportKey];

      // --- LOGIKA PENCARIAN ALIAS YANG DIPERBAIKI ---
      let semuaAliasTerkait = [reportKey];
      for (const key in aliasMap) {
        if (aliasMap[key].map((a) => a.toUpperCase()).includes(reportKey.toUpperCase())) {
          semuaAliasTerkait = aliasMap[key];
          break;
        }
      }
      // --- AKHIR PERBAIKAN ---

      const lastEntry = logs.find((row) => {
        const logAliases = (row[nameIndex] || "").split(",").map((a) => a.trim());
        return logAliases.some((logAlias) => semuaAliasTerkait.includes(logAlias));
      });

      if (!lastEntry) {
        reportMessage += `\n⚪️ <b>${reportKey}</b>\n   <i>(Tidak ada data log ditemukan)</i>\n`;
        return;
      }

      const currentUsage = parseFloat(lastEntry[usageIndex]) || 0;
      const percentage = totalCapacity > 0 ? (currentUsage / totalCapacity) * 100 : 0;
      let statusEmoji = percentage >= thresholds.critical ? "🔴" : percentage >= thresholds.warning ? "🟡" : "🟢";

      reportMessage += `\n${statusEmoji} <b>${reportKey}</b> <code>(${percentage.toFixed(1)}%)</code>\n`;
      reportMessage += `${createProgressBar(percentage)}\n`;
      reportMessage += `<code>${currentUsage.toFixed(1)} / ${totalCapacity} TB Terpakai</code>\n`;
    });
    
    reportMessage += "\n" + KONSTANTA.UI_STRINGS.SEPARATOR + "\n";
    reportMessage += "<i>*Catatan: Total kapasitas (TB) merupakan hasil konversi dari satuan asli pabrikan (TiB) untuk standarisasi pelaporan.</i>";

    return reportMessage;
  } catch (e) {
    console.error(`Gagal membuat laporan utilisasi storage: ${e.message}\n${e.stack}`);
    return `🔴 <b>Gagal Membuat Laporan Storage</b>\n\nPenyebab: <pre>${escapeHtml(e.message)}</pre>`;
  }
}

/**
 * [BARU] Menganalisis sebuah datastore secara komprehensif.
 */
function generateDatastoreAnalysis(datastoreName, config) {
  const analysis = {
    totalVms: 0,
    on: 0,
    off: 0,
    details: getDatastoreDetails(datastoreName, config),
  };

  if (!analysis.details) return analysis;

  try {
    const { headers, results: vmsInDatastore } = searchVmsByDatastore(datastoreName, config);
    analysis.totalVms = vmsInDatastore.length;

    if (vmsInDatastore.length > 0) {
      const stateIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_STATE]);
      if (stateIndex !== -1) {
        vmsInDatastore.forEach((row) => {
          String(row[stateIndex] || "")
            .toLowerCase()
            .includes("on")
            ? analysis.on++
            : analysis.off++;
        });
      }
    }
  } catch (e) {
    console.error(`Gagal menganalisis VM di datastore ${datastoreName}: ${e.message}`);
  }

  return analysis;
}
