/**
 * ============================================================
 *  TUTON TRACKER — Backend Google Apps Script  (v3)
 *  Dashboard tracking tugas, diskusi, dan Tuweb Universitas Terbuka
 * ============================================================
 *
 *  BARU DI v3
 *  Tampilan dashboard pindah ke GitHub Pages
 *  (https://my-razara.github.io/dashboard-kuliah/). Script ini jadi
 *  API: data tetap di spreadsheet, Calendar dan email tetap dari sini.
 *
 *  SETELAH MENEMPEL FILE INI
 *  1. Jalankan buatKunciApi() sekali, salin kunci yang muncul.
 *  2. Deploy → New deployment → Web app
 *       Execute as: Me · Who has access: Anyone
 *  3. Buka dashboard di GitHub, tempel URL /exec dan kuncinya.
 *
 *  "Anyone" artinya URL bisa dipanggil tanpa login Google, tapi setiap
 *  permintaan ditolak kalau tidak membawa kunci yang benar.
 * ============================================================
 */

const CONFIG = {
  SPREADSHEET_ID: '',      // kosongkan kalau script terikat ke spreadsheet
  EMAIL_TUJUAN: '',        // kosongkan = email akun yang login
  TIMEZONE: 'Asia/Jakarta',
  JAM_TUWEB_DEFAULT: '19:00',
  DURASI_TUWEB_MENIT: 120,
  // Pengingat Google Calendar, dalam menit sebelum acara dimulai.
  INGAT_SEBELUM: [1440, 60],
  // Komposisi nilai Tuton UT: Tugas 50%, Diskusi 30%, Daftar Hadir 20%.
  // Tes formatif tidak ikut dihitung — sifatnya asesmen mandiri.
  BOBOT_TUTON: { tugas: 0.5, diskusi: 0.3, hadir: 0.2 },
  BOBOT_AKHIR: { tuton: 0.3, uas: 0.7 },
  AMBANG: { A: 80, 'B+': 72.01, B: 65, 'C+': 57.01, C: 40 }
};

/**
 * Pola pelaksanaan mata kuliah.
 * diskusi / kuis / tuweb : daftar nomor sesi
 * tugas : { sesi = sesi mulai, tutup = sesi batas akhir pengumpulan }
 * labelDiskusi : nama khusus untuk sesi tertentu
 */
const POLA = {
  standar: {
    nama: 'Tuton standar',
    perkenalan: 1,                                   // form perkenalan, terpisah dari diskusi
    diskusi: [1, 2, 3, 4, 5, 6, 7, 8],
    latihan: [1, 2, 3, 4, 5, 6, 7, 8],               // latihan / quiz per sesi
    hadir: [1, 2, 3, 4, 5, 6, 7, 8],
    tugas: [{ sesi: 3, tutup: 3 }, { sesi: 5, tutup: 5 }, { sesi: 7, tutup: 7 }],
    tuweb: []
  },
  berpraktik: {
    nama: 'MK berpraktik (ada Tuweb)',
    perkenalan: 1,
    diskusi: [2, 3, 5, 7],                           // Diskusi 1-4, bukan 8 sesi penuh
    latihan: [1, 2, 3, 4, 5, 6, 7, 8],
    hadir: [1, 2, 3, 4, 5, 6, 7, 8],
    tugas: [{ sesi: 3, tutup: 4 }, { sesi: 5, tutup: 6 }, { sesi: 7, tutup: 8 }],
    tuweb: [4, 6, 8]
  }
};

const SHEETS = {
  SEMESTER: {
    nama: 'Semester',
    kolom: ['id', 'label', 'mulai_tuton', 'tgl_uas', 'status']
  },
  MATKUL: {
    nama: 'Matkul',
    kolom: ['id', 'semester_id', 'kode', 'nama', 'sks', 'warna', 'link_tuton', 'nilai_uas', 'pola', 'profil']
  },
  ITEM: {
    // Kolom baru sengaja ditaruh di ujung supaya data v1 tetap sejajar.
    nama: 'Item',
    kolom: ['id', 'matkul_id', 'sesi', 'tipe', 'status', 'deadline', 'nilai', 'link', 'catatan', 'label', 'jam', 'kal_id']
  },
  JADWAL: {
    nama: 'Jadwal',
    kolom: ['id', 'matkul_id', 'hari', 'jam_mulai', 'jam_selesai', 'tipe', 'keterangan']
  }
};

/* ------------------------------------------------------------------
 *  API UNTUK DASHBOARD DI GITHUB PAGES
 * ---------------------------------------------------------------- */

/**
 * Fungsi yang boleh dipanggil dari dashboard. Fungsi lain (reset,
 * migrasi, pemasangan trigger) hanya bisa dijalankan dari editor.
 */
const API_DIIZINKAN = [
  'getAllData',
  'tambahSemester', 'aktifkanSemester', 'ubahSemester', 'duplikatSemester',
  'tambahMatkul', 'ubahMatkul', 'gantiPola', 'hapusMatkul', 'lengkapiItem',
  'ubahItem', 'tandaiSesi',
  'tambahJadwal', 'hapusJadwal',
  'sinkronSemester', 'sinkronItemTunggal', 'lepasKalender'
];

/**
 * Halaman ini sengaja tidak lagi menyajikan dashboard. Dengan akses
 * "Anyone", dashboard lama yang dipanggil lewat google.script.run akan
 * bisa membaca dan mengubah data tanpa kunci.
 */
function doGet() {
  return ContentService
    .createTextOutput('API Tuton Tracker aktif. Buka dashboard di https://my-razara.github.io/dashboard-kuliah/')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Dashboard mengirim POST berisi JSON {kunci, fn, args}.
 * Dikirim sebagai text/plain supaya browser tidak perlu preflight CORS.
 */
function doPost(e) {
  let hasil;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const kunciBenar = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!kunciBenar) {
      hasil = { ok: false, kode: 'belum-ada-kunci', galat: 'Kunci API belum dibuat. Jalankan buatKunciApi() di editor Apps Script.' };
    } else if (req.kunci !== kunciBenar) {
      hasil = { ok: false, kode: 'kunci-salah', galat: 'Kunci API salah.' };
    } else if (req.fn === 'ping') {
      hasil = { ok: true, hasil: 'pong' };
    } else if (API_DIIZINKAN.indexOf(req.fn) < 0) {
      hasil = { ok: false, kode: 'tidak-diizinkan', galat: 'Fungsi tidak tersedia: ' + req.fn };
    } else {
      const fn = globalThis[req.fn];
      if (typeof fn !== 'function') throw new Error('Fungsi tidak ditemukan: ' + req.fn);
      // Kunci dipegang selama perubahan supaya dua permintaan bersamaan tidak saling menimpa baris.
      const kunciSkrip = LockService.getScriptLock();
      kunciSkrip.waitLock(20000);
      try {
        hasil = { ok: true, hasil: fn.apply(null, Array.isArray(req.args) ? req.args : []) };
      } finally {
        kunciSkrip.releaseLock();
      }
    }
  } catch (err) {
    hasil = { ok: false, kode: 'galat', galat: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(hasil))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Jalankan sekali dari editor. Kunci lama otomatis tidak berlaku lagi. */
function buatKunciApi() {
  const kunci = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('API_KEY', kunci);
  Logger.log('Kunci API baru: ' + kunci);
  return 'Kunci API baru: ' + kunci + '  — salin ke dashboard. Perangkat yang memakai kunci lama perlu memasukkan kunci ini.';
}

/** Lihat kunci yang sedang berlaku, kalau lupa. */
function lihatKunciApi() {
  const k = PropertiesService.getScriptProperties().getProperty('API_KEY');
  Logger.log(k ? 'Kunci API: ' + k : 'Belum ada kunci. Jalankan buatKunciApi().');
  return k || 'Belum ada kunci.';
}

/* ------------------------------------------------------------------
 *  SETUP & MIGRASI
 * ---------------------------------------------------------------- */

function setupAwal() {
  const ss = getSS_();
  Object.keys(SHEETS).forEach(function (k) {
    const def = SHEETS[k];
    let sh = ss.getSheetByName(def.nama);
    if (!sh) sh = ss.insertSheet(def.nama);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, def.kolom.length).setValues([def.kolom]);
      sh.getRange(1, 1, 1, def.kolom.length)
        .setFontWeight('bold').setBackground('#1B2432').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    }
  });

  const sisa = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1');
  if (sisa && ss.getSheets().length > 1 && sisa.getLastRow() === 0) ss.deleteSheet(sisa);

  if (baca_(SHEETS.SEMESTER).length === 0) {
    const now = new Date();
    const ganjil = now.getMonth() >= 7 || now.getMonth() <= 1;
    tambahSemester({
      label: now.getFullYear() + (ganjil ? '.1' : '.2'),
      mulai_tuton: fmtTgl_(now),
      tgl_uas: fmtTgl_(tambahHari_(now, 70))
    });
  }
  return 'Setup selesai.';
}

/** Jalankan tiap kali upgrade versi. Aman diulang, data lama tidak hilang. */
function migrasiSheet() {
  const ss = getSS_();
  const catatan = [];

  Object.keys(SHEETS).forEach(function (k) {
    const def = SHEETS[k];
    const sh = ss.getSheetByName(def.nama);
    if (!sh) { setupAwal(); return; }
    const lebar = Math.max(sh.getLastColumn(), 1);
    const header = sh.getRange(1, 1, 1, lebar).getValues()[0];
    const kurang = def.kolom.filter(function (c) { return header.indexOf(c) === -1; });
    if (kurang.length) {
      sh.getRange(1, header.length + 1, 1, kurang.length).setValues([kurang]);
      sh.getRange(1, 1, 1, header.length + kurang.length)
        .setFontWeight('bold').setBackground('#1B2432').setFontColor('#FFFFFF');
      catatan.push(def.nama + ': +' + kurang.join(', '));
    }
  });

  // Matkul lama tanpa pola dianggap standar
  const shMk = ss.getSheetByName(SHEETS.MATKUL.nama);
  const iPola = SHEETS.MATKUL.kolom.indexOf('pola') + 1;
  const lastMk = shMk.getLastRow();
  if (lastMk > 1) {
    const r = shMk.getRange(2, iPola, lastMk - 1, 1);
    const v = r.getValues();
    let n = 0;
    v.forEach(function (x) { if (!x[0]) { x[0] = 'standar'; n++; } });
    r.setValues(v);
    if (n) catatan.push(n + ' mata kuliah diset ke pola standar');
  }

  // Item bertipe 'kuis' dari versi lama diubah jadi 'latihan'
  const shIt = ss.getSheetByName(SHEETS.ITEM.nama);
  const kolIt = SHEETS.ITEM.kolom;
  const lastIt = shIt.getLastRow();
  if (lastIt > 1) {
    const iTipe = kolIt.indexOf('tipe'), iSesi = kolIt.indexOf('sesi'), iLbl = kolIt.indexOf('label');
    const dataIt = shIt.getRange(2, 1, lastIt - 1, kolIt.length).getValues();
    let ubahTipe = 0;
    dataIt.forEach(function (r) {
      if (r[iTipe] === 'kuis') {
        r[iTipe] = 'latihan';
        r[iLbl] = 'Latihan ' + r[iSesi];
        ubahTipe++;
      }
    });
    if (ubahTipe) {
      shIt.getRange(2, 1, dataIt.length, kolIt.length).setValues(dataIt);
      catatan.push(ubahTipe + ' item tes formatif diubah jadi Latihan');
    }
  }

  const ditambah = lengkapiSemua_();
  if (ditambah) catatan.push(ditambah + ' item baru dibuat sesuai pola');

  return catatan.length
    ? 'Migrasi selesai. ' + catatan.join(' · ')
    : 'Sudah versi terbaru, tidak ada perubahan.';
}

/**
 * Buat item yang didefinisikan pola tapi belum ada di sheet.
 * Tidak pernah menghapus apa pun, jadi aman dijalankan berulang.
 */
function lengkapiMatkul_(mk, sem, adaPeta) {
  const mulai = parseTgl_(sem.mulai_tuton);
  return generateItem_(mk.id, mk.pola, mulai, sem.tgl_uas)
    .filter(function (it) { return !adaPeta[kunciItem_(it)]; });
}

function lengkapiSemua_() {
  const semPeta = {};
  baca_(SHEETS.SEMESTER).forEach(function (s) { semPeta[s.id] = s; });

  const ada = {};
  baca_(SHEETS.ITEM).forEach(function (i) {
    ada[i.matkul_id] = ada[i.matkul_id] || {};
    ada[i.matkul_id][kunciItem_(i)] = 1;
  });

  const baru = [];
  baca_(SHEETS.MATKUL).forEach(function (m) {
    const sem = semPeta[m.semester_id];
    if (!sem) return;
    Array.prototype.push.apply(baru, lengkapiMatkul_(m, sem, ada[m.id] || {}));
  });

  if (baru.length) tulisBanyak_(SHEETS.ITEM, baru);
  return baru.length;
}

/** Dipanggil dari dashboard: lengkapi item semester aktif tanpa menghapus apa pun. */
function lengkapiItem(semesterId) {
  const sem = baca_(SHEETS.SEMESTER).filter(function (s) { return s.id === semesterId; })[0];
  if (!sem) throw new Error('Semester tidak ditemukan.');

  const ada = {};
  baca_(SHEETS.ITEM).forEach(function (i) {
    ada[i.matkul_id] = ada[i.matkul_id] || {};
    ada[i.matkul_id][kunciItem_(i)] = 1;
  });

  const baru = [];
  baca_(SHEETS.MATKUL)
    .filter(function (m) { return m.semester_id === semesterId; })
    .forEach(function (m) {
      Array.prototype.push.apply(baru, lengkapiMatkul_(m, sem, ada[m.id] || {}));
    });

  if (baru.length) tulisBanyak_(SHEETS.ITEM, baru);
  return baru.length;
}

/** Alias lama. */
function migrasiV2() { return migrasiSheet(); }

/** Pasang dua trigger: rekap mingguan + pengingat harian. */
function pasangReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'kirimReminderMingguan' || f === 'kirimReminderHarian') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kirimReminderMingguan')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6)
    .inTimezone(CONFIG.TIMEZONE).create();
  ScriptApp.newTrigger('kirimReminderHarian')
    .timeBased().everyDays(1).atHour(7)
    .inTimezone(CONFIG.TIMEZONE).create();
  return 'Rekap mingguan tiap Senin 06.00 dan pengingat harian tiap 07.00 WIB aktif.';
}

function matikanReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'kirimReminderMingguan' || f === 'kirimReminderHarian') ScriptApp.deleteTrigger(t);
  });
  return 'Semua reminder dimatikan.';
}

/* ------------------------------------------------------------------
 *  HELPER SHEET
 * ---------------------------------------------------------------- */

function getSS_() {
  if (CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script belum terikat ke spreadsheet. Isi CONFIG.SPREADSHEET_ID.');
  return ss;
}

function sheet_(def) {
  const sh = getSS_().getSheetByName(def.nama);
  if (!sh) throw new Error('Sheet "' + def.nama + '" belum ada. Jalankan setupAwal() dulu.');
  return sh;
}

function baca_(def) {
  const sh = sheet_(def);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const nilai = sh.getRange(2, 1, last - 1, def.kolom.length).getValues();
  return nilai.filter(function (r) { return r[0] !== '' && r[0] !== null; })
    .map(function (r) {
      const o = {};
      def.kolom.forEach(function (k, i) { o[k] = normalisasi_(r[i], k); });
      return o;
    });
}

function normalisasi_(v, kunci) {
  if (v instanceof Date) {
    return (kunci === 'jam' || kunci === 'jam_mulai' || kunci === 'jam_selesai')
      ? Utilities.formatDate(v, CONFIG.TIMEZONE, 'HH:mm')
      : fmtTgl_(v);
  }
  return v;
}

function tulis_(def, obj) {
  sheet_(def).appendRow(def.kolom.map(function (k) {
    return obj[k] === undefined || obj[k] === null ? '' : obj[k];
  }));
  return obj;
}

function tulisBanyak_(def, arr) {
  if (!arr.length) return;
  const sh = sheet_(def);
  const baris = arr.map(function (obj) {
    return def.kolom.map(function (k) {
      return obj[k] === undefined || obj[k] === null ? '' : obj[k];
    });
  });
  sh.getRange(sh.getLastRow() + 1, 1, baris.length, def.kolom.length).setValues(baris);
}

function cariBaris_(def, id) {
  const sh = sheet_(def);
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function ubah_(def, id, patch) {
  const row = cariBaris_(def, id);
  if (row === -1) throw new Error('Data tidak ditemukan: ' + id);
  const sh = sheet_(def);
  Object.keys(patch).forEach(function (k) {
    const idx = def.kolom.indexOf(k);
    if (idx >= 0) sh.getRange(row, idx + 1).setValue(patch[k]);
  });
  return true;
}

function hapus_(def, id) {
  const row = cariBaris_(def, id);
  if (row === -1) return false;
  sheet_(def).deleteRow(row);
  return true;
}

function hapusBanyak_(def, predikat) {
  const sh = sheet_(def);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const data = sh.getRange(2, 1, last - 1, def.kolom.length).getValues();
  let jumlah = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    const o = {};
    def.kolom.forEach(function (k, j) { o[k] = data[i][j]; });
    if (predikat(o)) { sh.deleteRow(i + 2); jumlah++; }
  }
  return jumlah;
}

function uid_(p) { return p + '_' + Utilities.getUuid().split('-')[0] + Date.now().toString(36).slice(-3); }

function fmtTgl_(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function parseTgl_(s) {
  const p = String(s).slice(0, 10).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function tambahHari_(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

/* ------------------------------------------------------------------
 *  API — BACA SEMUA
 * ---------------------------------------------------------------- */

function getAllData() {
  const daftarPola = {};
  Object.keys(POLA).forEach(function (k) { daftarPola[k] = POLA[k].nama; });
  return JSON.stringify({
    semester: baca_(SHEETS.SEMESTER),
    matkul: baca_(SHEETS.MATKUL),
    item: baca_(SHEETS.ITEM),
    jadwal: baca_(SHEETS.JADWAL),
    config: {
      bobotTuton: CONFIG.BOBOT_TUTON,
      bobotAkhir: CONFIG.BOBOT_AKHIR,
      ambang: CONFIG.AMBANG,
      pola: daftarPola
    },
    hariIni: fmtTgl_(new Date())
  });
}

/* ------------------------------------------------------------------
 *  API — SEMESTER
 * ---------------------------------------------------------------- */

function tambahSemester(data) {
  const id = uid_('sem');
  baca_(SHEETS.SEMESTER).forEach(function (s) {
    if (s.status === 'aktif') ubah_(SHEETS.SEMESTER, s.id, { status: 'arsip' });
  });
  tulis_(SHEETS.SEMESTER, {
    id: id, label: data.label,
    mulai_tuton: fmtTgl_(data.mulai_tuton),
    tgl_uas: data.tgl_uas ? fmtTgl_(data.tgl_uas) : '',
    status: 'aktif'
  });
  return id;
}

function aktifkanSemester(id) {
  baca_(SHEETS.SEMESTER).forEach(function (s) {
    ubah_(SHEETS.SEMESTER, s.id, { status: s.id === id ? 'aktif' : 'arsip' });
  });
  return true;
}

function ubahSemester(id, patch) {
  const lama = baca_(SHEETS.SEMESTER).filter(function (s) { return s.id === id; })[0];
  if (patch.mulai_tuton) patch.mulai_tuton = fmtTgl_(patch.mulai_tuton);
  if (patch.tgl_uas) patch.tgl_uas = fmtTgl_(patch.tgl_uas);
  ubah_(SHEETS.SEMESTER, id, patch);
  if (patch.mulai_tuton) geserDeadline(id, patch.mulai_tuton);
  if (patch.tgl_uas && lama) geserUas_(id, lama.tgl_uas, patch.tgl_uas);
  return true;
}

/**
 * Perbarui tanggal item UAS. Hanya yang masih memakai tanggal semester lama
 * yang digeser, supaya tanggal per matkul yang sudah lu atur sendiri tidak tertimpa.
 */
function geserUas_(semesterId, tglLama, tglBaru) {
  const mkIds = baca_(SHEETS.MATKUL)
    .filter(function (m) { return m.semester_id === semesterId; })
    .map(function (m) { return m.id; });
  if (!mkIds.length) return 0;

  const sh = sheet_(SHEETS.ITEM);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const kol = SHEETS.ITEM.kolom;
  const data = sh.getRange(2, 1, last - 1, kol.length).getValues();
  const iMat = kol.indexOf('matkul_id'), iTipe = kol.indexOf('tipe'), iDl = kol.indexOf('deadline');

  let n = 0;
  data.forEach(function (r) {
    if (r[iTipe] !== 'uas') return;
    if (mkIds.indexOf(r[iMat]) < 0) return;
    const kini = r[iDl] instanceof Date ? fmtTgl_(r[iDl]) : String(r[iDl] || '').slice(0, 10);
    if (kini === '' || kini === tglLama) { r[iDl] = tglBaru; n++; }
  });
  sh.getRange(2, 1, data.length, kol.length).setValues(data);
  return n;
}

function hapusSemester(id) {
  baca_(SHEETS.MATKUL).filter(function (m) { return m.semester_id === id; })
    .forEach(function (m) { hapusMatkul(m.id); });
  hapus_(SHEETS.SEMESTER, id);
  return true;
}

/**
 * Hitung ulang deadline seluruh item di satu semester.
 * Item Tuweb SENGAJA dilewati — tanggalnya ditetapkan tutor
 * dan tidak selalu ikut bergeser bersama jadwal Tuton.
 */
function geserDeadline(semesterId, mulaiBaru) {
  const mulai = parseTgl_(mulaiBaru);
  const peta = {};
  baca_(SHEETS.MATKUL)
    .filter(function (m) { return m.semester_id === semesterId; })
    .forEach(function (m) { peta[m.id] = petaDeadline_(m.pola, mulai); });

  const sh = sheet_(SHEETS.ITEM);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const kol = SHEETS.ITEM.kolom;
  const data = sh.getRange(2, 1, last - 1, kol.length).getValues();
  const iMat = kol.indexOf('matkul_id'), iSesi = kol.indexOf('sesi'),
        iTipe = kol.indexOf('tipe'), iDl = kol.indexOf('deadline');

  let n = 0;
  data.forEach(function (r) {
    const p = peta[r[iMat]];
    if (!p) return;
    if (r[iTipe] === 'tuweb' || r[iTipe] === 'uas') return;
    const baru = p[r[iTipe] + '|' + Number(r[iSesi])];
    if (baru) { r[iDl] = baru; n++; }
  });
  sh.getRange(2, 1, data.length, kol.length).setValues(data);
  return n;
}

function petaDeadline_(polaKey, mulai) {
  const p = POLA[polaKey] || POLA.standar, m = {};
  if (p.perkenalan) m['diskusi|' + p.perkenalan] = deadlineSesi_(mulai, p.perkenalan);
  (p.diskusi || []).forEach(function (s) { m['diskusi|' + s] = deadlineSesi_(mulai, s); });
  (p.latihan || []).forEach(function (s) { m['latihan|' + s] = deadlineSesi_(mulai, s); });
  (p.hadir || []).forEach(function (s) { m['hadir|' + s] = deadlineSesi_(mulai, s); });
  (p.tugas || []).forEach(function (t) { m['tugas|' + t.sesi] = deadlineSesi_(mulai, t.tutup); });
  (p.tuweb || []).forEach(function (s) { m['tuweb|' + s] = deadlineSesi_(mulai, s); });
  return m;
}

function deadlineSesi_(mulai, sesi) {
  return fmtTgl_(tambahHari_(mulai, sesi * 7 - 1));
}

/* ------------------------------------------------------------------
 *  API — MATKUL & GENERATOR ITEM
 * ---------------------------------------------------------------- */

function tambahMatkul(data) {
  const sem = baca_(SHEETS.SEMESTER).filter(function (s) { return s.id === data.semester_id; })[0];
  if (!sem) throw new Error('Semester tidak ditemukan.');

  const pola = POLA[data.pola] ? data.pola : 'standar';
  const id = uid_('mk');
  tulis_(SHEETS.MATKUL, {
    id: id, semester_id: data.semester_id,
    kode: data.kode || '', nama: data.nama, sks: data.sks || 3,
    warna: data.warna || '#2F5FE0', link_tuton: data.link_tuton || '',
    nilai_uas: '', pola: pola, profil: data.profil || ''
  });
  tulisBanyak_(SHEETS.ITEM, generateItem_(id, pola, parseTgl_(sem.mulai_tuton), sem.tgl_uas));
  return id;
}

function generateItem_(matkulId, polaKey, mulai, tglUas) {
  const p = POLA[polaKey] || POLA.standar;
  const out = [];

  if (p.perkenalan) {
    out.push(itemBaru_(matkulId, p.perkenalan, 'diskusi', 'Perkenalan',
      deadlineSesi_(mulai, p.perkenalan)));
  }

  (p.diskusi || []).forEach(function (s, i) {
    out.push(itemBaru_(matkulId, s, 'diskusi', 'Diskusi ' + (i + 1), deadlineSesi_(mulai, s)));
  });

  (p.latihan || []).forEach(function (s) {
    out.push(itemBaru_(matkulId, s, 'latihan', 'Latihan ' + s, deadlineSesi_(mulai, s)));
  });

  (p.hadir || []).forEach(function (s) {
    out.push(itemBaru_(matkulId, s, 'hadir', 'Daftar hadir', deadlineSesi_(mulai, s)));
  });

  (p.tugas || []).forEach(function (t, i) {
    out.push(itemBaru_(matkulId, t.sesi, 'tugas', 'Tugas ' + (i + 1), deadlineSesi_(mulai, t.tutup)));
  });

  (p.tuweb || []).forEach(function (s, i) {
    const it = itemBaru_(matkulId, s, 'tuweb', 'Tuweb ' + (i + 1), deadlineSesi_(mulai, s));
    it.jam = CONFIG.JAM_TUWEB_DEFAULT;
    out.push(it);
  });

  // UAS dipakai sesi 9 supaya berada di luar matriks sesi 1-8,
  // tapi tetap ikut reminder, kalender, dan sinkronisasi Calendar.
  out.push(itemBaru_(matkulId, 9, 'uas', 'UAS', tglUas || ''));

  return out;
}

/** Kunci unik satu item, dipakai untuk mencari item yang belum ada. */
function kunciItem_(it) {
  return it.tipe + '|' + it.sesi + '|' + (it.label || '');
}

function itemBaru_(matkulId, sesi, tipe, label, deadline) {
  return {
    id: uid_('it'), matkul_id: matkulId, sesi: sesi, tipe: tipe,
    status: 'belum', deadline: deadline, nilai: '', link: '', catatan: '',
    label: label, jam: '', kal_id: ''
  };
}

function ubahMatkul(id, patch) { ubah_(SHEETS.MATKUL, id, patch); return true; }

/** Ganti pola matkul. Seluruh item lama dibuang dan dibuat ulang. */
function gantiPola(matkulId, polaBaru) {
  const mk = baca_(SHEETS.MATKUL).filter(function (m) { return m.id === matkulId; })[0];
  if (!mk) throw new Error('Mata kuliah tidak ditemukan.');
  const sem = baca_(SHEETS.SEMESTER).filter(function (s) { return s.id === mk.semester_id; })[0];
  lepasKalenderBanyak_(baca_(SHEETS.ITEM).filter(function (o) { return o.matkul_id === matkulId; }));
  hapusBanyak_(SHEETS.ITEM, function (o) { return o.matkul_id === matkulId; });
  ubah_(SHEETS.MATKUL, matkulId, { pola: polaBaru });
  tulisBanyak_(SHEETS.ITEM, generateItem_(matkulId, polaBaru, parseTgl_(sem.mulai_tuton), sem.tgl_uas));
  return true;
}

function hapusMatkul(id) {
  lepasKalenderBanyak_(baca_(SHEETS.ITEM).filter(function (o) { return o.matkul_id === id; }));
  hapusBanyak_(SHEETS.ITEM, function (o) { return o.matkul_id === id; });
  hapusBanyak_(SHEETS.JADWAL, function (o) { return o.matkul_id === id; });
  hapus_(SHEETS.MATKUL, id);
  return true;
}

function duplikatSemester(dariId, label, mulaiTuton, tglUas) {
  const baruId = tambahSemester({ label: label, mulai_tuton: mulaiTuton, tgl_uas: tglUas });
  baca_(SHEETS.MATKUL).filter(function (m) { return m.semester_id === dariId; })
    .forEach(function (m) {
      tambahMatkul({
        semester_id: baruId, kode: m.kode, nama: m.nama, sks: m.sks,
        warna: m.warna, link_tuton: m.link_tuton, pola: m.pola, profil: m.profil
      });
    });
  return baruId;
}

/* ------------------------------------------------------------------
 *  API — ITEM & JADWAL
 * ---------------------------------------------------------------- */

function ubahItem(id, patch) {
  ubah_(SHEETS.ITEM, id, patch);
  // Kalau tanggal, jam, link, atau judulnya berubah dan item ini sudah punya
  // event di Calendar, event-nya ikut diperbarui. Kegagalan di sini tidak
  // boleh membatalkan penyimpanan data.
  var perluSync = ['deadline', 'jam', 'link', 'catatan'].some(function (k) {
    return patch[k] !== undefined;
  });
  if (perluSync) {
    try {
      var it = cariItem_(id);
      if (it && it.kal_id) sinkronSatu_(CalendarApp.getDefaultCalendar(), it, petaMatkul_());
    } catch (e) { /* diabaikan, Calendar opsional */ }
  }
  return true;
}

function cariItem_(id) {
  return baca_(SHEETS.ITEM).filter(function (i) { return i.id === id; })[0] || null;
}

function petaMatkul_() {
  var p = {};
  baca_(SHEETS.MATKUL).forEach(function (m) { p[m.id] = m; });
  return p;
}

/**
 * Tandai seluruh item pada satu sesi untuk semua mata kuliah di satu semester.
 * Item UAS tidak ikut karena berada di luar sesi 1-8.
 * status: 'belum' | 'draft' | 'submitted' | 'nihil'
 * Item yang sudah bertanda 'nihil' tidak ikut diubah.
 */
function tandaiSesi(semesterId, sesi, status) {
  const mkIds = baca_(SHEETS.MATKUL)
    .filter(function (m) { return m.semester_id === semesterId; })
    .map(function (m) { return m.id; });
  if (!mkIds.length) return 0;

  const sh = sheet_(SHEETS.ITEM);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const kol = SHEETS.ITEM.kolom;
  const data = sh.getRange(2, 1, last - 1, kol.length).getValues();
  const iMat = kol.indexOf('matkul_id'), iSesi = kol.indexOf('sesi'),
        iTipe = kol.indexOf('tipe'), iStat = kol.indexOf('status');

  let n = 0;
  data.forEach(function (r) {
    if (mkIds.indexOf(r[iMat]) < 0) return;
    if (Number(r[iSesi]) !== Number(sesi)) return;
    if (r[iTipe] === 'uas') return;
    if (r[iStat] === 'nihil') return;   // item yang ditandai "Tidak ada" dibiarkan
    if (r[iStat] === status) return;
    r[iStat] = status;
    n++;
  });
  if (n) sh.getRange(2, 1, data.length, kol.length).setValues(data);
  return n;
}

/* ------------------------------------------------------------------
 *  GOOGLE CALENDAR
 * ---------------------------------------------------------------- */

/**
 * Jalankan sekali dari editor untuk memberi izin akses Calendar.
 * Tanpa ini, tombol sinkron di dashboard akan gagal.
 */
function cekKalender() {
  var kal = CalendarApp.getDefaultCalendar();
  return 'Terhubung ke kalender: ' + kal.getName();
}

function gabungWaktu_(tanggal, jam) {
  var t = String(tanggal).slice(0, 10).split('-');
  var j = String(jam || CONFIG.JAM_TUWEB_DEFAULT).split(':');
  return new Date(Number(t[0]), Number(t[1]) - 1, Number(t[2]),
    Number(j[0]) || 0, Number(j[1]) || 0, 0);
}

function judulEvent_(it, mk) {
  return (it.label || labelTipe_(it.tipe) + ' ' + it.sesi) + ' · ' + mk.nama;
}

function deskripsiEvent_(it, mk) {
  var b = [];
  if (mk.kode) b.push(mk.kode + ' · sesi ' + it.sesi);
  else b.push('Sesi ' + it.sesi);
  if (it.tipe === 'tuweb' && it.link) b.push('Ruang Tuweb: ' + it.link);
  if (it.tipe !== 'tuweb' && mk.link_tuton) b.push('Ruang Tuton: ' + mk.link_tuton);
  if (it.catatan) b.push('', it.catatan);
  b.push('', 'Dibuat otomatis oleh Tuton Tracker.');
  return b.join('\n');
}

/** Buat atau perbarui satu event. Mengembalikan 'buat' | 'perbarui' | 'lewat'. */
function sinkronSatu_(kal, it, peta) {
  var mk = peta[it.matkul_id];
  if (!mk || !it.deadline) return 'lewat';

  var judul = judulEvent_(it, mk);
  var desk = deskripsiEvent_(it, mk);
  var timed = it.tipe === 'tuweb';
  var mulai, selesai;
  if (timed) {
    mulai = gabungWaktu_(it.deadline, it.jam);
    selesai = new Date(mulai.getTime() + CONFIG.DURASI_TUWEB_MENIT * 60000);
  }

  var ev = null;
  if (it.kal_id) {
    try { ev = kal.getEventById(it.kal_id); } catch (e) { ev = null; }
  }

  if (ev) {
    ev.setTitle(judul);
    ev.setDescription(desk);
    if (timed) {
      ev.setTime(mulai, selesai);
      if (it.link) ev.setLocation(it.link);
    } else {
      ev.setAllDayDate(parseTgl_(it.deadline));
    }
    pasangPengingat_(ev, timed);
    return 'perbarui';
  }

  ev = timed
    ? kal.createEvent(judul, mulai, selesai, { description: desk, location: it.link || '' })
    : kal.createAllDayEvent(judul, parseTgl_(it.deadline), { description: desk });

  pasangPengingat_(ev, timed);
  ubah_(SHEETS.ITEM, it.id, { kal_id: ev.getId() });
  return 'buat';
}

function pasangPengingat_(ev, timed) {
  ev.removeAllReminders();
  if (timed) {
    CONFIG.INGAT_SEBELUM.forEach(function (m) { ev.addPopupReminder(m); });
  } else {
    ev.addPopupReminder(600); // pagi hari-H untuk acara sehari penuh
  }
}

/**
 * Sinkronkan sekumpulan item ke Google Calendar.
 * itemIds: array id item. Dipanggil dari dashboard.
 */
function sinkronKalender(itemIds) {
  var kal = CalendarApp.getDefaultCalendar();
  var peta = petaMatkul_();
  var semua = baca_(SHEETS.ITEM);
  var pilih = {};
  itemIds.forEach(function (x) { pilih[x] = 1; });

  var hasil = { buat: 0, perbarui: 0, lewat: 0, kalender: kal.getName() };
  semua.forEach(function (it) {
    if (!pilih[it.id]) return;
    try { hasil[sinkronSatu_(kal, it, peta)]++; }
    catch (e) { hasil.lewat++; }
  });
  return JSON.stringify(hasil);
}

/** Sinkronkan satu item saja. Dipakai tombol per baris di dashboard. */
function sinkronItemTunggal(itemId) {
  var kal = CalendarApp.getDefaultCalendar();
  var it = cariItem_(itemId);
  if (!it) throw new Error('Item tidak ditemukan.');
  var aksi = sinkronSatu_(kal, it, petaMatkul_());
  var baru = cariItem_(itemId);
  return JSON.stringify({
    aksi: aksi,
    kal_id: baru ? baru.kal_id : '',
    kalender: kal.getName()
  });
}

/** Sinkronkan semua item bertipe tertentu di satu semester. */
function sinkronSemester(semesterId, tipeList) {
  var mkIds = baca_(SHEETS.MATKUL)
    .filter(function (m) { return m.semester_id === semesterId; })
    .map(function (m) { return m.id; });
  var ids = baca_(SHEETS.ITEM).filter(function (i) {
    return mkIds.indexOf(i.matkul_id) >= 0 && tipeList.indexOf(i.tipe) >= 0;
  }).map(function (i) { return i.id; });
  if (!ids.length) return JSON.stringify({ buat: 0, perbarui: 0, lewat: 0, kosong: true });
  return sinkronKalender(ids);
}

/** Hapus event satu item dari Calendar dan kosongkan tautannya. */
function lepasKalender(itemId) {
  var it = cariItem_(itemId);
  if (!it || !it.kal_id) return true;
  try {
    var ev = CalendarApp.getDefaultCalendar().getEventById(it.kal_id);
    if (ev) ev.deleteEvent();
  } catch (e) { /* event mungkin sudah dihapus manual */ }
  ubah_(SHEETS.ITEM, itemId, { kal_id: '' });
  return true;
}

function lepasKalenderBanyak_(items) {
  var kal;
  try { kal = CalendarApp.getDefaultCalendar(); } catch (e) { return; }
  items.forEach(function (it) {
    if (!it.kal_id) return;
    try {
      var ev = kal.getEventById(it.kal_id);
      if (ev) ev.deleteEvent();
    } catch (e) { /* abaikan */ }
  });
}

function tambahJadwal(data) {
  const id = uid_('jd');
  tulis_(SHEETS.JADWAL, {
    id: id, matkul_id: data.matkul_id, hari: data.hari,
    jam_mulai: data.jam_mulai, jam_selesai: data.jam_selesai,
    tipe: data.tipe || 'belajar', keterangan: data.keterangan || ''
  });
  return id;
}

function hapusJadwal(id) { hapus_(SHEETS.JADWAL, id); return true; }

/* ------------------------------------------------------------------
 *  REMINDER
 * ---------------------------------------------------------------- */

function konteksAktif_() {
  const sem = baca_(SHEETS.SEMESTER).filter(function (s) { return s.status === 'aktif'; })[0];
  if (!sem) return null;
  const matkul = baca_(SHEETS.MATKUL).filter(function (m) { return m.semester_id === sem.id; });
  if (!matkul.length) return null;
  const peta = {};
  matkul.forEach(function (m) { peta[m.id] = m; });
  const item = baca_(SHEETS.ITEM).filter(function (i) {
    return !!peta[i.matkul_id] && !!i.deadline && i.status !== 'nihil';
  });
  return { sem: sem, peta: peta, item: item };
}

/** Tiap pagi: hanya kirim kalau ada Tuweb H-1/hari-H atau deadline hari ini. */
function kirimReminderHarian() {
  const k = konteksAktif_();
  if (!k) return;
  const ini = fmtTgl_(new Date());
  const besok = fmtTgl_(tambahHari_(parseTgl_(ini), 1));

  const tuweb = k.item.filter(function (i) {
    return i.tipe === 'tuweb' && i.status !== 'submitted' &&
      (i.deadline === ini || i.deadline === besok);
  });
  const jatuhTempo = k.item.filter(function (i) {
    return i.tipe !== 'tuweb' && i.status !== 'submitted' && i.deadline === ini;
  });

  if (!tuweb.length && !jatuhTempo.length) return;

  let judul;
  if (tuweb.length) {
    const t = tuweb[0];
    judul = (t.deadline === ini ? 'Tuweb hari ini' : 'Tuweb besok') + ' — ' + k.peta[t.matkul_id].nama;
  } else {
    judul = jatuhTempo.length + ' item jatuh tempo hari ini';
  }

  let html = '<div style="font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#1B2432;max-width:560px">';

  tuweb.forEach(function (t) {
    const mk = k.peta[t.matkul_id];
    const hariH = t.deadline === ini;
    html += '<div style="border-left:4px solid ' + (mk.warna || '#2F5FE0') +
      ';padding:14px 16px;background:#F4F7FB;margin-bottom:14px">' +
      '<div style="font-size:13px;color:#5A6577;margin-bottom:3px">' +
      (hariH ? 'Hari ini' : 'Besok') + ' · ' + tglLengkap_(t.deadline) + '</div>' +
      '<div style="font-size:18px;font-weight:600">' + (t.label || 'Tuweb') + ' · ' + mk.nama + '</div>' +
      '<div style="font-size:15px;margin-top:5px">Mulai pukul ' +
      (t.jam || CONFIG.JAM_TUWEB_DEFAULT) + ' WIB</div>' +
      (t.link ? '<div style="margin-top:9px"><a href="' + t.link +
        '" style="color:#2F5FE0">Buka ruang Tuweb</a></div>' : '') +
      (t.catatan ? '<div style="font-size:13.5px;color:#5A6577;margin-top:7px">' +
        t.catatan + '</div>' : '') +
      '</div>';
  });

  if (jatuhTempo.length) {
    html += '<h3 style="font-size:14px;margin:20px 0 8px;color:#D64545">Jatuh tempo hari ini</h3>' +
      daftarItem_(jatuhTempo, k.peta);
  }

  html += '<p style="margin:24px 0 0;font-size:13px;color:#8A93A3">Tuton Tracker</p></div>';
  kirim_(judul, html);
}

/** Tiap Senin: rekap 7 hari ke depan plus yang sudah lewat. */
function kirimReminderMingguan() {
  const k = konteksAktif_();
  if (!k) return;
  const ini = parseTgl_(fmtTgl_(new Date()));
  const batas = tambahHari_(ini, 7);

  const relevan = k.item.filter(function (i) {
    return i.status !== 'submitted' && parseTgl_(i.deadline) <= batas;
  });

  if (!relevan.length) {
    kirim_('Tuton ' + k.sem.label + ' — aman minggu ini',
      '<p style="font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#1B2432">' +
      'Nggak ada yang jatuh tempo dalam 7 hari ke depan.</p>');
    return;
  }

  const lewat = relevan.filter(function (i) { return parseTgl_(i.deadline) < ini; });
  const minggu = relevan.filter(function (i) { return parseTgl_(i.deadline) >= ini; });

  let html = '<div style="font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#1B2432;max-width:560px">' +
    '<h2 style="font-size:19px;margin:0 0 4px">Tuton ' + k.sem.label + '</h2>' +
    '<p style="margin:0 0 20px;color:#5A6577">' + relevan.length +
    ' item belum kelar dalam 7 hari ke depan.</p>';
  if (lewat.length) {
    html += '<h3 style="font-size:14px;margin:20px 0 8px;color:#D64545">Lewat deadline</h3>' +
      daftarItem_(lewat, k.peta);
  }
  if (minggu.length) {
    html += '<h3 style="font-size:14px;margin:20px 0 8px;color:#2F5FE0">Minggu ini</h3>' +
      daftarItem_(minggu, k.peta);
  }
  html += '<p style="margin:24px 0 0;font-size:13px;color:#8A93A3">Tuton Tracker</p></div>';

  kirim_('Tuton ' + k.sem.label + ' — ' + relevan.length + ' item nunggu dikerjain', html);
}

function daftarItem_(items, peta) {
  const urut = items.slice().sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; });
  let h = '<table style="width:100%;border-collapse:collapse">';
  urut.forEach(function (it) {
    const mk = peta[it.matkul_id];
    const nama = it.label || (labelTipe_(it.tipe) + ' ' + it.sesi);
    h += '<tr><td style="padding:7px 0;border-bottom:1px solid #E4E8EE;font-size:14px">' +
      '<strong>' + nama + '</strong>' +
      (it.tipe === 'tuweb' && it.jam ? ' · ' + it.jam : '') +
      ' · ' + mk.nama + '</td>' +
      '<td style="padding:7px 0;border-bottom:1px solid #E4E8EE;font-size:13px;color:#5A6577;text-align:right;white-space:nowrap">' +
      tglPendek_(it.deadline) + '</td></tr>';
  });
  return h + '</table>';
}

function labelTipe_(t) {
  return { diskusi: 'Diskusi', tugas: 'Tugas', latihan: 'Latihan', tuweb: 'Tuweb', uas: 'UAS', hadir: 'Daftar hadir' }[t] || t;
}

function tglPendek_(s) {
  const d = parseTgl_(s);
  const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return d.getDate() + ' ' + b[d.getMonth()];
}

function tglLengkap_(s) {
  const d = parseTgl_(s);
  const h = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return h[d.getDay()] + ', ' + tglPendek_(s);
}

function kirim_(subjek, html) {
  const to = CONFIG.EMAIL_TUJUAN || Session.getActiveUser().getEmail();
  if (!to) return;
  MailApp.sendEmail({ to: to, subject: subjek, htmlBody: html });
}

function tesReminderHarian() {
  kirimReminderHarian();
  return 'Dikirim, kalau memang ada yang perlu diingatkan hari ini atau besok.';
}

function tesReminderMingguan() { kirimReminderMingguan(); return 'Dikirim.'; }

/* ==================================================================
 *  RESET & ISI ULANG DARI AWAL
 * ==================================================================
 *
 *  PENTING: deploy TIDAK menghapus data apa pun. Deploy cuma mengganti
 *  kode. Kalau mau mulai bersih, jalankan resetDanIsiUlang() dari editor.
 *
 *  Cara pakai:
 *  1. Periksa isi SEED di bawah. Betulkan tanggal dan isi kode matkul.
 *  2. Ubah IZINKAN_RESET jadi true.
 *  3. Pilih fungsi resetDanIsiUlang di editor, klik Run.
 *  4. Kembalikan IZINKAN_RESET ke false supaya nggak kejalan lagi.
 *
 *  Seluruh Semester, Matkul, Item, dan Jadwal dihapus, lalu dibuat ulang
 *  dari daftar di bawah. Event Google Calendar yang pernah dibuat ikut
 *  dihapus supaya tidak jadi event yatim.
 * ================================================================== */

const SEED = {
  IZINKAN_RESET: false,

  semester: {
    label: '2026.1',
    // Dihitung mundur dari Tuweb 3 pada 8 Nov 2026 yang jatuh di akhir sesi 8.
    // Betulkan kalau tanggal mulai Tuton di elearning ternyata berbeda.
    mulai_tuton: '2026-09-14',
    tgl_uas: '2026-11-23'
  },

  // Sesi yang langsung ditandai selesai setelah data dibuat.
  sesiSelesai: [1],

  // Kode matkul sengaja dikosongkan. Isi sendiri dari halaman Tuton kamu —
  // kode yang salah akan ikut terbawa ke prompt asisten dan daftar referensi.
  matkul: [
    {
      kode: '', nama: 'Bahasa Inggris', sks: 3, warna: '#2E6F9E', pola: 'standar',
      profil: 'Sebagian soal dan jawaban dalam bahasa Inggris. Kalau soalnya berbahasa Inggris, jawab dalam bahasa Inggris dan sertakan terjemahan ringkas di bawahnya. Fokus biasanya reading comprehension, tenses, dan kosakata kontekstual. Jelaskan alasan gramatikal tiap pilihan kata, jangan cuma kasih jawaban benar.'
    },
    {
      kode: '', nama: 'Pengantar Statistika', sks: 3, warna: '#0E8C7F', pola: 'standar',
      profil: 'Wajib tunjukkan langkah hitungan lengkap, bukan cuma hasil akhir. Tulis rumus yang dipakai, substitusi angkanya, baru hasil. Kalau ada tabel distribusi frekuensi atau perhitungan bertahap, tampilkan tabelnya. Sebutkan asumsi yang dipakai. Jangan bulatkan terlalu dini.'
    },
    {
      kode: '', nama: 'Bahasa Indonesia', sks: 3, warna: '#8A5A3C', pola: 'standar',
      profil: 'Penilaian ketat di kaidah kebahasaan, jadi jawaban harus jadi contoh yang baik dengan sendirinya. Patuhi PUEBI. Sering membahas kalimat efektif, ejaan, ragam bahasa, paragraf, dan penulisan karya ilmiah. Kalau soal minta mengoreksi kalimat, tampilkan kalimat asli, perbaikannya, dan alasannya satu per satu.'
    },
    {
      kode: '', nama: 'Pancasila', sks: 3, warna: '#3F4A5A', pola: 'standar',
      profil: 'Jawaban harus mengaitkan sila yang relevan dengan konteks kenegaraan Indonesia yang konkret. Sumber utama BMP, UUD 1945, dan TAP MPR. Kalau menyinggung peristiwa aktual, sebutkan sumber beritanya dan tetap netral. Hindari normatif kosong tanpa penjelasan mekanismenya.'
    },
    {
      kode: '', nama: 'Aljabar Linear Elementer', sks: 3, warna: '#5E8C2E', pola: 'standar',
      profil: 'Tunjukkan operasi matriks langkah demi langkah, termasuk operasi baris elementer di tiap tahap. Tulis notasi matriks dengan rapi. Sebutkan teorema atau sifat yang jadi dasar tiap langkah. Verifikasi hasil akhir dengan substitusi balik kalau memungkinkan.'
    },
    {
      kode: '', nama: 'Struktur Data', sks: 3, warna: '#6D4AC4', pola: 'berpraktik',
      profil: 'Mata kuliah berpraktik. Sertakan pseudocode atau kode yang benar-benar bisa dijalankan, bukan potongan setengah jadi. Analisis kompleksitas waktu dan ruang dalam notasi Big-O beserta alasannya. Ilustrasikan dengan contoh data kecil yang bisa ditelusuri manual.'
    },
    {
      kode: '', nama: 'Basis Data', sks: 3, warna: '#A43E86', pola: 'berpraktik',
      profil: 'Mata kuliah berpraktik. Kalau soal tentang perancangan, tampilkan ERD dalam bentuk tekstual yang jelas beserta kardinalitasnya. Kalau tentang normalisasi, tunjukkan bentuk normal tiap tahap dan anomali apa yang dihilangkan. Query SQL harus lengkap dan bisa dijalankan. Sebutkan asumsi struktur tabel kalau soalnya tidak menyebutkan.'
    }
  ]
};

/** Hapus seluruh data lalu buat ulang dari SEED. Tidak bisa dibatalkan. */
function resetDanIsiUlang() {
  if (!SEED.IZINKAN_RESET) {
    return 'Dibatalkan. Ubah SEED.IZINKAN_RESET jadi true dulu kalau memang mau menghapus semua data.';
  }

  setupAwal();
  migrasiSheet();

  const hasil = [];

  // 1. Bersihkan event Calendar milik item lama
  try {
    lepasKalenderBanyak_(baca_(SHEETS.ITEM).filter(function (i) { return i.kal_id; }));
  } catch (e) { hasil.push('event Calendar lama tidak bisa dihapus otomatis'); }

  // 2. Kosongkan seluruh sheet data, header tetap
  [SHEETS.ITEM, SHEETS.JADWAL, SHEETS.MATKUL, SHEETS.SEMESTER].forEach(function (def) {
    const sh = sheet_(def);
    const last = sh.getLastRow();
    if (last > 1) sh.deleteRows(2, last - 1);
  });
  hasil.push('data lama dihapus');

  // 3. Buat semester baru
  const semId = tambahSemester({
    label: SEED.semester.label,
    mulai_tuton: SEED.semester.mulai_tuton,
    tgl_uas: SEED.semester.tgl_uas
  });

  // 4. Buat mata kuliah beserta seluruh itemnya
  SEED.matkul.forEach(function (m) {
    tambahMatkul({
      semester_id: semId, kode: m.kode, nama: m.nama, sks: m.sks,
      warna: m.warna, link_tuton: m.link_tuton || '', pola: m.pola, profil: m.profil
    });
  });
  hasil.push(SEED.matkul.length + ' mata kuliah dibuat');

  // 5. Tandai sesi yang sudah selesai
  let ditandai = 0;
  (SEED.sesiSelesai || []).forEach(function (s) {
    ditandai += tandaiSesi(semId, s, 'submitted');
  });
  if (ditandai) hasil.push(ditandai + ' item ditandai selesai (sesi ' + SEED.sesiSelesai.join(', ') + ')');

  const total = baca_(SHEETS.ITEM).length;
  hasil.push(total + ' item total');

  return 'Selesai. ' + hasil.join(' · ') +
    '. Jangan lupa kembalikan IZINKAN_RESET ke false, lalu isi kode matkul lewat dashboard.';
}
