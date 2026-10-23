#!/usr/bin/env python3
"""Pengingat Tuton Tracker.

Dijalankan GitHub Actions tiap pagi. Membaca data.json lalu memutuskan:
  - Senin            : rekap semua yang jatuh tempo 7 hari ke depan + yang lewat
  - hari lain        : kirim hanya kalau ada Tuweb/UAS besok atau hari ini,
                       atau diskusi/latihan/tugas yang jatuh tempo hari ini
  - MODE=tes         : kirim rekap sekarang, apa pun harinya

Variabel lingkungan:
  GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_TO (opsional), MODE,
  DATA_FILE (default data.json), TANGGAL (YYYY-MM-DD, untuk pengujian),
  DRY_RUN=1 (tulis email ke file, jangan kirim)
"""
import html
import json
import os
import smtplib
import sys
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Jakarta")
LABEL = {"diskusi": "Diskusi", "tugas": "Tugas", "latihan": "Latihan",
         "tuweb": "Tuweb", "uas": "UAS", "hadir": "Daftar hadir"}
BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
MAKS_BARIS = 18

BIRU, MERAH, AMBER = "#2F5FE0", "#D64545", "#B7791F"
GAYA = "font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#1B2432;max-width:560px"


def tgl(s):
    return date.fromisoformat(str(s)[:10])


def pendek(d):
    return f"{d.day} {BLN[d.month - 1]}"


def lengkap(d):
    return f"{HARI[d.weekday()]}, {pendek(d)}"


def nama(it):
    return it.get("label") or f"{LABEL.get(it['tipe'], it['tipe'])} {it.get('sesi', '')}"


def e(s):
    return html.escape(str(s or ""), quote=True)


def kartu_acara(it, mk, hari_ini):
    d = tgl(it["deadline"])
    kapan = "Hari ini" if d == hari_ini else "Besok"
    jam = it.get("jam") or ("19:00" if it["tipe"] == "tuweb" else "")
    baris_jam = f'<div style="font-size:15px;margin-top:5px">Mulai pukul {e(jam)} WIB</div>' if jam else ""
    tautan = ""
    if it["tipe"] == "tuweb" and it.get("link"):
        tautan = f'<div style="margin-top:9px"><a href="{e(it["link"])}" style="color:{BIRU}">Buka ruang Tuweb</a></div>'
    catatan = f'<div style="font-size:13.5px;color:#5A6577;margin-top:7px">{e(it["catatan"])}</div>' if it.get("catatan") else ""
    return (
        f'<div style="border-left:4px solid {e(mk.get("warna") or BIRU)};padding:14px 16px;background:#F4F7FB;margin-bottom:14px">'
        f'<div style="font-size:13px;color:#5A6577;margin-bottom:3px">{kapan} · {lengkap(d)}</div>'
        f'<div style="font-size:18px;font-weight:600">{e(nama(it))} · {e(mk.get("nama"))}</div>'
        f"{baris_jam}{tautan}{catatan}</div>"
    )


def tabel(judul, warna, items, mk):
    items = sorted(items, key=lambda i: (i["deadline"], mk[i["matkul_id"]].get("nama", "")))
    sisa = len(items) - MAKS_BARIS
    baris = []
    for it in items[:MAKS_BARIS]:
        m = mk[it["matkul_id"]]
        jam = f' · {e(it["jam"])}' if it["tipe"] in ("tuweb", "uas") and it.get("jam") else ""
        baris.append(
            '<tr><td style="padding:7px 0;border-bottom:1px solid #E4E8EE;font-size:14px">'
            f'<strong>{e(nama(it))}</strong>{jam} · {e(m.get("nama"))}</td>'
            '<td style="padding:7px 0;border-bottom:1px solid #E4E8EE;font-size:13px;color:#5A6577;'
            f'text-align:right;white-space:nowrap">{pendek(tgl(it["deadline"]))}</td></tr>'
        )
    lebih = f'<p style="font-size:13px;color:#5A6577;margin:8px 0 0">dan {sisa} lainnya — lihat di dashboard.</p>' if sisa > 0 else ""
    return (f'<h3 style="font-size:14px;margin:20px 0 8px;color:{warna}">{judul}</h3>'
            f'<table style="width:100%;border-collapse:collapse">{"".join(baris)}</table>{lebih}')


def susun(db, hari_ini, mode):
    sem = next((s for s in db.get("semester", []) if s.get("status") == "aktif"), None)
    if not sem:
        return None, None, "Tidak ada semester aktif."
    mk = {m["id"]: m for m in db.get("matkul", []) if m.get("semester_id") == sem["id"]}
    if not mk:
        return None, None, "Semester aktif belum punya mata kuliah."

    items = []
    for it in db.get("item", []):
        if it.get("matkul_id") not in mk or not it.get("deadline"):
            continue
        if it.get("status") in ("submitted", "nihil") or it.get("tipe") == "hadir":
            continue
        try:
            tgl(it["deadline"])
        except ValueError:
            continue
        items.append(it)

    besok = hari_ini + timedelta(days=1)
    acara = [i for i in items if i["tipe"] in ("tuweb", "uas") and tgl(i["deadline"]) in (hari_ini, besok)]
    jatuh_hari_ini = [i for i in items if i["tipe"] not in ("tuweb", "uas") and tgl(i["deadline"]) == hari_ini]
    batas = hari_ini + timedelta(days=7)
    lewat = [i for i in items if tgl(i["deadline"]) < hari_ini and i["tipe"] not in ("tuweb", "uas")]
    minggu_ini = [i for i in items if hari_ini <= tgl(i["deadline"]) <= batas]

    rekap = mode == "tes" or hari_ini.weekday() == 0
    if not rekap and not acara and not jatuh_hari_ini:
        return None, None, "Tidak ada yang perlu diingatkan hari ini."

    acara.sort(key=lambda i: (i["deadline"], i.get("jam") or ""))
    isi = [f'<div style="{GAYA}">']
    for it in acara:
        isi.append(kartu_acara(it, mk[it["matkul_id"]], hari_ini))

    if rekap:
        isi.append(f'<h2 style="font-size:19px;margin:6px 0 4px">Tuton {e(sem.get("label"))}</h2>')
        total = len(lewat) + len(minggu_ini)
        if total:
            isi.append(f'<p style="margin:0 0 6px;color:#5A6577">{total} item belum kelar sampai {pendek(batas)}.</p>')
            if lewat:
                isi.append(tabel("Lewat deadline", MERAH, lewat, mk))
            if minggu_ini:
                isi.append(tabel("Tujuh hari ke depan", BIRU, minggu_ini, mk))
        else:
            isi.append('<p style="margin:0;color:#5A6577">Nggak ada yang jatuh tempo dalam 7 hari ke depan.</p>')
    elif jatuh_hari_ini:
        isi.append(tabel("Jatuh tempo hari ini", AMBER, jatuh_hari_ini, mk))

    isi.append('<p style="margin:24px 0 0;font-size:13px;color:#8A93A3">Tuton Tracker</p></div>')

    if acara:
        a = acara[0]
        kapan = "hari ini" if tgl(a["deadline"]) == hari_ini else "besok"
        subjek = f'{nama(a)} {kapan} — {mk[a["matkul_id"]].get("nama")}'
    elif rekap:
        n = len(lewat) + len(minggu_ini)
        subjek = f'Tuton {sem.get("label")} — {n} item nunggu dikerjain' if n else f'Tuton {sem.get("label")} — aman minggu ini'
    else:
        subjek = f"{len(jatuh_hari_ini)} item jatuh tempo hari ini"
    if mode == "tes":
        subjek = "[Tes] " + subjek
    return subjek, "".join(isi), None


def kirim(subjek, isi_html):
    pengirim = (os.environ.get("GMAIL_USER") or "").strip()
    sandi = (os.environ.get("GMAIL_APP_PASSWORD") or "").replace(" ", "").strip()
    tujuan = [x.strip() for x in (os.environ.get("EMAIL_TO") or pengirim).split(",") if x.strip()]
    if not pengirim or not sandi:
        return False, "Secret GMAIL_USER atau GMAIL_APP_PASSWORD belum diisi."
    pesan = EmailMessage()
    pesan["Subject"] = subjek
    pesan["From"] = f"Tuton Tracker <{pengirim}>"
    pesan["To"] = ", ".join(tujuan)
    pesan.set_content("Buka email ini di aplikasi yang mendukung HTML untuk melihat pengingatnya.")
    pesan.add_alternative(isi_html, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
        smtp.login(pengirim, sandi)
        smtp.send_message(pesan)
    return True, None


def main():
    mode = (os.environ.get("MODE") or "otomatis").strip().lower()
    hari_ini = date.fromisoformat(os.environ["TANGGAL"]) if os.environ.get("TANGGAL") else datetime.now(TZ).date()
    path = os.environ.get("DATA_FILE", "data.json")
    try:
        with open(path, encoding="utf-8") as f:
            db = json.load(f)
    except FileNotFoundError:
        print("data.json belum ada. Isi data lewat dashboard dulu.")
        return 0

    subjek, isi, alasan = susun(db, hari_ini, mode)
    if not subjek:
        print(alasan)
        return 0

    if os.environ.get("DRY_RUN"):
        out = os.environ.get("DRY_RUN_OUT", "pengingat.html")
        with open(out, "w", encoding="utf-8") as f:
            f.write(isi)
        print(f"[dry run] {subjek} -> {out}")
        return 0

    ok, galat = kirim(subjek, isi)
    if not ok:
        print(f"::warning::{galat} Email tidak dikirim.")
        return 1 if mode == "tes" else 0
    print("Email terkirim.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
