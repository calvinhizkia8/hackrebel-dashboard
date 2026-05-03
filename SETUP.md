# 🚀 Setup Guide — Hack Rebel Social Dashboard
## TikTok Business API + Vercel + GitHub Pages

Setup ini dilakukan sekali. Setelah selesai:
- Tim akses dashboard dari URL GitHub Pages
- Data TikTok 12 akun ter-update otomatis tiap hari jam 07:00 WIB
- Data resmi dari TikTok API (bukan scraping)

---

## BAGIAN 1 — Siapkan TikTok App

### 1.1 Tambahkan Redirect URI di TikTok Developer Portal
1. Buka [developers.tiktok.com](https://developers.tiktok.com) → **My Apps** → pilih app kamu
2. Masuk ke tab **"Login Kit"** → **"Redirect domain"**
3. Tambahkan URL ini:
   ```
   https://hackrebel-dashboard.vercel.app/api/callback
   ```
   *(sesuaikan nama app Vercel kamu nanti)*
4. Di bagian **"Scopes"**, aktifkan:
   - ✅ `user.info.basic`
   - ✅ `user.info.stats`
   - ✅ `video.list`
5. Save

### 1.2 Catat credentials
Dari halaman **App Info**:
- **App ID** → ini `TIKTOK_APP_ID`
- **App Secret** → ini `TIKTOK_APP_SECRET`

---

## BAGIAN 2 — Deploy ke Vercel

### 2.1 Buat akun Vercel
→ [vercel.com/signup](https://vercel.com/signup) (gratis, login pakai GitHub)

### 2.2 Upload project ke GitHub
1. Buat repo GitHub baru: `hackrebel-dashboard` (Public)
2. Upload semua file dari folder ini ke repo tersebut
   (termasuk folder `api/` dan `.github/`)

### 2.3 Import ke Vercel
1. Di Vercel dashboard → **"Add New Project"**
2. Import repo `hackrebel-dashboard` dari GitHub
3. Klik **Deploy** (biarkan settings default)
4. Setelah deploy, catat URL Vercel kamu:
   ```
   https://hackrebel-dashboard.vercel.app
   ```

### 2.4 Tambahkan Vercel KV Storage
1. Di project Vercel → tab **Storage**
2. Klik **"Create Database"** → pilih **KV**
3. Nama: `hackrebel-kv` → Create
4. Vercel otomatis menambahkan env vars KV ke project

### 2.5 Set Environment Variables
Di Vercel → project → **Settings** → **Environment Variables**, tambahkan:

| Key | Value |
|-----|-------|
| `TIKTOK_APP_ID` | App ID dari TikTok Developer Portal |
| `TIKTOK_APP_SECRET` | App Secret dari TikTok Developer Portal |
| `TIKTOK_REDIRECT_URI` | `https://hackrebel-dashboard.vercel.app/api/callback` |
| `DASHBOARD_URL` | `https://USERNAME.github.io/hackrebel-dashboard/hackrebel-dashboard.html` |
| `CRON_SECRET` | Random string panjang (generate di [randomkeygen.com](https://randomkeygen.com)) |

Setelah menambahkan env vars → klik **Redeploy**.

---

## BAGIAN 3 — Update Dashboard HTML

Buka `hackrebel-dashboard.html`, cari baris ini:
```javascript
const VERCEL_API = 'https://hackrebel-dashboard.vercel.app';
```
Ganti dengan URL Vercel kamu yang sebenarnya. Lalu commit/upload ulang ke GitHub.

---

## BAGIAN 4 — Aktifkan GitHub Pages

1. Di repo GitHub → **Settings** → **Pages**
2. Source: branch `main`, folder `/ (root)` → **Save**
3. Dapat URL:
   ```
   https://USERNAME.github.io/hackrebel-dashboard/hackrebel-dashboard.html
   ```
4. **Bagikan URL ini ke semua tim.** ✅

---

## BAGIAN 5 — Connect 12 Akun TikTok (sekali saja)

Untuk setiap akun klien, buka link berikut **sambil login ke akun TikTok klien tersebut**:

```
https://hackrebel-dashboard.vercel.app/api/connect?account=elfs_active
https://hackrebel-dashboard.vercel.app/api/connect?account=shumijapan
https://hackrebel-dashboard.vercel.app/api/connect?account=kamlaijakarta
https://hackrebel-dashboard.vercel.app/api/connect?account=pieraspropolinseofficial
https://hackrebel-dashboard.vercel.app/api/connect?account=brait.idn
https://hackrebel-dashboard.vercel.app/api/connect?account=m2000.outdoor
https://hackrebel-dashboard.vercel.app/api/connect?account=elfs_fits
https://hackrebel-dashboard.vercel.app/api/connect?account=alamsarideltamas
```

Atau kirim link tersebut ke masing-masing klien untuk mereka authorize sendiri.

Setelah authorize → halaman sukses muncul → akun terhubung → data langsung tampil di dashboard.

---

## Jadwal Auto-Sync

| Waktu | Keterangan |
|-------|------------|
| 07:00 WIB setiap hari | Vercel Cron otomatis refresh token + fetch data baru |
| Kapan saja | Klik "Refresh" di dashboard untuk update manual |

---

## Tambah Akun Baru

1. Buka `api/data.js` dan `api/cron.js`
2. Tambahkan username baru ke array `CLIENTS` / `USERNAMES`
3. Commit ke GitHub → Vercel auto-redeploy
4. Buka connect URL untuk akun baru

---

## Troubleshooting

**Data tidak muncul setelah connect?**
→ Cek tab **Functions** di Vercel untuk error log

**Token expired?**
→ TikTok refresh token valid 30 hari. Kalau lewat, akun perlu connect ulang.

**Cron tidak jalan?**
→ Vercel Cron butuh plan Hobby (gratis) atau lebih. Cek di Vercel → Settings → Cron Jobs.
