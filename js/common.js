/**
 * common.js — fungsi bersama lintas halaman
 * Perbaikan:
 *  1. Gunakan db.ref(".info/connected") untuk status koneksi Firebase yang akurat
 *  2. requireAuth menampilkan error jika Firebase Auth gagal (domain tidak diizinkan, dll)
 *  3. Loading screen otomatis timeout dengan pesan jelas
 *  4. [BUG FIX] Listener .info/connected dipasang SETELAH sidebar dibangun,
 *     sehingga elemen conn-inner sudah ada saat event pertama kali tiba.
 *     Sebelumnya listener dipasang terlalu awal → badge selalu "Menghubungkan..."
 */

// ─── DEBUG LOGGER ───────────────────────────────────────────────────────────
// Cara baca log: buka DevTools → Console (F12 → Console)
// Prefix warna:
//   [FIREBASE] → inisialisasi & auth
//   [DB]       → Realtime Database
//   [PROFILE]  → load profil user
//   [SENSOR]   → subscribe data sensor
//   [CONN]     → status koneksi .info/connected
const _dbg = {
  log:  (tag, ...a) => console.log(`%c[${tag}]`,  "color:#60a5fa;font-weight:bold", ...a),
  ok:   (tag, ...a) => console.log(`%c[${tag}] ✅`, "color:#34d399;font-weight:bold", ...a),
  warn: (tag, ...a) => console.warn(`%c[${tag}] ⚠️`, "color:#fbbf24;font-weight:bold", ...a),
  err:  (tag, ...a) => console.error(`%c[${tag}] ❌`, "color:#f87171;font-weight:bold", ...a),
};

// Log kondisi awal saat script dimuat
_dbg.log("FIREBASE", "common.js dimuat. Memeriksa objek Firebase global...");
try { _dbg.ok("FIREBASE", "firebase.app() OK →", firebase.app().name); } catch(e) { _dbg.err("FIREBASE", "firebase.app() gagal:", e.message); }
try { _dbg.ok("FIREBASE", "auth tersedia →", typeof auth, "| currentUser sekarang:", auth.currentUser?.email ?? "null (belum diketahui)"); } catch(e) { _dbg.err("FIREBASE", "auth tidak tersedia:", e.message); }
try { _dbg.ok("FIREBASE", "db tersedia →", typeof db, "| ref:", db.ref().toString()); } catch(e) { _dbg.err("FIREBASE", "db tidak tersedia:", e.message); }

// ── Auth state + redirect ─────────────────────────────────────

let _currentUser    = null;
let _currentProfile = null;
let _fuzzyConfig    = Object.assign({}, DEFAULT_CONFIG);
let _sensorUnsub    = null;
let _settingsUnsub  = null;
let _connUnsub      = null;   // referensi listener .info/connected agar bisa di-off
let _prevStatus        = "AMAN";
let _telegramCfg       = null;
let _latestSensorData  = null;   // data mentah sensor terbaru
let _latestFuzzyResult = null;   // hasil fuzzy terbaru
let _tgPollTimer       = null;   // setInterval handle
let _tgPollOffset      = 0;      // update_id offset agar tidak re-proses pesan lama

/** Panggil di awal setiap halaman (kecuali index.html).
 *  Kalau belum login → redirect ke index.html */
function requireAuth(onReady) {
  const loading = document.getElementById("loading-screen");
  _dbg.log("FIREBASE", "requireAuth() dipanggil. Menunggu onAuthStateChanged...");

  // Timeout 10 detik — jika Firebase tidak merespons, tampilkan error
  const timeoutId = setTimeout(() => {
    _dbg.err("FIREBASE", "TIMEOUT 10 detik — auth.onAuthStateChanged tidak pernah terpanggil!");
    _dbg.err("FIREBASE", "Kemungkinan: domain belum di-authorize di Firebase Console, atau CDN Firebase diblokir.");
    _showLoadingError(
      "Firebase tidak merespons.<br>" +
      "Kemungkinan penyebab:<br>" +
      "<b>Domain belum didaftarkan</b> di Firebase Console → Authentication → Settings → Authorized domains.<br>" +
      "Tambahkan domain GitHub Pages Anda (contoh: <code>username.github.io</code>) ke daftar tersebut."
    );
  }, 10000);

  auth.onAuthStateChanged(async (user) => {
    clearTimeout(timeoutId);
    _dbg.ok("FIREBASE", "onAuthStateChanged terpanggil → user:", user ? user.email : "null (tidak login)");

    if (!user) {
      _dbg.warn("FIREBASE", "Tidak ada user → redirect ke index.html dalam 400ms");
      setTimeout(() => { window.location.href = "index.html"; }, 400);
      return;
    }

    _currentUser = user;
    _dbg.ok("FIREBASE", "User login:", user.email, "| uid:", user.uid);

    try {
      _dbg.log("PROFILE", "Memuat profil dari Realtime Database...");
      _currentProfile = await loadProfile(user);
      _dbg.ok("PROFILE", "Profil berhasil dimuat:", JSON.stringify(_currentProfile));
    } catch (e) {
      _dbg.err("PROFILE", "loadProfile() gagal:", e.message);
      _showLoadingError("Gagal memuat profil: " + e.message);
      return;
    }

    if (loading) loading.style.display = "none";
    buildSidebar();
    loadTelegramConfig();
    _dbg.ok("FIREBASE", "Sidebar dibangun. #conn-inner seharusnya sudah ada di DOM:", !!document.getElementById("conn-inner"));

    // ── [BUG FIX] Pasang listener .info/connected DI SINI, setelah buildSidebar()
    // sehingga elemen #conn-inner sudah ada di DOM dan setConnected() bisa mengupdate badge.
    if (_connUnsub) {
      _dbg.warn("CONN", "Listener .info/connected lama terdeteksi → dimatikan dulu");
      db.ref(".info/connected").off("value", _connUnsub);
    }
    _dbg.log("CONN", "Memasang listener db.ref('.info/connected')...");
    _connUnsub = db.ref(".info/connected").on(
      "value",
      (snap) => {
        const val = snap.val();
        _dbg.ok("CONN", ".info/connected event tiba → nilai:", val, "| setConnected:", val === true);
        setConnected(val === true);
      },
      (err) => {
        _dbg.err("CONN", ".info/connected listener ERROR:", err.code, err.message);
        // Jika permission denied, database rules memblokir akses sama sekali
        setConnected(false);
      }
    );

    subscribeSettings();
    if (onReady) {
      _dbg.log("FIREBASE", "Memanggil onReady callback...");
      onReady(_currentProfile);
    }
  });
}

function _showLoadingError(html) {
  const loading = document.getElementById("loading-screen");
  if (!loading) return;
  loading.innerHTML = `
    <div style="max-width:360px;text-align:center;padding:24px;">
      <div style="width:56px;height:56px;border-radius:16px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p style="color:#f87171;font-weight:600;font-size:15px;margin-bottom:8px;">Koneksi Firebase Gagal</p>
      <p style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;">${html}</p>
      <div style="margin-top:20px;padding:12px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);text-align:left;">
        <p style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Cara memperbaiki:</p>
        <ol style="color:rgba(255,255,255,0.5);font-size:12px;line-height:1.8;padding-left:16px;">
          <li>Buka <b>Firebase Console</b> → Authentication</li>
          <li>Pilih tab <b>Settings</b> → <b>Authorized domains</b></li>
          <li>Klik <b>Add domain</b> → masukkan <b>username.github.io</b></li>
          <li>Simpan, lalu muat ulang halaman ini</li>
        </ol>
      </div>
      <button onclick="window.location.href='index.html'" style="margin-top:16px;padding:10px 24px;border-radius:10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;font-size:13px;cursor:pointer;">Kembali ke Login</button>
    </div>
  `;
}

// ── Profile ───────────────────────────────────────────────────

async function loadProfile(user) {
  const email = user.email || "";
  _dbg.log("PROFILE", "loadProfile() → email:", email, "| uid:", user.uid);

  // Cari di Akun/ berdasarkan email
  // STRATEGI: 2 langkah terpisah dalam try-catch masing-masing, sehingga
  // jika orderByChild gagal (mis. belum ada .indexOn di Rules), fallback scan tetap berjalan.
  let akunKey = null;

  // Langkah 1: coba pakai orderByChild (cepat, tapi butuh .indexOn di Rules)
  try {
    _dbg.log("PROFILE", "Langkah 1 — orderByChild('email').equalTo('" + email + "')...");
    _dbg.warn("PROFILE", "Catatan: butuh '.indexOn': 'email' di Firebase Rules node /Akun. Jika error, lanjut ke scan manual.");
    const snap = await db.ref("Akun").orderByChild("email").equalTo(email).get();
    if (snap.exists()) {
      akunKey = Object.keys(snap.val())[0];
      _dbg.ok("PROFILE", "akunKey ditemukan via orderByChild:", akunKey);
    } else {
      _dbg.warn("PROFILE", "orderByChild tidak menemukan email → akan dilanjutkan ke scan manual");
    }
  } catch(e) {
    // Error "Index not defined" terjadi jika Firebase Rules tidak punya .indexOn: "email"
    // Ini BUKAN error fatal — kita lanjut ke scan manual di bawah
    _dbg.warn("PROFILE", "orderByChild gagal (wajar jika belum ada .indexOn di Rules):", e.message,
      "→ Lanjut ke scan manual Akun/");
  }

  // Langkah 2: fallback — scan semua Akun/ (selalu jalan jika akunKey belum ditemukan)
  if (!akunKey) {
    try {
      _dbg.log("PROFILE", "Langkah 2 — scan manual db.ref('Akun').get()...");
      const all = await db.ref("Akun").get();
      if (all.exists()) {
        const data = all.val();
        _dbg.log("PROFILE", "Jumlah akun di DB:", Object.keys(data).length, "| Keys:", Object.keys(data).join(", "));
        for (const [k, v] of Object.entries(data)) {
          _dbg.log("PROFILE", "  Cek key '" + k + "' → email di DB:", v.email, "| email login:", email);
          if (v.email && v.email.toLowerCase() === email.toLowerCase()) {
            akunKey = k;
            _dbg.ok("PROFILE", "akunKey ditemukan via scan:", akunKey);
            break;
          }
        }
        if (!akunKey) {
          _dbg.warn("PROFILE", "Scan selesai tapi email '" + email + "' tidak ada di node Akun/ manapun!");
        }
      } else {
        _dbg.warn("PROFILE", "Node 'Akun/' kosong atau tidak ada di database!");
      }
    } catch(e2) {
      _dbg.err("PROFILE", "Scan manual Akun/ juga gagal:", e2.code, e2.message,
        "→ Kemungkinan Database Rules memblokir read ke node 'Akun/' sama sekali.");
    }
  }

  if (!akunKey) {
    _dbg.warn("PROFILE", "akunKey tidak ditemukan setelah 2 langkah. Sensor path akan pakai 'sensor' (bukan 'Akun/<key>')");
  }

  let prof = null;
  if (akunKey) {
    const s = await db.ref(`Akun/${akunKey}`).get();
    if (s.exists()) {
      const d = s.val();
      _dbg.ok("PROFILE", "Data Akun/" + akunKey + ":", JSON.stringify(d));
      prof = {
        uid: user.uid, email, akunKey,
        nama: d.nama || akunKey,
        role: d.role || "user",
        aktif: d.aktif !== false,
        loginTerakhir: Date.now(),
      };
      db.ref(`Akun/${akunKey}/loginTerakhir`).set(Date.now());
    }
  }

  if (!prof) {
    _dbg.log("PROFILE", "Mencoba users/" + user.uid + "...");
    const s = await db.ref(`users/${user.uid}`).get();
    if (s.exists()) {
      prof = { ...s.val(), akunKey };
      _dbg.ok("PROFILE", "Profil dari users/" + user.uid + ":", JSON.stringify(prof));
    } else {
      _dbg.warn("PROFILE", "users/" + user.uid + " juga tidak ada → membuat profil default");
      prof = {
        uid: user.uid, email, akunKey,
        nama: user.displayName || email.split("@")[0] || "User",
        role: "user", aktif: true,
      };
      db.ref(`users/${user.uid}`).set({ ...prof, loginTerakhir: Date.now() });
    }
    db.ref(`users/${user.uid}/loginTerakhir`).set(Date.now());
  }

  _dbg.ok("PROFILE", "Profil final yang digunakan:", JSON.stringify(prof));
  logActivity(user.uid, "Login").catch(() => {});
  return prof;
}

async function logActivity(uid, aktivitas) {
  const now = new Date();
  await db.ref(`logs/${Date.now()}`).set({
    user: uid, aktivitas,
    tanggal: now.toLocaleDateString("id-ID"),
    jam: now.toLocaleTimeString("id-ID"),
  });
}

// ── Settings (dynamic fuzzy threshold) ───────────────────────

function subscribeSettings() {
  db.ref("settings").on("value", (snap) => {
    if (!snap.exists()) return;
    const v = snap.val();
    const n = (k, fb) => (typeof v[k] === "number" ? v[k] : fb);
    _fuzzyConfig = {
      suhuMin:  n("suhuMin",  DEFAULT_CONFIG.suhuMin),
      suhuMax:  n("suhuMax",  DEFAULT_CONFIG.suhuMax),
      humidMin: n("humidMin", DEFAULT_CONFIG.humidMin),
      humidMax: n("humidMax", DEFAULT_CONFIG.humidMax),
      asapMin:  n("asapMin",  DEFAULT_CONFIG.asapMin),
      asapMax:  n("asapMax",  DEFAULT_CONFIG.asapMax),
    };
  });
}

// ── Sensor subscription ───────────────────────────────────────

/**
 * @param {function} onData    - callback(sensorData, fuzzyResult)
 * @param {function} onConnect - callback(bool) — opsional, override koneksi sensor
 */
function subscribeSensor(onData, onConnect) {
  const path = _currentProfile?.akunKey
    ? `Akun/${_currentProfile.akunKey}`
    : "sensor";

  _dbg.log("SENSOR", "subscribeSensor() → path:", path,
    "| akunKey:", _currentProfile?.akunKey ?? "(tidak ada, pakai 'sensor')");

  if (_sensorUnsub) {
    _dbg.warn("SENSOR", "Listener lama aktif → dimatikan dulu sebelum subscribe ulang");
    db.ref(path).off("value", _sensorUnsub);
    _sensorUnsub = null;
  }

  _dbg.log("SENSOR", "Memasang listener db.ref('" + path + "').on('value', ...)");

  _sensorUnsub = db.ref(path).on(
    "value",
    (snap) => {
      _dbg.ok("SENSOR", "Event 'value' tiba dari '" + path + "' → exists:", snap.exists());
      if (!snap.exists()) {
        _dbg.warn("SENSOR", "Snapshot kosong! Node '" + path + "' tidak ada di database.",
          "Pastikan ESP/perangkat sudah menulis data ke path ini.");
        if (onConnect) onConnect(false);
        return;
      }
      const raw  = snap.val();
      _dbg.log("SENSOR", "Data mentah dari Firebase:", JSON.stringify(raw));
      const data = normalisasi(raw);
      _dbg.log("SENSOR", "Setelah normalisasi:", JSON.stringify(data));

      // hitungFuzzy: 4 input (suhu, kelembaban, asap, api) — rule base asli + bug fix api absolut
      const result = hitungFuzzy(data.suhu, data.kelembaban, data.asap, data.api, _fuzzyConfig);
      _dbg.log("SENSOR", "Hasil fuzzy → status:", result.status, "| crisp:", result.nilaiCrisp);

      // Simpan data terbaru agar bisa diakses oleh bot command /status
      _latestSensorData  = data;
      _latestFuzzyResult = result;

      if (onConnect) onConnect(true);
      if (onData) onData(data, result);

      // Catat ke history saat status berubah ke BAHAYA/KEBAKARAN
      if (result.status !== _prevStatus) {
        _dbg.log("SENSOR", "Status berubah:", _prevStatus, "→", result.status);
        if (result.status === "BAHAYA") {
          const now = new Date();
          db.ref(`history/${Date.now()}`).set({
            tanggal:    now.toLocaleDateString("id-ID"),
            jam:        now.toLocaleTimeString("id-ID"),
            suhu:       data.suhu,
            kelembaban: data.kelembaban,
            asap:       data.asap,
            api:        data.api,
            fuzzy:      result.nilaiCrisp,
            status:     result.status,
            timestamp:  Date.now(),
          });
        }
        // Kirim notifikasi Telegram saat status jadi WASPADA/BAHAYA
        if (["WASPADA","BAHAYA"].includes(result.status)) {
          sendTelegramAlert(result.status, data, result);
        }
        _prevStatus = result.status;
      }
    },
    (err) => {
      _dbg.err("SENSOR", "Listener '" + path + "' ERROR:", err.code, err.message);
      _dbg.err("SENSOR", "→ Kemungkinan penyebab: Database Rules memblokir read, atau path salah.");
      if (onConnect) onConnect(false);
    }
  );
}

function normalisasi(raw) {
  return {
    suhu:       Number(raw.suhu       ?? raw.temperature ?? raw.temp  ?? 0),
    kelembaban: Number(raw.kelembaban ?? raw.humidity    ?? raw.hum   ?? 0),
    asap:       Number(raw.asap       ?? raw.smoke       ?? raw.gas   ?? raw.mq2 ?? 0),
    api:        Number(raw.api        ?? raw.flame       ?? raw.fire  ?? raw.flame_sensor ?? 0),
  };
}

// ── Telegram Notification ─────────────────────────────────────

function loadTelegramConfig() {
  db.ref("telegram").on("value", snap => {
    _telegramCfg = snap.exists() ? snap.val() : null;
    _dbg.log("TELEGRAM", "Config:", _telegramCfg ? "loaded ✅" : "tidak ada");
    // Restart polling sesuai config terbaru
    stopTelegramPolling();
    if (_telegramCfg?.polling && _telegramCfg?.token) startTelegramPolling();
  });
}

// ── Bot Command Polling ───────────────────────────────────────

function startTelegramPolling() {
  if (_tgPollTimer) return;                 // sudah berjalan
  _dbg.ok("TELEGRAM", "Polling commands dimulai (interval 4 detik)");
  // Ambil offset terkini dulu agar tidak membalas pesan lama
  _tgInitOffset().then(() => {
    _tgPollTimer = setInterval(pollTelegramUpdates, 4000);
  });
}

function stopTelegramPolling() {
  if (_tgPollTimer) { clearInterval(_tgPollTimer); _tgPollTimer = null; }
}

async function _tgInitOffset() {
  // Panggil getUpdates sekali untuk set offset ke pesan paling akhir
  try {
    const token = _telegramCfg?.token;
    if (!token) return;
    const res  = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=1&allowed_updates=message`);
    const json = await res.json();
    if (json.ok && json.result.length) {
      _tgPollOffset = json.result[json.result.length - 1].update_id + 1;
    }
  } catch(_) {}
}

async function pollTelegramUpdates() {
  const token = _telegramCfg?.token;
  if (!token) return;
  try {
    const res  = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${_tgPollOffset}&limit=10&allowed_updates=message`,
      { signal: AbortSignal.timeout(6000) }
    );
    const json = await res.json();
    if (!json.ok) return;
    for (const upd of json.result) {
      _tgPollOffset = upd.update_id + 1;
      if (upd.message?.text) handleTelegramCommand(upd.message);
    }
  } catch(_) {}
}

// ── Command dispatcher ────────────────────────────────────────

async function handleTelegramCommand(msg) {
  const raw  = (msg.text || "").trim();
  if (!raw.startsWith("/")) return;
  // Hapus @BotName suffix jika ada
  const cmd  = raw.split(" ")[0].replace(/@\S+/, "").toLowerCase();
  const args = raw.split(" ").slice(1).join(" ").trim();
  const cid  = msg.chat.id;

  let reply = "";
  switch (cmd) {
    case "/start":
    case "/help":   reply = await _tgCmdHelp();        break;
    case "/status": reply = await _tgCmdStatus();      break;
    case "/sensor": reply = await _tgCmdSensor();      break;
    case "/laporan":reply = await _tgCmdLaporan();     break;
    case "/history":reply = await _tgCmdHistory();     break;
    case "/harini": reply = await _tgCmdHariIni();     break;
    case "/alert":  reply = await _tgCmdAlert(args);   break;
    case "/ping":   reply = `🏓 Pong\\! Bot aktif dan terhubung ke Firebase\\.`; break;
    default: return; // abaikan bukan command yang dikenal
  }
  if (!reply) return;
  await _tgSend(cid, reply);
}

async function _tgSend(chatId, text, extra = {}) {
  const token = _telegramCfg?.token;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2", ...extra }),
    });
  } catch(_) {}
}

// Helper: escape karakter MarkdownV2
function _esc(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

// ── Command handlers ──────────────────────────────────────────

function _tgCmdHelp() {
  return (
    `🤖 *Bot Deteksi Kebakaran — IoT Fuzzy Sugeno*\n\n` +
    `Daftar perintah tersedia:\n\n` +
    `📡 /status — Status sensor & kondisi saat ini\n` +
    `🌡 /sensor — Pembacaan sensor mentah lengkap\n` +
    `📋 /laporan — Ringkasan statistik semua insiden\n` +
    `📜 /history — 5 insiden terakhir\n` +
    `📆 /harini — Rekap insiden hari ini\n` +
    `🔔 /alert on — Aktifkan notifikasi otomatis\n` +
    `🔕 /alert off — Nonaktifkan notifikasi otomatis\n` +
    `🏓 /ping — Cek koneksi bot\n` +
    `❓ /help — Tampilkan bantuan ini`
  );
}

function _tgCmdStatus() {
  if (!_latestSensorData || !_latestFuzzyResult) {
    return "⏳ *Data sensor belum tersedia*\\.\nPastikan perangkat IoT sudah terhubung dan mengirim data\\.";
  }
  const d   = _latestSensorData;
  const f   = _latestFuzzyResult;
  const emo = { AMAN:"✅", WASPADA:"⚠️", BAHAYA:"🔥", KEBAKARAN:"🚨" }[f.status] || "ℹ️";
  const now = new Date();
  return (
    `${emo} *STATUS SISTEM SAAT INI*\n` +
    `\`════════════════════\`\n` +
    `📅 *Waktu:* ${_esc(now.toLocaleTimeString("id-ID"))}\n\n` +
    `🌡 Suhu: *${_esc(d.suhu)} °C*\n` +
    `💧 Kelembaban: *${_esc(d.kelembaban)} %*\n` +
    `💨 Asap: *${_esc(d.asap)} ppm*\n` +
    `🕯 Api: *${d.api ? "Terdeteksi ‼️" : "Aman ✅"}*\n` +
    `📊 Fuzzy Output: *${_esc(f.nilaiCrisp?.toFixed(2) ?? "-")}*\n` +
    `🔖 Status: *${_esc(f.status)}*`
  );
}

function _tgCmdSensor() {
  if (!_latestSensorData) {
    return "⏳ *Belum ada data sensor*\\. Perangkat IoT mungkin belum mengirim data\\.";
  }
  const d = _latestSensorData;
  return (
    `🔬 *PEMBACAAN SENSOR LENGKAP*\n` +
    `\`════════════════════\`\n` +
    `🌡 *Suhu:*\n` +
    `  Nilai: \`${_esc(d.suhu)} °C\`\n\n` +
    `💧 *Kelembaban:*\n` +
    `  Nilai: \`${_esc(d.kelembaban)} %\`\n\n` +
    `💨 *Sensor Asap \\(MQ\\-2\\):*\n` +
    `  Nilai: \`${_esc(d.asap)} ppm\`\n\n` +
    `🕯 *Sensor Api \\(Flame\\):*\n` +
    `  Nilai: \`${_esc(d.api)}\`  ${d.api ? "→ API TERDETEKSI ‼️" : "→ Tidak ada api ✅"}`
  );
}

async function _tgCmdLaporan() {
  try {
    const snap  = await db.ref("history").once("value");
    const items = snap.exists() ? Object.values(snap.val()) : [];
    const total    = items.length;
    const waspada  = items.filter(i => i.status === "WASPADA").length;
    const bahaya   = items.filter(i => i.status === "BAHAYA").length;
    const kebakaran= items.filter(i => i.status === "KEBAKARAN").length;
    const withApi  = items.filter(i => i.api).length;
    const suhuArr  = items.map(i => Number(i.suhu)).filter(Boolean);
    const suhuMax  = suhuArr.length ? Math.max(...suhuArr).toFixed(1) : "-";
    const asapArr  = items.map(i => Number(i.asap)).filter(Boolean);
    const asapMax  = asapArr.length ? Math.max(...asapArr) : "-";
    return (
      `📋 *LAPORAN RINGKASAN INSIDEN*\n` +
      `\`════════════════════\`\n` +
      `📊 Total Insiden: *${_esc(total)}*\n` +
      `⚠️ Waspada: *${_esc(waspada)}*\n` +
      `🔥 Bahaya: *${_esc(bahaya)}*\n` +
      `🚨 Kebakaran: *${_esc(kebakaran)}*\n` +
      `🕯 Api Terdeteksi: *${_esc(withApi)} kali*\n\n` +
      `📈 Suhu Tertinggi: *${_esc(suhuMax)} °C*\n` +
      `📈 Asap Tertinggi: *${_esc(asapMax)} ppm*`
    );
  } catch(e) {
    return `❌ Gagal mengambil data laporan\\: ${_esc(e.message)}`;
  }
}

async function _tgCmdHistory() {
  try {
    const snap  = await db.ref("history").limitToLast(5).once("value");
    if (!snap.exists()) return "📂 *Belum ada data histori insiden\\.* Sistem aman\\!";
    const items = Object.values(snap.val()).reverse();
    const emoMap = { WASPADA:"⚠️", BAHAYA:"🔥", KEBAKARAN:"🚨" };
    const baris  = items.map((item, i) => {
      const emo = emoMap[item.status] || "ℹ️";
      return (
        `${i+1}\\. ${emo} *${_esc(item.status)}*\n` +
        `   📅 ${_esc(item.tanggal)} ${_esc(item.jam)}\n` +
        `   🌡 ${_esc(item.suhu)}°C  💨 ${_esc(item.asap)} ppm  🕯 ${item.api ? "Api ‼️" : "Aman"}`
      );
    }).join("\n\n");
    return `📜 *5 INSIDEN TERAKHIR*\n\`════════════════════\`\n\n${baris}`;
  } catch(e) {
    return `❌ Gagal mengambil histori\\: ${_esc(e.message)}`;
  }
}

async function _tgCmdHariIni() {
  try {
    const snap  = await db.ref("history").once("value");
    if (!snap.exists()) return "📂 *Belum ada insiden hari ini\\.* Sistem aman\\!";
    const hariIni = new Date().toLocaleDateString("id-ID");
    const items   = Object.values(snap.val()).filter(i => i.tanggal === hariIni);
    if (!items.length) return `📆 *Tidak ada insiden hari ini* \\(${_esc(hariIni)}\\)\\. Sistem aman ✅`;
    const waspada   = items.filter(i => i.status === "WASPADA").length;
    const bahaya    = items.filter(i => i.status === "BAHAYA").length;
    const kebakaran = items.filter(i => i.status === "KEBAKARAN").length;
    const suhuMax   = Math.max(...items.map(i => Number(i.suhu))).toFixed(1);
    const asapMax   = Math.max(...items.map(i => Number(i.asap)));
    return (
      `📆 *REKAP HARI INI* \\(${_esc(hariIni)}\\)\n` +
      `\`════════════════════\`\n` +
      `📊 Total Insiden: *${_esc(items.length)}*\n` +
      `⚠️ Waspada: *${_esc(waspada)}*\n` +
      `🔥 Bahaya: *${_esc(bahaya)}*\n` +
      `🚨 Kebakaran: *${_esc(kebakaran)}*\n\n` +
      `📈 Suhu Tertinggi: *${_esc(suhuMax)} °C*\n` +
      `📈 Asap Tertinggi: *${_esc(asapMax)} ppm*`
    );
  } catch(e) {
    return `❌ Gagal\\: ${_esc(e.message)}`;
  }
}

async function _tgCmdAlert(args) {
  const arg = args.toLowerCase();
  if (arg === "on") {
    await db.ref("telegram/aktif").set(true);
    return "🔔 Notifikasi otomatis *diaktifkan* ✅\\.";
  } else if (arg === "off") {
    await db.ref("telegram/aktif").set(false);
    return "🔕 Notifikasi otomatis *dinonaktifkan*\\.";
  }
  const on = _telegramCfg?.aktif ? "✅ Aktif" : "❌ Nonaktif";
  return `🔔 Status notifikasi: *${_esc(on)}*\nGunakan /alert on atau /alert off untuk mengubah\\.`;
}

async function sendTelegramAlert(status, data, fuzzy) {
  if (!_telegramCfg) return;
  const { token, chatId, aktif, levels } = _telegramCfg;
  if (!aktif || !token || !chatId) return;
  const levelKey = { WASPADA:"waspada", BAHAYA:"bahaya", KEBAKARAN:"kebakaran" }[status];
  if (!levelKey || !levels?.[levelKey]) return;

  const now  = new Date();
  const tgl  = now.toLocaleDateString("id-ID", { day:"2-digit", month:"long", year:"numeric" });
  const jam  = now.toLocaleTimeString("id-ID");
  const emo  = { WASPADA:"⚠️", BAHAYA:"🔥", KEBAKARAN:"🚨" }[status] || "ℹ️";
  const apiTxt = data.api ? "🔥 *Terdeteksi ‼️*" : "✅ Tidak terdeteksi";

  const msg =
    `${emo} *PERINGATAN ${status}*\n` +
    `\`════════════════════\`\n` +
    `📅 *Waktu:* ${tgl}, ${jam}\n\n` +
    `🌡 *Suhu:* ${data.suhu} °C\n` +
    `💧 *Kelembaban:* ${data.kelembaban} %\n` +
    `💨 *Asap:* ${data.asap} ppm\n` +
    `🕯 *Api:* ${apiTxt}\n` +
    `📊 *Fuzzy Output:* ${fuzzy?.nilaiCrisp?.toFixed(2) ?? "-"}\n\n` +
    `_Sistem Deteksi Kebakaran — IoT Fuzzy Sugeno_`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
    });
    const json = await res.json();
    if (json.ok) _dbg.ok("TELEGRAM", "Alert terkirim →", status);
    else _dbg.err("TELEGRAM", "API error:", json.description);
  } catch(e) {
    _dbg.err("TELEGRAM", "Fetch gagal:", e.message);
  }
}

// Kirim pesan test ke Telegram (dipanggil dari pengaturan.html)
async function testTelegramAlert(token, chatId) {
  const msg =
    `✅ *Tes Notifikasi Berhasil!*\n\n` +
    `Bot Telegram kamu terhubung dengan benar ke sistem deteksi kebakaran.\n\n` +
    `_Sistem Deteksi Kebakaran — IoT Fuzzy Sugeno_`;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
  });
  return await res.json();
}

// ── Sidebar ───────────────────────────────────────────────────

const NAV = [
  { href:"dashboard.html",  label:"Dashboard",    icon:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>', roles:["admin","petugas","user"] },
  { href:"histori.html",    label:"Histori Data", icon:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 15"/></svg>', roles:["admin","petugas","user"] },
  { href:"laporan.html",    label:"Laporan",      icon:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', roles:["admin","petugas"] },
  { href:"profil.html",     label:"Profil",       icon:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', roles:["admin","petugas","user"] },
  { href:"pengaturan.html", label:"Pengaturan",   icon:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>', roles:["admin","petugas"] },
  { href:"admin.html",      label:"Admin Panel",  icon:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', roles:["admin"] },
];

function buildSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar || !_currentProfile) return;

  const page = location.pathname.split("/").pop() || "dashboard.html";
  const role = _currentProfile.role || "user";
  const nav  = NAV.filter(n => n.roles.includes(role));

  sidebar.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid rgba(255,255,255,0.08);">
      <div class="sidebar-brand" style="display:flex;align-items:center;gap:8px;">
        <div style="width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#ef4444,#f97316);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
        </div>
        <div class="nav-label">
          <p style="color:#fff;font-size:12px;font-weight:700;line-height:1.2;">Fire Detection</p>
          <p style="color:rgba(255,255,255,0.4);font-size:10px;">Fuzzy Sugeno</p>
        </div>
      </div>
      <button id="sidebar-toggle" style="color:rgba(255,255,255,0.4);background:none;border:none;cursor:pointer;padding:4px;" title="Toggle sidebar">
        <svg id="toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </div>

    <div id="conn-badge" class="nav-label" style="padding:8px 12px;">
      <div id="conn-inner" style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:500;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/></svg>
        Menghubungkan...
      </div>
    </div>

    <nav style="flex:1;padding:8px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
      ${nav.map(item => `
        <a href="${item.href}" class="nav-item ${page === item.href ? 'active' : ''}">
          <span style="width:16px;height:16px;flex-shrink:0;">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
        </a>
      `).join("")}
    </nav>

    <div id="sidebar-footer" style="padding:12px;border-top:1px solid rgba(255,255,255,0.08);">
      <div class="nav-label" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#f97316);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0;">
          ${(_currentProfile.nama || "U").charAt(0).toUpperCase()}
        </div>
        <div style="min-width:0;">
          <p style="color:#fff;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_currentProfile.nama}</p>
          <p style="color:rgba(255,255,255,0.4);font-size:10px;text-transform:capitalize;">${_currentProfile.role}</p>
        </div>
      </div>
      <button onclick="doLogout()" style="width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;color:rgba(255,255,255,0.5);background:none;border:none;cursor:pointer;font-size:12px;" onmouseover="this.style.color='#f87171';this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.color='rgba(255,255,255,0.5)';this.style.background='none'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span class="nav-label">Keluar</span>
      </button>
    </div>
  `;

  document.getElementById("sidebar-toggle").addEventListener("click", toggleSidebar);

  // ── Mobile: tombol hamburger + overlay (dibuat sekali) ──
  if (!document.getElementById("mobile-menu-btn")) {
    const btn = document.createElement("button");
    btn.id = "mobile-menu-btn";
    btn.className = "mobile-menu-btn";
    btn.setAttribute("aria-label", "Buka menu");
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6"  x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
    btn.addEventListener("click", openMobileSidebar);
    document.body.appendChild(btn);
  }

  if (!document.getElementById("sidebar-overlay")) {
    const overlay = document.createElement("div");
    overlay.id = "sidebar-overlay";
    overlay.addEventListener("click", closeMobileSidebar);
    document.body.appendChild(overlay);
  }
}

function openMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  sidebar.classList.add("mobile-open");
  if (overlay) overlay.classList.add("active");
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  sidebar.classList.remove("mobile-open");
  if (overlay) overlay.classList.remove("active");
}

function toggleSidebar() {
  // Pada layar mobile: gunakan mobile-open, bukan collapsed
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById("sidebar");
    if (sidebar.classList.contains("mobile-open")) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
    return;
  }
  const sidebar = document.getElementById("sidebar");
  const main    = document.getElementById("main-content");
  const icon    = document.getElementById("toggle-icon");
  sidebar.classList.toggle("collapsed");
  main.classList.toggle("sidebar-collapsed");
  icon.innerHTML = sidebar.classList.contains("collapsed")
    ? '<polyline points="9 18 15 12 9 6"/>'
    : '<polyline points="15 18 9 12 15 6"/>';
}

// ── Koneksi badge (dipanggil dari .info/connected listener) ──

function setConnected(ok) {
  _dbg.log("CONN", "setConnected(" + ok + ") dipanggil →", ok ? "TERHUBUNG ✅" : "TIDAK TERHUBUNG ❌");
  const inner = document.getElementById("conn-inner");
  if (!inner) {
    _dbg.err("CONN", "#conn-inner tidak ditemukan di DOM! Sidebar mungkin belum dibangun.");
    return;
  }
  if (ok) {
    inner.style.background  = "rgba(16,185,129,0.1)";
    inner.style.borderColor = "rgba(16,185,129,0.2)";
    inner.style.color       = "#34d399";
    inner.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg> Terhubung Firebase`;
  } else {
    inner.style.background  = "rgba(239,68,68,0.1)";
    inner.style.borderColor = "rgba(239,68,68,0.2)";
    inner.style.color       = "#f87171";
    inner.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/></svg> Tidak Terhubung`;
  }
}

async function doLogout() {
  if (_currentUser) await logActivity(_currentUser.uid, "Logout").catch(() => {});
  await auth.signOut();
  window.location.href = "index.html";
}

// ── Toast ─────────────────────────────────────────────────────

let _toastTimeout;
function showToast(msg, type = "ok") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  const color = type === "ok" ? "#34d399" : type === "err" ? "#f87171" : "#60a5fa";
  el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;display:block;background:rgba(15,23,42,0.95);border:1px solid rgba(255,255,255,0.1);border-left:3px solid ${color};border-radius:12px;padding:12px 16px;color:#fff;font-size:13px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.4);`;
  el.textContent = msg;
  clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => { el.style.display = "none"; }, 3500);
}

// ── Helpers ───────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    AMAN: "badge-aman", WASPADA: "badge-waspada",
    BAHAYA: "badge-bahaya", KEBAKARAN: "badge-kebakaran",
  };
  return `<span class="badge ${map[status] || ''}">${status}</span>`;
}

function formatTanggal(d) {
  return d instanceof Date
    ? d.toLocaleDateString("id-ID", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
    : d;
}
function formatJam(d) {
  return d instanceof Date
    ? d.toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit", second:"2-digit" })
    : d;
}
