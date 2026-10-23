# Data Tuton Tracker

Repo ini menyimpan data dashboard [Tuton Tracker](https://github.com/my-razara/dashboard-kuliah). Isinya diubah otomatis dari dashboard, jadi biasanya nggak perlu disentuh.

| File | Isi |
|---|---|
| `data.json` | Semua semester, mata kuliah, item (diskusi, latihan, tugas, Tuweb, UAS, daftar hadir), dan slot jadwal |
| `.github/workflows/reminder.yml` | Jadwal pengingat email tiap pagi |
| `.github/scripts/reminder.py` | Skrip yang menyusun dan mengirim email |

**Jaga repo ini tetap private.** Isinya nilai, catatan, dan status tugas kuliah.

Setiap perubahan dari dashboard tersimpan sebagai satu commit. Kalau ada yang salah hapus, buka riwayat `data.json`, ambil versi sebelumnya, lalu pulihkan lewat **Atur → Ganti semua data dari file** di dashboard.

## Pengingat email

Isi dua secret di **Settings → Secrets and variables → Actions**:

- `GMAIL_USER` — alamat Gmail pengirim
- `GMAIL_APP_PASSWORD` — App Password dari [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
- `EMAIL_TO` — opsional, kalau email mau dikirim ke alamat lain

Uji di tab **Actions → Pengingat Tuton → Run workflow**, mode `tes`.
