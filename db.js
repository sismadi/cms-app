// ============================================================
// db.js — Lapisan akses data (fetch ke Worker API) + auto tenant-scoping.
// ============================================================
// Sama seperti versi POS (all/find/query/insert/update/remove/upsertBy
// dipertahankan), TAPI:
//   - API_BASE sekarang RELATIF ('/api'), bukan absolute URL, karena
//     app admin & Worker API dideploy sebagai SATU origin (lihat
//     wrangler.toml [assets] di blog-api) — ini juga yang bikin SSR
//     halaman publik bisa berbagi domain yang sama dengan app admin.
//   - SCOPED_TABLES diperbarui utk tabel blog: users, post, komentar.
//   - tenantId tetap otomatis ditambahkan ke tiap request tabel scoped
//     dari sesi login aktif (lihat auth.js) — halaman (editor.js,
//     postingan.js, dst.) tidak perlu mengurus tenantId sendiri.
// ============================================================
const API_BASE = '/api';

const SCOPED_TABLES = new Set(['users', 'post', 'komentar']);

async function apiGet(path) {
    const res = await fetch(`${API_BASE}/${path}`);
    if (!res.ok) {
        let msg = `GET ${path} gagal (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch (e) {}
        throw new Error(msg);
    }
    return res.json();
}

async function apiSend(method, path, body) {
    const res = await fetch(`${API_BASE}/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
        let msg = `${method} ${path} gagal (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch (e) {}
        throw new Error(msg);
    }
    return res.json();
}

function activeTenantId() {
    const user = (typeof auth !== 'undefined') ? auth.currentUser() : null;
    return user?.tenantId || null;
}

function requireTenant() {
    const t = activeTenantId();
    if (!t) throw new Error('Tidak ada sesi aktif — silakan masuk kembali.');
    return t;
}

const db = {
    async all(table) {
        let path = table;
        if (SCOPED_TABLES.has(table)) path += `?tenantId=${encodeURIComponent(requireTenant())}`;
        return apiGet(path);
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
        let path = table;
        if (SCOPED_TABLES.has(table)) {
            const t = requireTenant();
            body.tenantId = t;
            path += `?tenantId=${encodeURIComponent(t)}`;
        }
        return apiSend('POST', path, body);
    },

    async update(table, id, patch) {
        let path = `${table}/${id}`;
        if (SCOPED_TABLES.has(table)) path += `?tenantId=${encodeURIComponent(requireTenant())}`;
        return apiSend('PATCH', path, patch);
    },

    async remove(table, id) {
        let path = `${table}/${id}`;
        if (SCOPED_TABLES.has(table)) path += `?tenantId=${encodeURIComponent(requireTenant())}`;
        await apiSend('DELETE', path);
        return true;
    },

    async upsertBy(table, matchFn, row) {
        const rows = await this.all(table);
        const existing = rows.find(matchFn);
        if (!existing) return this.insert(table, row);
        return this.update(table, existing.id, row);
    },

    // --- Jalur eksplisit lintas-tenant, HANYA untuk auth.js (login/registrasi) ---
    async allForTenant(table, tenantId) {
        let path = table;
        if (SCOPED_TABLES.has(table)) path += `?tenantId=${encodeURIComponent(tenantId)}`;
        return apiGet(path);
    },

    async insertForTenant(table, tenantId, row) {
        const body = { ...row };
        let path = table;
        if (SCOPED_TABLES.has(table)) {
            body.tenantId = tenantId;
            path += `?tenantId=${encodeURIComponent(tenantId)}`;
        }
        return apiSend('POST', path, body);
    },

    // --- Tabel `tenants` sendiri TIDAK di-scope (global) ---
    async allTenants() { return apiGet('tenants'); },
    async insertTenant(row) { return apiSend('POST', 'tenants', row); },
    async updateTenant(id, patch) { return apiSend('PATCH', `tenants/${id}`, patch); },
};
