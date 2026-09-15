// ============================================================
// pages/tenant.js — Superadmin: kelola daftar blog (aktifkan/nonaktifkan).
// Sama seperti pola versi POS, tapi terminologi "toko" -> "blog".
// ============================================================
web.routes.tenant = 'resolveTenant';

async function resolveTenant() {
    const guard = requireLogin(['superadmin']);
    if (guard) return guard;

    const tenants = (await db.allTenants()).filter(t => t.id !== 'system');

    const rows = tenants.map(t => ({
        nama: t.nama,
        kodeBlog: t.kodeToko,
        status: t.status === 'aktif' ? '&#9679; Aktif' : '&#9675; Nonaktif',
        dibuat: t.createdAt ? new Date(t.createdAt).toLocaleDateString('id-ID') : '-',
        aksi: `<a href="/${t.kodeToko}" target="_blank" rel="noopener">Lihat</a>`
            + ` &middot; <a href="javascript:void(0)" onclick="tenantPage.toggleStatus('${t.id}','${t.status}')">${t.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}</a>`,
    }));

    return [
        { section: 'titleHero', title: 'Kelola Blog', description: `${tenants.length} blog terdaftar.` },
        {
            section: 'articleFull',
            subtitle: 'Daftar Blog',
            lines: ['table:rows'],
            rows,
            tableOpts: {
                visibleKeys: ['nama', 'kodeBlog', 'status', 'dibuat', 'aksi'],
                labels: { nama: 'Nama', kodeBlog: 'Kode/URL', status: 'Status', dibuat: 'Dibuat', aksi: 'Aksi' },
            },
            emptyText: 'Belum ada blog terdaftar.',
        },
    ];
}

const tenantPage = {
    async toggleStatus(tenantId, currentStatus) {
        const next = currentStatus === 'aktif' ? 'nonaktif' : 'aktif';
        if (!confirm(`Ubah status blog ini menjadi "${next}"?`)) return;
        await db.updateTenant(tenantId, { status: next });
        web.navigate('tenant');
    },
};
