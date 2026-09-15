// ============================================================
// dataset.js — Konfigurasi menu (siteConfig) + util slugify.
// Menambah halaman baru cukup di sini + daftar `pageFiles`, tidak
// perlu menyentuh app.html (lihat komentar asli di renderMenu, index.html).
// ============================================================
const siteConfig = [
    { slug: 'dashboard',  label: 'Dashboard', menu: true, role: ['owner', 'penulis'] },
    { slug: 'editor',     label: 'Tulis Baru', menu: true, role: ['owner', 'penulis'] },
    { slug: 'postingan',  label: 'Artikel Saya', menu: true, role: ['owner', 'penulis'] },
    { slug: 'profil',     label: 'Profil Blog', menu: true, role: ['owner'] },
    { slug: 'tenant',     label: 'Kelola Blog', menu: true, role: ['superadmin'] },
    { slug: 'login',      label: 'Masuk',     menu: true, guestOnly: true },
];

/** Ubah teks bebas jadi slug url-safe (huruf kecil, angka, strip). Dipakai
 *  oleh editor.js (judul artikel -> slug) & auth.js (nama blog -> kode blog). */
function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'artikel';
}

function formatRupiah(n) {
    return 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
}

// Daftar file JS halaman ADMIN yang dimuat berurutan sebelum menu
// dirender. Halaman publik (beranda, /:user, /:user/:slug) TIDAK ada
// di sini — semua itu di-SSR langsung oleh worker.js.
const pageFiles = [
    'pages/dashboard.js',
    'pages/editor.js',
    'pages/postingan.js',
    'pages/profil.js',
    'pages/tenant.js',
];

function loadPageScripts(files, done) {
    let i = 0;
    (function next() {
        if (i >= files.length) { done(); return; }
        const s = document.createElement('script');
        s.src = files[i++];
        s.onload = next;
        s.onerror = next; // tetap lanjut walau 1 file gagal, supaya halaman lain tidak ikut macet
        document.body.appendChild(s);
    })();
}
