import SwissEph from "https://cdn.jsdelivr.net/gh/prolaxu/swisseph-wasm@main/src/swisseph.js";

const SIGNS_AR = [
  "الحمل","الثور","الجوزاء","السرطان","الأسد","العذراء",
  "الميزان","العقرب","القوس","الجدي","الدلو","الحوت"
];

function toZodiac(lonDeg) {
  const x = ((lonDeg % 360) + 360) % 360;
  const signIndex = Math.floor(x / 30);
  const within = x - signIndex * 30;
  const deg = Math.floor(within);
  const min = Math.floor((within - deg) * 60);
  return { sign: SIGNS_AR[signIndex], deg, min };
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function parseUTCInputs() {
  const d = document.getElementById("date").value;
  const t = document.getElementById("time").value || "00:00";
  if (!d) throw new Error("اختر التاريخ أولاً.");
  const [Y, M, D] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const hourDecimal = hh + (mm / 60);
  return { Y, M, D, hourDecimal };
}

function renderRow({ name, lon, isRetro }) {
  const z = toZodiac(lon);
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${name}</td>
    <td>${lon.toFixed(6)}</td>
    <td>${z.sign}</td>
    <td>${String(z.deg).padStart(2,"0")}° ${String(z.min).padStart(2,"0")}'</td>
    <td>${isRetro ? "نعم" : "لا"}</td>
  `;
  return tr;
}

const PLANETS = [
  { key: "Sun",    id: "SE_SUN" },
  { key: "Moon",   id: "SE_MOON" },
  { key: "Mercury",id: "SE_MERCURY" },
  { key: "Venus",  id: "SE_VENUS" },
  { key: "Mars",   id: "SE_MARS" },
  { key: "Jupiter",id: "SE_JUPITER" },
  { key: "Saturn", id: "SE_SATURN" },
  { key: "Uranus", id: "SE_URANUS" },
  { key: "Neptune",id: "SE_NEPTUNE" },
  { key: "Pluto",  id: "SE_PLUTO" },
];

let swe;

async function ensureInit() {
  if (swe) return swe;
  setStatus("تحميل المحرك الفلكي (WASM)...");
  swe = new SwissEph();
  await swe.initSwissEph();
  setStatus("تم التحميل. جاهز للحساب.");
  return swe;
}

async function calculate() {
  const out = document.getElementById("out");
  out.innerHTML = "";

  const { Y, M, D, hourDecimal } = parseUTCInputs();
  const swe = await ensureInit();

  // Julian Day for UTC
  const jd = swe.julday(Y, M, D, hourDecimal);

  // Flags: Swiss Ephemeris + positions
  const flags = swe.SEFLG_SWIEPH;

  for (const p of PLANETS) {
    // calc_ut returns array: [lon, lat, dist, speed_lon, speed_lat, speed_dist] (حسب ربط المكتبة)
    const res = swe.calc_ut(jd, swe[p.id], flags);
    const lon = res[0];
    const speedLon = res[3]; // سرعة الطول
    const isRetro = speedLon < 0;

    out.appendChild(renderRow({
      name: p.key,
      lon,
      isRetro
    }));
  }

  setStatus(`تم الحساب. JD=${jd.toFixed(6)} (UTC)`);
}

document.getElementById("btn").addEventListener("click", () => {
  calculate().catch(err => setStatus("خطأ: " + err.message));
});

// اختيار تاريخ اليوم افتراضيًا (UTC)
const today = new Date();
const yyyy = today.getUTCFullYear();
const mm = String(today.getUTCMonth() + 1).padStart(2,"0");
const dd = String(today.getUTCDate()).padStart(2,"0");
document.getElementById("date").value = `${yyyy}-${mm}-${dd}`;
