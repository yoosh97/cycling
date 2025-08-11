/* =============================================================================
 * GPX 모바일 분석기 – 파워/케이던스 + NP/IF/TSS 포함 완성본 JS
 * (한 파일로 교체해서 사용)
 * ============================================================================= */

/* ===== 유틸 ===== */
const $ = (sel) => document.querySelector(sel);
const round = (n, d = 2) => Number.isFinite(n) ? Number(n.toFixed(d)) : "";
const numOr = (v, fallback) => Number.isFinite(v) ? v : fallback;

const secToHMS = (s = 0) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return [h, m, ss].map(v => String(v).padStart(2, "0")).join(":");
};
const paceMinPerKm = (kmh) => {
  if (!isFinite(kmh) || kmh <= 0) return "";
  const minPerKm = 60 / kmh; const mm = Math.floor(minPerKm); const ss = Math.round((minPerKm - mm) * 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
};
const toRad = (d) => d * Math.PI / 180;
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dlat = toRad(lat2 - lat1), dlon = toRad(lon2 - lon1);
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/* ===== 토스트/오버레이 ===== */
const toastEl = $("#toast"); let toastTimer = null;
function toast(msg, ms = 1600) {
  if (!toastEl) { console.log(msg); return; }
  toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}
const overlay = $("#overlay"), progressText = $("#progressText");
const showProgress = (t) => { progressText && (progressText.textContent = t); overlay?.classList.add("show"); };
const setProgress = (t) => { progressText && (progressText.textContent = t); };
const hideProgress = () => overlay?.classList.remove("show");

/* ===== 파일 선택 ===== */
const elNativeInput = $("#gpxFiles"), elAddBtn = $("#addFilesBtn"), elClearBtn = $("#clearFilesBtn"), elChips = $("#fileChips");
let selectedFiles = []; const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;
function renderChips() {
  if (!elChips) return;
  elChips.innerHTML = ""; if (!selectedFiles.length) { elChips.insertAdjacentHTML("beforeend", `<div class="muted">선택된 파일 없음</div>`); return; }
  selectedFiles.forEach((f, i) => {
    const div = document.createElement("div"); div.className = "chip";
    div.innerHTML = `<span title="${f.name}">${f.name}</span><button type="button" aria-label="삭제">삭제</button>`;
    div.querySelector("button").addEventListener("click", () => { selectedFiles.splice(i, 1); renderChips(); });
    elChips.appendChild(div);
  });
}
function addFiles(list) {
  const arr = Array.from(list || []); let added = 0; for (const f of arr) {
    const k = fileKey(f);
    if (!selectedFiles.some(x => fileKey(x) === k)) { selectedFiles.push(f); added++; }
  }
  if (added) renderChips(); toast(added ? `${added}개 파일 추가됨` : `이미 선택된 파일입니다`);
}
function clearSelected() { selectedFiles = []; renderChips(); if (elNativeInput) elNativeInput.value = ""; toast("선택 초기화 완료"); }
elNativeInput?.addEventListener("change", (e) => addFiles(e.target.files));
elAddBtn?.addEventListener("click", async () => {
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: "GPX Files", accept: { "application/gpx+xml": [".gpx"], "text/xml": [".gpx"], "application/xml": [".gpx"] } }]
      });
      const files = await Promise.all(handles.map(h => h.getFile()));
      addFiles(files);
    } catch (e) { if (e?.name !== "AbortError") console.warn(e); }
  } else {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".gpx"; input.multiple = true; input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => { addFiles(input.files); document.body.removeChild(input); }, { once: true });
    input.click();
  }
});
elClearBtn?.addEventListener("click", clearSelected); renderChips();

/* ===== 지도 ===== */
let map, layerControl, legendControl;
const mapLayers = {};
const colorModeSel = $("#colorMode"); const togglePanBtn = $("#togglePanBtn"); let panEnabled = false;

function ensureColorModeOptions() {
  if (!colorModeSel) return;
  const values = Array.from(colorModeSel.options || []).map(o => o.value);
  const addOpt = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; colorModeSel.appendChild(o); };
  if (!values.includes("power")) addOpt("power", "파워 색상");
  if (!values.includes("cad")) addOpt("cad", "케이던스 색상");
}
ensureColorModeOptions();

function initMap() {
  if (!window.L) { console.warn("Leaflet 로드 실패"); return; }
  map = L.map('map', { zoomControl: true, dragging: false, scrollWheelZoom: false, touchZoom: false, tap: false });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  layerControl = L.control.layers({ OpenStreetMap: osm }, {}, { collapsed: true }).addTo(map);
  map.setView([36.5, 127.8], 7);
}
initMap();
function setMapPan(enabled) {
  panEnabled = !!enabled; if (!map) return;
  map.dragging[enabled ? "enable" : "disable"](); map.scrollWheelZoom[enabled ? "enable" : "disable"](); map.touchZoom[enabled ? "enable" : "disable"]();
  togglePanBtn && (togglePanBtn.textContent = `지도 이동: ${enabled ? "켜짐" : "꺼짐"}`);
  toast(enabled ? "지도를 이동할 수 있습니다" : "지도가 고정되었습니다");
}
togglePanBtn?.addEventListener("click", () => setMapPan(!panEnabled));

function colorFromValue(val, minVal, maxVal) {
  if (!isFinite(val) || !isFinite(minVal) || !isFinite(maxVal) || maxVal <= minVal) return "#888";
  const t = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal))); const hue = (1 - t) * 240; return `hsl(${hue},85%,50%)`;
}
function addLegend(minVal, maxVal, unitLabel) {
  if (!window.L) return; if (legendControl) legendControl.remove();
  legendControl = L.control({ position: 'bottomright' }); legendControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend'); div.style.background = "#fff"; div.style.padding = "8px 10px"; div.style.borderRadius = "6px";
    div.style.boxShadow = "0 1px 4px rgba(0,0,0,.2)"; div.style.fontSize = "12px";
    div.innerHTML = `<div><strong>${unitLabel}</strong></div>
      <div style="height:10px;width:160px;background:linear-gradient(90deg,#3066ff,#21c36f,#ffd33d,#ff3b3b);border-radius:4px;margin:6px 0;"></div>
      <div style="display:flex;justify-content:space-between;"><span>${round(minVal, 0)}</span><span>${round((minVal + maxVal) / 2, 0)}</span><span>${round(maxVal, 0)}</span></div>`;
    return div;
  }; legendControl.addTo(map);
}
function randomColor(seed) { let h = 0; for (let i = 0; i < seed.length; i++) h = ((h << 5) - h) + seed.charCodeAt(i); const hue = Math.abs(h) % 360; return `hsl(${hue},80%,45%)`; }
function drawTrackLayer(fileName, analysis, colorMode, bounds) {
  if (!map) return;
  if (mapLayers[fileName]) { layerControl.removeLayer(mapLayers[fileName]); map.removeLayer(mapLayers[fileName]); delete mapLayers[fileName]; }
  const group = L.layerGroup(); mapLayers[fileName] = group; layerControl.addOverlay(group, fileName);

  let minMetric = Infinity, maxMetric = -Infinity;
  for (const s of analysis.segments) {
    const metric =
      (colorMode === 'hr')    ? (s.hrAvg ?? NaN) :
      (colorMode === 'speed') ? (s.v * 3.6)     :
      (colorMode === 'power') ? (s.pwAvg ?? NaN):
      (colorMode === 'cad')   ? (s.cadAvg ?? NaN) : NaN;
    if (isFinite(metric)) { minMetric = Math.min(minMetric, metric); maxMetric = Math.max(maxMetric, metric); }
  }
  if (minMetric === Infinity || maxMetric === -Infinity) { minMetric = 0; maxMetric = 1; }

  for (const s of analysis.segments) {
    const p1 = [s.lat1, s.lon1], p2 = [s.lat2, s.lon2];
    const metric =
      (colorMode === 'hr')    ? (s.hrAvg ?? NaN) :
      (colorMode === 'speed') ? (s.v * 3.6)     :
      (colorMode === 'power') ? (s.pwAvg ?? NaN):
      (colorMode === 'cad')   ? (s.cadAvg ?? NaN) : NaN;
    const color = (colorMode === 'mono') ? randomColor(fileName) : colorFromValue(metric, minMetric, maxMetric);
    L.polyline([p1, p2], { color, weight: 5, opacity: .9 }).addTo(group);
    bounds.extend(p1); bounds.extend(p2);
  }
  if (analysis.firstLatLng) { L.circleMarker(analysis.firstLatLng, { radius: 5, color: '#00a84f', fillColor: '#00a84f', fillOpacity: 1 }).bindPopup(`Start: ${fileName}`).addTo(group); bounds.extend(analysis.firstLatLng); }
  if (analysis.lastLatLng) { L.circleMarker(analysis.lastLatLng, { radius: 5, color: '#ff3b3b', fillColor: '#ff3b3b', fillOpacity: 1 }).bindPopup(`Finish: ${fileName}`).addTo(group); bounds.extend(analysis.lastLatLng); }
  if (colorMode === 'speed') addLegend(minMetric, maxMetric, '속도 km/h');
  else if (colorMode === 'hr') addLegend(minMetric, maxMetric, '심박 bpm');
  else if (colorMode === 'power') addLegend(minMetric, maxMetric, '파워 W');
  else if (colorMode === 'cad') addLegend(minMetric, maxMetric, '케이던스 rpm');
  group.addTo(map);
}

/* ===== 칼로리 ===== */
function kcalPerMinKeytel(hr, w, age, sex) {
  if (!isFinite(hr) || !isFinite(w) || !isFinite(age) || !sex) return null;
  if (sex === "male") return (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * age) / 4.184;
  if (sex === "female") return (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * age) / 4.184; return null;
}
function metFromSpeedKmh(kmh) { if (!isFinite(kmh) || kmh <= 0) return 1.2; if (kmh < 16) return 4; if (kmh < 19) return 6; if (kmh < 22) return 8; if (kmh < 25) return 10; if (kmh < 30) return 12; return 16; }
function estimateCaloriesHR(avgHR, dur, w, age, sex) { const perMin = kcalPerMinKeytel(avgHR, w, age, sex); return (perMin != null) ? perMin * (dur / 60) : null; }
function estimateCaloriesMET(avgKmh, dur, w) { if (!isFinite(w)) return null; return metFromSpeedKmh(avgKmh) * w * (dur / 3600); }

/* ===== GPX 파서: HR + 케이던스 + 파워 지원 ===== */
function parseGpxText(xml) {
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  const perr = dom.getElementsByTagName("parsererror"); if (perr && perr.length) throw new Error("GPX XML 파싱 실패");
  const trkpts = Array.from(dom.getElementsByTagName("trkpt"));
  const pts = trkpts.map(pt => {
    const lat = parseFloat(pt.getAttribute("lat")); const lon = parseFloat(pt.getAttribute("lon"));
    const timeEl = pt.getElementsByTagName("time")[0]; const eleEl = pt.getElementsByTagName("ele")[0];

    let hr = null, cad = null, pw = null;
    const ext = pt.getElementsByTagName("extensions")[0];
    if (ext) {
      const all = ext.getElementsByTagName("*");
      for (const x of all) {
        const name = (x.localName || "").toLowerCase();
        const val = parseFloat(x.textContent.trim());
        if (!Number.isFinite(val)) continue;
        if (name === "hr") hr = val;
        else if (name === "cad" || name === "cadence") cad = val;
        else if (name === "power") pw = val;
      }
    }
    const t = timeEl ? new Date(timeEl.textContent.trim()) : null;
    const ele = eleEl ? parseFloat(eleEl.textContent.trim()) : null;
    return (Number.isFinite(lat) && Number.isFinite(lon) && t) ? { lat, lon, t, ele, hr, cad, pw } : null;
  }).filter(Boolean);
  pts.sort((a, b) => a.t - b.t);
  const unique = []; for (let i = 0; i < pts.length; i++) { if (i === 0 || pts[i].t - pts[i - 1].t !== 0) unique.push(pts[i]); }

  const nodes = dom.getElementsByTagName("*"); let fileCalories = 0, anyCal = false;
  for (const n of nodes) { if (n.localName && n.localName.toLowerCase() === "calories") { const v = parseFloat(n.textContent.trim()); if (Number.isFinite(v)) { fileCalories += v; anyCal = true; } } }
  return { points: unique, fileCalories: anyCal ? fileCalories : null };
}

/* ===== 고도 스무딩 ===== */
function medianSmooth(arr, win = 5) {
  const half = Math.floor(win / 2); const res = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const s = Math.max(0, i - half), e = Math.min(arr.length - 1, i + half);
    const slice = arr.slice(s, e + 1).filter(Number.isFinite).sort((a, b) => a - b);
    res[i] = slice.length ? slice[Math.floor(slice.length / 2)] : arr[i];
  }
  return res;
}

/* ===== 5초 롤링 최대속도 ===== */
function maxSpeedKmhSmoothed(segments, windowS = 5) {
  let i = 0, j = 0, sumD = 0, sumT = 0, maxKmh = 0;
  const dtArr = segments.map(s => s.dt);
  const dArr = segments.map(s => s.d);
  while (i < segments.length) {
    while (j < segments.length && (sumT + dtArr[j]) <= windowS) {
      sumT += dtArr[j]; sumD += dArr[j]; j++;
    }
    if (sumT > 0) {
      const vKmh = (sumD / sumT) * 3.6;
      if (vKmh > maxKmh) maxKmh = vKmh;
    }
    if (sumT > 0) { sumT -= dtArr[i]; sumD -= dArr[i]; }
    i++;
    if (j < i) { j = i; sumT = 0; sumD = 0; }
  }
  return maxKmh;
}

/* ===== NP/IF/TSS 계산 ===== */
// segments: [{dt, pwAvg}, ...]
// - NP: 30초 이동평균 파워의 4제곱 시간가중 평균의 4제곱근
// - IF: NP / FTP
// - TSS: (duration_s * NP * IF) / (FTP * 3600) * 100  (여기서는 moving time 기준)
function normalizedPowerFromSegments(segments, windowS = 30) {
  if (!segments?.length) return null;
  // 파워 데이터가 하나도 없으면 null
  const anyPw = segments.some(s => Number.isFinite(s?.pwAvg));
  if (!anyPw) return null;

  const q = []; // {pw, dt}
  let sumPwDt = 0; // 창 내 ∑(pw*dt)
  let sumDt = 0;   // 창 내 ∑dt
  let sumFourthWeighted = 0; // ∑ ( (P30)^4 * w ) ; w는 현재 스텝의 시간 dt
  let totalTime = 0;

  for (const seg of segments) {
    let dt = seg.dt;
    if (!(dt > 0)) continue;
    const pw = Number.isFinite(seg.pwAvg) ? seg.pwAvg : 0; // 파워가 없으면 0으로 간주(코스팅 반영)

    // 창에 현재 구간 추가
    q.push({ pw, dt });
    sumPwDt += pw * dt;
    sumDt += dt;

    // 30초 초과분을 앞에서 제거(부분 제거 포함)
    while (sumDt > windowS && q.length) {
      const excess = sumDt - windowS;
      const front = q[0];
      if (front.dt <= excess + 1e-9) {
        sumPwDt -= front.pw * front.dt;
        sumDt   -= front.dt;
        q.shift();
      } else {
        front.dt -= excess;
        sumPwDt  -= front.pw * excess;
        sumDt    -= excess;
        break;
      }
    }

    const p30 = sumDt > 0 ? (sumPwDt / sumDt) : 0;
    sumFourthWeighted += Math.pow(p30, 4) * dt;
    totalTime += dt;
  }

  if (!(totalTime > 0)) return null;
  const np = Math.pow(sumFourthWeighted / totalTime, 1/4);
  return np;
}
function computeIF(np, ftp) {
   return (Number.isFinite(np) && Number.isFinite(ftp) && ftp > 0) ? (np / ftp) : null;
}

function computeTSS(durationS, np, ftp) {
  if (!(durationS > 0) || !Number.isFinite(np) || !Number.isFinite(ftp) || ftp <= 0) return null;
   const IF = np / ftp;
   return (durationS * np * IF) / (ftp * 3600) * 100;
}

/* ===== 분석 ===== */
function analyzePoints(points, opts) {
  const {
    movingSpeedThreshold = 1.0, maxSpeedCapKmh = 80, minElevGain = 1,
    useSmoothElevation = true, smoothWindow = 5
  } = opts || {};
  const speedCap = Number.isFinite(maxSpeedCapKmh) ? maxSpeedCapKmh : 80;
  const moveThr = Number.isFinite(movingSpeedThreshold) ? movingSpeedThreshold : 1.0;

  if (points.length < 2) {
    return {
      points: points.length, totalDistM: 0, elapsedS: 0, movingS: 0, avgKmhElapsed: 0, avgKmhMoving: 0,
      maxKmh: 0, maxKmhSmooth: 0, elevGainM: 0,
      avgHr: null, maxHr: null, avgCad: null, maxCad: null, avgPw: null, maxPw: null,
      segments: [], firstLatLng: null, lastLatLng: null,
      hrTimeSum: 0, hrTimeDen: 0, cadTimeSum: 0, cadTimeDen: 0, pwTimeSum: 0, pwTimeDen: 0
    };
  }

  if (useSmoothElevation) {
    const raw = points.map(p => p.ele);
    const smoothed = medianSmooth(raw, smoothWindow);
    for (let i = 0; i < points.length; i++) { points[i].se = Number.isFinite(smoothed[i]) ? smoothed[i] : points[i].ele; }
  } else { for (const p of points) p.se = p.ele; }

  let totalDist = 0, movingTime = 0, maxSpeedMps = 0, elevGain = 0;
  let maxHr = null, hrTimeSum = 0, hrTimeDen = 0;
  let maxCad = null, cadTimeSum = 0, cadTimeDen = 0;
  let maxPw = null, pwTimeSum = 0, pwTimeDen = 0;
  let pendingUp = 0;

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i], p2 = points[i + 1];
    const dt = (p2.t - p1.t) / 1000;
    if (dt <= 0 || dt > 3600) continue;

    const d = haversine(p1.lat, p1.lon, p2.lat, p2.lon);
    const v = d / dt; const vKmh = v * 3.6;
    if (vKmh > speedCap) continue;

    totalDist += d;
    if (v >= moveThr) movingTime += dt;
    if (v > maxSpeedMps) maxSpeedMps = v;

    if (Number.isFinite(p1.se) && Number.isFinite(p2.se)) {
      const de = p2.se - p1.se;
      if (de > 0) { pendingUp += de; }
      else if (de < 0) { pendingUp = Math.max(0, pendingUp + de); }
      if (pendingUp >= minElevGain) { elevGain += pendingUp; pendingUp = 0; }
    }

    const segElevUp = (Number.isFinite(p1.se) && Number.isFinite(p2.se)) ? Math.max(0, p2.se - p1.se) : 0;

    if (Number.isFinite(p1.hr)) maxHr = Math.max(maxHr ?? p1.hr, p1.hr);
    if (Number.isFinite(p2.hr)) maxHr = Math.max(maxHr ?? p2.hr, p2.hr);
    let hrAvg = null;
    if (Number.isFinite(p1.hr) && Number.isFinite(p2.hr)) { hrAvg = (p1.hr + p2.hr) / 2; hrTimeSum += hrAvg * dt; hrTimeDen += dt; }

    if (Number.isFinite(p1.cad)) maxCad = Math.max(maxCad ?? p1.cad, p1.cad);
    if (Number.isFinite(p2.cad)) maxCad = Math.max(maxCad ?? p2.cad, p2.cad);
    let cadAvg = null;
    if (Number.isFinite(p1.cad) && Number.isFinite(p2.cad)) { cadAvg = (p1.cad + p2.cad) / 2; cadTimeSum += cadAvg * dt; cadTimeDen += dt; }

    if (Number.isFinite(p1.pw)) maxPw = Math.max(maxPw ?? p1.pw, p1.pw);
    if (Number.isFinite(p2.pw)) maxPw = Math.max(maxPw ?? p2.pw, p2.pw);
    let pwAvg = null;
    if (Number.isFinite(p1.pw) && Number.isFinite(p2.pw)) { pwAvg = (p1.pw + p2.pw) / 2; pwTimeSum += pwAvg * dt; pwTimeDen += dt; }

    segments.push({ lat1: p1.lat, lon1: p1.lon, lat2: p2.lat, lon2: p2.lon, d, dt, v, elevUp: segElevUp, hrAvg, cadAvg, pwAvg });
  }
  if (pendingUp > 0) elevGain += pendingUp;

  const elapsedS = (points.at(-1).t - points[0].t) / 1000;
  const avgElapsed = totalDist / (elapsedS || Infinity);
  const avgMoving = totalDist / (movingTime || Infinity);
  const avgHr = hrTimeDen > 0 ? hrTimeSum / hrTimeDen : null;
  const avgCad = cadTimeDen > 0 ? cadTimeSum / cadTimeDen : null;
  const avgPw  = pwTimeDen  > 0 ? pwTimeSum  / pwTimeDen  : null;

  return {
    points: points.length,
    totalDistM: totalDist,
    elapsedS, movingS: movingTime,
    avgKmhElapsed: avgElapsed * 3.6,
    avgKmhMoving: avgMoving * 3.6,
    maxKmh: maxSpeedMps * 3.6,
    maxKmhSmooth: maxSpeedKmhSmoothed(segments, 5),
    elevGainM: elevGain,
    avgHr, maxHr,
    avgCad, maxCad,
    avgPw, maxPw,
    segments,
    firstLatLng: [points[0].lat, points[0].lon],
    lastLatLng: [points.at(-1).lat, points.at(-1).lon],
    hrTimeSum, hrTimeDen,
    cadTimeSum, cadTimeDen,
    pwTimeSum, pwTimeDen
  };
}

/* ===== 랩 ===== */
function makeDistanceLaps(analysis, lapDistanceKm, calorieParams) {
  const laps = []; const lapDistM = lapDistanceKm * 1000;
  let accDist = 0, accTime = 0, accElev = 0, accHrSum = 0, accHrDen = 0, lapIdx = 1;
  let accCadSum = 0, accCadDen = 0, accPwSum = 0, accPwDen = 0;

  for (const seg of analysis.segments) {
    let remain = seg.d, remainTime = seg.dt, remainElev = seg.elevUp;
    const hrAvg = seg.hrAvg, cadAvg = seg.cadAvg, pwAvg = seg.pwAvg;

    while (remain > 0) {
      const need = lapDistM - accDist;
      if (remain <= need) {
        accDist += remain; accTime += remainTime; accElev += Math.max(0, remainElev);
        if (Number.isFinite(hrAvg))  { accHrSum  += hrAvg  * remainTime; accHrDen  += remainTime; }
        if (Number.isFinite(cadAvg)) { accCadSum += cadAvg * remainTime; accCadDen += remainTime; }
        if (Number.isFinite(pwAvg))  { accPwSum  += pwAvg  * remainTime; accPwDen  += remainTime; }
        remain = 0;
      } else {
        const ratio = need / remain;
        accDist += need; accTime += remainTime * ratio; accElev += Math.max(0, remainElev) * ratio;
        if (Number.isFinite(hrAvg))  { accHrSum  += hrAvg  * remainTime * ratio; accHrDen  += remainTime * ratio; }
        if (Number.isFinite(cadAvg)) { accCadSum += cadAvg * remainTime * ratio; accCadDen += remainTime * ratio; }
        if (Number.isFinite(pwAvg))  { accPwSum  += pwAvg  * remainTime * ratio; accPwDen  += remainTime * ratio; }

        const avgKmh = (accDist / accTime) * 3.6; const lapAvgHr = accHrDen > 0 ? accHrSum / accHrDen : null;
        const lapAvgCad = accCadDen > 0 ? accCadSum / accCadDen : null;
        const lapAvgPw  = accPwDen  > 0 ? accPwSum  / accPwDen  : null;
        const kcal = computeCaloriesForSegment(avgKmh, accTime, lapAvgHr, calorieParams);

        laps.push({ lap: lapIdx++, distKm: accDist / 1000, timeS: accTime, avgKmh, pace: paceMinPerKm(avgKmh), elevUpM: accElev, avgHr: lapAvgHr, avgCad: lapAvgCad, avgPw: lapAvgPw, kcal });

        remain -= need; remainTime *= (1 - ratio); remainElev *= (1 - ratio);
        accDist = 0; accTime = 0; accElev = 0; accHrSum = 0; accHrDen = 0; accCadSum = 0; accCadDen = 0; accPwSum = 0; accPwDen = 0;
      }
    }
  }
  return laps;
}
function computeCaloriesForSegment(avgKmh, durationS, avgHr, params) {
  const { method, fileCalories, totalElapsedS, weightKg, age, sex } = params;
  if (method === "none") return null;
  if (method === "auto") {
    if (fileCalories != null && isFinite(totalElapsedS) && totalElapsedS > 0) return fileCalories * (durationS / totalElapsedS);
    const hrEst = estimateCaloriesHR(avgHr, durationS, weightKg, age, sex); if (hrEst != null && hrEst > 0) return hrEst;
    return estimateCaloriesMET(avgKmh, durationS, weightKg);
  }
  if (method === "hr") return estimateCaloriesHR(avgHr, durationS, weightKg, age, sex);
  if (method === "met") return estimateCaloriesMET(avgKmh, durationS, weightKg);
  return null;
}

/* ===== CSV ===== */
const toCSV = (rows) => {
  if (!rows.length) return ""; const headers = Object.keys(rows[0]);
  const esc = (v) => (v == null) ? "" : String(v).replaceAll('"', '""');
  return [headers.join(","), ...rows.map(r => headers.map(h => `"${esc(r[h])}"`).join(","))].join("\n");
};
const downloadCSV = (filename, csv) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
};



/* ====== 요약 테이블: 지표 선택(전체/선택) UI & 로직 ====== */

const SUMMARY_COLS_KEY = "summaryVisibleCols_v1";

// 요약 테이블에 쓸 컬럼 정의(‘파일’은 항상 표시)
const SUMMARY_COLUMNS = [
  { key: "total_km",        label: "거리(km)" },
  { key: "elapsed",         label: "경과시간" },
  { key: "moving",          label: "이동시간" },
  { key: "avg_kmh_elapsed", label: "평균속도(경과)" },
  { key: "avg_kmh_moving",  label: "평균속도(이동)" },
  { key: "max_kmh",         label: "최대속도" },
  { key: "avg_pace",        label: "평균페이스" },
  { key: "elev_gain_m",     label: "누적상승" },
  { key: "avg_hr",          label: "평균심박" },
  { key: "max_hr",          label: "최대심박" },
  { key: "calories_kcal",   label: "칼로리" },
  { key: "avg_cad",         label: "평균케이던스" },
  { key: "max_cad",         label: "최대케이던스" },
  { key: "avg_pw",          label: "평균파워" },
  { key: "max_pw",          label: "최대파워" },
  { key: "np",              label: "NP" },
  { key: "if",              label: "IF" },
  { key: "tss",             label: "TSS" }
];

// 현재 표시 설정 가져오기(미설정이면 “전체”)
function getVisibleSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(SUMMARY_COLS_KEY) || "[]");
    if (Array.isArray(arr) && arr.length) return new Set(arr);
  } catch {}
  return new Set(SUMMARY_COLUMNS.map(c => c.key)); // 기본: 전체
}
function saveVisibleSet(set) {
  localStorage.setItem(SUMMARY_COLS_KEY, JSON.stringify([...set]));
}

// 헤더를 우리 정의대로 재구성(데이터-키 부여)
function buildSummaryHeader() {
  const thead = document.querySelector("#summaryTable thead");
  if (!thead) return;
  const tr = document.createElement("tr");
  tr.innerHTML =
    `<th class="left" data-col="file">파일</th>` +
    SUMMARY_COLUMNS.map(c => `<th data-col="${c.key}">${c.label}</th>`).join("");
  thead.innerHTML = "";
  thead.appendChild(tr);
}

// 요약 행 렌더(일반/합계 공용)
function renderSummaryRow(row, { total = false } = {}) {
  const tb = document.querySelector("#summaryTable tbody");
  if (!tb) return;
  const tr = document.createElement("tr");
  if (total) tr.className = "total-row";
  const cells = [
    `<td class="left" data-col="file">${row.file ?? ""}</td>`,
    ...SUMMARY_COLUMNS.map(c => `<td data-col="${c.key}">${row[c.key] ?? ""}</td>`)
  ];
  tr.innerHTML = cells.join("");
  tb.appendChild(tr);
}

// 표시/숨김 적용
function applySummaryColumnVisibility() {
  const visible = getVisibleSet();
  const allCells = document.querySelectorAll('#summaryTable [data-col]');
  allCells.forEach(el => {
    const key = el.getAttribute('data-col');
    if (key === "file") { el.style.display = ""; return; } // 파일은 항상 보임
    el.style.display = visible.has(key) ? "" : "none";
  });
}

// 지표 선택 시트(바텀시트) 만들기
function ensureMetricSheet() {
  if (document.getElementById("metricSheet")) return;

  const sheet = document.createElement("div");
  sheet.id = "metricSheet";
  sheet.className = "sheet";
  sheet.innerHTML = `
    <div class="grab"></div>
    <h3 style="margin:4px 0 12px;">표시할 지표 선택</h3>
    <div id="metricList" class="row" style="gap:10px;align-items:flex-start;"></div>
    <div class="row" style="justify-content:space-between;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="metricAllBtn"    class="btn ghost">전체</button>
        <button id="metricBasicBtn"  class="btn ghost">기본</button>
        <button id="metricPowerBtn"  class="btn ghost">파워·NP</button>
        <button id="metricClearBtn"  class="btn ghost">모두 숨김</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="metricCloseBtn"  class="btn">닫기</button>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  // 체크박스 그리기
  const list = sheet.querySelector("#metricList");
  const visible = getVisibleSet();
  const mkItem = (c) => {
    const id = `metric_${c.key}`;
    const wrap = document.createElement("label");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";
    wrap.innerHTML = `
      <input type="checkbox" id="${id}" ${visible.has(c.key) ? "checked" : ""}/>
      <span>${c.label}</span>`;
    wrap.querySelector("input").addEventListener("change", (e) => {
      const v = getVisibleSet();
      if (e.target.checked) v.add(c.key); else v.delete(c.key);
      saveVisibleSet(v);
      applySummaryColumnVisibility();
    });
    return wrap;
  };
  list.append(...SUMMARY_COLUMNS.map(mkItem));

  // 프리셋
  const setAndApply = (keys) => {
    const s = new Set(keys);
    saveVisibleSet(s);
    // 체크박스도 동기화
    SUMMARY_COLUMNS.forEach(c => {
      const el = document.getElementById(`metric_${c.key}`);
      if (el) el.checked = s.has(c.key);
    });
    applySummaryColumnVisibility();
  };

  // 전체
  sheet.querySelector("#metricAllBtn").addEventListener("click", () => {
    setAndApply(SUMMARY_COLUMNS.map(c => c.key));
  });
  // 기본(가장 자주 보는 지표)
  sheet.querySelector("#metricBasicBtn").addEventListener("click", () => {
    setAndApply(["total_km","elapsed","moving","avg_kmh_elapsed","max_kmh","avg_pace","elev_gain_m","avg_hr","calories_kcal"]);
  });
  // 파워·NP 패키지
  sheet.querySelector("#metricPowerBtn").addEventListener("click", () => {
    setAndApply(["total_km","elapsed","moving","avg_kmh_elapsed","max_kmh","avg_pace","avg_cad","max_cad","avg_pw","max_pw","np","if","tss"]);
  });
  // 모두 숨김
  sheet.querySelector("#metricClearBtn").addEventListener("click", () => {
    setAndApply([]); // 파일만 남음
  });

  sheet.querySelector("#metricCloseBtn").addEventListener("click", () => {
    sheet.classList.remove("open");
  });
}

// “지표 선택” 버튼(요약 테이블 위에 툴바로 삽입)
function injectMetricToolbar() {
  const tbl = document.getElementById("summaryTable");
  if (!tbl || document.getElementById("openMetricSheetBtn")) return;

  const bar = document.createElement("div");
  bar.className = "chart-toolbar";
  bar.style.marginTop = "6px";
  bar.style.justifyContent = "flex-end";
  bar.innerHTML = `
    <button id="openMetricSheetBtn" class="btn">지표 선택</button>
    <button id="metricShowAllBtn" class="btn ghost">전체보기</button>
    <button id="metricShowBasicBtn" class="btn ghost">기본</button>
  `;
  tbl.parentNode.insertBefore(bar, tbl);

  document.getElementById("openMetricSheetBtn").addEventListener("click", () => {
    ensureMetricSheet();
    document.getElementById("metricSheet").classList.add("open");
  });
  document.getElementById("metricShowAllBtn").addEventListener("click", () => {
    saveVisibleSet(new Set(SUMMARY_COLUMNS.map(c => c.key)));
    applySummaryColumnVisibility();
  });
  document.getElementById("metricShowBasicBtn").addEventListener("click", () => {
    saveVisibleSet(new Set(["total_km","elapsed","moving","avg_kmh_elapsed","max_kmh","avg_pace","elev_gain_m","avg_hr","calories_kcal"]));
    applySummaryColumnVisibility();
  });
}

// 초기 1회 실행
buildSummaryHeader();
injectMetricToolbar();
// 표가 비어있을 수 있으므로, 분석 후에도 applySummaryColumnVisibility()를 다시 호출합니다.











/* ===== 누적 이동거리 차트 ===== */
let cumChart = null;
const cumCard = document.getElementById("cumCard");
const cumHint = document.getElementById("cumHint");
const cumModeSel = document.getElementById("cumMode");

function renderCumulativeChart(labels, cumValues) {
  if (!window.Chart) return;
  const ctx = document.getElementById("cumChart")?.getContext("2d"); if (!ctx) return;
  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 300);
  gradient.addColorStop(0, "rgba(18,184,134,0.35)");
  gradient.addColorStop(1, "rgba(18,184,134,0.02)");
  if (cumChart) { cumChart.destroy(); }
  cumChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "누적 이동거리 (km)", data: cumValues, tension: 0.35, fill: true, backgroundColor: gradient, borderColor: "#12b886", borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 4, pointHitRadius: 12 }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y.toFixed(2)} km` } } },
      scales: { x: { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 }, grid: { display: false } }, y: { title: { display: true, text: "거리(km)" }, ticks: { callback: v => `${v} km` }, grid: { color: "rgba(0,0,0,.06)" } } }
    }
  });
  if (cumCard) cumCard.style.display = labels.length ? "block" : "none";
}
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function getMonthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function makeCumulativeSeries(items, mode) {
  let groups = [];
  if (mode === "file") {
    groups = items.slice().sort((a, b) => a.date - b.date).map(x => ({ key: x.date || 0, label: `${x.label}`, km: x.km }));
  } else if (mode === "week") {
    const map = new Map();
    for (const it of items) { const d = new Date(it.date || 0); const key = getISOWeek(d); map.set(key, (map.get(key) || 0) + it.km); }
    groups = Array.from(map.entries()).map(([key, km]) => ({ key, label: key, km })).sort((a, b) => (a.key > b.key ? 1 : -1));
  } else if (mode === "month") {
    const map = new Map();
    for (const it of items) { const d = new Date(it.date || 0); const key = getMonthKey(d); map.set(key, (map.get(key) || 0) + it.km); }
    groups = Array.from(map.entries()).map(([key, km]) => ({ key, label: key, km })).sort((a, b) => (a.key > b.key ? 1 : -1));
  }
  const labels = groups.map(g => g.label);
  const cumulative = []; let acc = 0; for (const g of groups) { acc += g.km; cumulative.push(Number(acc.toFixed(3))); }
  return { labels, cumulative, total: acc };
}

/* ===== 옵션 시트 열고닫기 ===== */
const openSheetBtn = $("#openSheetBtn"), closeSheetBtn = $("#closeSheetBtn"), sheet = $("#sheet");
openSheetBtn?.addEventListener("click", () => sheet?.classList.add("open"));
closeSheetBtn?.addEventListener("click", () => sheet?.classList.remove("open"));

/* ===== 테이블/버튼 엘리먼트 ===== */
const elAnalyze = $("#analyzeBtn"), elExportSummary = $("#exportSummaryBtn"), elExportLaps = $("#exportLapsBtn");
const tbodySummary = $("#summaryTable tbody"), lapsSection = $("#lapsSection"), tbodyLaps = $("#lapsTable tbody");
let lastSummary = [], lastLaps = [];
let fileDistanceForChart = []; // {label, date(ms), km, fileName, elev}

/* ===== 요약/랩 테이블 헤더 보강(자동 추가) ===== */
function ensureSummaryHeaderColumns() {
  const headRow = document.querySelector("#summaryTable thead tr");
  if (!headRow) return;
  const existing = Array.from(headRow.querySelectorAll("th")).map(th => th.textContent.trim());
  const need = ["평균케이던스","최대케이던스","평균파워","최대파워","NP","IF","TSS"];
  for (const label of need) {
    if (!existing.includes(label)) {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    }
  }
}
function ensureLapsHeaderColumns() {
  const headRow = document.querySelector("#lapsTable thead tr");
  if (!headRow) return;
  const existing = Array.from(headRow.querySelectorAll("th")).map(th => th.textContent.trim());
  const need = ["구간평균케이던스","구간평균파워"];
  for (const label of need) {
    if (!existing.includes(label)) {
      const ref = headRow.querySelector("th:last-child");
      const th = document.createElement("th"); th.textContent = label;
      headRow.appendChild(th);
    }
  }
}
ensureSummaryHeaderColumns();
ensureLapsHeaderColumns();

/* ===== 누적 상승고도 차트(카드 동적) ===== */
let elevChart = null;
const elevCard = document.createElement("div");
elevCard.className = "card"; elevCard.style.display = "none";
elevCard.innerHTML = `
  <div class="chart-toolbar">
    <label for="elevMode" class="muted">표시: </label>
    <select id="elevMode" class="btn">
      <option value="file" selected>파일별(일자+파일명)</option>
      <option value="week">주간(ISO 주)</option>
      <option value="month">월간(YYYY-MM)</option>
    </select>
  </div>
  <h3>🏔 누적 상승고도</h3>
  <div class="chart-wrap">
    <canvas id="elevChart"></canvas>
  </div>
  <div class="muted" id="elevHint"></div>
`;
const cumCardEl = document.getElementById("cumCard");
if (!document.getElementById("elevChart")) { cumCardEl?.after(elevCard); }
const elevModeSel = elevCard.querySelector("#elevMode");
const elevHint = elevCard.querySelector("#elevHint");

function renderElevationChart(labels, cumValues) {
  if (!window.Chart) return;
  if (labels.length) elevCard.style.display = "block";
  const ctx = document.getElementById("elevChart")?.getContext("2d"); if (!ctx) return;
  const h = ctx.canvas.height || ctx.canvas.clientHeight || 300;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "rgba(255,102,0,0.35)");
  gradient.addColorStop(1, "rgba(255,102,0,0.02)");
  if (elevChart) elevChart.destroy();
  elevChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "누적 상승고도 (m)", data: cumValues, tension: 0.35, fill: true, backgroundColor: gradient, borderColor: "#ff6600", borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 4, pointHitRadius: 12 }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y.toFixed(1)} m` } } },
      scales: { x: { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 }, grid: { display: false } }, y: { title: { display: true, text: "상승고도(m)" }, ticks: { callback: v => `${v} m` }, grid: { color: "rgba(0,0,0,.06)" } } }
    }
  });
  if (!labels.length) elevCard.style.display = "none";
}
function makeElevationSeries(items, mode) {
  let groups = [];
  if (mode === "file") {
    groups = items.slice().sort((a, b) => a.date - b.date).map(x => ({ key: x.date || 0, label: `${x.label}`, elev: x.elev }));
  } else {
    const map = new Map();
    for (const it of items) {
      const d = new Date(it.date || 0);
      const key = mode === "week" ? getISOWeek(d) : getMonthKey(d);
      map.set(key, (map.get(key) || 0) + it.elev);
    }
    groups = Array.from(map.entries()).map(([key, elev]) => ({ key, label: key, elev })).sort((a, b) => (a.key > b.key ? 1 : -1));
  }
  const labels = groups.map(g => g.label);
  const cumulative = []; let acc = 0;
  for (const g of groups) { acc += g.elev; cumulative.push(Number(acc.toFixed(1))); }
  return { labels, cumulative, total: acc };
}
function updateElevationChart(mode = "file") {
  if (!fileDistanceForChart.length) { elevCard.style.display = "none"; return; }
  const items = fileDistanceForChart.map(d => ({ ...d, elev: d.elev || 0 }));
  const { labels, cumulative, total } = makeElevationSeries(items, mode);
  renderElevationChart(labels, cumulative);
  if (labels.length) {
    const first = labels[0].split(" · ")[0]; const last = labels.at(-1).split(" · ")[0];
    elevHint.textContent = `표시: ${mode.toUpperCase()}  ·  기간: ${first} ~ ${last}  ·  항목 ${labels.length}개  ·  총 ${total.toFixed(1)} m`;
  } else { elevHint.textContent = ""; }
}
elevModeSel?.addEventListener("change", () => updateElevationChart(elevModeSel.value));
updateElevationChart("file");

/* ===== 분석 실행 ===== */
elAnalyze?.addEventListener("click", async () => {
  try {
    if (elNativeInput?.files?.length) addFiles(elNativeInput.files);
    const files = selectedFiles.slice();
    if (!files.length) { toast("GPX 파일을 선택해 주세요"); return; }

    const movingThreshold = numOr(parseFloat($("#movingThreshold")?.value), 1.0);
    const lapDistanceKm = numOr(parseFloat($("#lapDistanceKm")?.value), 1.0);
    const minElevGain = numOr(parseFloat($("#minElevGain")?.value), 1.0);
    const maxSpeedCap = numOr(parseFloat($("#maxSpeedCap")?.value), 80.0);
    const method = $("#calorieMethod")?.value || "auto";
    const weightKg = numOr(parseFloat($("#weightKg")?.value), NaN);
    const age = numOr(parseFloat($("#age")?.value), NaN);
    const sex = $("#sex")?.value || "";
    const useSmoothElevation = $("#useSmoothElevation")?.checked ?? true;
    const ftpW = numOr(parseFloat($("#ftpW")?.value), NaN); // 옵션 시트에 있으면 사용

    if (tbodySummary) tbodySummary.innerHTML = "";
    if (tbodyLaps) tbodyLaps.innerHTML = "";
    lastSummary = []; lastLaps = []; fileDistanceForChart = [];
    sheet?.classList.remove("open");
    showProgress("파일 파싱 준비 중…");

    if (map) {
      Object.keys(mapLayers).forEach(k => { layerControl.removeLayer(mapLayers[k]); map.removeLayer(mapLayers[k]); delete mapLayers[k]; });
    }
    const bounds = (window.L && L.latLngBounds) ? L.latLngBounds() : null;
    const colorMode = colorModeSel?.value || "speed";

    const agg = {
      distM: 0, elapsedS: 0, movingS: 0, elevM: 0,
      maxKmh: 0, maxHr: null, hrTimeSum: 0, hrTimeDen: 0,
      maxCad: null, cadTimeSum: 0, cadTimeDen: 0,
      maxPw: null, pwTimeSum: 0, pwTimeDen: 0,
      calories: 0, tss: 0 // TSS는 파일별 합산
    };
    if (lapsSection) lapsSection.style.display = files.length === 1 ? "block" : "none";

    ensureSummaryHeaderColumns();
    ensureLapsHeaderColumns();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`처리 중 ${i + 1}/${files.length}… (${file.name})`);
      const text = await file.text();
      const { points, fileCalories } = parseGpxText(text);

      if (!points || points.length < 2) {
        // 0행(헤더와 칸수 맞춤: 기존 + 평균/최대 케이던스/파워 + NP/IF/TSS)
        /* const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="left">${file.name}</td>
          <td>0</td>                    <!-- 거리(km) -->
          <td>00:00:00</td>             <!-- 경과시간 -->
          <td>00:00:00</td>             <!-- 이동시간 -->
          <td>0</td>                    <!-- 평균속도(경과) -->
          <td>0</td>                    <!-- 평균속도(이동) -->
          <td>0</td>                    <!-- 최대속도 -->
          <td></td>                     <!-- 평균페이스 -->
          <td>0</td>                    <!-- 누적상승 -->
          <td></td>                     <!-- 평균심박 -->
          <td></td>                     <!-- 최대심박 -->
          <td></td>                     <!-- 칼로리 -->
          <td></td><td></td>            <!-- 평균/최대 케이던스 -->
          <td></td><td></td>            <!-- 평균/최대 파워 -->
          <td></td><td></td><td></td>   <!-- NP, IF, TSS -->
        `;
        tbodySummary?.appendChild(tr); */

         // 빈 값들로 행 객체 구성 (키는 SUMMARY_COLUMNS와 동일)
        const zeroRow = {
          file: file.name,
          total_km: 0, elapsed: "00:00:00", moving: "00:00:00",
          avg_kmh_elapsed: 0, avg_kmh_moving: 0, max_kmh: 0, avg_pace: "",
          elev_gain_m: 0, avg_hr: "", max_hr: "", calories_kcal: "",
          avg_cad: "", max_cad: "", avg_pw: "", max_pw: "",
          np: "", if: "", tss: ""
        };
        renderSummaryRow(zeroRow);

        




        continue;
      }

      const analysis = analyzePoints(points, {
        movingSpeedThreshold: movingThreshold, maxSpeedCapKmh: maxSpeedCap,
        minElevGain, useSmoothElevation
      });

      if (map && bounds) drawTrackLayer(file.name, analysis, colorMode, bounds);

      // 랩(1개 파일일 때만)
      if (files.length === 1) {
        const laps = makeDistanceLaps(analysis, lapDistanceKm, {
          method, fileCalories, totalElapsedS: analysis.elapsedS, weightKg, age, sex
        });
        laps.forEach(lp => {
          const row = {
            file: file.name, lap: lp.lap, lap_km: round(lp.distKm, 3), lap_time: secToHMS(lp.timeS),
            lap_avg_kmh: round(lp.avgKmh, 2), lap_pace: lp.pace, lap_elev_up_m: round(lp.elevUpM, 1),
            lap_avg_hr: lp.avgHr ? Math.round(lp.avgHr) : "",
            lap_avg_cad: lp.avgCad ? Math.round(lp.avgCad) : "",
            lap_avg_pw: lp.avgPw ? Math.round(lp.avgPw) : "",
            lap_kcal: lp.kcal != null ? Math.round(lp.kcal) : ""
          };
          lastLaps.push(row);
          const tr2 = document.createElement("tr");
          tr2.innerHTML = `<td class="left">${row.file}</td><td>${row.lap}</td><td>${row.lap_km}</td><td>${row.lap_time}</td>
                           <td>${row.lap_avg_kmh}</td><td>${row.lap_pace}</td><td>${row.lap_elev_up_m}</td>
                           <td>${row.lap_avg_hr}</td><td>${row.lap_avg_cad}</td><td>${row.lap_avg_pw}</td><td>${row.lap_kcal}</td>`;
          tbodyLaps?.appendChild(tr2);
        });
      }

      const displayMaxKmh = analysis.maxKmhSmooth ?? analysis.maxKmh;

      // 파일별 NP/IF/TSS
      const np = normalizedPowerFromSegments(analysis.segments, 30); // 30초 창
      const ifVal = computeIF(np, ftpW);
      const tss = computeTSS(analysis.movingS, np ?? NaN, ftpW);     // 이동시간 기준

      // 칼로리(기존 로직)
      let caloriesKcal = null;
      if (method === "auto" && fileCalories != null) caloriesKcal = fileCalories;
      else {
        const chosen = computeCaloriesForSegment(
          analysis.avgKmhElapsed, analysis.elapsedS, analysis.avgHr,
          { method, fileCalories: null, totalElapsedS: analysis.elapsedS, weightKg, age, sex }
        );
        caloriesKcal = chosen != null ? chosen : null;
      }

      // 합계 누적
      agg.distM += analysis.totalDistM; agg.elapsedS += analysis.elapsedS; agg.movingS += analysis.movingS;
      agg.elevM += analysis.elevGainM; agg.maxKmh = Math.max(agg.maxKmh, displayMaxKmh || 0);
      if (analysis.maxHr  != null) agg.maxHr  = Math.max(agg.maxHr  ?? analysis.maxHr,  analysis.maxHr);
      if (analysis.maxCad != null) agg.maxCad = Math.max(agg.maxCad ?? analysis.maxCad, analysis.maxCad);
      if (analysis.maxPw  != null) agg.maxPw  = Math.max(agg.maxPw  ?? analysis.maxPw,  analysis.maxPw);
      agg.hrTimeSum  += (analysis.hrTimeSum  || 0); agg.hrTimeDen  += (analysis.hrTimeDen  || 0);
      agg.cadTimeSum += (analysis.cadTimeSum || 0); agg.cadTimeDen += (analysis.cadTimeDen || 0);
      agg.pwTimeSum  += (analysis.pwTimeSum  || 0); agg.pwTimeDen  += (analysis.pwTimeDen  || 0);
      if (caloriesKcal != null) agg.calories += caloriesKcal;
      if (tss != null) agg.tss += tss;

      // 요약 행
      const sumRow = {
        file: file.name,
        total_km: round(analysis.totalDistM / 1000, 3),
        elapsed: secToHMS(analysis.elapsedS),
        moving: secToHMS(analysis.movingS),
        avg_kmh_elapsed: round(analysis.avgKmhElapsed, 2),
        avg_kmh_moving: round(analysis.avgKmhMoving, 2),
        max_kmh: round(displayMaxKmh, 2),
        avg_pace: paceMinPerKm(analysis.avgKmhElapsed),
        elev_gain_m: round(analysis.elevGainM, 1),
        avg_hr: analysis.avgHr ? Math.round(analysis.avgHr) : "",
        max_hr: analysis.maxHr ? Math.round(analysis.maxHr) : "",
        calories_kcal: caloriesKcal != null ? Math.round(caloriesKcal) : "",
        avg_cad: analysis.avgCad ? Math.round(analysis.avgCad) : "",
        max_cad: analysis.maxCad ? Math.round(analysis.maxCad) : "",
        avg_pw: analysis.avgPw ? Math.round(analysis.avgPw) : "",
        max_pw: analysis.maxPw ? Math.round(analysis.maxPw) : "",
        np: Number.isFinite(np) ? Math.round(np) : "",
        if: Number.isFinite(ifVal) ? ifVal.toFixed(2) : "",
        tss: Number.isFinite(tss) ? Math.round(tss) : ""
      };
      lastSummary.push(sumRow);

      /* const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${sumRow.file}</td><td>${sumRow.total_km}</td>
                    <td>${sumRow.elapsed}</td><td>${sumRow.moving}</td><td>${sumRow.avg_kmh_elapsed}</td>
                    <td>${sumRow.avg_kmh_moving}</td><td>${sumRow.max_kmh}</td><td>${sumRow.avg_pace}</td>
                    <td>${sumRow.elev_gain_m}</td><td>${sumRow.avg_hr}</td><td>${sumRow.max_hr}</td><td>${sumRow.calories_kcal}</td>
                    <td>${sumRow.avg_cad}</td><td>${sumRow.max_cad}</td><td>${sumRow.avg_pw}</td><td>${sumRow.max_pw}</td>
                    <td>${sumRow.np}</td><td>${sumRow.if}</td><td>${sumRow.tss}</td>`;
      tbodySummary?.appendChild(tr); */
      
      renderSummaryRow(sumRow);

      // 그래프용 데이터 수집
      const startTime = points?.[0]?.t instanceof Date ? points[0].t : null;
      const baseLabel = startTime
        ? `${startTime.getFullYear()}-${String(startTime.getMonth() + 1).padStart(2, "0")}-${String(startTime.getDate()).padStart(2, "0")}`
        : "0000-00-00";
      const label = `${baseLabel} · ${file.name}`;
      fileDistanceForChart.push({
        label,
        date: startTime ? +startTime : 0,
        km: (analysis.totalDistM || 0) / 1000,
        fileName: file.name,
        elev: analysis.elevGainM || 0
      });
    } // files loop

    // 합계 행 (NP/IF는 의미가 덜하므로 공란, TSS는 합산)
    if (agg.elapsedS > 0 || agg.distM > 0) {
      const totalAvgKmhElapsed = (agg.distM / (agg.elapsedS || Infinity)) * 3.6;
      const totalAvgKmhMoving = (agg.distM / (agg.movingS || Infinity)) * 3.6;
      const totalRow = {
        file: "합계",
        total_km: round(agg.distM / 1000, 3),
        elapsed: secToHMS(agg.elapsedS),
        moving: secToHMS(agg.movingS),
        avg_kmh_elapsed: round(totalAvgKmhElapsed, 2),
        avg_kmh_moving: round(totalAvgKmhMoving, 2),
        max_kmh: round(agg.maxKmh, 2),
        avg_pace: paceMinPerKm(totalAvgKmhElapsed),
        elev_gain_m: round(agg.elevM, 1),
        avg_hr: agg.hrTimeDen > 0 ? Math.round(agg.hrTimeSum / agg.hrTimeDen) : "",
        max_hr: agg.maxHr != null ? Math.round(agg.maxHr) : "",
        calories_kcal: agg.calories ? Math.round(agg.calories) : "",
        avg_cad: agg.cadTimeDen > 0 ? Math.round(agg.cadTimeSum / agg.cadTimeDen) : "",
        max_cad: agg.maxCad != null ? Math.round(agg.maxCad) : "",
        avg_pw: agg.pwTimeDen > 0 ? Math.round(agg.pwTimeSum / agg.pwTimeDen) : "",
        max_pw: agg.maxPw != null ? Math.round(agg.maxPw) : "",
        np: "", if: "", tss: Number.isFinite(agg.tss) ? Math.round(agg.tss) : ""
      };
      lastSummary.push(totalRow);
      /* const trT = document.createElement("tr"); trT.className = "total-row";
      trT.innerHTML = `<td class="left">${totalRow.file}</td><td>${totalRow.total_km}</td>
                     <td>${totalRow.elapsed}</td><td>${totalRow.moving}</td><td>${totalRow.avg_kmh_elapsed}</td>
                     <td>${totalRow.avg_kmh_moving}</td><td>${totalRow.max_kmh}</td><td>${totalRow.avg_pace}</td>
                     <td>${totalRow.elev_gain_m}</td><td>${totalRow.avg_hr}</td><td>${totalRow.max_hr}</td><td>${totalRow.calories_kcal}</td>
                     <td>${totalRow.avg_cad}</td><td>${totalRow.max_cad}</td><td>${totalRow.avg_pw}</td><td>${totalRow.max_pw}</td>
                     <td></td><td></td><td>${totalRow.tss}</td>`;
      tbodySummary?.appendChild(trT); */

      renderSummaryRow(totalRow, { total: true });
    }

    // 차트 렌더
    const { labels, cumulative, total } = makeCumulativeSeries(fileDistanceForChart, "file");
    renderCumulativeChart(labels, cumulative);
    if (labels.length && cumHint) {
      const first = labels[0]?.split(" · ")[0]; const last = labels.at(-1)?.split(" · ")[0];
      cumHint.textContent = `표시: FILE  ·  기간: ${first} ~ ${last}  ·  항목 ${labels.length}개  ·  총 ${total.toFixed(2)} km`;
    }
    updateElevationChart(document.getElementById("elevMode")?.value || "file");

    if (map && bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.1));
    if (elExportSummary) elExportSummary.disabled = lastSummary.length === 0;
    if (elExportLaps) elExportLaps.disabled = lastLaps.length === 0 || (lapsSection?.style.display === "none");
    hideProgress(); toast("분석 완료");
  } catch (err) { console.error(err); hideProgress(); toast(`오류: ${err.message || err}`); }
});

/* 그래프 모드 변경 */
cumModeSel?.addEventListener("change", () => {
  if (!fileDistanceForChart.length) { cumCard && (cumCard.style.display = "none"); return; }
  const mode = cumModeSel.value || "file";
  const { labels, cumulative, total } = makeCumulativeSeries(fileDistanceForChart, mode);
  renderCumulativeChart(labels, cumulative);
  if (labels.length && cumHint) {
    const first = labels[0].split(" · ")[0];
    const last = labels.at(-1).split(" · ")[0];
    cumHint.textContent = `표시: ${mode.toUpperCase()}  ·  기간: ${first} ~ ${last}  ·  항목 ${labels.length}개  ·  총 ${total.toFixed(2)} km`;
  } else { if (cumHint) cumHint.textContent = ""; }
});

applySummaryColumnVisibility();   // ← 선택한 지표만 보이도록 적용

/* ===== 내보내기 ===== */
elExportSummary?.addEventListener("click", () => { const csv = toCSV(lastSummary); downloadCSV("gpx_summary.csv", csv); toast("요약 CSV 저장 완료"); });
elExportLaps?.addEventListener("click", () => { if (!lastLaps.length) { toast("랩 데이터가 없습니다"); return; } const csv = toCSV(lastLaps); downloadCSV("gpx_laps.csv", csv); toast("랩 CSV 저장 완료"); });
