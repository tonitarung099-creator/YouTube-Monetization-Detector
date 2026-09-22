# YouTube Monetization Detector

Ekstensi Chrome Manifest V3 untuk menampilkan **indikator monetisasi channel YouTube orang lain langsung di YouTube**.

## Status proyek

Versi awal **v0.1.0** sudah memiliki:

- Badge otomatis pada link channel di halaman YouTube.
- Dukungan Home, Search, halaman video, channel, dan area lain yang memuat link channel.
- Pemindaian maksimal beberapa channel per halaman dengan concurrency terbatas.
- Cache hasil selama 6 jam agar tidak terus-menerus meminta halaman yang sama.
- Popup untuk aktif/nonaktif, batas scan, dan confidence.
- Indikator mengambang pada halaman video.
- Tidak memerlukan AI API atau kartu kredit.

## Arti status

- **MONET** — ditemukan sinyal publik kuat seperti Membership/Join atau Super Thanks.
- **MUNGKIN** — ditemukan sinyal yang lebih lemah seperti data penempatan iklan.
- **BELUM PASTI** — tidak ada cukup data publik.

> YouTube tidak menyediakan field publik sederhana `YPP=true/false` untuk channel orang lain. Karena itu ekstensi ini tidak menyebut channel “tidak monetisasi” hanya karena sinyal tidak ditemukan. Iklan juga tidak diperlakukan sebagai bukti tunggal bahwa kreator menerima pendapatan.

## Cara memasang untuk pengembangan

1. Download/clone repo.
2. Buka Chrome.
3. Masuk ke `chrome://extensions`.
4. Aktifkan **Developer mode**.
5. Pilih **Load unpacked**.
6. Pilih folder repo ini.
7. Buka YouTube dan refresh halaman.

## Test lokal

Jika Node.js terpasang:

```bash
npm test
```

## Struktur

- `manifest.json` — konfigurasi Chrome Extension MV3.
- `detector.js` — mesin klasifikasi sinyal publik.
- `background.js` — fetch halaman channel + cache.
- `content.js` — integrasi badge dengan UI YouTube.
- `styles.css` — tampilan badge.
- `popup.*` — panel pengaturan ekstensi.
- `tests/` — test logika detector.

## Prinsip

Target utamanya adalah **cepat, gratis, tanpa API berbayar, dan jujur terhadap tingkat kepastian**. Algoritme bisa terus ditambah jika ditemukan sinyal publik baru yang lebih akurat.
