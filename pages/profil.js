// ============================================================
// pages/profil.js — Edit profil blog (nama tampilan, bio, avatar).
// Catatan: kodeToko (slug URL) SENGAJA tidak bisa diubah dari sini —
// mengubahnya akan merusak tautan yang sudah dibagikan/terindex.
// ============================================================
web.routes.profil = 'resolveProfil';

async function resolveProfil() {
    const guard = requireLogin(['owner']);
    if (guard) return guard;

    const user = auth.currentUser();
    const tenants = await db.allTenants();
    const tenant = tenants.find(t => t.id === user.tenantId);
    if (!tenant) return [{ section: 'titleHero', title: 'Data Blog Tidak Ditemukan' }];

    return [
        {
            section: 'titleHero',
            title: 'Profil Blog',
            description: `Alamat blog: <a href="/${tenant.kodeToko}" target="_blank" rel="noopener">piawai.id/${tenant.kodeToko}</a> (tidak dapat diubah).`,
        },
        {
            section: 'articleFull',
            subtitle: 'Edit Profil',
            fields: [
                { type: 'text', name: 'nama', label: 'Nama Tampilan', value: tenant.nama, required: true },
                { type: 'textarea', name: 'bio', label: 'Bio Singkat', rows: 3, value: tenant.bio },
                { type: 'text', name: 'avatarUrl', label: 'URL Foto Profil (opsional)', value: tenant.avatarUrl },
            ],
            submitText: 'Simpan Profil',
            onSubmit: 'event.preventDefault(); profilPage.handleSubmit(this);',
            lines: ['form:'],
        },
    ];
}

const profilPage = {
    async handleSubmit(form) {
        const val = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() ?? '';
        const user = auth.currentUser();
        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
        try {
            await db.updateTenant(user.tenantId, {
                nama: val('nama'), bio: val('bio'), avatarUrl: val('avatarUrl') || null,
            });
            // Sinkronkan nama tampilan di sesi lokal supaya menu langsung terlihat update.
            const session = auth.currentUser();
            session.tenantNama = val('nama');
            localStorage.setItem(auth.SESSION_KEY, JSON.stringify(session));
        } catch (e) {
            alert(e.message);
            if (btn) { btn.disabled = false; btn.textContent = 'Simpan Profil'; }
            return;
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Simpan Profil'; }
        if (typeof renderMenu === 'function') renderMenu();
        alert('Profil blog tersimpan.');
        web.navigate('profil');
    },
};
