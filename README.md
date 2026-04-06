# LitPOS

LitPOS adalah aplikasi POS retail mobile-first berbasis Google Apps Script dan Google Sheets. Fokusnya ada di alur kasir yang ringkas, manajemen produk, stok, riwayat transaksi, dan laporan sederhana dalam satu tampilan compact.


## Fitur

- Kasir cepat dengan cart, checkout, dan multi-metode pembayaran
- Manajemen produk dan kategori
- Penyesuaian stok manual
- Riwayat transaksi dan detail struk
- Laporan penjualan sederhana
- Seed data CSV siap import untuk demo awal

## Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Google Apps Script
- Database: Google Sheets

## Struktur

- `index.html` untuk UI aplikasi
- `code.gs` untuk backend Apps Script
- `sample-data/` untuk data demo siap import
- `preview/` untuk screenshot tampilan aplikasi

## Quick Start

1. Buat Spreadsheet baru.
2. Masukkan ID Spreadsheet ke `SPREADSHEET_ID` di `code.gs`.
3. Deploy `index.html` dan `code.gs` ke Google Apps Script project.
4. Jalankan aplikasi sekali agar sheet schema otomatis dibuat.
5. Import CSV dari folder `sample-data/` jika ingin data awal demo.

## Preview

<p align="center">
  <img src="preview/Screenshot%202026-04-07%20005221.png" width="220" alt="LitPOS Preview 1" />
  <img src="preview/Screenshot%202026-04-07%20005242.png" width="220" alt="LitPOS Preview 2" />
</p>
<p align="center">
  <img src="preview/Screenshot%202026-04-07%20005327.png" width="220" alt="LitPOS Preview 3" />
  <img src="preview/Screenshot%202026-04-07%20005409.png" width="220" alt="LitPOS Preview 4" />
</p>
<p align="center">
  <img src="preview/Screenshot%202026-04-07%20005422.png" width="220" alt="LitPOS Preview 5" />
  <img src="preview/Screenshot%202026-04-07%20005432.png" width="220" alt="LitPOS Preview 6" />
</p>
<p align="center">
  <img src="preview/Screenshot%202026-04-07%20005443.png" width="220" alt="LitPOS Preview 7" />
  <img src="preview/Screenshot%202026-04-07%20005457.png" width="220" alt="LitPOS Preview 8" />
</p>
<p align="center">
  <img src="preview/Screenshot%202026-04-07%20005506.png" width="220" alt="LitPOS Preview 9" />
</p>

## Sample Data

Panduan import data demo ada di [`sample-data/README.md`](sample-data/README.md).

