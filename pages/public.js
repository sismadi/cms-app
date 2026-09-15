// ============================================================
// pages/public.js — Halaman PUBLIK (beranda, profil CMS, artikel +
// komentar). Rute: ?           (home)
//                   ?profile/<kodeCms>           (profil CMS)
//                   ?user/<kodeCms>/<slug>       (artikel)
// Lihat PRETTY_PUBLIC_ROUTES di engine.js untuk cara URL di atas
// dibaca/dibangun dari query string.
// ============================================================
// PERUBAHAN ARSITEKTUR: halaman-halaman ini DULU di-SSR (server-rendered
// HTML) langsung oleh worker.js supaya mesin pencari & pengunjung tanpa
// JS tetap bisa membaca artikel. Sekarang backend (cms-api) sudah
// dipisah jadi microservice API murni (JSON only, tanpa SSR) — jadi
// render HTML dilakukan DI SINI, di klien, memakai data dari
// db.publicHome() / db.publicProfile() / db.publicArtikel() (lihat db.js).
//
// Konsekuensi yang perlu diketahui:
//   - Pengindeksan mesin pencari kini bergantung pada Google/dst. mampu
//     menjalankan JavaScript (umumnya bisa, tapi tidak sekuat SSR asli).
//   - Form komentar SEKARANG butuh JS (fetch ke /public?view=komentar),
//     karena hosting statis (mis. GitHub Pages) tidak punya server yang
//     bisa memproses submit form HTML biasa.
// ============================================================

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function fmtTanggal(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return iso; }
}

/** Link ke halaman publik lain — pakai href dalam bentuk URL "cantik"
 *  (lihat PRETTY_PUBLIC_ROUTES di engine.js) + onclick SPA nav. */
function profileLink(kode, label) {
    return `<a href="${web.href({page:'profile', user:kode})}" onclick="web.navigate({page:'profile',user:'${kode}'}); return false;">${label}</a>`;
}
function artikelLink(kode, slug, label) {
    return `<a href="${web.href({page:'artikel', user:kode, slug})}" onclick="web.navigate({page:'artikel',user:'${kode}',slug:'${slug}'}); return false;">${label}</a>`;
}

// ------------------------------------------------------------
// Beranda — daftar CMS aktif
// ------------------------------------------------------------
web.routes.home = 'resolveHome';
async function resolveHome() {
    let daftarCms = [];
    try { ({ cms: daftarCms } = await db.publicHome()); }
    catch (e) { return [{ section: 'titleHero', title: 'Gagal Memuat', description: esc(e.message) }]; }

    const list = daftarCms.map(c => `
        <div class="col-1-3 artikel">
            ${c.avatarUrl ? `<img src="${esc(c.avatarUrl)}" alt="${esc(c.nama)}" width="56" height="56" loading="lazy" decoding="async" style="width:56px;height:56px;border-radius:50%;object-fit:cover;">` : ''}
            <span class="judul">${profileLink(c.kodeCms, esc(c.nama))}</span>
            <p>${esc(c.bio || '')}</p>
        </div>`).join('') || '<div class="col-1-1 artikel"><p>Belum ada CMS aktif.</p></div>';

    return [
        { section: 'titleHero', title: 'Piawai CMS', description: 'Platform CMS multi-penulis — jelajahi tulisan dari berbagai penulis di bawah ini.' },
        { section: 'rawHtml', html: `<div class="row gading">${list}</div>` },
    ];
}

// ------------------------------------------------------------
// Profil CMS publik — ?profile/<kodeCms>
// ------------------------------------------------------------
web.routes.profile = 'resolveProfile';
async function resolveProfile(kode) {
    kode = (kode || web.currentParams.user || '').toLowerCase();
    let cms, posts;
    try { ({ cms, posts } = await db.publicProfile(kode)); }
    catch (e) { return [{ section: 'titleHero', title: 'CMS Tidak Ditemukan', description: esc(e.message) }]; }

    const list = posts.map(p => `
        <div class="col-1-1 artikel" style="margin-bottom:1.2em;">
            <span class="judul">${artikelLink(kode, p.slug, esc(p.judul))}</span>
            ${p.kategori ? `<span class="badge">${esc(p.kategori)}</span>` : ''}
            <br><small>${fmtTanggal(p.publishedAt)}</small>
            <p>${esc(p.ringkasan || '')}</p>
        </div>`).join('') || '<div class="col-1-1 artikel"><p>Belum ada artikel yang dipublikasikan.</p></div>';

    const header = `
        <div class="row page">
            <div class="artikel">
                ${cms.avatarUrl ? `<img src="${esc(cms.avatarUrl)}" alt="${esc(cms.nama)}" width="72" height="72" loading="eager" fetchpriority="high" decoding="async" style="width:72px;height:72px;border-radius:50%;object-fit:cover;">` : ''}
                <h1>${esc(cms.nama)}</h1>
                <p>${esc(cms.bio || '')}</p>
            </div>
        </div>
        <div class="row gading">${list}</div>`;

    return [{ section: 'rawHtml', html: header }];
}

// ------------------------------------------------------------
// Artikel + komentar — ?user/<kodeCms>/<slug>
// ------------------------------------------------------------
web.routes.artikel = 'resolveArtikel';
async function resolveArtikel(_sub, _slug, notice) {
    const kode = (web.currentParams.user || '').toLowerCase();
    const slug = web.currentParams.slug || '';
    let cms, post, komentar;
    try { ({ cms, post, komentar } = await db.publicArtikel(kode, slug)); }
    catch (e) { return [{ section: 'titleHero', title: 'Artikel Tidak Ditemukan', description: esc(e.message) }]; }

    const tags = (post.tags || '').split(',').map(t => t.trim()).filter(Boolean)
        .map(t => `<span class="badge">${esc(t)}</span>`).join(' ');

    const komentarHtml = komentar.map(k => `
        <div class="info-card">
            <strong>${esc(k.nama)}</strong> <small>&middot; ${fmtTanggal(k.createdAt)}</small>
            <p>${esc(k.isi)}</p>
        </div>`).join('') || '<p>Belum ada komentar. Jadilah yang pertama.</p>';

    const noticeHtml = notice ? `<div class="info-card">${esc(notice)}</div>` : '';

    const html = `
        <div class="row page">
            <div class="artikel">
                <p>${profileLink(kode, '&larr; ' + esc(cms.nama))}</p>
                <h1>${esc(post.judul)}</h1>
                <p><small>${fmtTanggal(post.publishedAt)} ${post.kategori ? '&middot; ' + esc(post.kategori) : ''}</small></p>
                ${tags}
                ${post.coverImage ? `<p><img src="${esc(post.coverImage)}" alt="${esc(post.judul)}" loading="eager" fetchpriority="high" decoding="async" style="max-width:100%;"></p>` : ''}
                <div class="post-konten">${post.konten}</div>
                <hr>
                <h2 id="komentar">Komentar</h2>
                ${noticeHtml}
                <div id="komentarList">${komentarHtml}</div>
                <h3>Tulis Komentar</h3>
                <form class="dynamic-form" onsubmit="event.preventDefault(); publicPage.handleKomentarSubmit(this, '${kode}', '${slug}');">
                    <div class="a-row"><label class="a-label">Nama <span style="color:var(--orange,#f90)">*</span></label><input type="text" name="nama" required></div>
                    <div class="a-row"><label class="a-label">Email (opsional, tidak ditampilkan)</label><input type="email" name="email"></div>
                    <div class="a-row"><label class="a-label">Komentar <span style="color:var(--orange,#f90)">*</span></label><textarea name="isi" rows="3" required></textarea></div>
                    <button type="submit" class="slcBtn">Kirim Komentar</button>
                </form>
            </div>
        </div>`;

    return [{ section: 'rawHtml', html }];
}

const publicPage = {
    /** Submit komentar lewat fetch (bukan <form method="POST"> biasa) —
     *  hosting statis tidak punya server untuk memproses form POST langsung,
     *  jadi ini WAJIB AJAX. Lihat catatan arsitektur di atas berkas ini. */
    async handleKomentarSubmit(form, kode, slug) {
        const val = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() ?? '';
        const nama = val('nama'), email = val('email'), isi = val('isi');
        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }
        try {
            await db.publicKomentar(kode, slug, { nama, email, isi });
        } catch (e) {
            alert(e.message);
            if (btn) { btn.disabled = false; btn.textContent = 'Kirim Komentar'; }
            return;
        }
        // Render ulang halaman artikel supaya komentar baru langsung terlihat.
        web.currentParams = { page: 'artikel', user: kode, slug };
        const pageData = await resolveArtikel(undefined, undefined, 'Komentar terkirim, terima kasih!');
        await ui.render('content', pageData);
        location.hash = 'komentar';
    },
};
