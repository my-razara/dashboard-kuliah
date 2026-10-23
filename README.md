# Tuton Tracker

Dashboard pelacak kuliah Universitas Terbuka: diskusi, latihan, tugas, daftar hadir, Tuweb, dan UAS per sesi, plus perkiraan nilai dan prompt asisten per mata kuliah.

**Buka:** https://my-razara.github.io/dashboard-kuliah/

## Cara kerjanya

Repo ini publik dan cuma berisi tampilan. Data kuliah disimpan di repo **private** terpisah sebagai satu file `data.json`, dibaca dan ditulis langsung dari browser lewat GitHub API.

```
dashboard-kuliah (publik, GitHub Pages)      dashboard-kuliah-data (private)
  index.html  ─────── token, GitHub API ──────▶  data.json
  assets/                                         .github/workflows/reminder.yml
  data-repo/  ── disalin saat setup ──────────▶   .github/scripts/reminder.py
```

- Perubahan disimpan otomatis, dikumpulkan jadi satu commit tiap jeda singkat. Riwayat lengkapnya ada di commit repo data.
- HP dan laptop memakai data yang sama. Kalau keduanya mengubah data bersamaan, perubahan digabung, nggak saling menimpa.
- Saat offline, perubahan disimpan di perangkat dan dikirim begitu online lagi.
- Pengingat email dijalankan GitHub Actions di repo data tiap pagi sekitar 06.40 WIB.
- Google Calendar: tombol per item membuka Google Calendar dengan acara yang sudah terisi, atau unduh file `.ics` untuk banyak sekaligus.

## Setup pertama kali

1. Bikin repo **private** kosong bernama `dashboard-kuliah-data`.
2. Bikin [fine-grained token](https://github.com/settings/personal-access-tokens/new):
   - Repository access: **Only select repositories** → `dashboard-kuliah-data`
   - Permissions → **Contents**: Read and write
   - Permissions → **Workflows**: Read and write
3. Buka dashboard, tempel nama repo dan token.
4. Pilih sumber data: impor `.xlsx` dari Google Sheets lama (**File → Download → Microsoft Excel**), pulihkan cadangan `.json`, atau mulai dengan 7 mata kuliah semester ini.

Token disimpan di browser perangkat itu saja. Tiap perangkat perlu memasukkannya sekali.

### Pengingat email

Di repo data, **Settings → Secrets and variables → Actions**, isi:

| Secret | Isi |
|---|---|
| `GMAIL_USER` | Alamat Gmail pengirim |
| `GMAIL_APP_PASSWORD` | App Password dari [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (butuh verifikasi 2 langkah) |
| `EMAIL_TO` | Opsional, alamat tujuan kalau beda |

Uji lewat **Actions → Pengingat Tuton → Run workflow**, mode `tes`.

| Hari | Isi email |
|---|---|
| Senin | Rekap semua yang jatuh tempo 7 hari ke depan dan yang sudah lewat |
| Hari lain | Hanya kalau ada Tuweb atau UAS besok/hari ini, atau diskusi, latihan, tugas yang jatuh tempo hari itu |

## Struktur file

| File | Isi |
|---|---|
| `index.html` | Kerangka halaman |
| `assets/style.css` | Tampilan |
| `assets/store.js` | Penyimpanan GitHub, antrean perubahan, pola mata kuliah, generator item, impor |
| `assets/app.js` | Tampilan: matriks, jadwal, kalender, nilai, prompt asisten, setup |
| `data-repo/` | Workflow dan skrip pengingat yang dipasang ke repo data |

### Mengubah pola mata kuliah atau bobot nilai

Di `assets/store.js`, bagian `POLA` dan `CONFIG`. Setelah mengubah `POLA`, jalankan **Atur → Lengkapi item sesuai pola** di dashboard untuk menambah item yang kurang tanpa menghapus apa pun.

Kalau mengubah `data-repo/`, pasang ulang lewat **Atur → Penyimpanan & pengingat → pasang / perbarui**.

## Keamanan

- Token cuma bisa menyentuh repo yang dipilih saat membuatnya. Kalau HP hilang, cabut token di [pengaturan token GitHub](https://github.com/settings/personal-access-tokens).
- Dashboard menolak tersambung ke repo yang masih publik.
- Halaman ini tidak memuat skrip pihak ketiga selain font Google dan pembaca Excel (dari cdnjs, hanya saat impor).
