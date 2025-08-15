/**
 * @file ManajemenCatatan.js
 * @author Djanoer Team
 * @date 2023-08-01
 *
 * @description
 * Bertindak sebagai lapisan logika bisnis (business logic layer) untuk catatan VM.
 * Meneruskan permintaan dari State Machine ke Repositori Data.
 */

/**
 * [REFAKTOR] Mengambil satu catatan spesifik untuk sebuah VM dari cache atau repositori.
 */
function getVmNote(vmPrimaryKey, config) {
  // Di masa depan, kita bisa menambahkan lapisan cache di sini.
  // Untuk sekarang, kita ambil semua dan cari.
  const allNotes = RepositoriData.getSemuaCatatan();
  return allNotes.get(vmPrimaryKey) || null;
}

/**
 * [REFAKTOR] Meneruskan permintaan simpan/update ke Repositori Data.
 */
function saveOrUpdateVmNote(vmPrimaryKey, noteText, userData) {
  return RepositoriData.simpanAtauPerbaruiCatatan(vmPrimaryKey, noteText, userData);
}

/**
 * [REFAKTOR] Meneruskan permintaan hapus ke Repositori Data.
 */
function deleteVmNote(vmPrimaryKey) {
  return RepositoriData.hapusCatatan(vmPrimaryKey);
}