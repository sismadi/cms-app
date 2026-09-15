// ============================================================
// auth.js — Login berbasis "kode CMS" (= slug URL publik)
// + username/password.
// ============================================================
// Sesi disimpan di localStorage (key: cmsSession): { cmsId,
// cmsNama, cmsKode, userId, username, name, role }. Superadmin
// adalah CMS khusus (kodeCms 'superadmin', lihat seed di
// schema.sql) — dengan begini alur login TETAP SATU POLA untuk semua
// peran (owner/penulis/superadmin).
//
// kodeCms di sini RANGKAP PERAN: dipakai untuk login DAN sebagai NILAI
// URL profil publik (?profile/<kodeCms>) & artikel (?user/<kodeCms>/<slug>)
// — wajib url-safe.
//
// CATATAN ARSITEKTUR: versi sebelumnya (routing path) perlu daftar
// RESERVED_SLUGS supaya kodeCms tidak bentrok dengan path admin seperti
// /dashboard atau /editor. Di routing query string sekarang, kodeCms
// TIDAK PERNAH jadi bagian nama rute (`?page=`) — dia cuma NILAI di
// dalam query string publik (`?profile/...`, `?user/.../...`), jadi
// tidak mungkin bentrok dengan `?page=dashboard` dkk. Reserved-word
// check jadi tidak diperlukan lagi; validasi cukup format url-safe saja.
// Diulang juga di worker.js (SLUG_RE) sebagai jaring pengaman server-side.
// ============================================================
const auth = {
    SESSION_KEY: 'cmsSession',
    SUPERADMIN_KODE: 'superadmin',

    SLUG_RE: /^[a-z0-9][a-z0-9-]{1,29}$/,

    currentUser() {
        try { return JSON.parse(localStorage.getItem(this.SESSION_KEY) || 'null'); }
        catch (e) { return null; }
    },

    isLoggedIn() { return !!this.currentUser(); },
    isSuperadmin() { return this.currentUser()?.role === 'superadmin'; },

    validateKodeCms(kodeRaw) {
        const kode = String(kodeRaw || '').trim().toLowerCase();
        if (!this.SLUG_RE.test(kode)) return 'Kode CMS harus 2-30 karakter: huruf kecil, angka, atau tanda strip (mis. "wawan" atau "catatan-wawan").';
        return null;
    },

    /** Login: cari CMS lewat kodeCms, lalu cocokkan username/password DI DALAM CMS tsb. */
    async login(kodeCms, username, password) {
        const kode = String(kodeCms || '').trim().toLowerCase();
        if (!kode || !username || !password) return 'Kode CMS, username, dan password wajib diisi.';

        const daftarCms = await db.allCms();
        const cms = daftarCms.find(c => c.kodeCms.toLowerCase() === kode);
        if (!cms) return 'Kode CMS tidak ditemukan.';
        if (cms.status === 'nonaktif') return 'CMS ini sedang dinonaktifkan. Hubungi superadmin.';

        const users = await db.allForCms('users', cms.id);
        const user = users.find(u => u.username === username && u.password === password);
        if (!user) return 'Username atau password salah.';

        localStorage.setItem(this.SESSION_KEY, JSON.stringify({
            cmsId: cms.id, cmsNama: cms.nama, cmsKode: cms.kodeCms,
            userId: user.id, username: user.username, name: user.name, role: user.role,
        }));
        return null; // null = sukses
    },

    /**
     * Registrasi mandiri CMS baru (self-service akun CMS + akun owner).
     * Mengembalikan string error, atau null kalau berhasil (langsung login).
     */
    async register({ kodeCms, namaCms, bio, ownerName, username, password }) {
        const kode = String(kodeCms || '').trim().toLowerCase();
        if (!kode || !namaCms || !ownerName || !username || !password) return 'Semua field bertanda * wajib diisi.';
        const slugErr = this.validateKodeCms(kode);
        if (slugErr) return slugErr;
        if (password.length < 6) return 'Password minimal 6 karakter.';

        const daftarCms = await db.allCms();
        if (daftarCms.some(c => c.kodeCms.toLowerCase() === kode)) return 'Kode CMS sudah dipakai, gunakan kode lain.';

        let cms;
        try {
            cms = await db.insertCms({
                kodeCms: kode, nama: namaCms, bio: bio || '', avatarUrl: null,
                status: 'aktif', createdAt: new Date().toISOString(),
            });
        } catch (e) { return e.message; }

        await db.insertForCms('users', cms.id, {
            username, password, name: ownerName, role: 'owner', createdAt: new Date().toISOString(),
        });

        return this.login(kode, username, password);
    },

    logout() {
        localStorage.removeItem(this.SESSION_KEY);
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate('login');
    },

    /** Dipanggil dari renderMenu() (index.html) tiap kali menu digambar ulang. */
    renderAuthUI() {
        const slot = web.gebi('authSlot');
        if (!slot) return;
        const user = this.currentUser();
        slot.innerHTML = user
            ? `<span class="auth-chip">
                   <i class="di-person img-24"></i>
                   <span class="auth-name">${user.name}${user.role !== 'superadmin' ? ' &middot; ' + (user.cmsNama || '') : ''}</span>
                   <span class="badge auth-role">${roleLabel(user.role)}</span>
               </span>
               ${user.role !== 'superadmin' ? `<a class="slcBtn" href="${web.href(`profile/${user.cmsKode}`)}" target="_blank" rel="noopener">Lihat CMS</a>` : ''}
               <button class="slcBtn auth-logout" onclick="auth.logout()">Keluar</button>`
            : `<a href="javascript:void(0)" onclick="web.navigate('login')" class="auth-chip">
                   <i class="di-lock img-24"></i>
                   <span class="auth-name">Masuk</span>
               </a>`;
        if (typeof svg?.di === 'function') svg.di();
    },

    async handleLoginSubmit(form) {
        const kodeCms = form.querySelector('[name="kodeCms"]').value;
        const username = form.querySelector('[name="username"]').value.trim();
        const password = form.querySelector('[name="password"]').value;

        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
        const err = await this.login(kodeCms, username, password).catch(e => e.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }

        if (err) { alert(err); return; }
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate(this.isSuperadmin() ? 'cms' : 'dashboard');
    },

    async handleRegisterSubmit(form) {
        const val = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() || '';
        const payload = {
            kodeCms: val('kodeCms'), namaCms: val('namaCms'), bio: val('bio'),
            ownerName: val('ownerName'), username: val('username'),
            password: form.querySelector('[name="password"]').value,
        };
        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Mendaftarkan...'; }
        const err = await this.register(payload).catch(e => e.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Daftar & Mulai'; }

        if (err) { alert(err); return; }
        alert(`CMS "${payload.namaCms}" berhasil dibuat di cms.piawai.id/?profile/${payload.kodeCms.toLowerCase()}. Selamat menulis!`);
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate('dashboard');
    },
};

function roleLabel(role) {
    return { superadmin: 'Superadmin', owner: 'Pemilik CMS', penulis: 'Penulis' }[role] || role;
}

/** Guard: dipanggil di awal resolver halaman yang butuh login (lihat pages/*.js). */
function requireLogin(allowedRoles) {
    const user = auth.currentUser();
    if (!user) {
        return [{ section: 'titleHero', title: 'Perlu Masuk',
                   description: `Silakan <a href="javascript:void(0)" onclick="web.navigate(&#39;login&#39;)">masuk</a> terlebih dahulu untuk mengakses halaman ini.` }];
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return [{ section: 'titleHero', title: 'Akses Ditolak',
                   description: 'Peran akun Anda tidak memiliki izin untuk membuka halaman ini.' }];
    }
    return null; // null = boleh lanjut
}

web.routes.login = 'resolveLogin';
web.resolveLogin = function () {
    if (auth.isLoggedIn()) {
        return [{ section: 'titleHero', title: 'Anda Sudah Masuk',
                   description: `Masuk sebagai <strong>${auth.currentUser().name}</strong>.` }];
    }
    return [
        { section: 'titleHero', title: 'Masuk ke CMS Anda', description: 'Masukkan kode CMS, username, dan password.' },
        {
            section: 'articleFull',
            subtitle: 'Form Masuk',
            fields: [
                { type: 'text', name: 'kodeCms', label: 'Kode CMS', placeholder: 'mis. wawan', required: true },
                { type: 'text', name: 'username', label: 'Username', required: true },
                { type: 'password', name: 'password', label: 'Password', required: true },
            ],
            submitText: 'Masuk',
            onSubmit: 'event.preventDefault(); auth.handleLoginSubmit(this);',
            lines: [
                'form:',
                'link:Belum punya CMS? Daftar di sini:register',
                '---',
                '**Demo:** Kode CMS `wawan`, username `wawan` / password `wawan123`.',
                'Superadmin: Kode CMS `superadmin`, username `superadmin` / password `super123`.',
            ],
        },
    ];
};

web.routes.register = 'resolveRegister';
web.resolveRegister = function () {
    if (auth.isLoggedIn()) return web.resolveLogin();
    return [
        { section: 'titleHero', title: 'Buat CMS Baru', description: 'Buat CMS Anda sendiri dalam satu langkah — dapat alamat cms.piawai.id/?profile/kode-anda.' },
        {
            section: 'articleFull',
            subtitle: 'Form Registrasi CMS',
            fields: [
                { type: 'text', name: 'kodeCms', label: 'Kode CMS (alamat URL)', placeholder: 'mis. wawan', required: true },
                { type: 'text', name: 'namaCms', label: 'Nama Tampilan / Nama CMS', required: true },
                { type: 'textarea', name: 'bio', label: 'Bio Singkat', rows: 2 },
                { type: 'text', name: 'ownerName', label: 'Nama Anda', required: true },
                { type: 'text', name: 'username', label: 'Username Login', required: true },
                { type: 'password', name: 'password', label: 'Password (min. 6 karakter)', required: true },
            ],
            submitText: 'Daftar & Mulai',
            onSubmit: 'event.preventDefault(); auth.handleRegisterSubmit(this);',
            lines: [
                'form:',
                'Kode CMS akan menjadi alamat publik: cms.piawai.id/?profile/kode-cms-anda. Hanya huruf kecil, angka, dan tanda strip.',
                'link:Sudah punya akun? Masuk di sini:login',
            ],
        },
    ];
};
