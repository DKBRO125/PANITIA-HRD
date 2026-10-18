/* =========================================================
   PANITIA HUB — script.js
   Website statis tanpa backend. Seluruh data disimpan di
   localStorage browser ini (tidak tersinkron antarperangkat).

   Daftar isi:
   1. Konfigurasi & data awal   (ubah data contoh di sini)
   2. Penyimpanan (localStorage) & validasi data
   3. Utilitas (tanggal, escape HTML, toast, dialog)
   4. Logika progres
   5. Render tiap halaman
   6. Form & aksi (tambah / edit / hapus)
   7. Ekspor, impor, data.json bersama, reset, cetak
   8. Navigasi & event
   ========================================================= */
(function () {
  'use strict';

  /* =======================================================
     1. KONFIGURASI & DATA AWAL
     ======================================================= */
  const STORAGE_KEY = 'panitiahub.v1';
  const DATA_VERSION = 1;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // batas ukuran berkas impor: 2 MB
  const MAX_ITEMS = 1000;                    // batas jumlah item per daftar saat impor
  const MAX_ACTIVITIES = 30;                 // jumlah aktivitas terbaru yang disimpan
  const SEED_URL = 'data.json';                // data awal bersama (opsional) — diunggah admin ke GitHub
  const SEED_ID_KEY = STORAGE_KEY + '.seedId'; // penanda versi data.json yang terakhir diproses browser ini
  const SEED_TIMEOUT_MS = 4000;                // batas waktu menunggu data.json

  const TASK_STATUSES = ['Belum Dimulai', 'Sedang Dikerjakan', 'Menunggu Pemeriksaan', 'Selesai', 'Terhambat'];
  const TIMELINE_STATUSES = ['Belum Dijadwalkan', 'Belum Dimulai', 'Sedang Dikerjakan', 'Selesai', 'Terhambat'];
  const MEETING_STATUSES = ['Terjadwal', 'Selesai', 'Dibatalkan'];
  const MEMBER_ROLES = ['Koordinator', 'Anggota'];
  const ALL_DIVISIONS = 'Semua Divisi';

  const VIEWS = {
    dashboard: 'Dashboard',
    jobdesk: 'Jobdesk Panitia',
    rapat: 'Jadwal Rapat',
    timeline: 'Timeline Kegiatan',
    divisi: 'Data Divisi'
  };

  // Divisi beserta tanggung jawabnya (tampil di halaman Data Divisi).
  const DIVISIONS = [
    {
      id: 'PO', label: 'Project Officer (PO)',
      summary: 'Pengarah kegiatan dan penghubung seluruh divisi.',
      duties: ['Mengatur timeline.', 'Memimpin rapat.', 'Memantau progres.', 'Mengoordinasikan semua divisi.']
    },
    {
      id: 'Sekretaris', label: 'Sekretaris',
      summary: 'Pengelola administrasi dan arsip keuangan.',
      duties: ['Membuat notulen.', 'Mengelola presensi.', 'Mengumpulkan RAB.', 'Mengarsipkan bukti transaksi.']
    },
    {
      id: 'Acara', label: 'Acara',
      summary: 'Perancang isi dan jalannya acara.',
      duties: ['Menyusun konsep dan tema.', 'Membuat rundown.', 'Menentukan MC atau moderator.', 'Menyusun naskah acara.']
    },
    {
      id: 'PDD', label: 'PDD',
      summary: 'Pembuat materi visual dan publikasi kegiatan.',
      duties: ['Membuat poster.', 'Menyiapkan dokumentasi.', 'Membuat konten publikasi.', 'Menyusun siaran pers.']
    },
    {
      id: 'Konsumsi', label: 'Konsumsi',
      summary: 'Penyedia dan pengatur konsumsi kegiatan.',
      duties: ['Mendata kebutuhan konsumsi.', 'Mengatur menu dan jumlah.', 'Mengatur distribusi konsumsi.']
    },
    {
      id: 'Perkab', label: 'Perkab',
      summary: 'Penyedia perlengkapan dan fasilitas kegiatan.',
      duties: ['Mendata perlengkapan.', 'Mengatur kebutuhan fasilitas.', 'Mengelola peminjaman atau pengadaan barang.']
    }
  ];

  /*
    DATA AWAL — semua nama, tugas, dan tanggal di bawah hanyalah CONTOH.
    Ubah langsung di sini, lalu gunakan "Reset ke data awal" di menu Kelola Data.
    Tanggal pelaksanaan kegiatan utama SENGAJA tidak diisi (belum ditentukan).
    Format tanggal: 'YYYY-MM-DD'. Deadline kosong ('') = belum dijadwalkan.
  */
  function createDefaultData() {
    let n = 0;
    const next = (prefix) => prefix + '-' + (++n);

    const member = (name, division, role) => ({ id: next('mb'), name, division, role });
    const task = (name, division, owner, deadline, status, progress) =>
      ({ id: next('tk'), name, division, owner, deadline, status, progress });
    const meeting = (date, time, agenda, location, status, notes) =>
      ({ id: next('rp'), date, time, agenda, location, status, notes });
    const stage = (name, description, owner, deadline, status, progress) =>
      ({ id: next('tl'), name, description, owner, deadline, status, progress });
    const activity = (text, time) => ({ id: next('ac'), text, time });

    return {
      activity: { name: 'Program Sosial Kepanitiaan', status: 'Persiapan' },

      members: [
        member('Raka Pratama', 'PO', 'Koordinator'),
        member('Salsabila Putri', 'PO', 'Anggota'),
        member('Nadia Safitri', 'Sekretaris', 'Koordinator'),
        member('Dimas Anggara', 'Sekretaris', 'Anggota'),
        member('Alya Ramadhani', 'Acara', 'Koordinator'),
        member('Fajar Nugroho', 'Acara', 'Anggota'),
        member('Putri Maharani', 'Acara', 'Anggota'),
        member('Bagas Wicaksono', 'PDD', 'Koordinator'),
        member('Citra Lestari', 'PDD', 'Anggota'),
        member('Rizky Maulana', 'PDD', 'Anggota'),
        member('Intan Permata', 'Konsumsi', 'Koordinator'),
        member('Yoga Saputra', 'Konsumsi', 'Anggota'),
        member('Hendra Kusuma', 'Perkab', 'Koordinator'),
        member('Maya Anggraini', 'Perkab', 'Anggota')
      ],

      tasks: [
        task('Membentuk grup koordinasi panitia', 'PO', 'Salsabila Putri', '2026-10-18', 'Selesai', 100),
        task('Membagi jobdesk seluruh divisi', 'PO', 'Raka Pratama', '2026-10-20', 'Sedang Dikerjakan', 80),
        task('Menyusun timeline persiapan kegiatan', 'PO', 'Raka Pratama', '2026-10-21', 'Sedang Dikerjakan', 60),
        task('Menyusun daftar mitra dan pihak yang dihubungi', 'PO', 'Salsabila Putri', '2026-10-28', 'Belum Dimulai', 0),

        task('Membuat notulen rapat pertama', 'Sekretaris', 'Nadia Safitri', '2026-10-20', 'Sedang Dikerjakan', 40),
        task('Menyusun template presensi rapat', 'Sekretaris', 'Dimas Anggara', '2026-10-22', 'Menunggu Pemeriksaan', 100),
        task('Mengumpulkan RAB dari setiap divisi', 'Sekretaris', 'Nadia Safitri', '2026-11-05', 'Belum Dimulai', 0),

        task('Menyusun konsep dan tema kegiatan', 'Acara', 'Alya Ramadhani', '2026-10-27', 'Sedang Dikerjakan', 35),
        task('Membuat draf rundown kegiatan', 'Acara', 'Fajar Nugroho', '2026-11-03', 'Belum Dimulai', 0),
        task('Menentukan MC atau moderator', 'Acara', 'Putri Maharani', '2026-11-10', 'Belum Dimulai', 0),

        task('Menyusun identitas visual dan poster', 'PDD', 'Bagas Wicaksono', '2026-11-02', 'Sedang Dikerjakan', 25),
        task('Membuat rencana konten publikasi', 'PDD', 'Citra Lestari', '2026-10-30', 'Terhambat', 20),
        task('Menyiapkan tim dokumentasi', 'PDD', 'Rizky Maulana', '2026-11-12', 'Belum Dimulai', 0),

        task('Mendata kebutuhan konsumsi', 'Konsumsi', 'Intan Permata', '2026-11-06', 'Belum Dimulai', 0),
        task('Survei vendor konsumsi', 'Konsumsi', 'Yoga Saputra', '2026-11-09', 'Sedang Dikerjakan', 10),

        task('Mendata kebutuhan perlengkapan', 'Perkab', 'Hendra Kusuma', '2026-10-31', 'Sedang Dikerjakan', 45),
        task('Mengecek ketersediaan fasilitas dan peminjaman barang', 'Perkab', 'Maya Anggraini', '2026-11-13', 'Belum Dimulai', 0)
      ],

      meetings: [
        meeting('2026-10-18', '19:30', 'Rapat pertama: kickoff, pengenalan divisi, dan pembagian jobdesk',
          'Online (tautan dibagikan di grup)', 'Terjadwal', ''),
        meeting('2026-10-22', '19:30', 'Rapat koordinasi: konsep kegiatan dan kebutuhan teknis',
          'Online (contoh)', 'Terjadwal', 'Contoh jadwal — dapat diedit.'),
        meeting('2026-10-25', '19:30', 'Rapat evaluasi progres tiap divisi',
          'Online (contoh)', 'Terjadwal', 'Contoh jadwal — dapat diedit.')
      ],

      // Deadline hanya diisi untuk tahap persiapan awal sebagai contoh.
      // Tahap yang bergantung pada tanggal acara dibiarkan "Belum Dijadwalkan".
      timeline: [
        stage('Kickoff dan pembagian jobdesk', 'Rapat pertama, pengenalan divisi, dan pembagian tugas.', 'PO', '2026-10-18', 'Sedang Dikerjakan', 70),
        stage('Penyusunan konsep kegiatan', 'Menentukan tema, tujuan, sasaran, dan bentuk program sosial.', 'Acara', '2026-10-27', 'Sedang Dikerjakan', 30),
        stage('Penentuan kebutuhan teknis', 'Mendata kebutuhan tempat, perlengkapan, dan dukungan teknis.', 'Perkab', '2026-11-03', 'Belum Dimulai', 0),
        stage('Penyusunan rundown dan anggaran', 'Menyusun rundown dan RAB berdasarkan masukan semua divisi.', 'Sekretaris', '2026-11-10', 'Belum Dimulai', 0),
        stage('Persiapan publikasi', 'Poster, konten media sosial, dan siaran pers.', 'PDD', '', 'Belum Dijadwalkan', 0),
        stage('Pengadaan konsumsi dan perlengkapan', 'Memesan konsumsi serta meminjam atau mengadakan perlengkapan.', ALL_DIVISIONS, '', 'Belum Dijadwalkan', 0),
        stage('Pemeriksaan kesiapan', 'Pengecekan akhir kesiapan seluruh divisi sebelum hari pelaksanaan.', 'PO', '', 'Belum Dijadwalkan', 0),
        stage('Pelaksanaan kegiatan', 'Hari pelaksanaan program sosial. Tanggal belum ditentukan.', ALL_DIVISIONS, '', 'Belum Dijadwalkan', 0),
        stage('Evaluasi dan laporan akhir', 'Rapat evaluasi, laporan kegiatan, dan laporan keuangan.', 'PO', '', 'Belum Dijadwalkan', 0)
      ],

      activities: [
        activity('Salsabila Putri membentuk grup koordinasi panitia', '2026-10-17T20:15:00'),
        activity('Raka Pratama mulai membagi jobdesk seluruh divisi', '2026-10-17T21:40:00'),
        activity('Dimas Anggara mengajukan template presensi untuk diperiksa', '2026-10-18T08:05:00'),
        activity('Citra Lestari menandai rencana konten publikasi sebagai terhambat', '2026-10-18T09:30:00')
      ]
    };
  }

  /* =======================================================
     2. PENYIMPANAN & VALIDASI DATA
     ======================================================= */
  let state;
  let startupNotice = '';
  let startedFresh = false; // true bila browser ini belum punya data tersimpan yang valid
  let storageWarned = false;

  function loadState() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      startupNotice = 'Penyimpanan browser tidak dapat diakses. Perubahan hanya bertahan selama halaman terbuka.';
      startedFresh = true;
      return createDefaultData();
    }
    if (raw === null) { startedFresh = true; return createDefaultData(); }

    try {
      const result = validateData(JSON.parse(raw));
      if (result.ok) return result.data;
      throw new Error(result.error);
    } catch (err) {
      // Simpan salinan data rusak agar tidak hilang, lalu pakai data awal.
      try { window.localStorage.setItem(STORAGE_KEY + '.rusak', raw); } catch (e) { /* abaikan */ }
      startupNotice = 'Data tersimpan tidak valid, jadi data awal dimuat. (' + err.message + ')';
      startedFresh = true;
      return createDefaultData();
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      if (!storageWarned) {
        storageWarned = true;
        toast('Penyimpanan browser tidak tersedia atau penuh. Gunakan Ekspor JSON agar data tidak hilang.', 'warn', 8000);
      }
    }
  }

  // ----- Validasi & pembersihan (dipakai untuk localStorage dan impor JSON) -----
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function readText(obj, key, label, opts) {
    const o = opts || {};
    let v = obj[key];
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') throw new Error(label + ': kolom "' + key + '" harus berupa teks.');
    v = v.trim();
    if (o.required && !v) throw new Error(label + ': kolom "' + key + '" wajib diisi.');
    if (v.length > (o.max || 200)) throw new Error(label + ': kolom "' + key + '" terlalu panjang (maksimal ' + (o.max || 200) + ' karakter).');
    return v;
  }

  function readChoice(obj, key, label, list, fallback) {
    const v = obj[key];
    if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback;
    if (!list.includes(v)) {
      throw new Error(label + ': nilai "' + key + '" tidak dikenali (' + JSON.stringify(v) + '). Pilihan: ' + list.join(', ') + '.');
    }
    return v;
  }

  function readDate(obj, key, label, required) {
    const v = obj[key] === undefined || obj[key] === null ? '' : obj[key];
    if (v === '' && !required) return '';
    if (!isValidDate(v)) throw new Error(label + ': kolom "' + key + '" harus berformat YYYY-MM-DD yang valid.');
    return v;
  }

  function readProgress(obj, label) {
    const v = obj.progress === undefined || obj.progress === null ? 0 : obj.progress;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(label + ': kolom "progress" harus berupa angka 0–100.');
    return clampPercent(v);
  }

  function readList(payload, key, label, required) {
    const arr = payload[key];
    if (arr === undefined && !required) return [];
    if (!Array.isArray(arr)) throw new Error('Data ' + label + ' ("' + key + '") tidak ditemukan atau bukan daftar.');
    if (arr.length > MAX_ITEMS) throw new Error('Data ' + label + ' terlalu banyak (maksimal ' + MAX_ITEMS + ' item).');
    return arr;
  }

  function makeIdKeeper() {
    const used = new Set();
    return function (candidate, prefix) {
      let id = typeof candidate === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(candidate) ? candidate : '';
      if (!id || used.has(id)) id = uid(prefix);
      used.add(id);
      return id;
    };
  }

  function sanitizeData(raw) {
    if (!isObject(raw)) throw new Error('Isi berkas harus berupa objek JSON.');
    if (raw.app !== undefined && raw.app !== 'PANITIA HUB') throw new Error('Berkas ini bukan hasil ekspor PANITIA HUB.');
    if (typeof raw.version === 'number' && raw.version > DATA_VERSION) throw new Error('Versi data lebih baru daripada yang didukung website ini.');

    const payload = isObject(raw.data) ? raw.data : raw; // mendukung format ekspor ({data: …}) maupun data langsung
    const keepId = makeIdKeeper();
    const divisionIds = DIVISIONS.map((d) => d.id);

    const activityRaw = isObject(payload.activity) ? payload.activity : {};
    const defaults = { name: 'Program Sosial Kepanitiaan', status: 'Persiapan' };
    const activity = {
      name: readText(activityRaw, 'name', 'Kegiatan', { max: 100 }) || defaults.name,
      status: readText(activityRaw, 'status', 'Kegiatan', { max: 40 }) || defaults.status
    };

    const members = readList(payload, 'members', 'anggota', true).map((item, i) => {
      const label = 'Anggota ke-' + (i + 1);
      if (!isObject(item)) throw new Error(label + ': bukan objek.');
      return {
        id: keepId(item.id, 'mb'),
        name: readText(item, 'name', label, { required: true, max: 60 }),
        division: readChoice(item, 'division', label, divisionIds),
        role: readChoice(item, 'role', label, MEMBER_ROLES, 'Anggota')
      };
    });

    const tasks = readList(payload, 'tasks', 'tugas', true).map((item, i) => {
      const label = 'Tugas ke-' + (i + 1);
      if (!isObject(item)) throw new Error(label + ': bukan objek.');
      return normalizeTask({
        id: keepId(item.id, 'tk'),
        name: readText(item, 'name', label, { required: true, max: 120 }),
        division: readChoice(item, 'division', label, divisionIds),
        owner: readText(item, 'owner', label, { max: 60 }),
        deadline: readDate(item, 'deadline', label, false),
        status: readChoice(item, 'status', label, TASK_STATUSES, 'Belum Dimulai'),
        progress: readProgress(item, label)
      });
    });

    const meetings = readList(payload, 'meetings', 'rapat', true).map((item, i) => {
      const label = 'Rapat ke-' + (i + 1);
      if (!isObject(item)) throw new Error(label + ': bukan objek.');
      const time = readText(item, 'time', label, { max: 5 });
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(label + ': kolom "time" harus berformat HH:MM.');
      return {
        id: keepId(item.id, 'rp'),
        date: readDate(item, 'date', label, true),
        time,
        agenda: readText(item, 'agenda', label, { required: true, max: 160 }),
        location: readText(item, 'location', label, { max: 120 }),
        status: readChoice(item, 'status', label, MEETING_STATUSES, 'Terjadwal'),
        notes: readText(item, 'notes', label, { max: 2000 })
      };
    });

    const timeline = readList(payload, 'timeline', 'timeline', true).map((item, i) => {
      const label = 'Tahap timeline ke-' + (i + 1);
      if (!isObject(item)) throw new Error(label + ': bukan objek.');
      return normalizeStage({
        id: keepId(item.id, 'tl'),
        name: readText(item, 'name', label, { required: true, max: 120 }),
        description: readText(item, 'description', label, { max: 400 }),
        owner: readText(item, 'owner', label, { max: 60 }),
        deadline: readDate(item, 'deadline', label, false),
        status: readChoice(item, 'status', label, TIMELINE_STATUSES, 'Belum Dijadwalkan'),
        progress: readProgress(item, label)
      });
    });

    const activities = readList(payload, 'activities', 'aktivitas', false).slice(0, MAX_ACTIVITIES).map((item, i) => {
      const label = 'Aktivitas ke-' + (i + 1);
      if (!isObject(item)) throw new Error(label + ': bukan objek.');
      const time = typeof item.time === 'string' && !Number.isNaN(new Date(item.time).getTime()) ? item.time : new Date().toISOString();
      return { id: keepId(item.id, 'ac'), text: readText(item, 'text', label, { required: true, max: 200 }), time };
    });

    return { activity, members, tasks, meetings, timeline, activities };
  }

  function validateData(raw) {
    try {
      return { ok: true, data: sanitizeData(raw) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /* =======================================================
     3. UTILITAS
     ======================================================= */
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  // Semua teks dari pengguna WAJIB lewat esc() sebelum masuk ke innerHTML.
  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function slug(text) { return String(text).toLowerCase().replace(/\s+/g, '-'); }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isValidDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return y >= 2000 && y <= 2100 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  function parseISODate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function daysUntil(s) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((parseISODate(s) - today) / 86400000);
  }

  function formatDate(s, opts) {
    if (!s || !isValidDate(s)) return '—';
    return parseISODate(s).toLocaleDateString('id-ID', opts || { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 0) return formatDateTime(iso);
    if (mins < 1) return 'Baru saja';
    if (mins < 60) return mins + ' menit lalu';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + ' jam lalu';
    const days = Math.floor(hours / 24);
    if (days < 7) return days + ' hari lalu';
    return formatDateTime(iso);
  }

  // Keterangan sisa waktu menuju deadline, mis. "Terlambat 2 hari" / "3 hari lagi".
  function dueInfo(deadline) {
    if (!deadline || !isValidDate(deadline)) return { text: '', cls: 'ok' };
    const diff = daysUntil(deadline);
    if (diff < 0) return { text: 'Terlambat ' + Math.abs(diff) + ' hari', cls: 'late' };
    if (diff === 0) return { text: 'Hari ini', cls: 'soon' };
    if (diff === 1) return { text: 'Besok', cls: 'soon' };
    if (diff <= 3) return { text: diff + ' hari lagi', cls: 'soon' };
    return { text: diff + ' hari lagi', cls: 'ok' };
  }

  function getDivision(id) { return DIVISIONS.find((d) => d.id === id) || null; }
  function divisionLabel(id) { const d = getDivision(id); return d ? d.label : id; }
  function ownerLabel(owner) { return owner === ALL_DIVISIONS || !owner ? (owner || '—') : divisionLabel(owner); }

  function optionsHTML(list, selected) {
    return list.map((item) => {
      const value = typeof item === 'string' ? item : item.value;
      const label = typeof item === 'string' ? item : item.label;
      return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  const sortByDeadline = (a, b) => {
    if (a.deadline === b.deadline) return a.name.localeCompare(b.name, 'id');
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  };
  const sortMeetings = (a, b) => (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time);

  // ----- Toast -----
  function toast(message, type, ms) {
    const host = $('#toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), ms || 3500);
  }

  // ----- Dialog -----
  function openDialog(d) {
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }
  function closeDialog(d, value) {
    if (typeof d.close === 'function') d.close(value);
    else d.removeAttribute('open');
  }

  // Dialog konfirmasi berbasis Promise. Hasil: true bila pengguna menekan tombol konfirmasi.
  function confirmAction(options) {
    const o = Object.assign({ confirmText: 'Ya, lanjutkan', cancelText: 'Batal', danger: true, hideCancel: false }, options);
    return new Promise((resolve) => {
      const d = $('#confirmDialog');
      const okBtn = $('#confirmOk');
      const cancelBtn = $('#confirmCancel');
      $('#confirmTitle').textContent = o.title;
      $('#confirmMessage').textContent = o.message;
      okBtn.textContent = o.confirmText;
      okBtn.className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary');
      cancelBtn.textContent = o.cancelText;
      cancelBtn.hidden = o.hideCancel;
      d.returnValue = '';
      const onClose = () => {
        d.removeEventListener('close', onClose);
        resolve(d.returnValue === 'ok');
      };
      d.addEventListener('close', onClose);
      openDialog(d);
      (o.hideCancel ? okBtn : cancelBtn).focus();
    });
  }

  function showNotice(title, message) {
    return confirmAction({ title, message, confirmText: 'Mengerti', danger: false, hideCancel: true });
  }

  function showFormError(id, message, fieldId) {
    const box = $('#' + id);
    box.textContent = message;
    box.hidden = false;
    if (fieldId) { const f = $('#' + fieldId); if (f) f.focus(); }
  }
  function hideFormError(id) { const box = $('#' + id); box.textContent = ''; box.hidden = true; }

  function logActivity(text) {
    state.activities.unshift({ id: uid('ac'), text: String(text).slice(0, 200), time: new Date().toISOString() });
    if (state.activities.length > MAX_ACTIVITIES) state.activities.length = MAX_ACTIVITIES;
  }

  // Simpan + gambar ulang semua halaman (data kecil, jadi cukup cepat).
  function commit() {
    saveState();
    renderAll();
  }

  /* =======================================================
     4. LOGIKA PROGRES
     -------------------------------------------------------
     Progres keseluruhan = jumlah progres setiap tugas aktif
                           ÷ jumlah tugas aktif.
     • "Tugas aktif" = semua tugas yang masih ada di daftar
       (tugas yang dihapus otomatis tidak ikut dihitung).
     • Setiap tugas berbobot sama (tanpa rata-rata tertimbang).
     • Tanpa tugas -> hasil 0% (tidak terjadi pembagian nol).
     • Hasil selalu dijepit ke rentang 0–100.
     ======================================================= */
  function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  function averageProgress(list) {
    if (!list.length) return 0;
    const sum = list.reduce((total, item) => total + clampPercent(item.progress), 0);
    return clampPercent(sum / list.length);
  }

  // Aturan konsistensi tugas: Selesai = 100%, Belum Dimulai = 0%.
  function normalizeTask(t) {
    t.progress = clampPercent(t.progress);
    if (t.status === 'Selesai') t.progress = 100;
    if (t.status === 'Belum Dimulai') t.progress = 0;
    return t;
  }

  // Aturan konsistensi tahap timeline (ditambah status "Belum Dijadwalkan").
  function normalizeStage(s) {
    s.progress = clampPercent(s.progress);
    if (!s.deadline && s.status === 'Belum Dimulai') s.status = 'Belum Dijadwalkan';
    if (s.deadline && s.status === 'Belum Dijadwalkan') s.status = 'Belum Dimulai';
    if (s.status === 'Selesai') s.progress = 100;
    if (s.status === 'Belum Dimulai' || s.status === 'Belum Dijadwalkan') s.progress = 0;
    return s;
  }

  function taskStats(tasks) {
    const count = (fn) => tasks.filter(fn).length;
    return {
      total: tasks.length,
      done: count((t) => t.status === 'Selesai'),
      doing: count((t) => t.status === 'Sedang Dikerjakan' || t.status === 'Menunggu Pemeriksaan'),
      todo: count((t) => t.status === 'Belum Dimulai'),
      blocked: count((t) => t.status === 'Terhambat'),
      overall: averageProgress(tasks)
    };
  }

  function getNextMeeting() {
    const today = todayISO();
    return state.meetings
      .filter((m) => m.status === 'Terjadwal' && m.date >= today)
      .sort(sortMeetings)[0] || null;
  }

  /* =======================================================
     5. RENDER
     ======================================================= */
  function renderAll() {
    renderDashboard();
    renderTasks();
    renderMeetings();
    renderTimeline();
    renderDivisions();
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const st = taskStats(state.tasks);
    const circumference = 2 * Math.PI * 52;
    const offset = circumference * (1 - st.overall / 100);
    const next = getNextMeeting();
    const upcomingCount = state.meetings.filter((m) => m.status === 'Terjadwal' && m.date >= todayISO()).length;

    const deadlines = state.tasks
      .filter((t) => t.status !== 'Selesai' && t.deadline)
      .sort(sortByDeadline)
      .slice(0, 5);

    const recent = state.activities.slice().sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 6);

    const statCards = [
      { label: 'Total Anggota', value: state.members.length, cls: '' },
      { label: 'Total Tugas', value: st.total, cls: '' },
      { label: 'Tugas Selesai', value: st.done, cls: 'is-done' },
      { label: 'Dalam Pengerjaan', value: st.doing, cls: 'is-doing', hint: 'termasuk menunggu pemeriksaan' },
      { label: 'Belum Dimulai', value: st.todo, cls: '' },
      { label: 'Terhambat', value: st.blocked, cls: 'is-blocked' }
    ].map((c) => (
      '<div class="card stat ' + c.cls + '"><div class="stat-label">' + esc(c.label) + '</div>' +
      '<div class="stat-value">' + c.value + '</div>' +
      (c.hint ? '<div class="stat-hint">' + esc(c.hint) + '</div>' : '') + '</div>'
    )).join('');

    const divisionRows = DIVISIONS.map((d) => {
      const list = state.tasks.filter((t) => t.division === d.id);
      const pct = averageProgress(list);
      const done = list.filter((t) => t.status === 'Selesai').length;
      return '<li><div class="div-row-head"><span>' + esc(d.label) + '</span><span class="div-pct">' + pct + '%</span></div>' +
        '<div class="bar' + (pct === 100 && list.length ? ' is-done' : '') + '"><span style="width:' + pct + '%"></span></div>' +
        '<div class="div-meta">' + (list.length ? list.length + ' tugas · ' + done + ' selesai' : 'Belum ada tugas') + '</div></li>';
    }).join('');

    const deadlineHTML = deadlines.length ? '<ul class="list">' + deadlines.map((t) => {
      const due = dueInfo(t.deadline);
      return '<li class="list-item"><div><div class="list-title">' + esc(t.name) + '</div>' +
        '<div class="list-sub">' + esc(t.division) + ' · ' + esc(t.owner || 'Belum ada penanggung jawab') + '</div></div>' +
        '<div class="list-side"><div>' + esc(formatDate(t.deadline, { day: 'numeric', month: 'short' })) + '</div>' +
        '<div class="due ' + due.cls + '">' + esc(due.text) + '</div></div></li>';
    }).join('') + '</ul>' : '<p class="empty-inline">Tidak ada deadline aktif. Semua tugas sudah selesai atau belum ada tugas.</p>';

    const meetingHTML = next ? (
      '<div class="next-meeting"><div class="date-block"><span class="md-day">' + esc(parseISODate(next.date).getDate()) + '</span>' +
      '<span class="md-mon">' + esc(formatDate(next.date, { month: 'short' })) + '</span></div><div>' +
      '<h4>' + esc(next.agenda) + '</h4>' +
      '<div class="list-sub">' + esc(formatDate(next.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) +
      (next.time ? ' · ' + esc(next.time) : '') + '</div>' +
      '<div class="list-sub">' + esc(next.location || 'Lokasi belum diisi') + '</div>' +
      (upcomingCount > 1 ? '<div class="list-sub">+' + (upcomingCount - 1) + ' rapat terjadwal lainnya</div>' : '') +
      '</div></div>'
    ) : '<p class="empty-inline">Belum ada rapat terjadwal.</p>';

    const activityHTML = recent.length ? '<ul class="list dot-list">' + recent.map((a) =>
      '<li class="list-item"><div class="list-title" style="font-weight:500">' + esc(a.text) + '</div>' +
      '<div class="list-side muted">' + esc(timeAgo(a.time)) + '</div></li>'
    ).join('') + '</ul>' : '<p class="empty-inline">Belum ada aktivitas.</p>';

    $('#dashboardContent').innerHTML =
      '<section class="card hero"><div>' +
      '<p class="eyebrow">Kegiatan</p><h2>' + esc(state.activity.name) + '</h2>' +
      '<div class="hero-meta"><span class="badge s-' + esc(slug(state.activity.status)) + '">' + esc(state.activity.status) + '</span>' +
      '<span class="hero-note">Tanggal pelaksanaan: belum ditentukan</span></div>' +
      '<p class="hero-desc">Progres keseluruhan adalah rata-rata progres dari ' + st.total + ' tugas aktif.</p></div>' +
      '<div class="ring" role="img" aria-label="Progres keseluruhan ' + st.overall + ' persen">' +
      '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="52"/>' +
      '<circle class="ring-fg" cx="60" cy="60" r="52" transform="rotate(-90 60 60)" stroke-dasharray="' + circumference.toFixed(2) +
      '" stroke-dashoffset="' + offset.toFixed(2) + '"/></svg>' +
      '<div class="ring-label"><strong>' + st.overall + '%</strong><span>progres</span></div></div></section>' +

      '<div class="stats-grid">' + statCards + '</div>' +

      '<div class="panels">' +
      '<section class="card"><div class="panel-head"><h3>Progres per Divisi</h3></div><ul class="div-list">' + divisionRows + '</ul></section>' +
      '<section class="card"><div class="panel-head"><h3>Deadline Terdekat</h3>' +
      '<button type="button" class="link-btn" data-action="goto" data-view="jobdesk">Lihat semua</button></div>' + deadlineHTML + '</section>' +
      '<section class="card"><div class="panel-head"><h3>Rapat Berikutnya</h3>' +
      '<button type="button" class="link-btn" data-action="goto" data-view="rapat">Jadwal rapat</button></div>' + meetingHTML + '</section>' +
      '<section class="card"><div class="panel-head"><h3>Aktivitas Terbaru</h3></div>' + activityHTML + '</section>' +
      '</div>';
  }

  // ---------- Jobdesk ----------
  function getFilteredTasks() {
    const q = $('#taskSearch').value.trim().toLowerCase();
    const division = $('#filterDivision').value;
    const status = $('#filterStatus').value;
    return state.tasks.filter((t) => {
      if (division && t.division !== division) return false;
      if (status && t.status !== status) return false;
      if (!q) return true;
      return (t.name + ' ' + t.owner + ' ' + t.division + ' ' + divisionLabel(t.division)).toLowerCase().includes(q);
    }).sort(sortByDeadline);
  }

  function renderTasks() {
    const list = getFilteredTasks();
    const total = state.tasks.length;
    $('#taskCount').textContent = total ? 'Menampilkan ' + list.length + ' dari ' + total + ' tugas' : '';

    if (!total) {
      $('#taskList').innerHTML = '<div class="card empty"><strong>Belum ada tugas</strong>Mulai dengan menambahkan tugas pertama untuk salah satu divisi.' +
        '<br><button type="button" class="btn btn-primary" data-action="task-add">+ Tambah Tugas</button></div>';
      return;
    }
    if (!list.length) {
      $('#taskList').innerHTML = '<div class="card empty"><strong>Tidak ada tugas yang cocok</strong>Coba ubah kata kunci atau filter.' +
        '<br><button type="button" class="btn" data-action="clear-filters">Reset filter</button></div>';
      return;
    }

    const rows = list.map((t) => {
      const due = t.status === 'Selesai' ? { text: '', cls: 'ok' } : dueInfo(t.deadline);
      return '<tr>' +
        '<td class="cell-main" data-label="Tugas"><strong>' + esc(t.name) + '</strong></td>' +
        '<td data-label="Divisi"><span class="chip">' + esc(t.division) + '</span></td>' +
        '<td data-label="Penanggung jawab">' + esc(t.owner || '—') + '</td>' +
        '<td data-label="Deadline"><div>' + esc(formatDate(t.deadline, { day: 'numeric', month: 'short', year: 'numeric' })) + '</div>' +
        (due.text ? '<div class="due ' + due.cls + '">' + esc(due.text) + '</div>' : '') + '</td>' +
        '<td data-label="Status"><select class="inline-select s-' + esc(slug(t.status)) + '" data-action="task-status" data-id="' + esc(t.id) +
        '" aria-label="Status tugas ' + esc(t.name) + '">' + optionsHTML(TASK_STATUSES, t.status) + '</select></td>' +
        '<td class="cell-progress" data-label="Progres"><div class="progress-cell">' +
        '<input type="range" min="0" max="100" step="5" value="' + t.progress + '" data-action="task-progress" data-id="' + esc(t.id) +
        '" aria-label="Progres tugas ' + esc(t.name) + '"><span class="pct">' + t.progress + '%</span></div>' +
        '<div class="bar' + (t.progress === 100 ? ' is-done' : '') + '"><span style="width:' + t.progress + '%"></span></div></td>' +
        '<td class="cell-actions" data-label="Aksi"><div class="actions">' +
        '<button type="button" class="btn btn-sm" data-action="task-edit" data-id="' + esc(t.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-sm btn-del" data-action="task-delete" data-id="' + esc(t.id) + '">Hapus</button></div></td>' +
        '</tr>';
    }).join('');

    $('#taskList').innerHTML = '<div class="card table-wrap"><table class="table"><thead><tr>' +
      '<th>Tugas</th><th>Divisi</th><th>Penanggung jawab</th><th>Deadline</th><th>Status</th><th>Progres</th><th><span class="sr-only">Aksi</span></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // ---------- Rapat ----------
  function renderMeetings() {
    const box = $('#meetingList');
    if (!state.meetings.length) {
      box.innerHTML = '<div class="card empty"><strong>Belum ada jadwal rapat</strong>Tambahkan rapat pertama untuk mulai mencatat agenda dan hasilnya.' +
        '<br><button type="button" class="btn btn-primary" data-action="meeting-add">+ Tambah Rapat</button></div>';
      return;
    }
    const next = getNextMeeting();
    const today = todayISO();
    box.innerHTML = '<div class="meeting-list">' + state.meetings.slice().sort(sortMeetings).map((m) => {
      const overdue = m.status === 'Terjadwal' && m.date < today;
      return '<article class="card meeting' + (next && next.id === m.id ? ' is-next' : '') + '">' +
        '<div class="date-block"><span class="md-day">' + esc(parseISODate(m.date).getDate()) + '</span>' +
        '<span class="md-mon">' + esc(formatDate(m.date, { month: 'short' })) + '</span></div>' +
        '<div class="meeting-body"><div class="meeting-top"><h3>' + esc(m.agenda) + '</h3>' +
        '<span class="badge s-' + esc(slug(m.status)) + '">' + esc(m.status) + '</span>' +
        (next && next.id === m.id ? '<span class="tag-next">Berikutnya</span>' : '') +
        (overdue ? '<span class="due late">Sudah lewat — perbarui status</span>' : '') + '</div>' +
        '<p class="meeting-meta">' + esc(formatDate(m.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) +
        (m.time ? ' · ' + esc(m.time) : '') + ' · ' + esc(m.location || 'Lokasi belum diisi') + '</p>' +
        '<div class="notes' + (m.notes ? '' : ' is-empty') + '"><strong>Catatan hasil rapat</strong><p>' +
        esc(m.notes || 'Belum ada catatan.') + '</p></div></div>' +
        '<div class="actions"><button type="button" class="btn btn-sm" data-action="meeting-edit" data-id="' + esc(m.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-sm btn-del" data-action="meeting-delete" data-id="' + esc(m.id) + '">Hapus</button></div>' +
        '</article>';
    }).join('') + '</div>';
  }

  // ---------- Timeline ----------
  function renderTimeline() {
    const box = $('#timelineList');
    const total = state.timeline.length;
    const done = state.timeline.filter((s) => s.status === 'Selesai').length;
    $('#timelineSummary').textContent = total ? done + ' dari ' + total + ' tahap selesai' : '';

    if (!total) {
      box.innerHTML = '<div class="card empty"><strong>Timeline kosong</strong>Gunakan “Reset ke data awal” di menu Kelola Data untuk memuat tahapan standar.</div>';
      return;
    }
    box.innerHTML = '<ol class="timeline">' + state.timeline.map((s, i) => {
      const deadlineHTML = s.deadline
        ? esc(formatDate(s.deadline))
        : '<span class="badge s-belum-dijadwalkan">Belum Dijadwalkan</span>';
      return '<li class="tl-item s-' + esc(slug(s.status)) + '"><span class="tl-node">' + (i + 1) + '</span>' +
        '<div class="card tl-card"><div class="tl-head"><h3>' + esc(s.name) + '</h3>' +
        '<span class="badge s-' + esc(slug(s.status)) + '">' + esc(s.status) + '</span></div>' +
        (s.description ? '<p class="muted small">' + esc(s.description) + '</p>' : '') +
        '<dl class="tl-meta"><div><dt>Penanggung jawab</dt><dd>' + esc(ownerLabel(s.owner)) + '</dd></div>' +
        '<div><dt>Deadline</dt><dd>' + deadlineHTML + '</dd></div></dl>' +
        '<div class="progress-line"><div class="bar' + (s.progress === 100 ? ' is-done' : '') + '"><span style="width:' + s.progress + '%"></span></div>' +
        '<span class="pct">' + s.progress + '%</span></div>' +
        '<div class="tl-actions"><button type="button" class="btn btn-sm" data-action="timeline-edit" data-id="' + esc(s.id) + '">Edit tahap</button></div>' +
        '</div></li>';
    }).join('') + '</ol>';
  }

  // ---------- Divisi ----------
  function renderDivisions() {
    $('#divisionGrid').innerHTML = '<div class="division-grid">' + DIVISIONS.map((d) => {
      const members = state.members.filter((m) => m.division === d.id)
        .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'id') : a.role === 'Koordinator' ? -1 : 1));
      const tasks = state.tasks.filter((t) => t.division === d.id);

      const memberHTML = members.length ? '<ul class="member-list">' + members.map((m) =>
        '<li><div><span class="member-name">' + esc(m.name) + '</span><span class="member-role">' + esc(m.role) + '</span></div>' +
        '<div class="member-actions"><button type="button" class="btn btn-sm" data-action="member-edit" data-id="' + esc(m.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-sm btn-del" data-action="member-delete" data-id="' + esc(m.id) + '">Hapus</button></div></li>'
      ).join('') + '</ul>' : '<p class="empty-inline">Belum ada anggota.</p>';

      return '<article class="card division-card"><div><h3>' + esc(d.label) + '</h3><p class="summary">' + esc(d.summary) + '</p></div>' +
        '<div class="division-stats"><span><b>' + members.length + '</b> anggota</span><span><b>' + tasks.length + '</b> tugas</span>' +
        '<span>progres <b>' + averageProgress(tasks) + '%</b></span></div>' +
        '<div><p class="block-title">Tanggung jawab</p><ul class="dot-list">' + d.duties.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
        '<div><p class="block-title">Anggota</p>' + memberHTML + '</div>' +
        '<div class="division-foot"><button type="button" class="btn btn-sm" data-action="member-add" data-division="' + esc(d.id) + '">+ Anggota</button></div>' +
        '</article>';
    }).join('') + '</div>';
  }

  /* =======================================================
     6. FORM & AKSI
     ======================================================= */
  const dlg = {
    task: $('#taskDialog'),
    meeting: $('#meetingDialog'),
    timeline: $('#timelineDialog'),
    member: $('#memberDialog')
  };

  function fillStaticOptions() {
    const divisionOptions = DIVISIONS.map((d) => ({ value: d.id, label: d.label }));
    $('#filterDivision').innerHTML = '<option value="">Semua divisi</option>' + optionsHTML(divisionOptions);
    $('#filterStatus').innerHTML = '<option value="">Semua status</option>' + optionsHTML(TASK_STATUSES);
    $('#taskDivision').innerHTML = optionsHTML(divisionOptions);
    $('#taskStatus').innerHTML = optionsHTML(TASK_STATUSES);
    $('#meetingStatus').innerHTML = optionsHTML(MEETING_STATUSES);
    $('#timelineOwner').innerHTML = optionsHTML(divisionOptions.concat([{ value: ALL_DIVISIONS, label: ALL_DIVISIONS }]));
    $('#timelineStatus').innerHTML = optionsHTML(TIMELINE_STATUSES);
    $('#memberDivision').innerHTML = optionsHTML(divisionOptions);
    $('#memberRole').innerHTML = optionsHTML(MEMBER_ROLES);
  }

  // ---------- Tugas ----------
  function refreshOwnerSuggestions() {
    const division = $('#taskDivision').value;
    $('#ownerList').innerHTML = state.members
      .filter((m) => m.division === division)
      .map((m) => '<option value="' + esc(m.name) + '"></option>').join('');
  }

  function openTaskForm(id) {
    const t = id ? state.tasks.find((x) => x.id === id) : null;
    if (id && !t) return;
    $('#taskForm').dataset.editId = t ? t.id : '';
    $('#taskDialogTitle').textContent = t ? 'Edit Tugas' : 'Tambah Tugas';
    $('#taskName').value = t ? t.name : '';
    $('#taskDivision').value = t ? t.division : ($('#filterDivision').value || DIVISIONS[0].id);
    refreshOwnerSuggestions();
    $('#taskOwner').value = t ? t.owner : '';
    $('#taskDeadline').value = t ? t.deadline : '';
    $('#taskStatus').value = t ? t.status : 'Belum Dimulai';
    $('#taskProgress').value = t ? t.progress : 0;
    $('#taskProgressOut').textContent = $('#taskProgress').value + '%';
    hideFormError('taskError');
    openDialog(dlg.task);
    $('#taskName').focus();
  }

  function handleTaskSubmit(e) {
    e.preventDefault();
    const name = $('#taskName').value.trim();
    const division = $('#taskDivision').value;
    const owner = $('#taskOwner').value.trim();
    const deadline = $('#taskDeadline').value;
    const status = $('#taskStatus').value;
    const progress = Number($('#taskProgress').value);

    if (name.length < 3) return showFormError('taskError', 'Nama tugas minimal 3 karakter.', 'taskName');
    if (name.length > 120) return showFormError('taskError', 'Nama tugas maksimal 120 karakter.', 'taskName');
    if (!getDivision(division)) return showFormError('taskError', 'Pilih divisi yang valid.', 'taskDivision');
    if (!owner) return showFormError('taskError', 'Penanggung jawab wajib diisi.', 'taskOwner');
    if (owner.length > 60) return showFormError('taskError', 'Nama penanggung jawab maksimal 60 karakter.', 'taskOwner');
    if (!isValidDate(deadline)) return showFormError('taskError', 'Deadline wajib diisi dengan tanggal yang valid.', 'taskDeadline');
    if (!TASK_STATUSES.includes(status)) return showFormError('taskError', 'Pilih status yang valid.', 'taskStatus');
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) return showFormError('taskError', 'Progres harus antara 0 dan 100.', 'taskProgress');

    const editId = $('#taskForm').dataset.editId;
    const data = normalizeTask({ name, division, owner, deadline, status, progress });
    if (editId) {
      const t = state.tasks.find((x) => x.id === editId);
      if (!t) return showFormError('taskError', 'Tugas tidak ditemukan. Mungkin sudah dihapus.');
      Object.assign(t, data);
      logActivity('Tugas “' + t.name + '” diperbarui');
      toast('Tugas diperbarui.', 'success');
    } else {
      state.tasks.push(Object.assign({ id: uid('tk') }, data));
      logActivity('Tugas baru ditambahkan: “' + name + '”');
      toast('Tugas ditambahkan.', 'success');
    }
    closeDialog(dlg.task);
    commit();
  }

  function setTaskStatus(id, status) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t || !TASK_STATUSES.includes(status) || t.status === status) return;
    t.status = status;
    if (status === 'Selesai') t.progress = 100;
    else if (status === 'Belum Dimulai') t.progress = 0;
    else if (t.progress === 100 && status !== 'Menunggu Pemeriksaan') t.progress = 90; // belum selesai, jadi bukan 100%
    normalizeTask(t);
    logActivity('Status “' + t.name + '” diubah menjadi ' + status);
    commit();
  }

  function setTaskProgress(id, value) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const v = clampPercent(value);
    if (v === t.progress) { renderTasks(); return; }
    t.progress = v;
    if (v === 100 && (t.status === 'Belum Dimulai' || t.status === 'Sedang Dikerjakan')) t.status = 'Menunggu Pemeriksaan';
    else if (v > 0 && v < 100 && (t.status === 'Belum Dimulai' || t.status === 'Selesai' || t.status === 'Menunggu Pemeriksaan')) t.status = 'Sedang Dikerjakan';
    normalizeTask(t);
    logActivity('Progres “' + t.name + '” menjadi ' + t.progress + '%');
    commit();
  }

  async function deleteTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const ok = await confirmAction({ title: 'Hapus tugas?', message: '“' + t.name + '” akan dihapus dan tidak lagi dihitung dalam progres.', confirmText: 'Hapus' });
    if (!ok) return;
    state.tasks = state.tasks.filter((x) => x.id !== id);
    logActivity('Tugas “' + t.name + '” dihapus');
    toast('Tugas dihapus.', 'success');
    commit();
  }

  // ---------- Rapat ----------
  function openMeetingForm(id) {
    const m = id ? state.meetings.find((x) => x.id === id) : null;
    if (id && !m) return;
    $('#meetingForm').dataset.editId = m ? m.id : '';
    $('#meetingDialogTitle').textContent = m ? 'Edit Rapat' : 'Tambah Rapat';
    $('#meetingDate').value = m ? m.date : todayISO();
    $('#meetingTime').value = m ? m.time : '19:30';
    $('#meetingAgenda').value = m ? m.agenda : '';
    $('#meetingLocation').value = m ? m.location : '';
    $('#meetingStatus').value = m ? m.status : 'Terjadwal';
    $('#meetingNotes').value = m ? m.notes : '';
    hideFormError('meetingError');
    openDialog(dlg.meeting);
    $('#meetingAgenda').focus();
  }

  function handleMeetingSubmit(e) {
    e.preventDefault();
    const date = $('#meetingDate').value;
    const time = $('#meetingTime').value;
    const agenda = $('#meetingAgenda').value.trim();
    const location = $('#meetingLocation').value.trim();
    const status = $('#meetingStatus').value;
    const notes = $('#meetingNotes').value.trim();

    if (!isValidDate(date)) return showFormError('meetingError', 'Tanggal rapat wajib diisi dengan tanggal yang valid.', 'meetingDate');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return showFormError('meetingError', 'Waktu rapat wajib diisi (format JJ:MM).', 'meetingTime');
    if (agenda.length < 3) return showFormError('meetingError', 'Agenda minimal 3 karakter.', 'meetingAgenda');
    if (agenda.length > 160) return showFormError('meetingError', 'Agenda maksimal 160 karakter.', 'meetingAgenda');
    if (location.length > 120) return showFormError('meetingError', 'Lokasi maksimal 120 karakter.', 'meetingLocation');
    if (!MEETING_STATUSES.includes(status)) return showFormError('meetingError', 'Pilih status yang valid.', 'meetingStatus');
    if (notes.length > 2000) return showFormError('meetingError', 'Catatan maksimal 2000 karakter.', 'meetingNotes');

    const editId = $('#meetingForm').dataset.editId;
    const data = { date, time, agenda, location, status, notes };
    if (editId) {
      const m = state.meetings.find((x) => x.id === editId);
      if (!m) return showFormError('meetingError', 'Rapat tidak ditemukan. Mungkin sudah dihapus.');
      Object.assign(m, data);
      logActivity('Rapat “' + agenda + '” diperbarui');
      toast('Rapat diperbarui.', 'success');
    } else {
      state.meetings.push(Object.assign({ id: uid('rp') }, data));
      logActivity('Rapat baru dijadwalkan: ' + formatDate(date, { day: 'numeric', month: 'long' }));
      toast('Rapat ditambahkan.', 'success');
    }
    closeDialog(dlg.meeting);
    commit();
  }

  async function deleteMeeting(id) {
    const m = state.meetings.find((x) => x.id === id);
    if (!m) return;
    const ok = await confirmAction({ title: 'Hapus jadwal rapat?', message: '“' + m.agenda + '” beserta catatannya akan dihapus.', confirmText: 'Hapus' });
    if (!ok) return;
    state.meetings = state.meetings.filter((x) => x.id !== id);
    logActivity('Jadwal rapat “' + m.agenda + '” dihapus');
    toast('Jadwal rapat dihapus.', 'success');
    commit();
  }

  // ---------- Timeline ----------
  function syncTimelineForm(source) {
    const status = $('#timelineStatus');
    const hasDate = !!$('#timelineDeadline').value;
    if (source === 'deadline') {
      if (hasDate && status.value === 'Belum Dijadwalkan') status.value = 'Belum Dimulai';
      if (!hasDate && status.value === 'Belum Dimulai') status.value = 'Belum Dijadwalkan';
    }
    if (source === 'status') {
      if (status.value === 'Selesai') $('#timelineProgress').value = 100;
      if (status.value === 'Belum Dimulai' || status.value === 'Belum Dijadwalkan') $('#timelineProgress').value = 0;
    }
    $('#timelineProgressOut').textContent = $('#timelineProgress').value + '%';
  }

  function openTimelineForm(id) {
    const s = state.timeline.find((x) => x.id === id);
    if (!s) return;
    $('#timelineForm').dataset.editId = s.id;
    $('#timelineDialogTitle').textContent = 'Edit Tahap: ' + s.name;
    $('#timelineName').value = s.name;
    $('#timelineDesc').value = s.description;
    // Pemilik bebas dari impor tetap bisa dipilih: tambahkan sebagai opsi sementara.
    const ownerSelect = $('#timelineOwner');
    if (s.owner && !Array.from(ownerSelect.options).some((o) => o.value === s.owner)) {
      ownerSelect.insertAdjacentHTML('beforeend', '<option value="' + esc(s.owner) + '">' + esc(s.owner) + '</option>');
    }
    ownerSelect.value = s.owner || ALL_DIVISIONS;
    $('#timelineDeadline').value = s.deadline;
    $('#timelineStatus').value = s.status;
    $('#timelineProgress').value = s.progress;
    $('#timelineProgressOut').textContent = s.progress + '%';
    hideFormError('timelineError');
    openDialog(dlg.timeline);
    $('#timelineName').focus();
  }

  function handleTimelineSubmit(e) {
    e.preventDefault();
    const s = state.timeline.find((x) => x.id === $('#timelineForm').dataset.editId);
    if (!s) return showFormError('timelineError', 'Tahap tidak ditemukan.');
    const name = $('#timelineName').value.trim();
    const description = $('#timelineDesc').value.trim();
    const owner = $('#timelineOwner').value;
    const deadline = $('#timelineDeadline').value;
    const status = $('#timelineStatus').value;
    const progress = Number($('#timelineProgress').value);

    if (name.length < 3) return showFormError('timelineError', 'Nama tahap minimal 3 karakter.', 'timelineName');
    if (name.length > 120) return showFormError('timelineError', 'Nama tahap maksimal 120 karakter.', 'timelineName');
    if (description.length > 400) return showFormError('timelineError', 'Deskripsi maksimal 400 karakter.', 'timelineDesc');
    if (deadline && !isValidDate(deadline)) return showFormError('timelineError', 'Deadline tidak valid. Kosongkan jika belum ada tanggal pasti.', 'timelineDeadline');
    if (!TIMELINE_STATUSES.includes(status)) return showFormError('timelineError', 'Pilih status yang valid.', 'timelineStatus');
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) return showFormError('timelineError', 'Progres harus antara 0 dan 100.', 'timelineProgress');

    Object.assign(s, normalizeStage({ name, description, owner, deadline, status, progress }));
    logActivity('Tahap timeline “' + name + '” diperbarui');
    toast('Tahap timeline diperbarui.', 'success');
    closeDialog(dlg.timeline);
    commit();
  }

  // ---------- Anggota ----------
  function openMemberForm(id, presetDivision) {
    const m = id ? state.members.find((x) => x.id === id) : null;
    if (id && !m) return;
    $('#memberForm').dataset.editId = m ? m.id : '';
    $('#memberDialogTitle').textContent = m ? 'Edit Anggota' : 'Tambah Anggota';
    $('#memberName').value = m ? m.name : '';
    $('#memberDivision').value = m ? m.division : (presetDivision || DIVISIONS[0].id);
    $('#memberRole').value = m ? m.role : 'Anggota';
    hideFormError('memberError');
    openDialog(dlg.member);
    $('#memberName').focus();
  }

  function handleMemberSubmit(e) {
    e.preventDefault();
    const name = $('#memberName').value.trim();
    const division = $('#memberDivision').value;
    const role = $('#memberRole').value;
    const editId = $('#memberForm').dataset.editId;

    if (name.length < 2) return showFormError('memberError', 'Nama minimal 2 karakter.', 'memberName');
    if (name.length > 60) return showFormError('memberError', 'Nama maksimal 60 karakter.', 'memberName');
    if (!getDivision(division)) return showFormError('memberError', 'Pilih divisi yang valid.', 'memberDivision');
    if (!MEMBER_ROLES.includes(role)) return showFormError('memberError', 'Pilih peran yang valid.', 'memberRole');
    const duplicate = state.members.some((m) => m.id !== editId && m.division === division && m.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return showFormError('memberError', 'Anggota dengan nama itu sudah ada di divisi tersebut.', 'memberName');

    if (editId) {
      const m = state.members.find((x) => x.id === editId);
      if (!m) return showFormError('memberError', 'Anggota tidak ditemukan.');
      if (m.name !== name && m.division === division) {
        // Nama berubah: perbarui penanggung jawab pada tugas milik anggota ini.
        state.tasks.forEach((t) => { if (t.owner === m.name && t.division === m.division) t.owner = name; });
      }
      Object.assign(m, { name, division, role });
      logActivity('Data anggota “' + name + '” diperbarui');
      toast('Anggota diperbarui.', 'success');
    } else {
      state.members.push({ id: uid('mb'), name, division, role });
      logActivity(name + ' ditambahkan ke divisi ' + division);
      toast('Anggota ditambahkan.', 'success');
    }
    closeDialog(dlg.member);
    commit();
  }

  async function deleteMember(id) {
    const m = state.members.find((x) => x.id === id);
    if (!m) return;
    const owned = state.tasks.filter((t) => t.owner === m.name && t.division === m.division).length;
    const message = '“' + m.name + '” akan dihapus dari divisi ' + m.division + '.' +
      (owned ? '\n' + owned + ' tugas atas nama anggota ini tetap ada; ubah penanggung jawabnya bila perlu.' : '');
    const ok = await confirmAction({ title: 'Hapus anggota?', message, confirmText: 'Hapus' });
    if (!ok) return;
    state.members = state.members.filter((x) => x.id !== id);
    logActivity(m.name + ' dihapus dari divisi ' + m.division);
    toast('Anggota dihapus.', 'success');
    commit();
  }

  /* =======================================================
     7. EKSPOR, IMPOR, RESET, CETAK
     ======================================================= */
  function exportJSON() {
    const payload = { app: 'PANITIA HUB', version: DATA_VERSION, exportedAt: new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'panitia-hub-' + todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Data diekspor ke berkas JSON.', 'success');
  }

  function handleImportFile(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showNotice('Impor gagal', 'Berkas terlalu besar (maksimal 2 MB). Data yang ada tidak diubah.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => showNotice('Impor gagal', 'Berkas tidak dapat dibaca. Data yang ada tidak diubah.');
    reader.onload = async () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (err) {
        showNotice('Impor gagal', 'Berkas bukan JSON yang valid, jadi tidak dapat diimpor. Data yang ada tidak diubah.');
        return;
      }
      const result = validateData(parsed);
      if (!result.ok) {
        showNotice('Impor gagal', result.error + '\n\nData yang ada tidak diubah.');
        return;
      }
      const d = result.data;
      const ok = await confirmAction({
        title: 'Ganti data dengan isi berkas?',
        message: 'Berkas “' + file.name + '” berisi ' + d.tasks.length + ' tugas, ' + d.meetings.length + ' rapat, ' + d.timeline.length +
          ' tahap timeline, dan ' + d.members.length + ' anggota.\n\nSeluruh data saat ini akan DIGANTI.',
        confirmText: 'Ya, ganti data'
      });
      if (!ok) return;
      state = d;
      logActivity('Data diimpor dari berkas JSON');
      toast('Data berhasil diimpor.', 'success');
      commit();
    };
    reader.readAsText(file);
  }

  /* =======================================================
     DATA AWAL BERSAMA (data.json)
     -------------------------------------------------------
     Admin cukup mengunggah berkas data.json (hasil "Ekspor data")
     ke GitHub. Setiap browser membacanya lewat fetch():
       • pengunjung baru  -> langsung memakai data.json;
       • pengunjung lama  -> ditanya SEKALI bila data.json berubah
         (dikenali dari kolom "exportedAt", atau "revision" bila
         berkas diedit tangan);
       • data.json tidak ada, atau index.html dibuka langsung dari
         folder -> diam-diam memakai data contoh bawaan di atas.
     ======================================================= */
  function readSeedId() { try { return window.localStorage.getItem(SEED_ID_KEY); } catch (e) { return null; } }
  function writeSeedId(id) { try { window.localStorage.setItem(SEED_ID_KEY, id); } catch (e) { /* abaikan */ } }

  function seedIdOf(raw) {
    if (isObject(raw)) {
      if (typeof raw.exportedAt === 'string' && raw.exportedAt) return raw.exportedAt;
      if (raw.revision !== undefined && raw.revision !== null) return String(raw.revision);
    }
    return 'tanpa-penanda';
  }

  // Mengembalikan { id, data } bila data.json ada dan valid; selain itu null.
  async function fetchSeed() {
    if (typeof window.fetch !== 'function' || window.location.protocol === 'file:') return null; // dibuka dari folder: browser memblokir fetch
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), SEED_TIMEOUT_MS) : null;
    try {
      const res = await fetch(SEED_URL + '?v=' + Date.now(), { cache: 'no-store', signal: controller ? controller.signal : undefined });
      if (!res.ok) return null; // 404 = tidak ada data.json; itu normal
      const raw = await res.json();
      const result = validateData(raw);
      if (!result.ok) {
        toast('data.json tidak dipakai: ' + result.error, 'warn', 9000);
        return null;
      }
      return { id: seedIdOf(raw), data: result.data };
    } catch (err) {
      if (err instanceof SyntaxError) toast('data.json bukan JSON yang valid, jadi diabaikan.', 'warn', 9000);
      return null; // jaringan gagal atau dibuka dari file lokal: abaikan
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function describeData(d) {
    return d.tasks.length + ' tugas, ' + d.meetings.length + ' rapat, ' + d.timeline.length + ' tahap timeline, dan ' + d.members.length + ' anggota';
  }

  async function offerSeed(seed) {
    const ok = await confirmAction({
      title: 'Pakai data terbaru dari data.json?',
      message: 'Berkas data.json di situs ini berisi ' + describeData(seed.data) + '.\n\nBila dipakai, seluruh data di browser ini akan DIGANTI, termasuk perubahan yang belum diekspor.',
      confirmText: 'Ya, pakai data terbaru',
      cancelText: 'Nanti saja',
      danger: false
    });
    writeSeedId(seed.id); // ingat versi ini agar tidak ditanyakan terus-menerus
    if (!ok) {
      toast('Data tidak diganti. Anda bisa memuatnya kapan saja lewat Kelola Data.', 'info', 5000);
      return;
    }
    state = seed.data;
    logActivity('Data diperbarui dari data.json');
    toast('Data diperbarui dari data.json.', 'success');
    commit();
  }

  // Dipanggil saat halaman dibuka oleh pengunjung lama.
  async function checkSeedUpdate() {
    const seed = await fetchSeed();
    if (seed && readSeedId() !== seed.id) offerSeed(seed);
  }

  // Dipanggil dari menu Kelola Data -> "Ambil data terbaru dari situs".
  async function loadSeedManually() {
    const seed = await fetchSeed();
    if (!seed) {
      showNotice('data.json tidak ditemukan',
        'Berkas data.json tidak ada atau tidak valid di situs ini.\n\nFitur ini hanya bekerja bila situs dibuka lewat alamat web (mis. GitHub Pages), bukan dengan membuka index.html langsung dari folder.');
      return;
    }
    offerSeed(seed);
  }

  async function resetData() {
    const ok = await confirmAction({
      title: 'Reset ke data awal?',
      message: 'Semua perubahan (tugas, rapat, timeline, anggota) akan dihapus dan diganti data awal (data.json dari situs bila ada, jika tidak data contoh bawaan). Tindakan ini tidak dapat dibatalkan — ekspor JSON dulu bila perlu.',
      confirmText: 'Ya, reset'
    });
    if (!ok) return;
    const seed = await fetchSeed();
    if (seed) { state = seed.data; writeSeedId(seed.id); } else { state = createDefaultData(); }
    toast('Data dikembalikan ke data awal.', 'success');
    commit();
  }

  function setPrintMeta() {
    const now = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    $('#printMeta').textContent = 'PANITIA HUB — ' + state.activity.name + ' — dicetak ' + now;
  }

  function printPage() {
    setPrintMeta();
    window.print();
  }

  /* =======================================================
     8. NAVIGASI & EVENT
     ======================================================= */
  function viewFromHash() {
    const name = window.location.hash.replace('#', '');
    return Object.prototype.hasOwnProperty.call(VIEWS, name) ? name : 'dashboard';
  }

  function showView(name) {
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
    $$('.nav-link').forEach((link) => {
      if (link.dataset.view === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    $('#pageTitle').textContent = VIEWS[name];
    document.title = VIEWS[name] + ' — PANITIA HUB';
    window.scrollTo(0, 0);
  }

  function clearFilters() {
    $('#taskSearch').value = '';
    $('#filterDivision').value = '';
    $('#filterStatus').value = '';
    renderTasks();
  }

  function closeMenu() { const m = $('#dataMenu'); if (m) m.removeAttribute('open'); }

  function bindEvents() {
    // --- klik (delegasi) ---
    document.addEventListener('click', (e) => {
      const closer = e.target.closest('[data-close]');
      if (closer) { const d = closer.closest('dialog'); if (d) closeDialog(d); return; }

      const menu = $('#dataMenu');
      if (menu && menu.hasAttribute('open') && !e.target.closest('#dataMenu')) closeMenu();

      const el = e.target.closest('[data-action]');
      if (!el) return;
      const id = el.dataset.id;

      switch (el.dataset.action) {
        case 'task-add': openTaskForm(); break;
        case 'task-edit': openTaskForm(id); break;
        case 'task-delete': deleteTask(id); break;
        case 'clear-filters': clearFilters(); break;
        case 'meeting-add': openMeetingForm(); break;
        case 'meeting-edit': openMeetingForm(id); break;
        case 'meeting-delete': deleteMeeting(id); break;
        case 'timeline-edit': openTimelineForm(id); break;
        case 'member-add': openMemberForm(null, el.dataset.division); break;
        case 'member-edit': openMemberForm(id); break;
        case 'member-delete': deleteMember(id); break;
        case 'goto': window.location.hash = '#' + el.dataset.view; break;
        case 'export': closeMenu(); exportJSON(); break;
        case 'import': closeMenu(); $('#importFile').click(); break;
        case 'seed': closeMenu(); loadSeedManually(); break;
        case 'reset': closeMenu(); resetData(); break;
        case 'print': printPage(); break;
        default: break; // task-status / task-progress ditangani di event change
      }
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    // --- ubah status / progres langsung dari daftar ---
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('input[data-action="task-progress"]')) {
        // pratinjau langsung saat slider digeser (disimpan saat dilepas)
        const cell = t.closest('td');
        cell.querySelector('.pct').textContent = t.value + '%';
        cell.querySelector('.bar > span').style.width = t.value + '%';
      }
    });

    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('select[data-action="task-status"]')) setTaskStatus(t.dataset.id, t.value);
      else if (t.matches('input[data-action="task-progress"]')) setTaskProgress(t.dataset.id, t.value);
    });

    // --- filter & pencarian ---
    $('#taskSearch').addEventListener('input', renderTasks);
    $('#filterDivision').addEventListener('change', renderTasks);
    $('#filterStatus').addEventListener('change', renderTasks);

    // --- form ---
    $('#taskForm').addEventListener('submit', handleTaskSubmit);
    $('#meetingForm').addEventListener('submit', handleMeetingSubmit);
    $('#timelineForm').addEventListener('submit', handleTimelineSubmit);
    $('#memberForm').addEventListener('submit', handleMemberSubmit);

    // sinkronisasi antar kolom di form tugas
    $('#taskDivision').addEventListener('change', refreshOwnerSuggestions);
    $('#taskStatus').addEventListener('change', () => {
      const status = $('#taskStatus').value;
      if (status === 'Selesai') $('#taskProgress').value = 100;
      if (status === 'Belum Dimulai') $('#taskProgress').value = 0;
      $('#taskProgressOut').textContent = $('#taskProgress').value + '%';
    });
    $('#taskProgress').addEventListener('input', () => {
      const v = Number($('#taskProgress').value);
      const status = $('#taskStatus');
      if (v === 100 && (status.value === 'Belum Dimulai' || status.value === 'Sedang Dikerjakan')) status.value = 'Menunggu Pemeriksaan';
      else if (v > 0 && v < 100 && status.value === 'Belum Dimulai') status.value = 'Sedang Dikerjakan';
      $('#taskProgressOut').textContent = v + '%';
    });

    // sinkronisasi antar kolom di form timeline
    $('#timelineDeadline').addEventListener('change', () => syncTimelineForm('deadline'));
    $('#timelineStatus').addEventListener('change', () => syncTimelineForm('status'));
    $('#timelineProgress').addEventListener('input', () => syncTimelineForm('progress'));

    // --- dialog: klik latar gelap untuk menutup ---
    $$('dialog').forEach((d) => {
      let downOnBackdrop = false;
      d.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === d; });
      d.addEventListener('click', (e) => { if (e.target === d && downOnBackdrop) closeDialog(d, 'cancel'); });
    });

    // --- impor ---
    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ''; // agar berkas yang sama bisa dipilih lagi
      handleImportFile(file);
    });

    // --- navigasi & cetak ---
    window.addEventListener('hashchange', () => showView(viewFromHash()));
    window.addEventListener('beforeprint', setPrintMeta);

    // --- tangkap error tak terduga agar tidak gagal diam-diam ---
    window.addEventListener('error', (e) => toast('Terjadi kesalahan: ' + (e.message || 'tidak diketahui'), 'error', 6000));
    window.addEventListener('unhandledrejection', () => toast('Terjadi kesalahan saat memproses permintaan.', 'error', 6000));
  }

  async function init() {
    state = loadState();
    fillStaticOptions();
    bindEvents();
    // Pengunjung baru: ambil data awal bersama (data.json) sebelum halaman digambar.
    if (startedFresh) {
      const seed = await fetchSeed();
      if (seed) { state = seed.data; writeSeedId(seed.id); saveState(); }
    }
    renderAll();
    showView(viewFromHash());
    if (startupNotice) toast(startupNotice, 'warn', 8000);
    // Pengunjung lama: tawarkan data.json hanya bila isinya berubah sejak terakhir diproses.
    if (!startedFresh) checkSeedUpdate();
  }

  init().catch((err) => { console.error(err); toast('Gagal memulai aplikasi: ' + err.message, 'error', 8000); });
})();
