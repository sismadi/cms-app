// ============================================================
// engine.js — Mesin render generik untuk aplikasi ADMIN blog multi-user.
// ============================================================
// Dikonversi dari versi POS. Komponen render generik (titleHero/article/
// genericForm/table/dst) DIPERTAHANKAN APA ADANYA. Yang BERUBAH: routing
// sekarang berbasis PATH ASLI (/dashboard, /editor/post_123), bukan query
// string (?dashboard) — supaya konsisten dengan halaman publik yang di-SSR
// langsung oleh worker.js di /:user dan /:user/:slug. Lihat catatan di
// worker.js: app.html HANYA disajikan untuk path admin yang reserved
// (login/register/dashboard/editor/postingan/profil/tenant), jadi
// window.location.pathname di sini SELALU salah satu dari itu.
//
// Halaman didaftarkan lewat `web.routes[slug] = 'namaResolver'` (lihat
// pages/*.js) — resolver mengembalikan array blok { section, ...data }
// yang dirender oleh `ui.render()` lewat `components[section](data)`.
// ============================================================

const web = {
    routes: {},   // diisi oleh masing-masing pages/*.js, mis. web.routes.produk = 'resolveProduk'

    gebi: (id) => document.getElementById(id),

    // ------------------------------------------------------------
    // FORM DRAWER — panel geser dari kanan, dipakai ulang oleh SEMUA
    // form tambah/edit (produk, kontak, lokasi, distribusi, transaksi).
    // Markup statis ada di index.html (#formDrawerOverlay/#formDrawerPanel).
    // ------------------------------------------------------------
    openDrawer: function (cfg) {
        const overlay = this.gebi('formDrawerOverlay');
        const panel   = this.gebi('formDrawerPanel');
        const titleEl = this.gebi('formDrawerTitle');
        const bodyEl  = this.gebi('formDrawerBody');
        if (!overlay || !panel || !bodyEl || !cfg) return;

        titleEl.textContent = cfg.title || cfg.subtitle || 'Form';
        bodyEl.innerHTML = cfg.bodyHtml !== undefined ? cfg.bodyHtml : components.genericForm(cfg);

        overlay.classList.add('open');
        panel.classList.add('open');
        document.body.classList.add('drawer-lock');
        if (typeof svg?.di === 'function') svg.di();
    },

    closeDrawer: function () {
        this.gebi('formDrawerOverlay')?.classList.remove('open');
        this.gebi('formDrawerPanel')?.classList.remove('open');
        document.body.classList.remove('drawer-lock');
    },

    /** Jembatan generik: buka drawer langsung dari config form { title, fields, onSubmit, submitText }. */
    openFormFromPage: function (cfg, opts = {}) {
        if (!cfg || !cfg.fields) { alert(opts.title || 'Tidak dapat membuka form'); return; }
        this.openDrawer({ ...cfg, title: opts.title || cfg.title || cfg.subtitle });
    },

    // ------------------------------------------------------------
    // ROUTING — mirip versi MOOC: slug -> resolver di `web.routes`,
    // slug yang tidak terdaftar otomatis dibaca dari `pages[slug]` statis
    // (lihat resolveContent). Semua resolver di sini di-await karena
    // sebagian besar mengambil data lewat db.js (fetch async ke Worker API).
    // ------------------------------------------------------------
    navigate: async function (slug) {
        this.closeDrawer();
        // Path asli, mis. "/editor/post_123" -> "editor/post_123". Kosong
        // (path "/") tidak pernah terjadi di sini karena worker.js hanya
        // menyajikan app.html untuk path admin yang reserved — tapi tetap
        // fallback ke 'dashboard' untuk jaga-jaga (mis. dibuka langsung
        // lewat file lokal saat development).
        const pathname = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
        const currentPath = slug || pathname || 'dashboard';
        const [targetSlug, subParam] = currentPath.split('/');

        let pageData = [];
        const resolverName = this.routes[targetSlug];
        // Resolver bisa terdaftar sebagai web.resolveXxx (mis. auth.js) ATAU
        // sebagai `function resolveXxx(){}` biasa di pages/*.js (otomatis
        // jadi window.resolveXxx) — cek keduanya, jangan cuma `this`.
        const resolverFn = this[resolverName] || window[resolverName];

        try {
            if (typeof resolverFn === 'function') {
                pageData = await Promise.resolve(resolverFn.call(this, subParam, targetSlug));
            } else {
                pageData = [{ section: 'titleHero', title: 'Halaman Tidak Ditemukan', description: `Rute <strong>${targetSlug}</strong> tidak dikenal.` }];
            }
        } catch (err) {
            console.error(err);
            pageData = [{ section: 'titleHero', title: 'Terjadi Kesalahan', description: err.message }];
        }

        await ui.render('content', pageData);

        if (slug !== undefined) {
            window.history.pushState({ path: currentPath }, '', `/${currentPath}`);
        }
        document.title = `Piawai Blog | ${targetSlug.toUpperCase()}`;
        window.scrollTo(0, 0);
        if (typeof svg?.di === 'function') svg.di();

        web.gebi('navLinks')?.classList.remove('active');
        document.querySelectorAll('.nav-parent.open').forEach(el => el.classList.remove('open'));
        return false;
    },

    /** Buka/tutup submenu dropdown (dipakai lewat klik, terutama di mobile;
     *  di desktop dropdown juga terbuka lewat hover via CSS — lihat style.css). */
    toggleSubmenu: function (labelEl) {
        const parent = labelEl.closest('.nav-parent');
        if (!parent) return;
        const wasOpen = parent.classList.contains('open');
        document.querySelectorAll('.nav-parent.open').forEach(el => el.classList.remove('open'));
        if (!wasOpen) parent.classList.add('open');
    },

};

// ============================================================
// COMPONENTS — komponen render (identik pola-nya dengan versi MOOC)
// ============================================================
const components = {

    lineRenderer: (lines = [], context = {}) => {
        const data = Array.isArray(lines) ? lines : [];
        let inCodeBlock = false;

        const handlers = {
            'form:': (val) => {
                if (val) {
                    try { const inlineCtx = JSON.parse(val); return components.genericForm(inlineCtx); }
                    catch (e) { return components.genericForm(context); }
                }
                return components.genericForm(context);
            },
            'link:': (val) => {
                const parts = val.split(':');
                return `<a href="javascript:void(0)" onclick="web.navigate('${parts.slice(1).join(':')}')" class="inline-link">${parts[0]} &raquo;</a>`;
            },
            'skill:': (val) => {
                const [percent, label, text] = val.split(':');
                return `<div class="skill-item">
                    <div class="skill-info"><strong>${label}</strong> ${text || ''} <small>(${percent})</small></div>
                    <div class="skill-track"><div class="skill-fill" style="width:${percent}"></div></div>
                </div>`;
            },
            'card:': (val) => {
                const [title, content] = val.split(':');
                return `<div class="info-card"><strong>${title}</strong><p>${content}</p></div>`;
            },
            'table:': (val) => {
                let dataTable = null;
                if (val) {
                    if (context[val] && Array.isArray(context[val])) dataTable = context[val];
                    else { try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) dataTable = parsed; } catch (e) { return `<div class="info-card">⚠ Format tabel salah</div>`; } }
                }
                if (!dataTable?.length) return context.emptyText ? `<div class="info-card">${context.emptyText}</div>` : '';
                return components.renderTable(dataTable, context.tableOpts || {});
            },
            'badge:': (val) => `<span class="badge">${val}</span>`,
            '### ': (val) => `<h3>${val}</h3>`,
            '## ':  (val) => `<h2>${val}</h2>`,
            '---':  () => '<hr>',
        };

        const out = [];
        let cardBuffer = [];
        const flushCards = () => {
            if (!cardBuffer.length) return;
            out.push(`<div class="info-card-row">${cardBuffer.join('')}</div>`);
            cardBuffer = [];
        };

        data.forEach(line => {
            if (typeof line !== 'string') { out.push(String(line)); return; }
            if (line.trim().startsWith('```')) {
                flushCards();
                if (!inCodeBlock) { inCodeBlock = true; out.push('<pre class="sv-code"><code>'); }
                else { inCodeBlock = false; out.push('</code></pre>'); }
                return;
            }
            if (inCodeBlock) { out.push(line.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '\n'); return; }

            let html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            if (html.startsWith('card:')) {
                cardBuffer.push(handlers['card:'](html.replace('card:', '').trim()));
                return;
            }
            flushCards();

            for (const [key, handler] of Object.entries(handlers)) {
                if (html.startsWith(key)) { out.push(handler(html.replace(key, '').trim())); return; }
            }
            out.push(`<div>${html}</div>`);
        });
        flushCards();

        return out.join('');
    },

    /** Form generik: dipakai oleh drawer tambah/edit di semua halaman bisnis.
     *  Class CSS yang dipakai (a-row, a-label, dynamic-form) BENAR-BENAR ada
     *  di style.css (lihat .form-drawer-body .dynamic-form / .a-row / .a-label). */
    genericForm: (ctx) => {
        const fields = (ctx.fields || []).map(f => {
            const fid  = f.id ? `id="${f.id}"` : '';
            const fval = f.value !== undefined && f.value !== null ? String(f.value) : '';
            const req  = f.required ? 'required' : '';
            const ph   = f.placeholder ? `placeholder="${f.placeholder}"` : '';

            if (f.type === 'hidden') return `<input type="hidden" ${fid} name="${f.name}" value="${fval}">`;

            const starMark = f.required ? ' <span style="color:var(--orange,#f90)">*</span>' : '';
            const label = f.label ? `<label class="a-label">${f.label}${starMark}</label>` : '';

            let input;
            const fname = f.name ? `name="${f.name}"` : '';

            if (f.type === 'select') {
                const opts = (f.options || []).map(o => {
                    const v   = typeof o === 'object' ? o.value : o;
                    const l   = typeof o === 'object' ? o.label : o;
                    const sel = String(fval) === String(v) ? 'selected' : '';
                    return `<option value="${v}" ${sel}>${l}</option>`;
                }).join('');
                input = `<select ${fid} ${fname} ${req}><option value="">— pilih —</option>${opts}</select>`;
            } else if (f.type === 'textarea') {
                input = `<textarea ${fid} ${fname} rows="${f.rows || 3}" ${ph} ${req}>${fval}</textarea>`;
            } else {
                const step = f.type === 'number' ? `step="${f.step || 'any'}"` : '';
                input = `<input type="${f.type || 'text'}" ${fid} ${fname} value="${fval}" ${ph} ${req} ${step}>`;
            }
            return `<div class="a-row">${label}${input}</div>`;
        }).join('');

        const onSubmit  = ctx.onSubmit || "event.preventDefault();";
        const submitBtn = ctx.noSubmitBtn ? '' : `<button type="submit" class="slcBtn">${ctx.submitText || 'Simpan'}</button>`;

        return `<form class="${ctx.wrapClass || 'dynamic-form'}" onsubmit="${onSubmit}">
            ${fields}
            ${submitBtn}
        </form>`;
    },

    titleHero: (d) => `
        <div class="row page">
            <div class="artikel">
                <h1>${d.title}</h1>
                ${d.description ? `<p>${d.description}</p>` : ''}
            </div>
        </div>`,

    hero: (d) => {
        const media = d.img
            ? `<img src="${d.img}" alt="${d.title}" class="img-hero">`
            : d.imgClass
                ? `<i style="max-width:300px;" class="${d.imgClass} kanan img"></i>`
                : '';
        return `
            <div class="row page hero">
                <div class="col-2-3 artikel">
                    <h1>${d.title}</h1><br>
                    <em>${d.tagline || ''}</em> &mdash; ${d.description || ''}<br><br>
                    ${(d.badges || []).map(b => `<span class="badge">${b}</span>`).join(' ')}
                    <br><br>
                    ${d.cta ? `<a href="?${d.cta.link}" onclick="return web.navigate('${d.cta.link}')" class="btn-cta">${d.cta.text}</a>` : ''}
                </div>
                <div class="col-1-3 artikel">${media}</div>
            </div>`;
    },

    features: (d) => `
        <div class="row gading">
            ${(d.items || []).map(item => `
                <div class="col-1-3 artikel">
                    <i class="${item.icon} simg"></i>
                    <span class="judul">${item.title}</span><br>
                    <p>${item.content}</p>
                    ${item.linkTarget ? `<a href="javascript:void(0)" onclick="web.navigate('${item.linkTarget}')">${item.linkText}</a>` : ''}
                </div>`).join('')}
        </div>`,

    article: (d) => `
        <div class="row page4">
            <div class="col-1-3 artikel">
                ${d.leftCol.subtitle ? `<h2>${d.leftCol.subtitle}</h2><hr>` : ''}
                ${components.lineRenderer(d.leftCol.lines || [], d.leftCol)}
            </div>
            <div class="col-2-3 artikel">
                ${d.rightCol.subtitle ? `<h2>${d.rightCol.subtitle}</h2><hr>` : ''}
                ${components.lineRenderer(d.rightCol.lines || [], d.rightCol)}
            </div>
        </div>`,

    /** Varian 'article' satu kolom lebar penuh — dipakai oleh semua halaman CRUD POS
     *  (daftar produk/kontak/lokasi/dst butuh lebar penuh untuk tabel). */
    articleFull: (d) => `
        <div class="row page4">
            <div class="col-1-1 artikel">
                ${d.subtitle ? `<h2>${d.subtitle}</h2><hr>` : ''}
                ${components.lineRenderer(d.lines || [], d)}
            </div>
        </div>`,

    /** Kartu statistik (KPI) — dipakai oleh dashboard. */
    statGrid: (d) => `
        <div class="row page4 artikel">
            <div class="stat-grid">
                ${(d.stats || []).map(s => `
                    <div class="stat-card">
                        <div class="stat-value">${s.value}</div>
                        <div class="stat-label">${s.label}</div>
                    </div>`).join('')}
            </div>
        </div>`,

    /** Bar chart SVG generik — dipakai oleh dashboard (mis. produk terlaris). */
    barChart: (d) => {
        const items  = d.items || [];
        const max    = Math.max(1, ...items.map(i => i.value));
        const barH = 28, gap = 10, leftW = 170, chartW = 380, topPad = 10;
        const height = items.length * (barH + gap) + topPad || (barH + topPad);

        const bars = items.map((it, i) => {
            const y = topPad + i * (barH + gap);
            const w = max ? (it.value / max) * chartW : 0;
            return `
                <text x="0" y="${y + barH / 2}" class="chart-label" text-anchor="start">${it.label}</text>
                <rect x="${leftW}" y="${y}" width="${w}" height="${barH}" class="chart-bar" rx="4"></rect>
                <text x="${leftW + w + 8}" y="${y + barH / 2}" class="chart-value">${it.value}</text>`;
        }).join('');

        return `
            <div class="row page4 artikel">
                <h3>${d.title || ''}</h3>
                <div class="chart-wrap">
                    ${items.length
                        ? `<svg class="chart-svg" viewBox="0 0 ${leftW + chartW + 60} ${height}">${bars}</svg>`
                        : '<p>Belum ada data untuk ditampilkan.</p>'}
                </div>
            </div>`;
    },

    /** Tabel generik — baris bisa berisi HTML mentah (mis. kolom "Aksi" dengan tombol Edit/Hapus). */
    renderTable: (dataTable, opts = {}) => {
        if (!dataTable?.length) return '';
        const allKeys  = Object.keys(dataTable[0]);
        const hidden   = new Set(opts.hiddenKeys || []);
        const keys     = opts.visibleKeys ? opts.visibleKeys.filter(k => !hidden.has(k)) : allKeys.filter(k => !hidden.has(k));
        const labels   = opts.labels || {};

        const head = keys.map(k => `<th>${labels[k] || k.toUpperCase()}</th>`).join('');
        const body = dataTable.map(row => `<tr>${keys.map(k => `<td>${row[k] ?? ''}</td>`).join('')}</tr>`).join('')
            || `<tr><td colspan="${keys.length}" style="text-align:center;color:var(--aColor)">Tidak ada data.</td></tr>`;

        return `<div class="table-container"><table>
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
        </table></div>`;
    },
};

// ============================================================
// UI — Render Engine
// ============================================================
const ui = {
    render: async (id, dataArray) => {
        const el = web.gebi(id);
        if (el && Array.isArray(dataArray)) {
            const rendered = await Promise.all(
                dataArray.map(d => Promise.resolve(components[d.section]?.(d) || ''))
            );
            el.innerHTML = rendered.join('');
        }
    },
};

window.addEventListener('load', () => web.navigate());
window.addEventListener('popstate', () => web.navigate());

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') web.closeDrawer?.();
});

document.addEventListener('click', (e) => {
    const burger = web.gebi('burgerBtn');
    const nav    = web.gebi('navLinks');
    if (burger?.contains(e.target)) {
        nav.classList.toggle('active');
        e.stopPropagation();
    } else if (nav?.classList.contains('active') && !nav.contains(e.target)) {
        nav.classList.remove('active');
    }

    if (!e.target.closest('.nav-parent')) {
        document.querySelectorAll('.nav-parent.open').forEach(el => el.classList.remove('open'));
    }
});
