// ============================================================
// pages/postingan.js — Daftar & kelola artikel milik blog yang login.
// ============================================================
web.routes.postingan = 'resolvePostingan';

async function resolvePostingan() {
    const guard = requireLogin(['owner', 'penulis']);
    if (guard) return guard;

    const user = auth.currentUser();
    const posts = (await db.query('post', () => true))
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    const rows = posts.map(p => ({
        judul: p.judul,
        status: p.status === 'publish' ? '&#9679; Publish' : '&#9675; Draft',
        views: p.views || 0,
        diperbarui: p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('id-ID') : '-',
        aksi: `<a href="javascript:void(0)" onclick="web.navigate('editor/${p.id}')">Edit</a>`
            + (p.status === 'publish' ? ` &middot; <a href="/${user.tenantKode}/${p.slug}" target="_blank" rel="noopener">Lihat</a>` : ''),
    }));

    return [
        {
            section: 'titleHero',
            title: 'Artikel Saya',
            description: `Blog Anda: <a href="/${user.tenantKode}" target="_blank" rel="noopener">piawai.id/${user.tenantKode}</a>`,
        },
        {
            section: 'articleFull',
            subtitle: `${posts.length} Artikel`,
            lines: [
                'link:+ Tulis Artikel Baru:editor',
                '---',
                'table:rows',
            ],
            rows,
            tableOpts: {
                visibleKeys: ['judul', 'status', 'views', 'diperbarui', 'aksi'],
                labels: { judul: 'Judul', status: 'Status', views: 'Dilihat', diperbarui: 'Diperbarui', aksi: 'Aksi' },
            },
            emptyText: 'Belum ada artikel. Mulai menulis yang pertama!',
        },
    ];
}
