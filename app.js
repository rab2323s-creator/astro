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

