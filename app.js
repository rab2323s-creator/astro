 import Swisseph from "./swisseph.js";

/* ========= عناصر الصفحة (قد لا تكون كلها موجودة حسب index.html) ========= */
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

/* ========= تحديد البيت (1..12) بناء على cusps ========= */
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
      // التفاف عبر 360
      if (L >= a || L < b) return i + 1;
    }
  }
  return 12;
}

/* ========= تهيئة Swiss Ephemeris ========= */
let swe;

async function init() {
  setStatus("تحميل Swiss Ephemeris...");
  swe = await Swisseph({ locateFile: (f) => f }); // مهم لربط wasm و data
  setStatus("جاهز ✅");
}

/* ========= قراءة التاريخ/الوقت ========= */
function parseUTC() {
  const d = document.getElementById("date")?.value;
  const t = document.getElementById("time")?.value || "12:00";
  if (!d) throw new Error("اختر التاريخ");

  const [Y, M, D] = d.split("-").map(Number);
  const [h, m] = t.split(":").map(Number);
  return { Y, M, D, hour: h + m / 60 };
}

/* ========= حساب البيوت (محاولة ذكية حسب ما توفره نسخة swisseph) =========
   - بعض النسخ توفر swe.houses(jd, lat, lon, 'P')
   - وبعضها توفر دالة منخفضة level مثل swe._houses(...)
   هذا الكود يحاول ويعطي نتيجة إذا أمكن.
*/
function tryCalcHouses(jd, lat, lon, hsys = "P") {
  // 1) إن كانت هناك دالة houses عالية المستوى
  if (typeof swe.houses === "function") {
    // نتوقع شيء مثل: { cusps: [...], ascmc: [...] } أو [cusps, ascmc]
    const r = swe.houses(jd, lat, lon, hsys);
    if (Array.isArray(r) && r.length >= 2) {
      return { cusps: r[0], ascmc: r[1] };
    }
    if (r && r.cusps && r.ascmc) {
      return { cusps: r.cusps, ascmc: r.ascmc };
    }
  }

  // 2) محاولة دالة منخفضة المستوى _houses (لو موجودة)
  if (typeof swe._houses === "function") {
    // في Swiss Ephemeris C: swe_houses(jd_ut, geolat, geolon, hsys, cusps, ascmc)
    // نستخدم Float64Array(13) للـ cusps (1..12) + [0] مهمل
    // و Float64Array(10) للـ ascmc
    const cusps = new Float64Array(13);
    const ascmc = new Float64Array(10);

    // بعض لفافات emscripten تتوقع hsys كـ char code
    // سنحاول تمرير كود الحرف:
    const hsysCode = hsys.charCodeAt(0);

    try {
      swe._houses(jd, lat, lon, hsysCode, cusps, ascmc);
      return { cusps, ascmc };
    } catch (e) {
      // تجاهل
    }
  }

  return null;
}

/* ========= الكواكب الأساسية ========= */
function getPlanetsList() {
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

/* ========= حساب الكواكب + (اختياري) البيوت ========= */
async function calc() {
  if (!swe) throw new Error("المحرك لم يجهز بعد");

  if (outEl) outEl.innerHTML = "";
  if (housesOutEl) housesOutEl.innerHTML = "";
  if (planetsInHousesOutEl) planetsInHousesOutEl.innerHTML = "";
  if (anglesOutEl) anglesOutEl.textContent = "";

  const { Y, M, D, hour } = parseUTC();
  const jd = swe._julday(Y, M, D, hour, swe.SE_GREG_CAL);

  const flags = swe.SEFLG_SWIEPH;

  // نحسب البيوت إذا كانت عناصرها موجودة + lat/lon موجودة
  let houses = null;
  let lat = null;
  let lon = null;

  if (latEl && lonEl && (housesOutEl || planetsInHousesOutEl || anglesOutEl)) {
    lat = Number(latEl.value);
    lon = Number(lonEl.value);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      houses = tryCalcHouses(jd, lat, lon, "P"); // Placidus
    }
  }

  // لتجميع نتائج الكواكب لاستخدامها لاحقاً في Planets in Houses
  const planetResults = [];

  for (const [name, pid] of getPlanetsList()) {
    const xx = new Float64Array(6);
    swe._calc_ut(jd, pid, flags, xx, 0);

    const lonP = xx[0];
    const speedLon = xx[3];
    const retro = speedLon < 0 ? "نعم" : "لا";
    const z = toZodiac(lonP);

    planetResults.push({ name, lon: lonP });

    if (outEl) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${name}</td>
        <td>${lonP.toFixed(6)}</td>
        <td>${z.sign}</td>
        <td>${fmtDegMin(lonP)}</td>
        <td>${retro}</td>
      `;
      outEl.appendChild(tr);
    }
  }

  // عرض البيوت إن توفرت
  if (houses && housesOutEl) {
    const { cusps, ascmc } = houses;

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

    // ASC/MC غالباً في ascmc[0] و ascmc[1] حسب SwissEph
    if (anglesOutEl && ascmc) {
      const asc = ascmc[0];
      const mc  = ascmc[1];
      const ascZ = toZodiac(asc);
      const mcZ  = toZodiac(mc);

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
  } else {
    // لو المستخدم عنده واجهة البيوت لكن الدالة غير متاحة
    if ((housesOutEl || planetsInHousesOutEl || anglesOutEl) && (latEl && lonEl)) {
      if (anglesOutEl) {
        anglesOutEl.textContent =
          "ملاحظة: نسخة swisseph الحالية لا تُظهر دالة البيوت (houses) بشكل مباشر. الكواكب تعمل ✅ وسنضيف البيوت بتعديل بسيط على طريقة الاستدعاء.";
      }
    }
  }

  setStatus(`تم الحساب ✅ (JD=${jd.toFixed(6)} UTC)`);
}

/* ========= ربط الزر ========= */
document.getElementById("btn")?.addEventListener("click", () => {
  calc().catch((e) => setStatus("خطأ: " + e.message));
});

/* ========= تشغيل ========= */
init().catch((e) => setStatus("خطأ init: " + e.message));

