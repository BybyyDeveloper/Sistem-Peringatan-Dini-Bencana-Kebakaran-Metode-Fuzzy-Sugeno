# IoT Fire Detection — Static Web Pages

Versi HTML/CSS/Vanilla JS murni dari proyek React + TypeScript.  
**Siap upload ke GitHub Pages, Netlify, atau hosting statis apa pun.**

---

## ⚠️ WAJIB: Daftarkan Domain GitHub Pages di Firebase Console

Ini adalah **langkah yang paling sering terlewat** dan menyebabkan Firebase tidak terhubung setelah upload ke GitHub Pages.

### Cara menambahkan domain:
1. Buka [Firebase Console](https://console.firebase.google.com/) → pilih project Anda
2. Klik **Authentication** di menu kiri
3. Pilih tab **Settings**
4. Scroll ke bagian **Authorized domains**
5. Klik tombol **Add domain**
6. Masukkan: `username.github.io` (ganti `username` dengan username GitHub Anda)
7. Klik **Add** dan tunggu beberapa detik
8. Muat ulang halaman GitHub Pages Anda

> **Catatan:** Cukup daftarkan `username.github.io` (tanpa path repo). Firebase akan mengizinkan semua subdomain/path di bawahnya secara otomatis.

---

## ⚠️ WAJIB: Tambahkan `.indexOn` di Firebase Database Rules

Tanpa ini, query pencarian akun berdasarkan email gagal dan dashboard menampilkan **"Tidak Terhubung"** meskipun auth berhasil.

### Cara menambahkan:
1. Buka [Firebase Console](https://console.firebase.google.com/) → pilih project Anda
2. Klik **Realtime Database** di menu kiri
3. Pilih tab **Rules**
4. Ubah rules menjadi seperti ini (sesuaikan dengan rules Anda yang sudah ada):

```json
{
  "rules": {
    "Akun": {
      ".indexOn": ["email"],
      ".read": "auth != null",
      ".write": "auth != null"
    },
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

5. Klik **Publish**

> **Kenapa perlu ini?** Kode menggunakan `orderByChild("email")` untuk menemukan akun berdasarkan email login. Firebase mensyaratkan field yang di-query harus didaftarkan di Rules dengan `.indexOn`. Tanpa ini, query dilempar error dan sistem tidak tahu path sensor yang harus dibaca → data tidak muncul.

---

## Bug yang telah diperbaiki (versi ini)

| Bug | File | Deskripsi |
|---|---|---|
| **Race condition koneksi badge** | `js/common.js` | Listener `.info/connected` dipasang sebelum sidebar dibangun → badge selalu "Menghubungkan...". Dipindahkan ke setelah `buildSidebar()`. |
| **Error domain tidak tertangkap** | `index.html` | Error `auth/unauthorized-domain` tidak ditangani → pengguna hanya lihat "Gagal masuk". Sekarang tampil pesan jelas + langkah perbaikan. |
| **Reset password error domain** | `index.html` | Fitur reset password juga tidak menangkap `auth/unauthorized-domain`. Sudah diperbaiki. |
| **Chart.js crash blokir Firebase** | `dashboard.html` | `new Chart()` dipanggil sebelum `requireAuth()` → jika CDN lambat, seluruh script crash dan Firebase tidak connect. Dipindahkan ke dalam callback `requireAuth()`. |
| **orderByChild crash skip fallback** | `js/common.js` | Error `Index not defined` dari `orderByChild` menyebabkan fallback scan ikut diskip → `akunKey` null → path sensor salah → data tidak muncul. Sekarang fallback scan berjalan mandiri di try-catch terpisah. |

---

## 📁 Struktur Folder

```
web-pages/
├── index.html          ← Halaman Login
├── dashboard.html      ← Dashboard monitoring realtime
├── histori.html        ← Tabel histori data + export Excel
├── laporan.html        ← Laporan lengkap + export PDF/Excel
├── profil.html         ← Profil & ganti password
├── pengaturan.html     ← Pengaturan threshold Fuzzy Sugeno
├── admin.html          ← Admin panel manajemen user
├── setup.html          ← Setup akun admin pertama (sekali pakai)
├── css/
│   └── style.css       ← Custom CSS + animasi
└── js/
    ├── firebase-config.js  ← Inisialisasi Firebase (config sudah terisi)
    ├── fuzzy.js            ← Logika Fuzzy Sugeno Orde-Nol
    └── common.js           ← Auth, sidebar, sensor, helpers
```

---

## 🚀 Cara Deploy ke GitHub Pages

1. **Buat repository GitHub** (bisa private atau public)
2. **Upload seluruh isi folder `web-pages/`** ke root repository
   ```bash
   git init
   git add .
   git commit -m "Initial commit - IoT Fire Detection static"
   git remote add origin https://github.com/username/nama-repo.git
   git push -u origin main
   ```
3. **Aktifkan GitHub Pages:**  
   `Settings → Pages → Source: Deploy from branch → Branch: main → / (root)`
4. Tunggu beberapa menit → akses di `https://username.github.io/nama-repo/`
5. **⚠️ Daftarkan domain** `username.github.io` di Firebase Console (lihat bagian atas README)

### Login pertama kali
Jika belum ada akun admin, buka `setup.html` untuk membuat akun admin pertama.

---

## 🔌 Teknologi yang Digunakan

| Library | Versi | Digunakan untuk |
|---|---|---|
| Firebase JS SDK (compat) | 9.23.0 | Auth + Realtime Database |
| Tailwind CSS (CDN Play) | v3 | Styling utility |
| Chart.js | 4.4.0 | Grafik sensor realtime |
| SheetJS (xlsx) | latest | Export Excel |
| jsPDF | 2.5.1 | Export PDF |

Semua library di-load via CDN — **tidak perlu npm install atau build step.**

---

## 🔥 Fitur Lengkap

| Fitur | Halaman |
|---|---|
| Login / Reset password | `index.html` |
| Dashboard realtime (sensor + grafik) | `dashboard.html` |
| Alarm audio BAHAYA/KEBAKARAN | `dashboard.html` |
| Histori data dengan filter & sort | `histori.html` |
| Export Excel | `histori.html`, `laporan.html` |
| Laporan PDF + Print | `laporan.html` |
| Edit profil & ganti password | `profil.html` |
| Dynamic Threshold Fuzzy (slider) | `pengaturan.html` |
| Manajemen user (tambah/edit/toggle) | `admin.html` |
| Sidebar collapsible + role-based nav | Semua halaman |

---

## 🧮 Logika Fuzzy Sugeno

7 rule base sesuai spesifikasi riset (lihat `js/fuzzy.js`):

| Rule | Kondisi | Output |
|---|---|---|
| R1 | Suhu Rendah ∧ Kel Tinggi ∧ Asap Rendah ∧ Api=0 | AMAN (0) |
| R2 | Suhu Rendah ∧ Kel Sedang ∧ Asap Rendah ∧ Api=0 | AMAN (0) |
| R3 | Suhu Sedang ∧ Kel Sedang ∧ Asap Sedang ∧ Api=0 | WASPADA (1) |
| R4 | Suhu Tinggi ∧ Kel Sedang ∧ Asap Rendah ∧ Api=0 | WASPADA (1) |
| R5★| Suhu Sedang ∧ Kel Rendah ∧ Asap Sedang ∧ Api=1 | BAHAYA (2) |
| R6 | Suhu Tinggi ∧ Kel Rendah ∧ Asap Tinggi ∧ Api=0 | WASPADA (1) |
| R7 | Suhu Tinggi ∧ Kel Rendah ∧ Asap Tinggi ∧ Api=1 | BAHAYA (2) |

Output dibulatkan: 0 = AMAN, 1 = WASPADA, 2 = BAHAYA/KEBAKARAN.

---

## ⚠️ Catatan Penting

- Firebase config sudah tertanam di `js/firebase-config.js` — tidak perlu diubah
- Kode TypeScript asli tetap aman di folder `artifacts/fire-detection/` (tidak diubah)
- Folder `web-pages/` ini adalah konversi **terpisah**, bukan pengganti
