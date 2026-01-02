 import Swisseph from "./swisseph.js";

const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");

function setStatus(t) {
  statusEl.textContent = t;
}

const SIGNS_AR = [
  "الحمل","الثور","الجوزاء","السرطان","الأسد","العذراء",
  "الميزان","العقرب","القوس","الجدي","الدلو","الحوت"
];

function toZodiac(lon) {
  lon = ((lon % 360) + 360) % 360;
  const s = Math.floor(lon / 30);
  const d = lon - s * 30;
  return {
    sign: SIGNS_AR[s],
    deg: Math.floor(d),
    min: Math.floor((d - Math.floor(d)) * 60)
  };
}
function fmtDegMin(lonDeg) {
  const z = toZodiac(lonDeg);
  return {
    sign: z.sign,
    text: `${String(z.deg).padStart(2,"0")}° ${String(z.min).padStart(2,"0")}'`
  };
}

// ترجع رقم البيت (1..12) الذي يقع فيه الكوكب
function houseOf(lon, cusps) {
  // cusps[1..12] طول بداية كل بيت (0..360)
  // نحولها لمصفوفة 12 ونقفل الدائرة
  const c = [];
  for (let i = 1; i <= 12; i++) c.push(((cusps[i] % 360) + 360) % 360);

  // للتعامل مع الالتفاف عند 360
  const L = ((lon % 360) + 360) % 360;

  for (let i = 0; i < 12; i++) {
    const a = c[i];
    const b = c[(i + 1) % 12];

    if (a <= b) {
      if (L >= a && L < b) return i + 1;
    } else {
      // الالتفاف عبر 360
      if (L >= a || L < b) return i + 1;
    }
  }
  return 12;
}

let swe;

async function init() {
  setStatus("تحميل Swiss Ephemeris...");
  swe = await Swisseph({
    locateFile: f => f   // مهم لربط wasm و data
  });
  setStatus("جاهز ✅");
}

function parseUTC() {
  const d = document.getElementById("date").value;
  const t = document.getElementById("time").value || "12:00";
  if (!d) throw new Error("اختر التاريخ");
  const [Y,M,D] = d.split("-").map(Number);
  const [h,m] = t.split(":").map(Number);
  return { Y, M, D, hour: h + m / 60 };
}

const PLANETS = [
  ["الشمس", swe?.SE_SUN],
];

async function calc() {
  outEl.innerHTML = "";
  const { Y, M, D, hour } = parseUTC();

  const jd = swe._julday(Y, M, D, hour, swe.SE_GREG_CAL);

  const res = swe._calc_ut(
    jd,
    swe.SE_SUN,
    swe.SEFLG_SWIEPH,
    new Float64Array(6),
    0
  );

  const lon = res[0];
  const z = toZodiac(lon);

  outEl.innerHTML = `
    <tr>
      <td>الشمس</td>
      <td>${lon.toFixed(6)}</td>
      <td>${z.sign}</td>
      <td>${z.deg}° ${z.min}'</td>
    </tr>
  `;
}

document.getElementById("btn").onclick = () =>
  calc().catch(e => setStatus("خطأ: " + e.message));

init();

