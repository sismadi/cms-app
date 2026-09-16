# Patch frontend `cms-app` agar kompatibel dengan `cms-api` ter-hardening

Hanya **2 file** yang berubah. Timpa file dengan nama sama di repo
`cms-app` Anda, lalu deploy bersamaan dengan backend — skema lama sudah
tidak kompatibel, jadi jangan deploy salah satunya saja.

## `db.js`
- Semua request `/api` dan `POST /public` kini membawa header
  `Authorization: Bearer <token>`.
- `401` dari server → sesi lokal dibersihkan, pengguna diarahkan ke halaman masuk.
- `db.allForCms()` dan `db.insertForCms()` **dihapus** — itu jalur yang
  dulu menarik seluruh tabel `users` (berikut password) ke browser.
  Backend sekarang menolak tabel `users` sepenuhnya.
- Ditambah `db.login()` dan `db.register()` yang memanggil endpoint server.
- `SCOPED_TABLES` tinggal `post` (cmsId di query hanya untuk kunci cache;
  backend mengabaikannya dan memakai token).

## `auth.js`
- `auth.login()` / `auth.register()` tidak lagi mencocokkan kredensial di
  browser — satu panggilan ke server, lalu simpan token.
- Token disimpan di `localStorage` key `cmsToken` (`auth.TOKEN_KEY`),
  dibaca `db.js` lewat `auth.token()`. `logout()` menghapus keduanya.
- `turnstileToken` benar-benar dikirim ke server (TODO(backend) lama
  sudah hilang — backend memverifikasinya lewat `siteverify`).
- Minimum password naik 6 → 8 karakter, selaras dengan validasi server.
- Kredensial demo **dihapus dari halaman login publik**.

## Yang perlu Anda isi sendiri
1. `db.js` → `API_BASE`: URL Worker hasil `wrangler deploy`.
2. `auth.js` → `TURNSTILE_SITE_KEY`: Site Key asli dari dashboard Turnstile
   (placeholder `0x0000000000000000AA` masih terpasang).

## Tidak berubah
`pages/public.js` sudah mengirim `{isi}` dan hanya menampilkan form
komentar untuk pengguna login — field `nama`/`userId` yang ikut terkirim
kini diabaikan backend, jadi tidak perlu disentuh.

## Sisa bersih-bersih (dari SECURITY.md lama)
`app.html`, `public.js` di root, dan `pages/tenant.js` masih sisa
arsitektur lama dan tidak dimuat `index.html` — pertimbangkan dihapus.
