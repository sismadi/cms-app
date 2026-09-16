# Keamanan Piawai CMS (cms-app)

Dokumen ini mencatat perubahan keamanan yang sudah diterapkan di repo
**frontend** ini, dan — sama pentingnya — masalah yang **tidak bisa**
diperbaiki dari repo ini saja karena akarnya ada di backend (`cms-api`,
repo terpisah, tidak disertakan). Baca bagian "Belum Bisa Diperbaiki dari
Sini" sebelum menganggap aplikasi ini "sudah aman".

## Prinsip penulisan kode yang dipakai mulai sekarang

1. **Escape di titik render, bukan di titik input.** Jangan percaya validasi
   di form sebagai satu-satunya pertahanan — selalu escape/sanitize nilai
   tepat sebelum ditaruh ke DOM/HTML, di lokasi ia dirender. Semua tempat
   yang membangun HTML dari data (tabel, form, kartu, dst.) pakai `escHtml()`
   (di `engine.js`) atau `esc()` (di `pages/public.js`) secara default.
2. **Allowlist, bukan blocklist**, untuk apa pun yang menerima HTML mentah
   (lihat `sanitizeHtml()` di `pages/public.js`). Daftar hitam nama tag/atribut
   berbahaya selalu punya celah (nama event handler ada puluhan); daftar putih
   tidak.
3. **Raw HTML harus eksplisit dan sempit.** Kalau sebuah nilai memang HARUS
   berupa HTML mentah (kolom "aksi" di tabel, atau field `raw` di form),
   itu wajib ditandai eksplisit (`rawKeys`, `type:'raw'`) dan isinya wajib
   dirakit oleh kode kita sendiri — TIDAK PERNAH langsung dari input pengguna.
4. **Jangan percaya apa pun yang datang dari klien** untuk keputusan otorisasi
   (lihat temuan #2 di bawah) — cmsId, role, userId di `localStorage` bisa
   diedit siapa pun lewat DevTools. Keputusan "siapa boleh apa" harus diverifikasi
   ulang di server dari token sesi, bukan dari field yang dikirim klien.
5. **Captcha hanya berarti kalau diverifikasi di server.** Widget di frontend
   cuma UX gate; kalau backend tidak memanggil `siteverify`, bot yang memanggil
   API langsung tetap lolos.
6. **Kredensial tidak pernah dalam bentuk yang bisa dibaca ulang** — password
   harus di-hash (Argon2id/bcrypt) di backend saat disimpan, dan dibandingkan
   lewat verifikasi hash, bukan `===` string biasa.

## Yang sudah diperbaiki di repo ini

| # | Temuan | Perbaikan |
|---|---|---|
| 1 | `renderTable()` menaruh nilai sel (nama CMS, judul artikel — input bebas pengguna) langsung sebagai HTML, tanpa escape. Nama CMS nakal seperti `<img src=x onerror=...>` akan **dieksekusi di sesi superadmin** saat membuka "Kelola CMS" — stored XSS → pengambilalihan akun paling berkuasa di sistem. | `renderTable()` sekarang escape semua sel secara default; hanya kolom yang didaftar eksplisit di `opts.rawKeys` (kolom "aksi") yang dilewatkan sebagai HTML. `pages/cms.js` & `pages/postingan.js` diperbarui. |
| 2 | `genericForm()` menaruh `value="${...}"` field (mis. judul artikel) tanpa escape — nilai dengan `"` bisa keluar dari atribut dan menyuntik `onfocus=...autofocus` (XSS tanpa perlu klik). | Semua `value`, `placeholder`, opsi `<select>` di-escape lewat `escHtml()`. |
| 3 | Isi artikel (`post.konten`) dirender lewat `innerHTML` apa adanya — penulis boleh mengetik HTML bebas, dan itu langsung tayang ke SEMUA pengunjung publik tanpa disaring. | Ditambah `sanitizeHtml()` (allowlist tag `p,strong,a,ul,li,img,...` + atribut, buang skema `javascript:`/`data:` di `href`/`src`, buang semua `on*`). Dipanggil di `pages/public.js` sebelum `post.konten` ditayangkan. |
| 4 | Komentar publik bisa dikirim siapa saja tanpa akun, dengan nama bebas ketik (mudah dipalsukan/spam). | Form komentar hanya tampil untuk pengguna yang login; nama diambil dari sesi, bukan input bebas. Lihat `komentarFormOrLoginPrompt()` di `pages/public.js`. |
| 5 | Tidak ada captcha di login/registrasi. | Widget Cloudflare Turnstile ditambahkan ke kedua form (`auth.js`, dimuat lewat `index.html`). **Lihat batasan penting di bawah.** |
| 6 | Beberapa nilai disisipkan ke atribut `onclick="...('${id}')"` — kalau id mengandung tanda kutip, bisa memutus keluar dari handler. | Diganti pakai `JSON.stringify(...)` saat menyisip ke `onclick` (`pages/cms.js`, `pages/postingan.js`). |
| 7 | Tidak ada batas panjang input (nama CMS, bio, komentar, dst.) — memperbesar permukaan serangan & spam. | Ditambah `maxlength` di field registrasi & komentar. |

## Belum Bisa Diperbaiki dari Sini (butuh perubahan di `cms-api`)

Ini bagian **paling penting** untuk dibaca — repo `cms-app` ini murni frontend
statis; backend (`cms-api`, Cloudflare Worker) ada di repo terpisah yang tidak
ikut ter-upload, jadi berikut ini tidak bisa dituntaskan hanya dari sini.

### KRITIS — Password & data pengguna bisa diakses langsung lewat API

`auth.js` login dengan cara: ambil **seluruh isi tabel `users`** untuk satu
CMS (`db.allForCms('users', cms.id)` → `GET /api?table=users&cmsId=...`),
lalu cocokkan `username`/`password` **di browser**. Konsekuensinya:

- Endpoint itu **wajib** mengembalikan password (dalam bentuk apa pun) ke
  klien supaya pencocokan bisa terjadi di JS. Artinya **siapa pun** yang tahu
  URL API (tidak perlu login) bisa memanggil `GET /api?table=users&cmsId=X`
  langsung dan membaca username **+ password** semua pengguna CMS itu.
- Kalau password disimpan plaintext di database (tidak ada tanda hashing di
  kode ini), ini bocor password asli, bukan hash.

**Perbaikan yang diperlukan (di `cms-api`):**
1. Buat endpoint login khusus di server, mis. `POST /public?view=login`
   menerima `{kodeCms, username, password, turnstileToken}`, memverifikasi
   Turnstile lewat `siteverify`, mencocokkan password terhadap **hash**
   (Argon2id/bcrypt) di server, lalu mengembalikan **token sesi** (JWT
   bertanda tangan atau opaque token tersimpan di server) — bukan daftar user.
2. Hentikan pola "fetch semua baris tabel `users` ke klien" sama sekali.
3. Hash ulang semua password yang sudah ada di database sebelum rilis fitur ini.

### KRITIS — Otorisasi bergantung pada data yang dikirim klien (IDOR)

`db.js` menambahkan `cmsId` ke tiap request tabel scoped (`users`, `post`,
`komentar`) dari `auth.currentUser().cmsId` yang **disimpan di `localStorage`
milik klien sendiri**. Kalau backend memercayai `cmsId` dari query string
sebagai kebenaran (tanpa memverifikasi lewat token sesi), pengguna bisa
mengubah `cmsId` di localStorage lewat DevTools lalu membaca/mengedit/menghapus
artikel & pengguna milik CMS **lain**.

**Perbaikan yang diperlukan:** backend menurunkan `cmsId` dari token sesi
yang terverifikasi di server (hasil dari perbaikan #1 di atas), **bukan**
dari parameter yang dikirim klien — walau frontend tetap mengirim `cmsId`,
backend harus mengabaikannya dan memakai nilai dari token.

### TINGGI — Captcha & rate limiting login perlu diverifikasi/ditegakkan di server

Widget Turnstile yang sudah ditambahkan di frontend **hanya efektif** kalau
`cms-api` memanggil `siteverify` (contoh kode lengkap ada di komentar atas
`auth.js`, dekat `TURNSTILE_SITE_KEY`). Begitu juga pengunci percobaan login
(`auth._recordLoginFailure`) di frontend murni kosmetik — bot yang memanggil
API langsung tidak melewatinya. Backend perlu rate limit asli (per IP dan/atau
per akun, mis. lewat Cloudflare Rate Limiting atau counter di KV/D1).

### SEDANG — Sanitasi HTML idealnya juga ada di backend

`sanitizeHtml()` yang ditambahkan di `pages/public.js` melindungi pengunjung
yang membuka artikel lewat frontend ini. Tapi kalau ada konsumen API lain
(mobile app, integrasi pihak ketiga) yang menampilkan `post.konten` tanpa
lewat frontend ini, mereka tidak ikut terlindungi. Idealnya `cms-api`
men-sanitize `konten` saat disimpan (atau minimal saat dibaca lewat endpoint publik).

### SEDANG — Ganti Turnstile Site Key contoh

`TURNSTILE_SITE_KEY` di `auth.js` masih placeholder
(`0x0000000000000000AA`). Buat widget asli di dashboard Cloudflare Turnstile,
tempel Site Key ke sana, dan simpan Secret Key sebagai **Worker secret** di
`cms-api` (jangan pernah taruh Secret Key di repo frontend mana pun).

## File lama yang sebaiknya dihapus

`app.html`, `public.js` (root, bukan `pages/public.js`), dan `pages/tenant.js`
tampaknya sisa arsitektur versi sebelumnya dan tidak dimuat oleh `index.html`
(lihat `dataset.js` → `pageFiles`). File yang tidak dipakai tapi masih ada di
repo memperbesar permukaan serangan (mis. kalau suatu saat ter-deploy/ter-index
tanpa sadar) dan membingungkan audit berikutnya — pertimbangkan dihapus atau
dipindah ke branch arsip.
