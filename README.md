# Tuton Tracker

Dashboard pelacak kuliah Universitas Terbuka: diskusi, latihan, tugas, daftar hadir, Tuweb, dan UAS per sesi, plus perkiraan nilai dan prompt asisten per mata kuliah.

**Buka:** https://my-razara.github.io/dashboard-kuliah/

## Cara kerjanya

Repo ini cuma berisi tampilan, di-host GitHub Pages. Datanya tetap di Google Sheets, dan Apps Script yang mengerjakan semua yang butuh akses Google:

```
my-razara.github.io/dashboard-kuliah      Apps Script (Web App)         Google
  index.html, assets/   ── fetch + kunci ──▶  doPost → fungsi Code.gs ──▶  Sheets
                                                                         Calendar
                                             trigger harian ───────────▶ Gmail
```

- **Data** tetap di spreadsheet dan masih bisa diedit langsung dari Sheets.
- **Google Calendar** sinkron dua arah: tambah, perbarui, dan hapus event langsung dari dashboard.
- **Pengingat email** tetap dikirim trigger Apps Script.
- **Kunci API** wajib di setiap permintaan. Web App di-deploy dengan akses "Anyone" supaya bisa dipanggil dari github.io, tapi tanpa kunci yang benar semua permintaan ditolak.

## Setup

Di editor Apps Script yang terikat ke spreadsheet:

1. Tempel isi [`apps-script/Code.gs`](apps-script/Code.gs) menimpa Code.gs lama, simpan.
2. Jalankan `buatKunciApi`, salin kunci dari log.
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Salin Web app URL (berakhiran `/exec`).
5. Buka dashboard, tempel URL dan kunci.

Alamat dan kunci disimpan di browser perangkat itu saja. Tiap perangkat perlu memasukkannya sekali.

### Kalau Code.gs diubah

**Deploy → Manage deployments → ikon pensil → Version: New version → Deploy.** URL tetap sama, dashboard nggak perlu diatur ulang.

### Kalau HP hilang

Jalankan `buatKunciApi` lagi. Kunci lama langsung nggak berlaku di semua perangkat; masukkan kunci baru di perangkat yang masih dipakai. `lihatKunciApi` menampilkan kunci yang sedang berlaku.

## Fungsi yang bisa dipanggil dashboard

Hanya fungsi di daftar `API_DIIZINKAN` dalam Code.gs: baca data, ubah semester/matkul/item/jadwal, tandai sesi, lengkapi item, dan sinkron Calendar. Reset data, migrasi, pembuatan kunci, dan pemasangan trigger tetap hanya bisa dijalankan dari editor.

## Struktur file

| File | Isi |
|---|---|
| `index.html` | Kerangka halaman |
| `assets/style.css` | Tampilan |
| `assets/app.js` | Semua logika tampilan + pemanggilan API |
| `apps-script/Code.gs` | Backend, ditempel ke editor Apps Script |
