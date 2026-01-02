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

/* ========= ثوابت Swiss Ephemeris (أرقام صحيحة) =========
   مهم: لا نعتمد على swe.SE_* لأن نسختك لا تصدرها.
*/
const SE_GREG_CAL = 1;

// Planets (Swiss Ephemeris)
const SE_SUN = 0;
const SE_MOON = 1;
const SE_MERCURY = 2;
const SE_VENUS = 3;
const SE_MARS = 4;
const SE_JUPITER = 5;
const SE_SATURN = 6;
const SE_URANUS = 7;
const SE_NEPTUNE = 8;
const SE_PLUTO = 9;

// Flags
const SEFLG_SWIEPH = 2;
const SEFLG_SPEED = 256;

/* ========= تطبيع الأرقام العربية/الفارسية + إزالة علامات RTL ========= */
function normalizeDigits(s) {
  if (s == null) return s;
  const map = {
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
    "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9"
  };
  return String(s)
    .replace(/[٠-٩۰-۹]/g, ch => map[ch] ?? ch)
    .replace(/[\u200E\u200F\u202A-\u202E]/g, "")
    .trim();
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

let swe;

/* ========= قراءة تاريخ مرنة: ISO أو DD/MM/YYYY ========= */
function parseDateFlexible(dateValue) {
  const s = normalizeDigits(dateValue);

  // ISO: YYYY-MM-DD
  if (s.includes("-")) {
    const [Y, M, D] = s.split("-").map(Number);
    return { Y, M, D };
  }

  // محلي: DD/MM/YYYY (مع الأرقام العربية)
  if (s.includes("/")) {
    const parts = s.split("/").map(Number);
    if (parts.length === 3) {
      const Y = parts[2];
      let D = parts[0];
      let M = parts[1];

      // لو كانت MM/DD (نادر) نعدّل
      if (parts[0] <= 12 && parts[1] > 12) { M = parts[0]; D = parts[1]; }
      return { Y, M, D };
    }
  }

  throw new Error(`صيغة تاريخ غير مدعومة: ${dateValue}`);
}

function parseUTC() {
  const dRaw = document.getElementById("date")?.value;
  const tRaw = document.getElementById("time")?.value || "12:00";
  if (!dRaw) throw new Error("اختر التاريخ");

  const { Y, M, D } = parseDateFlexible(dRaw);

  const t = normalizeDigits(tRaw);
  const [h, m] = t.split(":").map(Number);

  if (![Y, M, D, h, m].every(Number.isFinite)) {
    throw new Error(`مدخلات غير صالحة: التاريخ=${dRaw} الوقت=${tRaw}`);
  }

  return { Y, M, D, hour: h + m / 60 };
}

/* ========= Julian Day (UT) ========= */
function juldayUTC(Y, M, D, hour) {
  return swe._swe_julday(Y, M, D, hour, SE_GREG_CAL); // ✅ Gregorian
}

/* ========= calc_ut: lon + speedLon ========= */
function calcPlanetUT(jd, pid, flags) {
  const xxPtr = swe._malloc(6 * 8);
  const serrPtr = swe._malloc(256);

  try {
    const retflag = swe._swe_calc_ut(jd, pid, flags, xxPtr, serrPtr);
    const errMsg = (typeof swe.UTF8ToString === "function" ? swe.UTF8ToString(serrPtr) : "").trim();

    const base = xxPtr >> 3;
    const lon = swe.HEAPF64[base + 0];
    const speedLon = swe.HEAPF64[base + 3];

    if (retflag < 0) throw new Error(errMsg || "خطأ في swe_calc_ut");
    return { lon, speedLon };
  } finally {
    swe._free(xxPtr);
    swe._free(serrPtr);
  }
}

/* ========= Houses (Placidus) ========= */
function calcHouses(jd, lat, lon, hsys = "P") {
  if (typeof swe._swe_houses !== "function") return null;

  const cuspsPtr = swe._malloc(13 * 8);
  const ascmcPtr = swe._malloc(10 * 8);
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
    ["الشمس",   SE_SUN],
    ["القمر",   SE_MOON],
    ["عطارد",   SE_MERCURY],
    ["الزهرة",  SE_VENUS],
    ["المريخ",  SE_MARS],
    ["المشتري", SE_JUPITER],
    ["زحل",     SE_SATURN],
    ["أورانوس", SE_URANUS],
    ["نبتون",   SE_NEPTUNE],
    ["بلوتو",   SE_PLUTO],
  ];
}

/* ========= init: تحميل + ephe path ========= */
async function init() {
  setStatus("تحميل Swiss Ephemeris...");
  swe = await Swisseph({ locateFile: f => f });

  // اجعل المحرك يقرأ ملفات ephemeris من /sweph (حزمة data تفكها هناك)
  if (typeof swe.ccall === "function") {
    swe.ccall("swe_set_ephe_path", "void", ["string"], ["/sweph"]);
  }

  setStatus("جاهز ✅");
}

/* ========= الحساب ========= */
async function calc() {
  if (!swe) throw new Error("المحرك لم يجهز بعد");

  outEl && (outEl.innerHTML = "");
  housesOutEl && (housesOutEl.innerHTML = "");
  planetsInHousesOutEl && (planetsInHousesOutEl.innerHTML = "");
  anglesOutEl && (anglesOutEl.textContent = "");

  const { Y, M, D, hour } = parseUTC();
  const jd = juldayUTC(Y, M, D, hour);

  const flags = SEFLG_SWIEPH | SEFLG_SPEED;

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

  // البيوت (اختياري)
  if (latEl && lonEl && (housesOutEl || anglesOutEl || planetsInHousesOutEl)) {
    const lat = Number(normalizeDigits(latEl.value));
    const lon = Number(normalizeDigits(lonEl.value));

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const houseRes = calcHouses(jd, lat, lon, "P");
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

        if (anglesOutEl) {
          const asc = ascmc[0];
          const mc = ascmc[1];
          anglesOutEl.textContent =
            `الطالع (ASC): ${toZodiac(asc).sign} ${fmtDegMin(asc)} | وسط السماء (MC): ${toZodiac(mc).sign} ${fmtDegMin(mc)}`;
        }

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

document.getElementById("btn")?.addEventListener("click", () => {
  calc().catch(e => setStatus("خطأ: " + e.message));
});

init().catch(e => setStatus("خطأ init: " + e.message));

