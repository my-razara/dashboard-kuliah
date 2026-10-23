/* ==================================================================
 *  Tuton Tracker — lapisan data
 *
 *  Halaman ini cuma tampilan. Datanya disimpan sebagai satu file
 *  data.json di repo GitHub PRIVATE milik pengguna, dibaca dan ditulis
 *  lewat GitHub API dengan token yang disimpan di browser perangkat itu.
 *
 *  Setiap perubahan dicatat sebagai "op" kecil (tambah, ubah, hapus).
 *  Op langsung diterapkan ke tampilan, lalu dikumpulkan dan dikirim
 *  sebagai satu commit setelah jeda singkat. Kalau file di GitHub ternyata
 *  sudah berubah dari perangkat lain, data terbaru diambil ulang dan op
 *  yang belum terkirim diterapkan ulang di atasnya, jadi perubahan dari
 *  dua perangkat tidak saling menimpa.
 * ================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------
   *  Konfigurasi
   * ------------------------------------------------------------- */

  var CONFIG = {
    TIMEZONE: 'Asia/Jakarta',
    JAM_TUWEB_DEFAULT: '19:00',
    DURASI_TUWEB_MENIT: 120,
    DURASI_UAS_MENIT: 90,
    // Komposisi nilai Tuton UT: Tugas 50%, Diskusi 30%, Daftar Hadir 20%.
    // Latihan / quiz tidak ikut dihitung.
    BOBOT_TUTON: { tugas: 0.5, diskusi: 0.3, hadir: 0.2 },
    BOBOT_AKHIR: { tuton: 0.3, uas: 0.7 },
    AMBANG: { A: 80, 'B+': 72.01, B: 65, 'C+': 57.01, C: 40 }
  };

  /**
   * Pola pelaksanaan mata kuliah.
   * diskusi / latihan / hadir / tuweb : nomor sesi
   * tugas : { sesi = sesi dibuka, tutup = sesi batas akhir }
   */
  var POLA = {
    standar: {
      nama: 'Tuton standar',
      perkenalan: 1,
      diskusi: [1, 2, 3, 4, 5, 6, 7, 8],
      latihan: [1, 2, 3, 4, 5, 6, 7, 8],
      hadir: [1, 2, 3, 4, 5, 6, 7, 8],
      tugas: [{ sesi: 3, tutup: 3 }, { sesi: 5, tutup: 5 }, { sesi: 7, tutup: 7 }],
      tuweb: []
    },
    berpraktik: {
      nama: 'MK berpraktik (ada Tuweb)',
      perkenalan: 1,
      diskusi: [2, 3, 5, 7],
      latihan: [1, 2, 3, 4, 5, 6, 7, 8],
      hadir: [1, 2, 3, 4, 5, 6, 7, 8],
      tugas: [{ sesi: 3, tutup: 4 }, { sesi: 5, tutup: 6 }, { sesi: 7, tutup: 8 }],
      tuweb: [4, 6, 8]
    }
  };

  /** Data awal kalau pengguna memilih mulai tanpa impor. */
  var SEED = {
    semester: { label: '2026.1', mulai_tuton: '2026-09-14', tgl_uas: '2026-11-23' },
    matkul: [
      { nama: 'Bahasa Inggris', warna: '#2E6F9E', pola: 'standar',
        profil: 'Sebagian soal dan jawaban dalam bahasa Inggris. Kalau soalnya berbahasa Inggris, jawab dalam bahasa Inggris dan sertakan terjemahan ringkas di bawahnya. Fokus biasanya reading comprehension, tenses, dan kosakata kontekstual. Jelaskan alasan gramatikal tiap pilihan kata, jangan cuma kasih jawaban benar.' },
      { nama: 'Pengantar Statistika', warna: '#0E8C7F', pola: 'standar',
        profil: 'Wajib tunjukkan langkah hitungan lengkap, bukan cuma hasil akhir. Tulis rumus yang dipakai, substitusi angkanya, baru hasil. Kalau ada tabel distribusi frekuensi atau perhitungan bertahap, tampilkan tabelnya. Sebutkan asumsi yang dipakai. Jangan bulatkan terlalu dini.' },
      { nama: 'Bahasa Indonesia', warna: '#8A5A3C', pola: 'standar',
        profil: 'Penilaian ketat di kaidah kebahasaan, jadi jawaban harus jadi contoh yang baik dengan sendirinya. Patuhi PUEBI. Sering membahas kalimat efektif, ejaan, ragam bahasa, paragraf, dan penulisan karya ilmiah. Kalau soal minta mengoreksi kalimat, tampilkan kalimat asli, perbaikannya, dan alasannya satu per satu.' },
      { nama: 'Pancasila', warna: '#3F4A5A', pola: 'standar',
        profil: 'Jawaban harus mengaitkan sila yang relevan dengan konteks kenegaraan Indonesia yang konkret. Sumber utama BMP, UUD 1945, dan TAP MPR. Kalau menyinggung peristiwa aktual, sebutkan sumber beritanya dan tetap netral. Hindari normatif kosong tanpa penjelasan mekanismenya.' },
      { nama: 'Aljabar Linear Elementer', warna: '#5E8C2E', pola: 'standar',
        profil: 'Tunjukkan operasi matriks langkah demi langkah, termasuk operasi baris elementer di tiap tahap. Tulis notasi matriks dengan rapi. Sebutkan teorema atau sifat yang jadi dasar tiap langkah. Verifikasi hasil akhir dengan substitusi balik kalau memungkinkan.' },
      { nama: 'Struktur Data', warna: '#6D4AC4', pola: 'berpraktik',
        profil: 'Mata kuliah berpraktik. Sertakan pseudocode atau kode yang benar-benar bisa dijalankan, bukan potongan setengah jadi. Analisis kompleksitas waktu dan ruang dalam notasi Big-O beserta alasannya. Ilustrasikan dengan contoh data kecil yang bisa ditelusuri manual.' },
      { nama: 'Basis Data', warna: '#A43E86', pola: 'berpraktik',
        profil: 'Mata kuliah berpraktik. Kalau soal tentang perancangan, tampilkan ERD dalam bentuk tekstual yang jelas beserta kardinalitasnya. Kalau tentang normalisasi, tunjukkan bentuk normal tiap tahap dan anomali apa yang dihilangkan. Query SQL harus lengkap dan bisa dijalankan. Sebutkan asumsi struktur tabel kalau soalnya tidak menyebutkan.' }
    ]
  };

  var TABEL = ['semester', 'matkul', 'item', 'jadwal'];
  var FILE_DATA = 'data.json';
  var FILE_PENGINGAT = [
    { dari: 'data-repo/reminder.yml', ke: '.github/workflows/reminder.yml' },
    { dari: 'data-repo/reminder.py', ke: '.github/scripts/reminder.py' },
    { dari: 'data-repo/README.md', ke: 'README.md', sekaliSaja: true }
  ];
  var KUNCI_KONEKSI = 'tuton.koneksi.v1';
  var KUNCI_CACHE = 'tuton.cache.v1';
  var JEDA_SIMPAN = 1200;

  /* ---------------------------------------------------------------
   *  Utilitas
   * ------------------------------------------------------------- */

  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function uid(p) {
    var r = '';
    if (global.crypto && crypto.getRandomValues) {
      var a = new Uint32Array(2); crypto.getRandomValues(a);
      r = a[0].toString(36) + a[1].toString(36).slice(0, 3);
    } else { r = Math.random().toString(36).slice(2, 10); }
    return p + '_' + r + Date.now().toString(36).slice(-3);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTgl(d) {
    if (typeof d === 'string') return d.slice(0, 10);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function parseTgl(s) {
    var p = String(s).slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function tambahHari(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function deadlineSesi(mulai, sesi) { return fmtTgl(tambahHari(mulai, sesi * 7 - 1)); }
  function cekTgl(s, nama) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) {
      throw new Error((nama || 'Tanggal') + ' harus berformat YYYY-MM-DD, misalnya 2027-03-01.');
    }
    var d = parseTgl(s);
    if (isNaN(d.getTime()) || fmtTgl(d) !== s) throw new Error((nama || 'Tanggal') + ' tidak valid.');
    return s;
  }

  /** Tanggal hari ini menurut jam Jakarta, terlepas dari zona waktu perangkat. */
  function hariIni() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: CONFIG.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (e) { return fmtTgl(new Date()); }
  }

  function find(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function dataKosong() { return { versi: 1, semester: [], matkul: [], item: [], jadwal: [] }; }

  /** Satu record per baris, supaya riwayat commit di GitHub enak dibaca. */
  function serialisasi(db) {
    var bagian = ['{', ' "versi": 1,', ' "diperbarui": ' + JSON.stringify(new Date().toISOString()) + ','];
    TABEL.forEach(function (t, i) {
      var arr = db[t] || [];
      var baris = arr.map(function (r) { return '  ' + JSON.stringify(r); });
      bagian.push(' ' + JSON.stringify(t) + ': [' + (baris.length ? '\n' + baris.join(',\n') + '\n ' : '') + ']' +
        (i < TABEL.length - 1 ? ',' : ''));
    });
    bagian.push('}');
    return bagian.join('\n') + '\n';
  }

  function bersihkan(db) {
    var out = dataKosong();
    TABEL.forEach(function (t) { out[t] = Array.isArray(db && db[t]) ? db[t] : []; });
    return out;
  }

  /* ---------------------------------------------------------------
   *  Op: unit perubahan yang bisa diterapkan ulang
   * ------------------------------------------------------------- */

  function opIns(t, rows) { return { op: 'ins', t: t, rows: clone(rows) }; }
  function opUpd(t, id, set) { return { op: 'upd', t: t, id: id, set: clone(set) }; }
  function opDel(t, ids) { return { op: 'del', t: t, ids: ids.slice() }; }
  function opDelWhere(t, f, v) { return { op: 'delWhere', t: t, f: f, v: v }; }
  function opGanti(db) { return { op: 'ganti', db: clone(bersihkan(db)) }; }

  function terapkan(db, o) {
    if (o.op === 'ganti') {
      TABEL.forEach(function (t) { db[t] = clone(o.db[t] || []); });
      return;
    }
    if (!db[o.t]) db[o.t] = [];
    var arr = db[o.t];
    if (o.op === 'ins') {
      o.rows.forEach(function (r) {
        var c = clone(r), ada = false;
        for (var i = 0; i < arr.length; i++) if (arr[i].id === c.id) { arr[i] = c; ada = true; break; }
        if (!ada) arr.push(c);
      });
    } else if (o.op === 'upd') {
      var r = find(arr, o.id);
      if (r) { var s = clone(o.set); for (var k in s) r[k] = s[k]; }
    } else if (o.op === 'del') {
      db[o.t] = arr.filter(function (r) { return o.ids.indexOf(r.id) < 0; });
    } else if (o.op === 'delWhere') {
      db[o.t] = arr.filter(function (r) { return r[o.f] !== o.v; });
    }
  }

  function bangun(base, ops) {
    var v = clone(bersihkan(base));
    (ops || []).forEach(function (o) { terapkan(v, o); });
    return v;
  }

  /* ---------------------------------------------------------------
   *  Generator item (port dari Code.gs)
   * ------------------------------------------------------------- */

  function itemBaru(mkId, sesi, tipe, label, deadline) {
    return {
      id: uid('it'), matkul_id: mkId, sesi: sesi, tipe: tipe, status: 'belum',
      deadline: deadline || '', nilai: '', link: '', catatan: '', label: label, jam: ''
    };
  }

  function generateItem(mkId, polaKey, mulai, tglUas) {
    var p = POLA[polaKey] || POLA.standar, out = [];
    if (p.perkenalan) out.push(itemBaru(mkId, p.perkenalan, 'diskusi', 'Perkenalan', deadlineSesi(mulai, p.perkenalan)));
    (p.diskusi || []).forEach(function (s, i) { out.push(itemBaru(mkId, s, 'diskusi', 'Diskusi ' + (i + 1), deadlineSesi(mulai, s))); });
    (p.latihan || []).forEach(function (s) { out.push(itemBaru(mkId, s, 'latihan', 'Latihan ' + s, deadlineSesi(mulai, s))); });
    (p.hadir || []).forEach(function (s) { out.push(itemBaru(mkId, s, 'hadir', 'Daftar hadir', deadlineSesi(mulai, s))); });
    (p.tugas || []).forEach(function (t, i) { out.push(itemBaru(mkId, t.sesi, 'tugas', 'Tugas ' + (i + 1), deadlineSesi(mulai, t.tutup))); });
    (p.tuweb || []).forEach(function (s, i) {
      var it = itemBaru(mkId, s, 'tuweb', 'Tuweb ' + (i + 1), deadlineSesi(mulai, s));
      it.jam = CONFIG.JAM_TUWEB_DEFAULT;
      out.push(it);
    });
    // UAS di sesi 9: di luar matriks 1–8, tapi tetap ikut kalender dan pengingat.
    out.push(itemBaru(mkId, 9, 'uas', 'UAS', tglUas || ''));
    return out;
  }

  function petaDeadline(polaKey, mulai) {
    var p = POLA[polaKey] || POLA.standar, m = {};
    if (p.perkenalan) m['diskusi|' + p.perkenalan] = deadlineSesi(mulai, p.perkenalan);
    (p.diskusi || []).forEach(function (s) { m['diskusi|' + s] = deadlineSesi(mulai, s); });
    (p.latihan || []).forEach(function (s) { m['latihan|' + s] = deadlineSesi(mulai, s); });
    (p.hadir || []).forEach(function (s) { m['hadir|' + s] = deadlineSesi(mulai, s); });
    (p.tugas || []).forEach(function (t) { m['tugas|' + t.sesi] = deadlineSesi(mulai, t.tutup); });
    return m;
  }

  function kunciItem(it) { return it.tipe + '|' + it.sesi + '|' + (it.label || ''); }

  function itemKurang(db, mk, sem) {
    var ada = {};
    db.item.forEach(function (i) { if (i.matkul_id === mk.id) ada[kunciItem(i)] = 1; });
    return generateItem(mk.id, mk.pola, parseTgl(sem.mulai_tuton), sem.tgl_uas)
      .filter(function (it) { return !ada[kunciItem(it)]; });
  }

  /* ---------------------------------------------------------------
   *  Status penyimpanan
   * ------------------------------------------------------------- */

  var S = {
    koneksi: null,     // { repo: 'owner/nama', token: '...' }
    base: null,        // isi data.json terakhir yang diketahui ada di GitHub
    sha: null,
    pending: [],       // op yang belum terkirim
    view: null,        // base + pending, yang ditampilkan
    status: 'diam',    // diam | menyimpan | tersimpan | offline | galat | akses
    pesan: '',
    terakhirSinkron: 0,
    sedangSimpan: false,
    timer: null,
    coba: 0,
    pendengar: { data: [], status: [] }
  };

  function emit(jenis) { S.pendengar[jenis].forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function setStatus(st, pesan) { S.status = st; S.pesan = pesan || ''; emit('status'); }

  function simpanCache() {
    try {
      if (!S.koneksi) return;
      localStorage.setItem(KUNCI_CACHE, JSON.stringify({
        repo: S.koneksi.repo, base: S.base, sha: S.sha, pending: S.pending, waktu: S.terakhirSinkron
      }));
    } catch (e) { /* penyimpanan browser penuh atau diblokir */ }
  }

  function muatCache() {
    try {
      var c = JSON.parse(localStorage.getItem(KUNCI_CACHE) || 'null');
      if (!c || !S.koneksi || c.repo !== S.koneksi.repo) return;
      S.base = c.base; S.sha = c.sha; S.pending = c.pending || []; S.terakhirSinkron = c.waktu || 0;
      if (S.base) S.view = bangun(S.base, S.pending);
    } catch (e) { /* cache rusak, abaikan */ }
  }

  /* ---------------------------------------------------------------
   *  GitHub API
   * ------------------------------------------------------------- */

  function encodePath(p) { return p.split('/').map(encodeURIComponent).join('/'); }

  function b64enc(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64dec(b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function gh(method, path, body, koneksi) {
    var k = koneksi || S.koneksi;
    var headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + k.token,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + path, {
      method: method, headers: headers, cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.message) || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }, function () {
      var err = new Error('Tidak bisa menghubungi GitHub. Periksa koneksi internet.');
      err.offline = true;
      throw err;
    });
  }

  function bacaFile(path, koneksi) {
    var k = koneksi || S.koneksi;
    return gh('GET', '/repos/' + k.repo + '/contents/' + encodePath(path), null, k).then(function (d) {
      if (!d || Array.isArray(d)) throw new Error(path + ' bukan file.');
      if (d.encoding !== 'base64' || !d.content) throw new Error(path + ' terlalu besar untuk dibaca lewat API.');
      return { teks: b64dec(d.content), sha: d.sha };
    }, function (e) {
      if (e.status === 404) return null;
      throw e;
    });
  }

  function tulisFile(path, teks, sha, pesan, koneksi) {
    var k = koneksi || S.koneksi;
    var body = { message: pesan, content: b64enc(teks) };
    if (sha) body.sha = sha;
    return gh('PUT', '/repos/' + k.repo + '/contents/' + encodePath(path), body, k)
      .then(function (d) { return d && d.content ? d.content.sha : null; });
  }

  function jelaskanGalat(e) {
    if (e.offline) return 'Offline — perubahan disimpan di perangkat ini dan dikirim begitu online.';
    if (e.status === 401) return 'Token ditolak GitHub. Mungkin sudah kedaluwarsa atau dicabut.';
    if (e.status === 403) return 'Token tidak punya izin yang dibutuhkan. ' + e.message;
    if (e.status === 404) return 'Repo tidak ditemukan, atau token tidak diberi akses ke repo itu.';
    return e.message || String(e);
  }

  /* ---------------------------------------------------------------
   *  Sinkronisasi
   * ------------------------------------------------------------- */

  function tarik() {
    if (!S.koneksi) return Promise.reject(new Error('Belum tersambung.'));
    return bacaFile(FILE_DATA).then(function (f) {
      S.terakhirSinkron = Date.now();
      if (!f) {
        // Repo tersambung tapi data belum dibuat.
        S.base = null; S.sha = null; S.view = null;
        simpanCache();
        setStatus('kosong');
        return 'kosong';
      }
      var berubah = f.sha !== S.sha;
      S.base = bersihkan(JSON.parse(f.teks));
      S.sha = f.sha;
      if (berubah || !S.view) { S.view = bangun(S.base, S.pending); emit('data'); }
      simpanCache();
      if (S.pending.length) jadwalkanSimpan(); else setStatus('tersimpan');
      return berubah ? 'berubah' : 'sama';
    }).catch(function (e) {
      setStatus(e.offline ? 'offline' : (e.status === 401 || e.status === 403 || e.status === 404 ? 'akses' : 'galat'), jelaskanGalat(e));
      throw e;
    });
  }

  function jadwalkanSimpan(jeda) {
    clearTimeout(S.timer);
    S.timer = setTimeout(kirim, jeda == null ? JEDA_SIMPAN : jeda);
  }

  function kirim() {
    if (S.sedangSimpan || !S.pending.length || !S.koneksi || !S.base) return Promise.resolve();
    S.sedangSimpan = true;
    setStatus('menyimpan');
    var jumlah = S.pending.length;
    var berikut = bangun(S.base, S.pending.slice(0, jumlah));
    var teks = serialisasi(berikut);
    return tulisFile(FILE_DATA, teks, S.sha, pesanCommit(S.pending.slice(0, jumlah))).then(function (shaBaru) {
      S.base = bersihkan(JSON.parse(teks));
      S.sha = shaBaru;
      S.pending = S.pending.slice(jumlah);
      S.terakhirSinkron = Date.now();
      S.sedangSimpan = false; S.coba = 0;
      simpanCache();
      if (S.pending.length) jadwalkanSimpan(300); else setStatus('tersimpan');
    }, function (e) {
      S.sedangSimpan = false;
      // 409 / 422: file di GitHub sudah berubah (perangkat lain). Ambil ulang, terapkan ulang.
      if ((e.status === 409 || e.status === 422 || (e.status === 400 && /sha/i.test(e.message))) && S.coba < 4) {
        S.coba++;
        return tarik().then(function () { return kirim(); }, function () { jadwalkanSimpan(5000); });
      }
      if (e.offline) {
        setStatus('offline', jelaskanGalat(e));
        S.coba++;
        jadwalkanSimpan(Math.min(60000, 5000 * S.coba));
        return;
      }
      setStatus(e.status === 401 || e.status === 403 || e.status === 404 ? 'akses' : 'galat', jelaskanGalat(e));
    });
  }

  function pesanCommit(ops) {
    var n = ops.length;
    var jenis = {};
    ops.forEach(function (o) { jenis[o.op === 'ganti' ? 'ganti semua data' : o.t] = 1; });
    return 'Perbarui ' + Object.keys(jenis).join(', ') + ' (' + n + ' perubahan)';
  }

  function ubah(ops) {
    if (!S.view) throw new Error('Data belum dimuat.');
    ops.forEach(function (o) { S.pending.push(o); terapkan(S.view, o); });
    simpanCache();
    setStatus('menunggu');
    jadwalkanSimpan();
  }

  function V() {
    if (!S.view) throw new Error('Data belum dimuat.');
    return S.view;
  }

  /* ---------------------------------------------------------------
   *  API yang dipakai tampilan (pengganti fungsi Apps Script)
   * ------------------------------------------------------------- */

  var API = {
    tambahSemester: function (data) {
      cekTgl(data.mulai_tuton, 'Tanggal mulai Tuton');
      if (data.tgl_uas) cekTgl(data.tgl_uas, 'Tanggal UAS');
      var ops = [];
      V().semester.forEach(function (s) { if (s.status === 'aktif') ops.push(opUpd('semester', s.id, { status: 'arsip' })); });
      var id = uid('sem');
      ops.push(opIns('semester', [{
        id: id, label: String(data.label || '').trim() || 'Semester baru',
        mulai_tuton: data.mulai_tuton, tgl_uas: data.tgl_uas || '', status: 'aktif'
      }]));
      ubah(ops);
      return id;
    },

    aktifkanSemester: function (id) {
      ubah(V().semester.map(function (s) { return opUpd('semester', s.id, { status: s.id === id ? 'aktif' : 'arsip' }); }));
      return true;
    },

    ubahSemester: function (id, patch) {
      var lama = clone(find(V().semester, id));
      if (!lama) throw new Error('Semester tidak ditemukan.');
      if (patch.mulai_tuton) cekTgl(patch.mulai_tuton, 'Tanggal mulai Tuton');
      if (patch.tgl_uas) cekTgl(patch.tgl_uas, 'Tanggal UAS');
      var ops = [opUpd('semester', id, patch)];

      // Deadline hanya digeser kalau tanggal mulai memang berubah,
      // supaya deadline yang diatur manual tidak tertimpa saat ganti nama semester.
      if (patch.mulai_tuton && patch.mulai_tuton !== lama.mulai_tuton) {
        var mulai = parseTgl(patch.mulai_tuton);
        V().matkul.filter(function (m) { return m.semester_id === id; }).forEach(function (m) {
          var peta = petaDeadline(m.pola, mulai);
          V().item.forEach(function (it) {
            if (it.matkul_id !== m.id || it.tipe === 'tuweb' || it.tipe === 'uas') return;
            var baru = peta[it.tipe + '|' + Number(it.sesi)];
            if (baru && baru !== it.deadline) ops.push(opUpd('item', it.id, { deadline: baru }));
          });
        });
      }

      // UAS: hanya yang masih ikut tanggal semester lama (atau kosong) yang digeser.
      if (patch.tgl_uas && patch.tgl_uas !== lama.tgl_uas) {
        var mkIds = V().matkul.filter(function (m) { return m.semester_id === id; }).map(function (m) { return m.id; });
        V().item.forEach(function (it) {
          if (it.tipe !== 'uas' || mkIds.indexOf(it.matkul_id) < 0) return;
          if (!it.deadline || it.deadline === lama.tgl_uas) ops.push(opUpd('item', it.id, { deadline: patch.tgl_uas }));
        });
      }
      ubah(ops);
      return true;
    },

    tambahMatkul: function (data) {
      var sem = find(V().semester, data.semester_id);
      if (!sem) throw new Error('Semester tidak ditemukan.');
      var pola = POLA[data.pola] ? data.pola : 'standar';
      var id = uid('mk');
      var mk = {
        id: id, semester_id: sem.id, kode: data.kode || '', nama: data.nama,
        sks: Number(data.sks) || 3, warna: data.warna || '#2F5FE0', link_tuton: data.link_tuton || '',
        nilai_uas: '', pola: pola, profil: data.profil || ''
      };
      ubah([opIns('matkul', [mk]), opIns('item', generateItem(id, pola, parseTgl(sem.mulai_tuton), sem.tgl_uas))]);
      return id;
    },

    ubahMatkul: function (id, patch) { ubah([opUpd('matkul', id, patch)]); return true; },

    gantiPola: function (mkId, polaBaru) {
      var mk = find(V().matkul, mkId);
      if (!mk) throw new Error('Mata kuliah tidak ditemukan.');
      var sem = find(V().semester, mk.semester_id);
      ubah([
        opDelWhere('item', 'matkul_id', mkId),
        opUpd('matkul', mkId, { pola: polaBaru }),
        opIns('item', generateItem(mkId, polaBaru, parseTgl(sem.mulai_tuton), sem.tgl_uas))
      ]);
      return true;
    },

    hapusMatkul: function (id) {
      ubah([opDelWhere('item', 'matkul_id', id), opDelWhere('jadwal', 'matkul_id', id), opDel('matkul', [id])]);
      return true;
    },

    duplikatSemester: function (dariId, label, mulai, uas) {
      var asal = V().matkul.filter(function (m) { return m.semester_id === dariId; }).map(clone);
      var baruId = API.tambahSemester({ label: label, mulai_tuton: mulai, tgl_uas: uas });
      asal.forEach(function (m) {
        API.tambahMatkul({
          semester_id: baruId, kode: m.kode, nama: m.nama, sks: m.sks,
          warna: m.warna, link_tuton: m.link_tuton, pola: m.pola, profil: m.profil
        });
      });
      return baruId;
    },

    lengkapiItem: function (semId) {
      var sem = find(V().semester, semId);
      if (!sem) throw new Error('Semester tidak ditemukan.');
      var baru = [];
      V().matkul.filter(function (m) { return m.semester_id === semId; }).forEach(function (m) {
        baru = baru.concat(itemKurang(V(), m, sem));
      });
      if (baru.length) ubah([opIns('item', baru)]);
      return baru.length;
    },

    ubahItem: function (id, patch) { ubah([opUpd('item', id, patch)]); return true; },

    tandaiSesi: function (semId, sesi, status) {
      var mkIds = V().matkul.filter(function (m) { return m.semester_id === semId; }).map(function (m) { return m.id; });
      var ops = [];
      V().item.forEach(function (it) {
        if (mkIds.indexOf(it.matkul_id) < 0 || Number(it.sesi) !== Number(sesi)) return;
        if (it.tipe === 'uas' || it.status === 'nihil' || it.status === status) return;
        ops.push(opUpd('item', it.id, { status: status }));
      });
      if (ops.length) ubah(ops);
      return ops.length;
    },

    tambahJadwal: function (data) {
      var id = uid('jd');
      ubah([opIns('jadwal', [{
        id: id, matkul_id: data.matkul_id, hari: data.hari, jam_mulai: data.jam_mulai,
        jam_selesai: data.jam_selesai, tipe: data.tipe || 'belajar', keterangan: data.keterangan || ''
      }])]);
      return id;
    },

    hapusJadwal: function (id) { ubah([opDel('jadwal', [id])]); return true; }
  };

  /** Pengganti google.script.run: call('namaFungsi', ...args) -> Promise */
  function call(nama) {
    var args = [].slice.call(arguments, 1);
    return new Promise(function (ok, gagal) {
      if (!API[nama]) return gagal(new Error('Fungsi tidak dikenal: ' + nama));
      try { ok(API[nama].apply(null, args)); } catch (e) { gagal(e); }
    });
  }

  /* ---------------------------------------------------------------
   *  Data awal & impor
   * ------------------------------------------------------------- */

  /**
   * Bangun data dari SEED. Item yang batas akhirnya jatuh sampai akhir
   * sesi `sampaiSesi` ditandai selesai — berdasarkan batas akhir, bukan sesi
   * dibukanya, supaya tugas berpraktik yang tutup sesi berikutnya tidak ikut.
   */
  function dataAwal(sampaiSesi) {
    var db = dataKosong();
    var s = SEED.semester, semId = uid('sem');
    var batas = sampaiSesi ? deadlineSesi(parseTgl(s.mulai_tuton), sampaiSesi) : '';
    db.semester.push({ id: semId, label: s.label, mulai_tuton: s.mulai_tuton, tgl_uas: s.tgl_uas, status: 'aktif' });
    SEED.matkul.forEach(function (m) {
      var id = uid('mk');
      db.matkul.push({
        id: id, semester_id: semId, kode: '', nama: m.nama, sks: 3, warna: m.warna,
        link_tuton: '', nilai_uas: '', pola: m.pola, profil: m.profil
      });
      generateItem(id, m.pola, parseTgl(s.mulai_tuton), s.tgl_uas).forEach(function (it) {
        if (batas && it.tipe !== 'uas' && it.deadline && it.deadline <= batas) it.status = 'submitted';
        db.item.push(it);
      });
    });
    return db;
  }

  /** Rapikan data hasil impor (format lama Apps Script maupun cadangan JSON). */
  function rapikanImpor(mentah) {
    var db = bersihkan(mentah);
    TABEL.forEach(function (t) {
      db[t] = db[t].filter(function (r) { return r && r.id !== '' && r.id != null; }).map(function (r) {
        var c = {};
        for (var k in r) if (k !== 'kal_id' && k.indexOf('__') !== 0) c[k] = r[k] == null ? '' : r[k];
        c.id = String(c.id);
        return c;
      });
    });
    db.matkul.forEach(function (m) { if (!POLA[m.pola]) m.pola = 'standar'; m.sks = Number(m.sks) || 3; });
    db.item.forEach(function (i) {
      i.sesi = Number(i.sesi) || 0;
      if (i.tipe === 'kuis') { i.tipe = 'latihan'; i.label = 'Latihan ' + i.sesi; }
      if (!i.status) i.status = 'belum';
    });
    db.jadwal.forEach(function (j) { j.hari = Number(j.hari) || 0; });

    // Tepat satu semester aktif
    var aktif = db.semester.filter(function (s) { return s.status === 'aktif'; });
    if (!aktif.length && db.semester.length) db.semester[db.semester.length - 1].status = 'aktif';
    if (aktif.length > 1) aktif.slice(1).forEach(function (s) { s.status = 'arsip'; });

    // Lengkapi item yang belum ada di versi lama (daftar hadir, UAS, perkenalan, latihan)
    var tambahan = 0;
    db.matkul.forEach(function (m) {
      var sem = find(db.semester, m.semester_id);
      if (!sem || !sem.mulai_tuton) return;
      var kurang = itemKurang(db, m, sem);
      tambahan += kurang.length;
      db.item = db.item.concat(kurang);
    });
    return { db: db, tambahan: tambahan };
  }

  function muatSkrip(src) {
    return new Promise(function (ok, gagal) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok;
      s.onerror = function () { gagal(new Error('Gagal memuat pembaca file Excel. Periksa koneksi internet.')); };
      document.head.appendChild(s);
    });
  }

  var FIELD_TGL = { mulai_tuton: 1, tgl_uas: 1, deadline: 1 };
  var FIELD_JAM = { jam: 1, jam_mulai: 1, jam_selesai: 1 };

  function serialKeTgl(n) {
    var d = new Date(Math.round((n - 25569) * 86400000));
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function serialKeJam(n) {
    var menit = Math.round((n - Math.floor(n)) * 1440) % 1440;
    return pad2(Math.floor(menit / 60)) + ':' + pad2(menit % 60);
  }

  /** Baca file .xlsx hasil "Download → Microsoft Excel" dari Google Sheets lama. */
  function bacaXlsx(file) {
    var siap = global.XLSX ? Promise.resolve() :
      muatSkrip('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    return siap.then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = global.XLSX.read(buf, { type: 'array' });
      var nama = { semester: 'Semester', matkul: 'Matkul', item: 'Item', jadwal: 'Jadwal' };
      var out = {};
      TABEL.forEach(function (t) {
        var ws = wb.Sheets[nama[t]];
        if (!ws) { out[t] = []; return; }
        out[t] = global.XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }).map(function (r) {
          var c = {};
          Object.keys(r).forEach(function (k) {
            var key = String(k).trim(), v = r[k];
            if (FIELD_TGL[key]) v = typeof v === 'number' ? serialKeTgl(v) : String(v || '').trim().slice(0, 10);
            else if (FIELD_JAM[key]) v = typeof v === 'number' ? serialKeJam(v) : String(v || '').trim().slice(0, 5);
            c[key] = v;
          });
          return c;
        });
      });
      if (!out.semester.length && !out.matkul.length) {
        throw new Error('File ini tidak berisi sheet Semester dan Matkul. Pastikan yang diunduh spreadsheet Tuton Tracker.');
      }
      return out;
    });
  }

  function bacaJson(file) {
    return file.text().then(function (t) {
      var d = JSON.parse(t);
      if (!d || !Array.isArray(d.semester) || !Array.isArray(d.item)) throw new Error('Ini bukan file cadangan Tuton Tracker.');
      return d;
    });
  }

  function bacaFileImpor(file) {
    return /\.json$/i.test(file.name) ? bacaJson(file) : bacaXlsx(file);
  }

  /* ---------------------------------------------------------------
   *  Koneksi, pembuatan data, dan pemasangan pengingat
   * ------------------------------------------------------------- */

  function normalRepo(s) {
    s = String(s || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
    var m = s.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
    if (m) return m[1] + '/' + m[2];
    if (/^[\w.-]+\/[\w.-]+$/.test(s)) return s;
    return null;
  }

  /** Coba sambungkan. Mengembalikan info repo; menolak kalau repo publik. */
  function sambungkan(repoInput, token) {
    var repo = normalRepo(repoInput);
    if (!repo) return Promise.reject(new Error('Tulis repo dengan format pemilik/nama, misalnya my-razara/dashboard-kuliah-data.'));
    token = String(token || '').trim();
    if (!token) return Promise.reject(new Error('Token belum diisi.'));
    var k = { repo: repo, token: token };
    return gh('GET', '/repos/' + repo, null, k).then(function (info) {
      if (!info.private) {
        var e = new Error('Repo ' + repo + ' masih publik. Data kuliah lu bakal bisa dibaca siapa saja. Ubah jadi private di Settings repo, atau pakai repo lain.');
        e.publik = true;
        throw e;
      }
      if (info.permissions && info.permissions.push === false) {
        throw new Error('Token cuma bisa membaca repo ini. Beri izin Contents: Read and write.');
      }
      S.koneksi = k;
      S.base = null; S.sha = null; S.pending = []; S.view = null;
      try { localStorage.setItem(KUNCI_KONEKSI, JSON.stringify(k)); } catch (e) { /* abaikan */ }
      muatCache();
      return { repo: repo, defaultBranch: info.default_branch };
    }, function (e) { throw new Error(jelaskanGalat(e)); });
  }

  function putuskan() {
    clearTimeout(S.timer);
    try { localStorage.removeItem(KUNCI_KONEKSI); localStorage.removeItem(KUNCI_CACHE); } catch (e) { /* abaikan */ }
    S.koneksi = null; S.base = null; S.sha = null; S.pending = []; S.view = null;
  }

  /** Tulis data.json pertama kali (atau timpa seluruhnya). */
  function buatData(db, pesan) {
    var teks = serialisasi(bersihkan(db));
    return bacaFile(FILE_DATA).then(function (ada) {
      return tulisFile(FILE_DATA, teks, ada ? ada.sha : null, pesan || 'Buat data awal Tuton Tracker');
    }).then(function (sha) {
      S.base = bersihkan(JSON.parse(teks)); S.sha = sha; S.pending = [];
      S.view = bangun(S.base, []);
      S.terakhirSinkron = Date.now();
      simpanCache();
      setStatus('tersimpan');
      emit('data');
    });
  }

  /** Ganti seluruh data lewat antrean biasa (dipakai saat sudah ada data). */
  function gantiSemua(db) { ubah([opGanti(db)]); }

  /** Salin workflow dan skrip pengingat dari halaman ini ke repo data. */
  function pasangPengingat() {
    var hasil = [];
    var urut = FILE_PENGINGAT.reduce(function (p, f) {
      return p.then(function () {
        return fetch(f.dari, { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('Tidak menemukan ' + f.dari + ' di situs dashboard.');
          return r.text();
        }).then(function (isi) {
          return bacaFile(f.ke).then(function (ada) {
            if (ada && f.sekaliSaja) { hasil.push({ file: f.ke, ok: true, ket: 'sudah ada' }); return; }
            if (ada && ada.teks === isi) { hasil.push({ file: f.ke, ok: true, ket: 'sudah terbaru' }); return; }
            return tulisFile(f.ke, isi, ada ? ada.sha : null, (ada ? 'Perbarui ' : 'Pasang ') + f.ke)
              .then(function () { hasil.push({ file: f.ke, ok: true, ket: ada ? 'diperbarui' : 'dipasang' }); });
          });
        }).catch(function (e) {
          var ket = jelaskanGalat(e);
          if (/workflows\//.test(f.ke) && (e.status === 403 || e.status === 404 || e.status === 422)) {
            ket = 'Token belum punya izin Workflows: Read and write. Tambahkan di pengaturan token, lalu coba lagi.';
          }
          hasil.push({ file: f.ke, ok: false, ket: ket });
        });
      });
    }, Promise.resolve());
    return urut.then(function () { return hasil; });
  }

  function cekPengingat() {
    return bacaFile('.github/workflows/reminder.yml').then(function (f) { return !!f; }, function () { return null; });
  }

  function eksporJson() {
    if (!S.view) throw new Error('Belum ada data.');
    return serialisasi(S.view);
  }

  /* ---------------------------------------------------------------
   *  Inisialisasi
   * ------------------------------------------------------------- */

  function init() {
    try { S.koneksi = JSON.parse(localStorage.getItem(KUNCI_KONEKSI) || 'null'); } catch (e) { S.koneksi = null; }
    if (S.koneksi) muatCache();

    global.addEventListener('online', function () { if (S.pending.length) jadwalkanSimpan(200); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !S.koneksi) return;
      if (S.pending.length) { jadwalkanSimpan(200); return; }
      // Ambil perubahan dari perangkat lain kalau sudah lebih dari 20 detik.
      if (Date.now() - S.terakhirSinkron > 20000) tarik().catch(function () { /* status sudah diset */ });
    });
    global.addEventListener('beforeunload', function (e) {
      if (S.pending.length) {
        kirim();
        e.preventDefault(); e.returnValue = '';
      }
    });
  }

  global.Store = {
    CONFIG: CONFIG,
    POLA: POLA,
    init: init,
    tersambung: function () { return !!S.koneksi; },
    repo: function () { return S.koneksi ? S.koneksi.repo : ''; },
    get view() { return S.view; },
    status: function () {
      return { status: S.status, pesan: S.pesan, pending: S.pending.length, terakhir: S.terakhirSinkron };
    },
    on: function (jenis, fn) { S.pendengar[jenis].push(fn); },
    tarik: tarik,
    kirimSekarang: function () { clearTimeout(S.timer); return kirim(); },
    sambungkan: sambungkan,
    putuskan: putuskan,
    buatData: buatData,
    gantiSemua: gantiSemua,
    dataAwal: dataAwal,
    rapikanImpor: rapikanImpor,
    bacaFileImpor: bacaFileImpor,
    pasangPengingat: pasangPengingat,
    cekPengingat: cekPengingat,
    eksporJson: eksporJson,
    hariIni: hariIni,
    uiConfig: function () {
      var nama = {};
      Object.keys(POLA).forEach(function (k) { nama[k] = POLA[k].nama; });
      return { bobotTuton: CONFIG.BOBOT_TUTON, bobotAkhir: CONFIG.BOBOT_AKHIR, ambang: CONFIG.AMBANG, pola: nama };
    },
    // Untuk pengujian
    _internal: { terapkan: terapkan, bangun: bangun, serialisasi: serialisasi, generateItem: generateItem, rapikanImpor: rapikanImpor, S: S, API: API }
  };
  global.call = call;
})(window);
