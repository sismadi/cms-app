// ============================================================
// auth.js — Login berbasis "kode blog" (tenant, = slug URL publik)
// + username/password.
// ============================================================
// Sesi disimpan di localStorage (key: blogSession): { tenantId,
// tenantNama, tenantKode, userId, username, name, role }. Superadmin
// adalah tenant khusus (kodeToko 'superadmin', lihat seed di
// schema.sql) — dengan begini alur login TETAP SATU POLA untuk semua
// peran (owner/penulis/superadmin).
//
// kodeToko di sini RANGKAP PERAN: dipakai untuk login DAN sebagai slug
// URL publik blog (piawai.id/<kodeToko>) — makanya wajib url-safe.
// Validasi format & kata reserved dilakukan DI SINI (klien) sebagai
// UX utama, dan diulang di worker.js (server) sebagai jaring pengaman
// — lihat RESERVED_SLUGS & SLUG_RE di worker.js.
// ============================================================
const auth = {
    SESSION_KEY: 'blogSession',
    SUPERADMIN_KODE: 'superadmin',

    // Harus SAMA dengan RESERVED_SLUGS di worker.js — kalau menambah
    // path admin baru, perbarui juga daftar di worker.js.
    RESERVED_SLUGS: new Set([
        'login', 'register', 'dashboard', 'editor', 'postingan', 'profil',
        'tenant', 'app', 'api', 'pages', 'assets', 'static', 'admin',
        'tentang', 'cari', 'search',
    ]),
    SLUG_RE: /^[a-z0-9][a-z0-9-]{1,29}$/,

    currentUser() {
        try { return JSON.parse(localStorage.getItem(this.SESSION_KEY) || 'null'); }
        catch (e) { return null; }
    },

    isLoggedIn() { return !!this.currentUser(); },
    isSuperadmin() { return this.currentUser()?.role === 'superadmin'; },

    validateKodeBlog(kodeRaw) {
        const kode = String(kodeRaw || '').trim().toLowerCase();
        if (!this.SLUG_RE.test(kode)) return 'Kode blog harus 2-30 karakter: huruf kecil, angka, atau tanda strip (mis. "wawan" atau "catatan-wawan").';
        if (this.RESERVED_SLUGS.has(kode)) return `Kode blog "${kode}" tidak dapat dipakai (dipakai sistem).`;
        return null;
    },

    /** Login: cari tenant lewat kodeToko, lalu cocokkan username/password DI DALAM tenant tsb. */
    async login(kodeToko, username, password) {
        const kode = String(kodeToko || '').trim().toLowerCase();
        if (!kode || !username || !password) return 'Kode blog, username, dan password wajib diisi.';

        const tenants = await db.allTenants();
        const tenant = tenants.find(t => t.kodeToko.toLowerCase() === kode);
        if (!tenant) return 'Kode blog tidak ditemukan.';
        if (tenant.status === 'nonaktif') return 'Blog ini sedang dinonaktifkan. Hubungi superadmin.';

        const users = await db.allForTenant('users', tenant.id);
        const user = users.find(u => u.username === username && u.password === password);
        if (!user) return 'Username atau password salah.';

        localStorage.setItem(this.SESSION_KEY, JSON.stringify({
            tenantId: tenant.id, tenantNama: tenant.nama, tenantKode: tenant.kodeToko,
            userId: user.id, username: user.username, name: user.name, role: user.role,
        }));
        return null; // null = sukses
    },

    /**
     * Registrasi mandiri blog baru (self-service tenant + akun owner).
     * Mengembalikan string error, atau null kalau berhasil (langsung login).
     */
    async register({ kodeToko, namaToko, bio, ownerName, username, password }) {
        const kode = String(kodeToko || '').trim().toLowerCase();
        if (!kode || !namaToko || !ownerName || !username || !password) return 'Semua field bertanda * wajib diisi.';
        const slugErr = this.validateKodeBlog(kode);
        if (slugErr) return slugErr;
        if (password.length < 6) return 'Password minimal 6 karakter.';

        const tenants = await db.allTenants();
        if (tenants.some(t => t.kodeToko.toLowerCase() === kode)) return 'Kode blog sudah dipakai, gunakan kode lain.';

        let tenant;
        try {
            tenant = await db.insertTenant({
                kodeToko: kode, nama: namaToko, bio: bio || '', avatarUrl: null,
                status: 'aktif', createdAt: new Date().toISOString(),
            });
        } catch (e) { return e.message; }

        await db.insertForTenant('users', tenant.id, {
            username, password, name: ownerName, role: 'owner', createdAt: new Date().toISOString(),
        });

        return this.login(kode, username, password);
    },

    logout() {
        localStorage.removeItem(this.SESSION_KEY);
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate('login');
    },

    /** Dipanggil dari renderMenu() (app.html) tiap kali menu digambar ulang. */
    renderAuthUI() {
        const slot = web.gebi('authSlot');
        if (!slot) return;
        const user = this.currentUser();
        slot.innerHTML = user
            ? `<span class="auth-chip">
                   <i class="di-person img-24"></i>
                   <span class="auth-name">${user.name}${user.role !== 'superadmin' ? ' &middot; ' + (user.tenantNama || '') : ''}</span>
                   <span class="badge auth-role">${roleLabel(user.role)}</span>
               </span>
               ${user.role !== 'superadmin' ? `<a class="slcBtn" href="/${user.tenantKode}" target="_blank" rel="noopener">Lihat Blog</a>` : ''}
               <button class="slcBtn auth-logout" onclick="auth.logout()">Keluar</button>`
            : `<a href="javascript:void(0)" onclick="web.navigate('login')" class="auth-chip">
                   <i class="di-lock img-24"></i>
                   <span class="auth-name">Masuk</span>
               </a>`;
        if (typeof svg?.di === 'function') svg.di();
    },

    async handleLoginSubmit(form) {
        const kodeToko = form.querySelector('[name="kodeToko"]').value;
        const username = form.querySelector('[name="username"]').value.trim();
        const password = form.querySelector('[name="password"]').value;

        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
        const err = await this.login(kodeToko, username, password).catch(e => e.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }

        if (err) { alert(err); return; }
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate(this.isSuperadmin() ? 'tenant' : 'dashboard');
    },

    async handleRegisterSubmit(form) {
        const val = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() || '';
        const payload = {
            kodeToko: val('kodeToko'), namaToko: val('namaToko'), bio: val('bio'),
            ownerName: val('ownerName'), username: val('username'),
            password: form.querySelector('[name="password"]').value,
        };
        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Mendaftarkan...'; }
        const err = await this.register(payload).catch(e => e.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Daftar & Mulai'; }

        if (err) { alert(err); return; }
        alert(`Blog "${payload.namaToko}" berhasil dibuat di piawai.id/${payload.kodeToko.toLowerCase()}. Selamat menulis!`);
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate('dashboard');
    },
};

function roleLabel(role) {
    return { superadmin: 'Superadmin', owner: 'Pemilik Blog', penulis: 'Penulis' }[role] || role;
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
        { section: 'titleHero', title: 'Masuk ke Blog Anda', description: 'Masukkan kode blog, username, dan password.' },
        {
            section: 'articleFull',
            subtitle: 'Form Masuk',
            fields: [
                { type: 'text', name: 'kodeToko', label: 'Kode Blog', placeholder: 'mis. wawan', required: true },
                { type: 'text', name: 'username', label: 'Username', required: true },
                { type: 'password', name: 'password', label: 'Password', required: true },
            ],
            submitText: 'Masuk',
            onSubmit: 'event.preventDefault(); auth.handleLoginSubmit(this);',
            lines: [
                'form:',
                'link:Belum punya blog? Daftar di sini:register',
                '---',
                '**Demo:** Kode Blog `wawan`, username `wawan` / password `wawan123`.',
                'Superadmin: Kode Blog `superadmin`, username `superadmin` / password `super123`.',
            ],
        },
    ];
};

web.routes.register = 'resolveRegister';
web.resolveRegister = function () {
    if (auth.isLoggedIn()) return web.resolveLogin();
    return [
        { section: 'titleHero', title: 'Buat Blog Baru', description: 'Buat blog Anda sendiri dalam satu langkah — dapat alamat piawai.id/kode-anda.' },
        {
            section: 'articleFull',
            subtitle: 'Form Registrasi Blog',
            fields: [
                { type: 'text', name: 'kodeToko', label: 'Kode Blog (alamat URL)', placeholder: 'mis. wawan', required: true },
                { type: 'text', name: 'namaToko', label: 'Nama Tampilan / Nama Blog', required: true },
                { type: 'textarea', name: 'bio', label: 'Bio Singkat', rows: 2 },
                { type: 'text', name: 'ownerName', label: 'Nama Anda', required: true },
                { type: 'text', name: 'username', label: 'Username Login', required: true },
                { type: 'password', name: 'password', label: 'Password (min. 6 karakter)', required: true },
            ],
            submitText: 'Daftar & Mulai',
            onSubmit: 'event.preventDefault(); auth.handleRegisterSubmit(this);',
            lines: [
                'form:',
                'Kode blog akan menjadi alamat publik: piawai.id/kode-blog-anda. Hanya huruf kecil, angka, dan tanda strip.',
                'link:Sudah punya akun? Masuk di sini:login',
            ],
        },
    ];
};
