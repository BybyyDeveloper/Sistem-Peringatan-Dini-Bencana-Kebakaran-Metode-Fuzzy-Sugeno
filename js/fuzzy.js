/**
 * fuzzy.js — Fuzzy Sugeno Orde-Nol
 * Sesuai Tabel 4.1 (Dokumen Pribadi 2026) — diperbarui 19 rule
 *
 * 4 Input : Suhu (x), Kelembaban (z), Asap/Gas (y), Sensor Api (s)
 * 3 Output: AMAN (0), WASPADA (1), BAHAYA (2)
 *
 * ── Rule Base 19 Aturan ──────────────────────────────────────
 * === AMAN (Z=0) ===
 * R1 : Suhu Rendah  ∧ Kel Tinggi  ∧ Asap Rendah  ∧ Api Tidak  → AMAN     (Z=0)
 * R2 : Suhu Rendah  ∧ Kel Sedang  ∧ Asap Rendah  ∧ Api Tidak  → AMAN     (Z=0)
 * R3 : Suhu Sedang  ∧ Kel Tinggi  ∧ Asap Rendah  ∧ Api Tidak  → AMAN     (Z=0)
 * R4 : Suhu Sedang  ∧ Kel Sedang  ∧ Asap Rendah  ∧ Api Tidak  → AMAN     (Z=0)
 * R5 : Suhu Rendah  ∧ Kel Rendah  ∧ Asap Rendah  ∧ Api Tidak  → AMAN     (Z=0)
 * R6 : Suhu Sedang  ∧ Kel Rendah  ∧ Asap Rendah  ∧ Api Tidak  → AMAN     (Z=0)
 * === WASPADA (Z=1) ===
 * R7 : Suhu Sedang  ∧ Kel Sedang  ∧ Asap Sedang  ∧ Api Tidak  → WASPADA  (Z=1)
 * R8 : Suhu Tinggi  ∧ Kel Sedang  ∧ Asap Rendah  ∧ Api Tidak  → WASPADA  (Z=1)
 * R9 : Suhu Tinggi  ∧ Kel Rendah  ∧ Asap Rendah  ∧ Api Tidak  → WASPADA  (Z=1)
 * R10: Suhu Rendah  ∧ Kel Rendah  ∧ Asap Sedang  ∧ Api Tidak  → WASPADA  (Z=1)
 * R11: Suhu Sedang  ∧ Kel Rendah  ∧ Asap Sedang  ∧ Api Tidak  → WASPADA  (Z=1)  ← [FIX]
 * R12: Suhu Tinggi  ∧ Kel Rendah  ∧ Asap Sedang  ∧ Api Tidak  → WASPADA  (Z=1)
 * R13: Suhu Rendah  ∧ Kel Rendah  ∧ Asap Tinggi  ∧ Api Tidak  → WASPADA  (Z=1)
 * R14: Suhu Sedang  ∧ Kel Rendah  ∧ Asap Tinggi  ∧ Api Tidak  → WASPADA  (Z=1)
 * R15: Suhu Tinggi  ∧ Kel Rendah  ∧ Asap Tinggi  ∧ Api Tidak  → WASPADA  (Z=1)
 * === BAHAYA (Z=2) ===
 * R16: Suhu Sedang  ∧ Kel Rendah  ∧ Asap Sedang  ∧ Api Ada    → BAHAYA   (Z=2)
 * R17: Suhu Tinggi  ∧ Kel Rendah  ∧ Asap Tinggi  ∧ Api Ada    → BAHAYA   (Z=2)
 * R18: Suhu Rendah  ∧ Kel Rendah  ∧ Asap Tinggi  ∧ Api Ada    → BAHAYA   (Z=2)
 * R19: Suhu Tinggi  ∧ Kel Tinggi  ∧ Asap Tinggi  ∧ Api Ada    → BAHAYA   (Z=2)
 *
 * ── Fungsi Keanggotaan ───────────────────────────────────────
 * Rendah : trapf(x, 0, 0, min, max)
 *          µ=1 untuk x≤min, turun linear ke 0 di x=max
 *
 * Sedang : trimf(x, 2·min−max, min, max)   [suhu & asap]
 *          Puncak di min, kaki kanan di max.
 *          Contoh suhu: µ_Sedang(30) = (32−30)/(32−26) = 0,333  ✓
 *          Contoh asap: µ_Sedang(300) = (400−300)/(400−200) = 0,5 ✓
 *
 * Sedang kel: trapf(x, min−gap, min, max, max+gap)  [kelembaban]
 *          Puncak penuh di [min, max], ramp width = (max−min)/2
 *
 * Tinggi : trapf(x, max, max+(max−min), domainMax, domainMax)
 *          0 untuk x≤max, naik linear ke 1 dalam lebar (max−min)
 *          → Tidak tumpang tindih dengan Sedang (kaki kanan Sedang = max = kaki kiri Tinggi)
 *          Contoh: µSuhu_Tinggi(30) = 0 (30 < suhuMax=32)  ✓
 *
 * Api (biner): µ_Terdeteksi   = 1 jika api≥1, 0 jika tidak
 *              µ_TidakTerdeteksi = 1 jika api=0, 0 jika tidak
 *
 * ── Inferensi ────────────────────────────────────────────────
 * Operator AND = MIN → α_i = min(µ₁, µ₂, µ₃, µ₄)
 *
 * ── Defuzzifikasi ────────────────────────────────────────────
 * Weighted Average (Sugeno):
 *   Z_output = Σ(αᵢ · Zᵢ) / Σαᵢ
 *
 * Verifikasi contoh (x=30, z=30, y=300, s=0):
 *   sS=0,333  kR=1,0  aS=0,5  apiTidak=1
 *   R11 aktif: α₁₁ = min(0,333; 1,0; 0,5; 1) = 0,333  → WASPADA  ✓
 *
 * Verifikasi contoh dokumen (x=30, z=35, y=300, s=1):
 *   sS=0,333  kR=1,0  aS=0,5  apiAda=1
 *   R16 aktif: α₁₆ = min(0,333; 1,0; 0,5; 1) = 0,333
 *   Z = (0,333×2) / 0,333 = 2,0  → BAHAYA  ✓
 */

const DEFAULT_CONFIG = {
  suhuMin:  26, suhuMax:  32,
  humidMin: 40, humidMax: 60,
  asapMin: 200, asapMax: 400,
};

// ── Fungsi keanggotaan dasar ──────────────────────────────────

/**
 * Fungsi segitiga (Triangular MF)
 * a = kaki kiri, b = puncak, c = kaki kanan
 */
function trimf(x, a, b, c) {
  if (x <= a || x >= c) return 0;
  if (x <= b) return (x - a) / (b - a);
  return (c - x) / (c - b);
}

/**
 * Fungsi trapesium (Trapezoidal MF)
 * a,b = kaki kiri (naik dari a ke b), c,d = kaki kanan (turun dari c ke d)
 * µ = 1 untuk x ∈ [b, c]
 */
function trapf(x, a, b, c, d) {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x < b) return (x - a) / (b - a);
  return (d - x) / (d - c);
}

// ── Himpunan fuzzy per variabel ───────────────────────────────

/**
 * Himpunan RENDAH
 * µ = 1 untuk x ≤ min, turun linear ke 0 di x = max
 * Kurva: trapezoid datar kiri
 */
function mfRendah(x, min, max) {
  return trapf(x, 0, 0, min, max);
}

/**
 * Himpunan SEDANG untuk Suhu & Asap
 * Segitiga dengan puncak di min, kaki kanan di max.
 * Sesuai rumus dokumen:
 *   µ_Sedang(x) = (max - x) / (max - min)  untuk x ∈ [min, max]   ← sisi turun
 *   µ_Sedang(x) = (x - (2·min-max)) / (max - min)  untuk x ∈ [2·min-max, min] ← sisi naik
 */
function mfSedang(x, min, max) {
  return trimf(x, 2 * min - max, min, max);
}

/**
 * Himpunan SEDANG untuk Kelembaban
 * Trapezoid dengan puncak penuh di [humidMin, humidMax]
 * Ramp width = (humidMax - humidMin) / 2
 */
function kelSedang(x, min, max) {
  const gap = (max - min) / 2;
  return trapf(x, min - gap, min, max, max + gap);
}

/**
 * Himpunan TINGGI
 * µ = 0 untuk x ≤ max (tidak tumpang tindih dengan Sedang)
 * Naik linear dari max ke (max + lebar) lalu datar hingga domainMax.
 * Lebar = (max - min), simetris dengan lebar transisi Sedang.
 *
 * Contoh suhu: µSuhu_Tinggi(30) = 0  (30 < suhuMax=32) ✓
 */
function mfTinggi(x, min, max, domainMax) {
  const width = max - min;                          // lebar transisi = suhuMax - suhuMin
  return trapf(x, max, max + width, domainMax, domainMax);
}

// ── Fungsi utama ──────────────────────────────────────────────

/**
 * hitungFuzzy(suhu, kelembaban, asap, api, config?)
 *
 * @param {number} suhu       - Suhu dalam °C
 * @param {number} kelembaban - Kelembaban dalam %
 * @param {number} asap       - Kadar asap dalam ppm
 * @param {number} api        - Sensor api: 0 = tidak terdeteksi, 1 = terdeteksi
 * @param {object} [config]   - Override DEFAULT_CONFIG
 *
 * @returns {{
 *   nilaiCrisp: number,
 *   rawCrisp: number,
 *   status: "AMAN"|"WASPADA"|"BAHAYA",
 *   persentase: number,
 *   activeRules: string[],
 *   membership: object
 * }}
 */
function hitungFuzzy(suhu, kelembaban, asap, api, config) {
  const cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
  const { suhuMin, suhuMax, humidMin, humidMax, asapMin, asapMax } = cfg;

  // ── 1. FUZZIFIKASI ──────────────────────────────────────────

  // Suhu
  const sR = mfRendah(suhu,      suhuMin,  suhuMax);          // Suhu Rendah
  const sS = mfSedang(suhu,      suhuMin,  suhuMax);          // Suhu Sedang  [puncak di suhuMin]
  const sT = mfTinggi(suhu,      suhuMin,  suhuMax,  80);     // Suhu Tinggi  [mulai di suhuMax]

  // Kelembaban
  const kR = mfRendah(kelembaban, humidMin, humidMax);         // Kelembaban Rendah
  const kS = kelSedang(kelembaban, humidMin, humidMax);        // Kelembaban Sedang
  const kT = mfTinggi(kelembaban, humidMin, humidMax, 100);    // Kelembaban Tinggi

  // Asap / Gas
  const aR = mfRendah(asap,      asapMin,  asapMax);          // Asap Rendah
  const aS = mfSedang(asap,      asapMin,  asapMax);          // Asap Sedang  [puncak di asapMin]
  const aT = mfTinggi(asap,      asapMin,  asapMax, 1000);    // Asap Tinggi  [mulai di asapMax]

  // Api — variabel biner digital
  const apiAda   = api >= 1 ? 1 : 0;   // µ Terdeteksi
  const apiTidak = api >= 1 ? 0 : 1;   // µ Tidak Terdeteksi

  // ── 2. INFERENSI — 19 Rule Base ────────────────────────────
  // Operator AND = MIN  →  α_i = min(µ₁, µ₂, µ₃, µ₄)

  const rules = [
    // ── AMAN (Z = 0) — kondisi aman / terkendali ─────────────
    {
      alpha: Math.min(sR, kT, aR, apiTidak), z: 0,
      name: "R1: Suhu Rendah ∧ Kel Tinggi ∧ Asap Rendah ∧ Api Tidak → AMAN",
    },
    {
      alpha: Math.min(sR, kS, aR, apiTidak), z: 0,
      name: "R2: Suhu Rendah ∧ Kel Sedang ∧ Asap Rendah ∧ Api Tidak → AMAN",
    },
    {
      alpha: Math.min(sS, kT, aR, apiTidak), z: 0,
      name: "R3: Suhu Sedang ∧ Kel Tinggi ∧ Asap Rendah ∧ Api Tidak → AMAN",
    },
    {
      alpha: Math.min(sS, kS, aR, apiTidak), z: 0,
      name: "R4: Suhu Sedang ∧ Kel Sedang ∧ Asap Rendah ∧ Api Tidak → AMAN",
    },
    {
      alpha: Math.min(sR, kR, aR, apiTidak), z: 0,
      name: "R5: Suhu Rendah ∧ Kel Rendah ∧ Asap Rendah ∧ Api Tidak → AMAN",
    },
    {
      alpha: Math.min(sS, kR, aR, apiTidak), z: 0,
      name: "R6: Suhu Sedang ∧ Kel Rendah ∧ Asap Rendah ∧ Api Tidak → AMAN",
    },

    // ── WASPADA (Z = 1) — kondisi perlu perhatian ─────────────
    {
      alpha: Math.min(sS, kS, aS, apiTidak), z: 1,
      name: "R7: Suhu Sedang ∧ Kel Sedang ∧ Asap Sedang ∧ Api Tidak → WASPADA",
    },
    {
      alpha: Math.min(sT, kS, aR, apiTidak), z: 1,
      name: "R8: Suhu Tinggi ∧ Kel Sedang ∧ Asap Rendah ∧ Api Tidak → WASPADA",
    },
    {
      alpha: Math.min(sT, kR, aR, apiTidak), z: 1,
      name: "R9: Suhu Tinggi ∧ Kel Rendah ∧ Asap Rendah ∧ Api Tidak → WASPADA",
    },
    {
      alpha: Math.min(sR, kR, aS, apiTidak), z: 1,
      name: "R10: Suhu Rendah ∧ Kel Rendah ∧ Asap Sedang ∧ Api Tidak → WASPADA",
    },
    {
      alpha: Math.min(sS, kR, aS, apiTidak), z: 1,
      name: "R11: Suhu Sedang ∧ Kel Rendah ∧ Asap Sedang ∧ Api Tidak → WASPADA",
    },
    {
      alpha: Math.min(sT, kR, aS, apiTidak), z: 1,
      name: "R12: Suhu Tinggi ∧ Kel Rendah ∧ Asap Sedang ∧ Api Tidak → WASPADA",
    },
    {
      alpha: Math.min(sR, kR, aT, apiTidak), z: 1,
      name: "R13: Suhu Rendah ∧ Kel Rendah ∧ Asap Tinggi ∧ Api Tidak → WASPADA",
    },
    {
      alpha: Math.min(sS, kR, aT, apiTidak), z: 1,
      name: "R14: Suhu Sedang ∧ Kel Rendah ∧ Asap Tinggi ∧ Api Tidak → WASPADA",
    },
    {
      alpha: Math.min(sT, kR, aT, apiTidak), z: 1,
      name: "R15: Suhu Tinggi ∧ Kel Rendah ∧ Asap Tinggi ∧ Api Tidak → WASPADA",
    },

    // ── BAHAYA (Z = 2) — kondisi kebakaran ────────────────────
    {
      alpha: Math.min(sS, kR, aS, apiAda),   z: 2,
      name: "R16: Suhu Sedang ∧ Kel Rendah ∧ Asap Sedang ∧ Api Ada → BAHAYA",
    },
    {
      alpha: Math.min(sT, kR, aT, apiAda),   z: 2,
      name: "R17: Suhu Tinggi ∧ Kel Rendah ∧ Asap Tinggi ∧ Api Ada → BAHAYA",
    },
    {
      alpha: Math.min(sR, kR, aT, apiAda),   z: 2,
      name: "R18: Suhu Rendah ∧ Kel Rendah ∧ Asap Tinggi ∧ Api Ada → BAHAYA",
    },
    {
      alpha: Math.min(sT, kT, aT, apiAda),   z: 2,
      name: "R19: Suhu Tinggi ∧ Kel Tinggi ∧ Asap Tinggi ∧ Api Ada → BAHAYA",
    },
  ];

  // ── 3. DEFUZZIFIKASI — Weighted Average Sugeno ──────────────
  // Z_output = Σ(αᵢ · Zᵢ) / Σαᵢ

  const sumAlphaZ = rules.reduce((s, r) => s + r.alpha * r.z, 0);
  const sumAlpha  = rules.reduce((s, r) => s + r.alpha,       0);
  const rawCrisp  = sumAlpha > 0 ? sumAlphaZ / sumAlpha : 0;
  const nilaiCrisp = Math.round(rawCrisp);   // 0, 1, atau 2

  // ── 4. PEMETAAN STATUS ──────────────────────────────────────
  let status;
  if      (nilaiCrisp === 0) status = "AMAN";
  else if (nilaiCrisp === 1) status = "WASPADA";
  else                        status = "BAHAYA";

  const activeRules = rules
    .filter(r => r.alpha > 0.001)
    .map(r => `${r.name} [α=${r.alpha.toFixed(3)}]`);

  return {
    nilaiCrisp,
    rawCrisp:   +rawCrisp.toFixed(4),
    status,
    persentase: nilaiCrisp * 50,   // 0 → 0%, 1 → 50%, 2 → 100%
    activeRules,
    membership: {
      suhu:       { rendah: +sR.toFixed(3), sedang: +sS.toFixed(3), tinggi: +sT.toFixed(3) },
      kelembaban: { rendah: +kR.toFixed(3), sedang: +kS.toFixed(3), tinggi: +kT.toFixed(3) },
      asap:       { rendah: +aR.toFixed(3), sedang: +aS.toFixed(3), tinggi: +aT.toFixed(3) },
      api:        { terdeteksi: apiAda, tidakTerdeteksi: apiTidak },
    },
  };
}
