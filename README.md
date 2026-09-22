# YouTube Monetization Detector

Ekstensi Chrome Manifest V3 untuk menampilkan **indikator monetisasi channel YouTube orang lain langsung di YouTube**.

## Status proyek

Versi **v0.2.0** sekarang memiliki:

- Badge otomatis pada channel yang muncul di YouTube.
- Dukungan Home, Search, halaman video, halaman channel, dan Shorts.
- Pemeriksaan halaman channel **plus sampai 3 video sampel**.
- Deteksi beberapa sinyal sekaligus:
  - Membership / Join.
  - Super Thanks.
  - Super Chat / Super Sticker.
  - Merch shelf.
  - flag monetisasi eksplisit jika tersedia.
  - `monetizationDetails`.
  - `yt_ad=1` pada video sampel.
  - sinyal iklan umum hanya sebagai bukti lemah.
- Cache hasil selama 6 jam.
- Popup aktif/nonaktif, batas scan, confidence, dan statistik scan.
- Tidak memerlukan AI API, YouTube Data API, atau kartu kredit.

## Cara penilaian

Ekstensi tidak hanya melihat satu iklan lalu menyimpulkan monetisasi.

- **MONET** — ada sinyal kuat seperti Membership/Super Thanks/flag monetisasi, atau sedikitnya 2 video sampel memberi sinyal `yt_ad`.
- **MUNGKIN** — contohnya hanya 1 video sampel memberi sinyal `yt_ad` atau bukti pendukung belum cukup kuat.
- **BELUM PASTI** — tidak ada cukup bukti publik.

Confidence yang ditampilkan adalah **skor heuristik ekstensi**, bukan angka resmi dari YouTube.

> YouTube tidak menyediakan field publik resmi sederhana `YPP=true/false` untuk channel orang lain. Karena itu status negatif tidak boleh dianggap bukti pasti bahwa channel belum masuk YPP.

## Dasar teknik

Versi ini ditulis ulang untuk struktur proyek ini, tetapi metode pemeriksaan video sampel terinspirasi dari teknik komunitas open-source yang memeriksa `yt_ad`, tombol Join, dan beberapa video channel. Implementasi di repo ini tidak menyalin mentah kode repo tanpa lisensi yang jelas.

## Cara memasang

1. Download ZIP repo ini lalu extract.
2. Buka Chrome.
3. Masuk ke `chrome://extensions`.
4. Aktifkan **Developer mode**.
5. Klik **Load unpacked**.
6. Pilih folder yang berisi `manifest.json`.
7. Buka atau refresh YouTube.

## Test

Jika Node.js tersedia:

```bash
npm test
```

GitHub Actions juga menjalankan test detector dan validasi `manifest.json` pada setiap push.

## Struktur

- `manifest.json` — konfigurasi Chrome Extension MV3.
- `detector.js` — parsing dan agregasi sinyal monetisasi.
- `background.js` — fetch channel/video sampel + cache.
- `content.js` — badge dan panel status di UI YouTube.
- `styles.css` — tampilan badge.
- `popup.*` — panel pengaturan.
- `tests/` — test mesin detector.

## Target berikutnya

- Memperluas coverage UI YouTube jika selector berubah.
- Mengurangi request lebih jauh dengan cache lintas halaman.
- Menambah diagnostics agar channel yang salah terdeteksi mudah dianalisis.
- Menguji detector terhadap kumpulan channel dengan status yang sudah diketahui.
