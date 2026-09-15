// ============================================================
// db.js — Lapisan akses data (fetch ke Worker API backend) + auto cms-scoping.
// ============================================================
// PERUBAHAN ARSITEKTUR (microservices, 2 repo terpisah):
//   - API_BASE sekarang ABSOLUT (bukan '/api' relatif lagi), karena
//     cms-app (frontend, repo ini) dan cms-api (backend) sekarang 2
//     origin/deployment TERPISAH (mis. frontend di GitHub Pages, backend
//     di Cloudflare Workers). ISI URL DI BAWAH sesuai hasil `wrangler
//     deploy` di repo cms-api.
//   - Semua parameter (table, id, cmsId) sekarang dikirim lewat QUERY
//     STRING ke satu endpoint `/api`, BUKAN path segment (`/api/table/id`)
//     seperti sebelumnya — konsisten dengan worker.js yang baru.
//   - SCOPED_TABLES diperbarui utk tabel CMS: users, post, komentar.
//   - cmsId tetap otomatis ditambahkan ke tiap request tabel scoped
//     dari sesi login aktif (lihat auth.js) — halaman (editor.js,
//     postingan.js, dst.) tidak perlu mengurus cmsId sendiri.
// ============================================================

// GANTI dengan URL hasil `wrangler deploy` di repo cms-api, tanpa slash
// di akhir. Contoh: 'https://cms-api.namaakun.workers.dev'
const API_BASE = 'https://cms-api.piawai.workers.dev';

const SCOPED_TABLES = new Set(['users', 'post', 'komentar']);

/** Bangun query string dari objek {key: value}, buang key yang kosong/undefined. */
function qs(params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null && v !== '') sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `?${s}` : '';
}

async function apiGet(params) {
    const res = await fetch(`${API_BASE}/api${qs(params)}`);
    if (!res.ok) {
        let msg = `GET /api gagal (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch (e) {}
        throw new Error(msg);
    }
    return res.json();
}

async function apiSend(method, params, body) {
    const res = await fetch(`${API_BASE}/api${qs(params)}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
        let msg = `${method} /api gagal (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch (e) {}
        throw new Error(msg);
    }
    return res.json();
}

/** Fetch ke endpoint /public (data siap-pakai untuk halaman publik, lihat pages/public.js). */
async function apiPublicGet(params) {
    const res = await fetch(`${API_BASE}/public${qs(params)}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `GET /public gagal (${res.status})`);
    return body;
}

async function apiPublicSend(method, params, body) {
    const res = await fetch(`${API_BASE}/public${qs(params)}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const resBody = await res.json().catch(() => null);
    if (!res.ok) throw new Error(resBody?.error || `${method} /public gagal (${res.status})`);
    return resBody;
}

function activeCmsId() {
    const user = (typeof auth !== 'undefined') ? auth.currentUser() : null;
    return user?.cmsId || null;
}

function requireCms() {
    const c = activeCmsId();
    if (!c) throw new Error('Tidak ada sesi aktif — silakan masuk kembali.');
    return c;
}

const db = {
    async all(table) {
        const params = { table };
        if (SCOPED_TABLES.has(table)) params.cmsId = requireCms();
        return apiGet(params);
    },

    async find(table, predicate) {
        const rows = await this.all(table);
        return rows.find(predicate) || null;
    },

    async query(table, predicate) {
        const rows = await this.all(table);
        return rows.filter(predicate);
    },

    async insert(table, row) {
        const body = { ...row };
        const params = { table };
        if (SCOPED_TABLES.has(table)) {
            const c = requireCms();
            body.cmsId = c;
            params.cmsId = c;
        }
        return apiSend('POST', params, body);
    },

    async update(table, id, patch) {
        const params = { table, id };
        if (SCOPED_TABLES.has(table)) params.cmsId = requireCms();
        return apiSend('PATCH', params, patch);
    },

    async remove(table, id) {
        const params = { table, id };
        if (SCOPED_TABLES.has(table)) params.cmsId = requireCms();
        await apiSend('DELETE', params);
        return true;
    },

    async upsertBy(table, matchFn, row) {
        const rows = await this.all(table);
        const existing = rows.find(matchFn);
        if (!existing) return this.insert(table, row);
        return this.update(table, existing.id, row);
    },

    // --- Jalur eksplisit lintas-CMS, HANYA untuk auth.js (login/registrasi) ---
    async allForCms(table, cmsId) {
        const params = { table };
        if (SCOPED_TABLES.has(table)) params.cmsId = cmsId;
        return apiGet(params);
    },

    async insertForCms(table, cmsId, row) {
        const body = { ...row };
        const params = { table };
        if (SCOPED_TABLES.has(table)) {
            body.cmsId = cmsId;
            params.cmsId = cmsId;
        }
        return apiSend('POST', params, body);
    },

    // --- Tabel `cms` sendiri TIDAK di-scope (global) ---
    async allCms() { return apiGet({ table: 'cms' }); },
    async insertCms(row) { return apiSend('POST', { table: 'cms' }, row); },
    async updateCms(id, patch) { return apiSend('PATCH', { table: 'cms', id }, patch); },

    // --- Data publik (beranda / profil CMS / artikel + komentar) ---
    async publicHome() { return apiPublicGet({ view: 'home' }); },
    async publicProfile(userSlug) { return apiPublicGet({ view: 'profile', user: userSlug }); },
    async publicArtikel(userSlug, slug) { return apiPublicGet({ view: 'artikel', user: userSlug, slug }); },
    async publicKomentar(userSlug, slug, komentar) {
        return apiPublicSend('POST', { view: 'komentar', user: userSlug, slug }, komentar);
    },
};
