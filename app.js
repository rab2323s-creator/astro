 import Swisseph from "./swisseph.js";

/* ========= عناصر الصفحة ========= */
const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");
const housesOutEl = document.getElementById("housesOut");
const anglesOutEl = document.getElementById("anglesOut");
const planetsInHousesOutEl = document.getElementById("planetsInHousesOut");

const countryEl = document.getElementById("country");
const cityEl = document.getElementById("city");
const citySearchEl = document.getElementById("citySearch");
const citiesStatusEl = document.getElementById("citiesStatus");

const latEl = document.getElementById("lat");
const lonEl = document.getElementById("lon");
const tzEl = document.getElementById("tz");

const dateEl = document.getElementById("date");
const timeEl = document.getElementById("time");
const utcPreviewEl = document.getElementById("utcPreview");

function setStatus(t) { if (statusEl) statusEl.textContent = t; }
function setCitiesStatus(t) { if (citiesStatusEl) citiesStatusEl.textContent = t; }

/* ========= تطبيع أرقام عربية/فارسية + إزالة علامات RTL ========= */
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

/* ========= الأبراج ========= */
const SIGNS_AR = ["الحمل","الثور","الجوزاء","السرطان","الأسد","العذراء","الميزان","العقرب","القوس","الجدي","الدلو","الحوت"];
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
    const a = c[i], b = c[(i + 1) % 12];
    if (a <= b) { if (L >= a && L < b) return i + 1; }
    else { if (L >= a || L < b) return i + 1; }
  }
  return 12;
}

/* ========= SwissEph (نفس الكود الذي أعطاك مواقع صحيحة) ========= */
let swe;

/* ثوابت (في نسختك تعمل بهذه الأرقام) */
const SE_GREG_CAL = 1;
const SEFLG_SWIEPH = 2;
const SEFLG_SPEED = 256;

// Planets IDs
const SE_SUN = 0, SE_MOON = 1, SE_MERCURY = 2, SE_VENUS = 3, SE_MARS = 4,
      SE_JUPITER = 5, SE_SATURN = 6, SE_URANUS = 7, SE_NEPTUNE = 8, SE_PLUTO = 9;

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

/* ========= Cities ========= */
let CITIES = [];
const countriesMap = new Map(); // key: country code/name -> {country, country_ar, cities: []}

function cityLabel(c) {
  // عرض عربي إن وجد، وإلا إنجليزي
  const cityName = c.city_ar || c.city;
  const countryName = c.country_ar || c.country;
  return `${cityName} — ${countryName}`;
}

function rebuildCountrySelect() {
  countryEl.innerHTML = "";
  const entries = Array.from(countriesMap.values())
    .sort((a, b) => (a.country_ar || a.country).localeCompare(b.country_ar || b.country, "ar"));

  for (const c of entries) {
    const opt = document.createElement("option");
    opt.value = c.country;
    opt.textContent = c.country_ar || c.country;
    countryEl.appendChild(opt);
  }
}

function rebuildCitySelect(countryKey, searchTerm = "") {
  const entry = countriesMap.get(countryKey);
  cityEl.innerHTML = "";
  if (!entry) return;

  const q = normalizeDigits(searchTerm).toLowerCase();
  const list = q
    ? entry.cities.filter(x => (x.city_ar || "").toLowerCase().includes(q) || (x.city || "").toLowerCase().includes(q))
    : entry.cities;

  // حد للعرض حتى لا تتعب الصفحة مع ملف ضخم
  const MAX = 500;
  const sliced = list.slice(0, MAX);

  for (const c of sliced) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.city_ar || c.city;
    cityEl.appendChild(opt);
  }

  if (list.length > MAX) {
    setCitiesStatus(`تمت التصفية: ${list.length} مدينة (عرضنا أول ${MAX}). استخدم البحث لتضييق النتائج.`);
  } else {
    setCitiesStatus(`مدن: ${list.length}`);
  }

  // اختر أول مدينة وتحديث القيم
  if (cityEl.options.length) {
    cityEl.selectedIndex = 0;
    applySelectedCity();
  }
}

function applySelectedCity() {
  const countryKey = countryEl.value;
  const entry = countriesMap.get(countryKey);
  if (!entry) return;

  const id = cityEl.value;
  const c = entry.cities.find(x => String(x.id) === String(id));
  if (!c) return;

  latEl.value = c.lat;
  lonEl.value = c.lon;
  tzEl.value = c.tz || "";

  updateUtcPreview();
}

/* ========= تحويل محلي -> UTC باستخدام Luxon + tz ========= */
function getUtcComponentsFromLocal() {
  const dRaw = dateEl.value;
  const tRaw = timeEl.value || "12:00";
  const tz = tzEl.value;

  if (!dRaw) throw new Error("اختر التاريخ");
  if (!tz) throw new Error("اختر مدينة (Timezone غير متوفر)");

  const d = normalizeDigits(dRaw);     // متوقع ISO YYYY-MM-DD من input
  const t = normalizeDigits(tRaw);     // HH:mm

  const isoLocal = `${d}T${t}:00`;

  const { DateTime } = window.luxon || {};
  if (!DateTime) throw new Error("Luxon لم يتم تحميله");

  const local = DateTime.fromISO(isoLocal, { zone: tz });
  if (!local.isValid) throw new Error("وقت/تاريخ غير صالح");

  const utc = local.toUTC();

  const Y = utc.year;
  const M = utc.month;
  const D = utc.day;
  const hour = utc.hour + utc.minute / 60 + utc.second / 3600;

  return { utc, Y, M, D, hour };
}

function updateUtcPreview() {
  try {
    const { utc } = getUtcComponentsFromLocal();
    utcPreviewEl.textContent = `UTC: ${utc.toFormat("yyyy-LL-dd HH:mm")} (تحويل تلقائي مع DST)`;
  } catch {
    utcPreviewEl.textContent = "UTC: —";
  }
}

/* ========= Swiss calc (كواكب + بيوت) ========= */
function juldayUTC(Y, M, D, hour) {
  return swe._swe_julday(Y, M, D, hour, SE_GREG_CAL);
}

function calcPlanetUT(jd, pid, flags) {
  const xxPtr = swe._malloc(6 * 8);
  const serrPtr = swe._malloc(256);
  try {
    const retflag = swe._swe_calc_ut(jd, pid, flags, xxPtr, serrPtr);
    const base = xxPtr >> 3;
    const lon = swe.HEAPF64[base + 0];
    const speedLon = swe.HEAPF64[base + 3];
    if (retflag < 0) throw new Error("خطأ في حساب الكوكب");
    return { lon, speedLon };
  } finally {
    swe._free(xxPtr);
    swe._free(serrPtr);
  }
}

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

/* ========= init ========= */
async function init() {
  setStatus("تحميل Swiss Ephemeris...");
  swe = await Swisseph({ locateFile: f => f });

  // اجعل المحرك يقرأ ملفات ephemeris من /sweph
  if (typeof swe.ccall === "function") {
    swe.ccall("swe_set_ephe_path", "void", ["string"], ["/sweph"]);
  }

  setStatus("تحميل المدن…");
  await loadCities();

  // افتراضي تاريخ اليوم
  const now = new Date();
  dateEl.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  updateUtcPreview();

  setStatus("جاهز ✅");
}

/* ========= تحميل المدن ========= */
async function loadCities() {
  const res = await fetch("./data/cities.min.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("لم أستطع تحميل data/cities.min.json");
  CITIES = await res.json();

  // بناء map للدول
  countriesMap.clear();
  for (const c of CITIES) {
    const key = c.country; // مفتاح الدولة
    if (!countriesMap.has(key)) {
      countriesMap.set(key, { country: c.country, country_ar: c.country_ar || "", cities: [] });
    }
    countriesMap.get(key).cities.push(c);
  }

  // ترتيب المدن داخل كل دولة
  for (const entry of countriesMap.values()) {
    entry.cities.sort((a, b) => (a.city_ar || a.city).localeCompare(b.city_ar || b.city, "ar"));
  }

  rebuildCountrySelect();

  // اختَر أول دولة ثم مدنها
  if (countryEl.options.length) {
    countryEl.selectedIndex = 0;
    rebuildCitySelect(countryEl.value);
  }

  setCitiesStatus(`تم تحميل ${CITIES.length} مدينة (نموذج). يمكنك استبدال الملف بقاعدة عالمية بنفس البنية.`);
}

/* ========= الحساب ========= */
async function calc() {
  outEl.innerHTML = "";
  housesOutEl.innerHTML = "";
  planetsInHousesOutEl.innerHTML = "";
  anglesOutEl.textContent = "";

  const lat = Number(latEl.value);
  const lon = Number(lonEl.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("الموقع غير صالح");

  // محلي -> UTC
  const { utc, Y, M, D, hour } = getUtcComponentsFromLocal();

  // JD على UTC
  const jd = juldayUTC(Y, M, D, hour);

  const flags = SEFLG_SWIEPH | SEFLG_SPEED;

  const planetResults = [];
  for (const [name, pid] of planetsList()) {
    const { lon: plon, speedLon } = calcPlanetUT(jd, pid, flags);
    const retro = speedLon < 0 ? "نعم" : "لا";
    const z = toZodiac(plon);
    planetResults.push({ name, lon: plon });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${name}</td>
      <td>${plon.toFixed(6)}</td>
      <td>${z.sign}</td>
      <td>${fmtDegMin(plon)}</td>
      <td>${retro}</td>
    `;
    outEl.appendChild(tr);
  }

  // البيوت (Placidus)
  const houseRes = calcHouses(jd, lat, lon, "P");
  if (houseRes) {
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

    const asc = ascmc[0];
    const mc = ascmc[1];
    anglesOutEl.textContent =
      `الطالع (ASC): ${toZodiac(asc).sign} ${fmtDegMin(asc)} | وسط السماء (MC): ${toZodiac(mc).sign} ${fmtDegMin(mc)} | UTC المحسوب: ${utc.toFormat("yyyy-LL-dd HH:mm")}`;
    
    for (const p of planetResults) {
      const h = houseOf(p.lon, cusps);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${p.name}</td><td>البيت ${h}</td>`;
      planetsInHousesOutEl.appendChild(tr);
    }
  }

  setStatus(`تم الحساب ✅ (JD=${jd.toFixed(6)} UTC)`);
}

/* ========= أحداث واجهة المدن ========= */
countryEl.addEventListener("change", () => {
  citySearchEl.value = "";
  rebuildCitySelect(countryEl.value);
});

cityEl.addEventListener("change", () => {
  applySelectedCity();
});

citySearchEl.addEventListener("input", () => {
  rebuildCitySelect(countryEl.value, citySearchEl.value);
});

dateEl.addEventListener("change", updateUtcPreview);
timeEl.addEventListener("change", updateUtcPreview);

document.getElementById("btn").addEventListener("click", () => {
  calc().catch(e => setStatus("خطأ: " + e.message));
});

/* ========= تشغيل ========= */
init().catch(e => setStatus("خطأ init: " + e.message));

