// ============================================================
// dataset.js — Konfigurasi menu (siteConfig) + util slugify.
// Menambah halaman baru cukup di sini + daftar `pageFiles`, tidak
// perlu menyentuh app.html (lihat komentar asli di renderMenu, index.html).
// ============================================================
const siteConfig = [
    { slug: 'dashboard',  label: 'Dashboard', menu: true, role: ['owner', 'penulis'] },
    { slug: 'editor',     label: 'Tulis Baru', menu: true, role: ['owner', 'penulis'] },
    { slug: 'postingan',  label: 'Artikel Saya', menu: true, role: ['owner', 'penulis'] },
    { slug: 'profil',     label: 'Profil CMS', menu: true, role: ['owner'] },
    { slug: 'cms',        label: 'Kelola CMS', menu: true, role: ['superadmin'] },
    { slug: 'login',      label: 'Masuk',     menu: true, guestOnly: true },
];

/** Ubah teks bebas jadi slug url-safe (huruf kecil, angka, strip). Dipakai
 *  oleh editor.js (judul artikel -> slug) & auth.js (nama CMS -> kode CMS). */
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

// Daftar file JS halaman yang dimuat berurutan sebelum menu dirender.
// Termasuk pages/public.js (beranda, profil CMS, artikel + komentar) —
// dulu di-SSR langsung oleh worker.js, sekarang di-render client-side
// di sini karena backend (cms-api) sudah dipisah jadi microservice API
// murni tanpa SSR. Lihat pages/public.js.
const pageFiles = [
    'pages/public.js',
    'pages/dashboard.js',
    'pages/editor.js',
    'pages/postingan.js',
    'pages/profil.js',
    'pages/cms.js',
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
