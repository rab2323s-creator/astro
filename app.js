 import Swisseph from "./swisseph.js";

/* ========= عناصر الصفحة ========= */
const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");

const housesOutEl = document.getElementById("housesOut");
const anglesOutEl = document.getElementById("anglesOut");
const planetsInHousesOutEl = document.getElementById("planetsInHousesOut");

const latEl = document.getElementById("lat");
const lonEl = document.getElementById("lon");

function setStatus(t) {
  if (statusEl) statusEl.textContent = t;
}

/* ========= الأبراج بالعربي ========= */
const SIGNS_AR = [
  "الحمل","الثور","الجوزاء","السرطان","الأسد","العذراء",
  "الميزان","العقرب","القوس","الجدي","الدلو","الحوت"
];

function toZodiac(lon) {
  lon = ((lon % 360) + 360) % 360;
  const s = Math.floor(lon / 30);
  const d = lon - s * 30;
  const deg = Math.floor(d);
  const min = Math.floor((d - deg) * 60);
  return { sign: SIGNS_AR[s], deg, min };
}

function fmtDegMin(lonDeg) {
  const z = toZodiac(lonDeg);
  return `${String(z.deg).padStart(2, "0")}° ${String(z.min).padStart(2, "0")}'`;
}

/* ========= تحديد البيت (1..12) ========= */
function houseOf(lon, cusps) {
  const c = [];
  for (let i = 1; i <= 12; i++) c.push(((cusps[i] % 360) + 360) % 360);
  const L = ((lon % 360) + 360) % 360;

  for (let i = 0; i < 12; i++) {
    const a = c[i];
    const b = c[(i + 1) % 12];
    if (a <= b) {
      if (L >= a && L < b) return i + 1;
    } else {
      if (L >= a || L < b) return i + 1;
    }
  }
  return 12;
}

/* ========= تهيئة Swiss Ephemeris ========= */
let swe;

async function init() {
  setStatus("تحميل Swiss Ephemeris...");
  swe = await Swisseph({ locateFile: f => f });
  setStatus("جاهز ✅");
}

/* ========= قراءة التاريخ/الوقت (UTC) ========= */
function parseUTC() {
  const d = document.getElementById("date")?.value;
  const t = document.getElementById("time")?.value || "12:00";
  if (!d) throw new Error("اختر التاريخ");

  const [Y, M, D] = d.split("-").map(Number);
  const [h, m] = t.split(":").map(Number);
  return { Y, M, D, hour: h + m / 60 };
}

/* ========= Helpers: Julian Day / Calc_ut / Houses ========= */
function juldayUTC(Y, M, D, hour) {
  // في هذه النسخة الدالة اسمها _swe_julday
  if (typeof swe._swe_julday !== "function") {
    throw new Error("دالة swe._swe_julday غير موجودة في swisseph.js");
  }
  return swe._swe_julday(Y, M, D, hour, swe.SE_GREG_CAL);
}

function calcPlanetUT(jd, pid, flags) {
  // swe_calc_ut(jd, ipl, iflag, xx, serr)
  if (typeof swe._swe_calc_ut !== "function") {
    throw new Error("دالة swe._swe_calc_ut غير موجودة في swisseph.js");
  }

  const xxPtr = swe._malloc(6 * 8);
  const serrPtr = swe._malloc(256);

  try {
    swe._swe_calc_ut(jd, pid, flags, xxPtr, serrPtr);

    // قراءة 6 قيم double من HEAPF64
    const base = xxPtr >> 3; // /8
    const lon = swe.HEAPF64[base + 0];
    const speedLon = swe.HEAPF64[base + 3];

    return { lon, speedLon };
  } finally {
    swe._free(xxPtr);
    swe._free(serrPtr);
  }
}

function calcHouses(jd, lat, lon, hsys = "P") {
  // swe_houses(jd_ut, geolat, geolon, hsys, cusps, ascmc)
  if (typeof swe._swe_houses !== "function") return null;

  const cuspsPtr = swe._malloc(13 * 8);  // 0..12 (نستخدم 1..12)
  const ascmcPtr = swe._malloc(10 * 8);  // عادة 0..9
  const hsysCode = hsys.charCodeAt(0);

  try {
    swe._swe_houses(jd, lat, lon, hsysCode, cuspsPtr, ascmcPtr);

    const cusps = new Float64Array(13);
    const ascmc = new Float64Array(10);

    let b = cuspsPtr >> 3;
    for (let i = 0; i < 13; i++) cusps[i] = swe.HEAPF64[b + i];

    b = ascmcPtr >> 3;
    for (let i = 0; i < 10; i++) ascmc[i] = swe.HEAPF64[b + i];

    return { cusps, ascmc };
  } finally {
    swe._free(cuspsPtr);
    swe._free(ascmcPtr);
  }
}

/* ========= قائمة الكواكب ========= */
function planetsList() {
  return [
    ["الشمس",   swe.SE_SUN],
    ["القمر",   swe.SE_MOON],
    ["عطارد",   swe.SE_MERCURY],
    ["الزهرة",  swe.SE_VENUS],
    ["المريخ",  swe.SE_MARS],
    ["المشتري", swe.SE_JUPITER],
    ["زحل",     swe.SE_SATURN],
    ["أورانوس", swe.SE_URANUS],
    ["نبتون",   swe.SE_NEPTUNE],
    ["بلوتو",   swe.SE_PLUTO],
  ];
}

/* ========= الحساب الرئيسي ========= */
async function calc() {
  if (!swe) throw new Error("المحرك لم يجهز بعد");

  outEl && (outEl.innerHTML = "");
  housesOutEl && (housesOutEl.innerHTML = "");
  planetsInHousesOutEl && (planetsInHousesOutEl.innerHTML = "");
  anglesOutEl && (anglesOutEl.textContent = "");

  const { Y, M, D, hour } = parseUTC();
  const jd = juldayUTC(Y, M, D, hour);

  const flags = swe.SEFLG_SWIEPH;

  // 1) حساب الكواكب
  const planetResults = [];

  for (const [name, pid] of planetsList()) {
    const { lon, speedLon } = calcPlanetUT(jd, pid, flags);

    const retro = speedLon < 0 ? "نعم" : "لا";
    const z = toZodiac(lon);

    planetResults.push({ name, lon });

    if (outEl) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${name}</td>
        <td>${lon.toFixed(6)}</td>
        <td>${z.sign}</td>
        <td>${fmtDegMin(lon)}</td>
        <td>${retro}</td>
      `;
      outEl.appendChild(tr);
    }
  }

  // 2) حساب البيوت (اختياري) إذا عناصرها موجودة
  if (latEl && lonEl && (housesOutEl || anglesOutEl || planetsInHousesOutEl)) {
    const lat = Number(latEl.value);
    const lon = Number(lonEl.value);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const houseRes = calcHouses(jd, lat, lon, "P"); // Placidus
      if (houseRes && housesOutEl) {
        const { cusps, ascmc } = houseRes;

        for (let i = 1; i <= 12; i++) {
          const c = cusps[i];
          const z = toZodiac(c);

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>البيت ${i}</td>
            <td>${c.toFixed(6)}</td>
            <td>${z.sign}</td>
            <td>${fmtDegMin(c)}</td>
          `;
          housesOutEl.appendChild(tr);
        }

        // ASC/MC
        if (anglesOutEl) {
          const asc = ascmc[0];
          const mc = ascmc[1];
          const ascZ = toZodiac(asc);
          const mcZ = toZodiac(mc);
          anglesOutEl.textContent =
            `الطالع (ASC): ${ascZ.sign} ${fmtDegMin(asc)}  |  وسط السماء (MC): ${mcZ.sign} ${fmtDegMin(mc)}`;
        }

        // الكواكب في البيوت
        if (planetsInHousesOutEl) {
          for (const p of planetResults) {
            const h = houseOf(p.lon, cusps);
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${p.name}</td><td>البيت ${h}</td>`;
            planetsInHousesOutEl.appendChild(tr);
          }
        }
      }
    }
  }

  setStatus(`تم الحساب ✅ (JD=${jd.toFixed(6)} UTC)`);
}

/* ========= زر الحساب ========= */
document.getElementById("btn")?.addEventListener("click", () => {
  calc().catch(e => setStatus("خطأ: " + e.message));
});

/* ========= بدء التشغيل ========= */
init().catch(e => setStatus("خطأ init: " + e.message));

