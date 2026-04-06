# Sample Data Import Pack

Paket ini disiapkan supaya cocok dengan schema di `code.gs`.

File yang tersedia:

- `Categories.csv`
- `Items.csv`
- `Settings.csv`
- `Transactions.csv`
- `TransactionItems.csv`
- `InventoryMoves.csv`

Urutan import yang disarankan:

1. `Categories.csv`
2. `Items.csv`
3. `Settings.csv`
4. `Transactions.csv`
5. `TransactionItems.csv`
6. `InventoryMoves.csv`

Catatan penting:

- Jalankan aplikasi sekali dulu supaya sheet otomatis dibuat oleh `ensureSchema_()`.
- Import tiap CSV ke sheet dengan nama yang sama.
- Paling aman pakai opsi `Replace current sheet`.
- Header di CSV sudah sesuai backend, jadi jangan ubah nama kolom.
- Kolom `Items.category` berisi `categoryId`, bukan nama kategori.
- `InventoryMoves.csv` opsional. Dashboard dan kasir tetap jalan tanpa itu.

