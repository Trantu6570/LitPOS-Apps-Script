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
- `payment_gateway_midtrans.gs` untuk modul Midtrans (sandbox/production)
- `sample-data/` untuk data demo siap import
- `preview/` untuk screenshot tampilan aplikasi

## Quick Start

1. Buat Spreadsheet baru.
2. Masukkan ID Spreadsheet ke `SPREADSHEET_ID` di `code.gs`.
3. Deploy `index.html` dan `code.gs` ke Google Apps Script project.
4. Jalankan aplikasi sekali agar sheet schema otomatis dibuat.
5. Import CSV dari folder `sample-data/` jika ingin data awal demo.

## Midtrans Sandbox (Modular GAS)

Integrasi payment gateway Midtrans dipisah ke modul `payment_gateway_midtrans.gs` agar tetap modular namun kompatibel dengan Google Apps Script.

### 1) Isi Script Properties

Di Apps Script: **Project Settings > Script properties**

- `MIDTRANS_SERVER_KEY`: server key sandbox Midtrans (wajib)
- `MIDTRANS_CLIENT_KEY`: client key sandbox (opsional untuk UI depan)
- `MIDTRANS_MERCHANT_ID`: merchant id (opsional)
- `MIDTRANS_MODE`: isi `sandbox` atau `production` (default: `sandbox`)
- `MIDTRANS_IS_PRODUCTION`: `true/false` (opsional, jika `true` akan override ke production)

Anda juga bisa mengelola properti Midtrans dari UI aplikasi:

- Buka menu **Midtrans Gateway**
- Simpan mode, merchant ID, client key
- Update server key via field password (nilai server key lama tidak pernah ditampilkan ke UI)
- Atau hapus server key dengan opsi **Hapus Server Key Saat Simpan**

### 2) Flow checkout Midtrans

- Pilih metode bayar **Midtrans** di checkout.
- POS memanggil `createMidtransPayment(payload)`:
  - create Snap transaction ke Midtrans sandbox (`/snap/v1/transactions`)
  - simpan transaksi POS dengan status `Menunggu Pembayaran`
  - reserve stok (tipe move: `SALE_PENDING`)
- UI akan membuka `redirect_url` Midtrans.
- Di detail transaksi, klik **Cek Status Midtrans** untuk memanggil `syncMidtransTransactionStatus({ trxId })`.

### 3) Sinkron status transaksi

`syncMidtransTransactionStatus` memanggil Midtrans status endpoint (`/v2/{order_id}/status`) dan update status lokal:

- `settlement` / `capture` -> `Selesai`
- `pending` -> `Menunggu Pembayaran`
- `deny` -> `Ditolak`
- `cancel` -> `Dibatalkan`
- `expire` -> `Kadaluarsa`
- `failure` -> `Gagal`

Jika transaksi terminal gagal (deny/cancel/expire/failure), stok reservasi akan dikembalikan otomatis (move: `PAYMENT_RELEASE`).

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
  <img src="preview/Screenshot%202026-04-14%20002644.png" width="220" alt="LitPOS Preview 10" />
</p>
<p align="center">
  <img src="preview/Screenshot%202026-04-14%20002629.png" width="220" alt="LitPOS Preview 11" />
  <img src="preview/Screenshot%202026-04-14%20002606.png" width="220" alt="LitPOS Preview 12" />
</p>
<p align="center">
  <img src="preview/Screenshot%202026-04-14%20002542.png" width="220" alt="LitPOS Preview 13" />
  <img src="preview/Screenshot%202026-04-14%20002439.png" width="220" alt="LitPOS Preview 14" />
</p>
<p align="center">
  <img src="preview/Screenshot%202026-04-14%20001540.png" width="220" alt="LitPOS Preview 15" />
</p>

## Sample Data

Panduan import data demo ada di [`sample-data/README.md`](sample-data/README.md).

## Komunitas

Mau belajar Google Apps Script bareng-bareng? Yuk gabung grup WhatsApp:

https://chat.whatsapp.com/HhXHuhvQtQYAnRtR8uCil5?mode=gi_t
