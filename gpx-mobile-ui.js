/* =============================================================================
 * GPX 모바일 분석기 – 단일파일 상세그래프(거리-속도/고도/심박) + 누적차트 + 지도 + 요약/랩
 *  - HTML에 detailCard가 없으면 JS가 자동 생성해서 cumCard 아래에 추가합니다.
 *  - 단일 파일 선택 시: 누적 차트 숨기고 상세 3차트 표시
 *  - 다중 파일 선택 시: 상세 3차트 숨기고 기존 누적 차트 표시
 *  - Chart.js / Leaflet / Bootstrap은 HTML에서 로드되어 있어야 함
 * 수정일자: 2025-08-13
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


/* ✅ 인풋 오른쪽에 상태 라벨을 한 번만 만든다 */
(function ensureFileCountLabel() {
  if (!elNativeInput) return;
  if (document.getElementById('fileCountLabel')) return;
  const span = document.createElement('span');
  span.id = 'fileCountLabel';
  span.className = 'muted';
  span.textContent = '선택된 파일 없음';
  // 한 줄 정렬이 필요하면 .file-row 래퍼를 HTML에 두거나,
  // 아니면 그냥 인풋 바로 뒤에 꽂아 넣습니다.
  elNativeInput.insertAdjacentElement('afterend', span);
})();




function renderChips() {
  if (!elChips) return;
  elChips.innerHTML = "";
  const label = document.createElement("div");
  /* label.id = "gpxFilesLabel"; */
  label.className = "muted";
  elChips.appendChild(label);
  updateFileCountLabel();

  if (!selectedFiles.length) return;

  // 칩 렌더
  selectedFiles.forEach((f, i) => {
    const div = document.createElement("div");
    div.className = "chip";
    div.innerHTML = `<span title="${f.name}">${f.name}</span><button type="button" aria-label="삭제">삭제</button>`;
    div.querySelector("button").addEventListener("click", () => {
      selectedFiles.splice(i, 1);
      renderChips();            // 삭제 후 다시 렌더 → 라벨도 자동 갱신
    });
    elChips.appendChild(div);
  });
}


/* 파일 추가/삭제/초기화 시 반드시 갱신 */
function addFiles(list){
  const arr = Array.from(list || []);
  let added = 0;
  for (const f of arr) {
    const k = `${f.name}|${f.size}|${f.lastModified}`;
    if (!selectedFiles.some(x => `${x.name}|${x.size}|${x.lastModified}` === k)) {
      selectedFiles.push(f); added++;
    }
  }
  renderChips();
  updateFileCountLabel();                // ← 추가/유지
  toast(added ? `${added}개 파일 추가됨` : `이미 선택된 파일입니다`);
}

function clearSelected(){
  selectedFiles = [];
  renderChips();
  if (elNativeInput) elNativeInput.value = '';
  updateFileCountLabel();                // ← 유지
  toast('선택 초기화 완료');
}

/* ✅ 라벨 갱신은 이 ID만 대상으로 */
function updateFileCountLabel() {
  const el = document.getElementById('fileCountLabel');
  if (!el) return;
  const n = selectedFiles.length;
  el.textContent =
    n === 0 ? '선택된 파일 없음'
    : n === 1 ? selectedFiles[0].name
    : `파일 ${n}개`;
}

elNativeInput?.addEventListener('change', (e) => {
  addFiles(e.target.files);
  e.target.value = '';                   // 재선택 가능
});

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
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".gpx"; input.multiple = true; input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => { addFiles(input.files); document.body.removeChild(input); }, { once: true });
    input.click();
  }
});
elClearBtn?.addEventListener("click", clearSelected); renderChips();

/* ===== 지도 ===== */
let map, layerControl, legendControl;
const mapLayers = {};
const colorModeSel = $("#colorMode");
const togglePanBtn = $("#togglePanBtn");
let panEnabled = false;

function initMap() {
  if (!window.L) return console.warn("Leaflet 로드 실패");
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
      (colorMode === 'hr') ? (s.hrAvg ?? NaN) :
        (colorMode === 'speed') ? (s.v * 3.6) :
          (colorMode === 'power') ? (s.pwAvg ?? NaN) :
            (colorMode === 'cad') ? (s.cadAvg ?? NaN) : NaN;
    if (isFinite(metric)) { minMetric = Math.min(minMetric, metric); maxMetric = Math.max(maxMetric, metric); }
  }
  if (minMetric === Infinity || maxMetric === -Infinity) { minMetric = 0; maxMetric = 1; }

  for (const s of analysis.segments) {
    const p1 = [s.lat1, s.lon1], p2 = [s.lat2, s.lon2];
    const metric =
      (colorMode === 'hr') ? (s.hrAvg ?? NaN) :
        (colorMode === 'speed') ? (s.v * 3.6) :
          (colorMode === 'power') ? (s.pwAvg ?? NaN) :
            (colorMode === 'cad') ? (s.cadAvg ?? NaN) : NaN;
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
function estimateCaloriesMET(avgKmh, dur, w, { useMovingTime = true, net = false } = {}) {
  if (!Number.isFinite(w)) return null;
  const MET = metFromSpeedKmh(avgKmh);
  const metVal = net ? Math.max(0, MET - 1) : MET;
  return metVal * w * (dur / 3600);
}

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
  const unique = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 || pts[i].t - pts[i - 1].t !== 0) unique.push(pts[i]);
  }

  // 칼로리는 합계가 아닌 대표(최대)값만 사용
  const nodes = dom.getElementsByTagName("*");
  const calVals = [];
  for (const n of nodes) {
    if (n.localName && n.localName.toLowerCase() === "calories") {
      const v = parseFloat(n.textContent.trim());
      if (Number.isFinite(v)) calVals.push(v);
    }
  }
  const fileCalories = calVals.length ? Math.max(...calVals) : null;
  return { points: unique, fileCalories };
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

/* ===== NP/IF/TSS & Work(kJ) ===== */
function normalizedPowerFromSegments(segments, windowS = 30) {
  if (!segments?.length) return null;
  const anyPw = segments.some(s => Number.isFinite(s?.pwAvg));
  if (!anyPw) return null;

  const q = []; // {pw, dt}
  let sumPwDt = 0; let sumDt = 0;
  let sumFourthWeighted = 0; let totalTime = 0;

  for (const seg of segments) {
    let dt = seg.dt; if (!(dt > 0)) continue;
    const pw = Number.isFinite(seg.pwAvg) ? seg.pwAvg : 0;

    q.push({ pw, dt }); sumPwDt += pw * dt; sumDt += dt;

    while (sumDt > windowS && q.length) {
      const excess = sumDt - windowS;
      const front = q[0];
      if (front.dt <= excess + 1e-9) { sumPwDt -= front.pw * front.dt; sumDt -= front.dt; q.shift(); }
      else { front.dt -= excess; sumPwDt -= front.pw * excess; sumDt -= excess; break; }
    }

    const p30 = sumDt > 0 ? (sumPwDt / sumDt) : 0;
    sumFourthWeighted += Math.pow(p30, 4) * dt;
    totalTime += dt;
  }

  if (!(totalTime > 0)) return null;
  return Math.pow(sumFourthWeighted / totalTime, 1 / 4);
}
function computeIF(np, ftp) { return (Number.isFinite(np) && Number.isFinite(ftp) && ftp > 0) ? (np / ftp) : null; }
function computeTSS(durationS, np, ftp) {
  if (!(durationS > 0) || !Number.isFinite(np) || !Number.isFinite(ftp) || ftp <= 0) return null;
  const IF = np / ftp;
  return (durationS * np * IF) / (ftp * 3600) * 100;
}
function totalWorkKJFromSegments(segments) {
  let workJ = 0;
  for (const s of segments) {
    const pw = Number.isFinite(s.pwAvg) ? s.pwAvg : 0;
    workJ += pw * (s.dt || 0);
  }
  return workJ / 1000; // kJ
}

/* ===== 분석 ===== */
function analyzePoints(points, opts) {
  const {
    movingSpeedThreshold = 1.0, maxSpeedCapKmh = 80, minElevGain = 1,
    useSmoothElevation = true, smoothWindow = 5,
    avgOnMovingOnly = true,          // 평균 산정: 이동 구간만
    cadenceMinRpm = 10,              // 케이던스 하한(0 제외)
    avgPowerIncludeZero = true       // 파워 평균에 0W 포함 (코스팅 포함)
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
    const isMoving = v >= moveThr;

    totalDist += d;
    if (isMoving) movingTime += dt;
    if (v > maxSpeedMps) maxSpeedMps = v;

    if (Number.isFinite(p1.se) && Number.isFinite(p2.se)) {
      const de = p2.se - p1.se;
      if (de > 0) { pendingUp += de; }
      else if (de < 0) { pendingUp = Math.max(0, pendingUp + de); }
      if (pendingUp >= minElevGain) { elevGain += pendingUp; pendingUp = 0; }
    }

    const segElevUp = (Number.isFinite(p1.se) && Number.isFinite(p2.se)) ? Math.max(0, p2.se - p1.se) : 0;

    // HR
    if (Number.isFinite(p1.hr)) maxHr = Math.max(maxHr ?? p1.hr, p1.hr);
    if (Number.isFinite(p2.hr)) maxHr = Math.max(maxHr ?? p2.hr, p2.hr);
    let hrAvg = null;
    {
      const h1 = Number.isFinite(p1.hr) ? p1.hr : null;
      const h2 = Number.isFinite(p2.hr) ? p2.hr : null;
      hrAvg = (h1 != null && h2 != null) ? (h1 + h2) / 2 : (h2 ?? h1);
      if (hrAvg != null && (!avgOnMovingOnly || isMoving)) { hrTimeSum += hrAvg * dt; hrTimeDen += dt; }
    }

    // Cadence
    if (Number.isFinite(p1.cad)) maxCad = Math.max(maxCad ?? p1.cad, p1.cad);
    if (Number.isFinite(p2.cad)) maxCad = Math.max(maxCad ?? p2.cad, p2.cad);
    let cadAvg = null;
    {
      const c1 = Number.isFinite(p1.cad) ? p1.cad : null;
      const c2 = Number.isFinite(p2.cad) ? p2.cad : null;
      cadAvg = (c1 != null && c2 != null) ? (c1 + c2) / 2 : (c2 ?? c1);
      if (cadAvg != null && cadAvg >= cadenceMinRpm && (!avgOnMovingOnly || isMoving)) {
        cadTimeSum += cadAvg * dt; cadTimeDen += dt;
      } else { cadAvg = null; }
    }

    // Power
    if (Number.isFinite(p1.pw)) maxPw = Math.max(maxPw ?? p1.pw, p1.pw);
    if (Number.isFinite(p2.pw)) maxPw = Math.max(maxPw ?? p2.pw, p2.pw);
    let pwAvg = null;
    {
      const w1 = Number.isFinite(p1.pw) ? p1.pw : null;
      const w2 = Number.isFinite(p2.pw) ? p2.pw : null;
      pwAvg = (w1 != null && w2 != null) ? (w1 + w2) / 2 : (w2 ?? w1);
      const useForAvg = (!avgOnMovingOnly || isMoving) && (pwAvg != null) && (true /* include zero */);
      if (useForAvg) { pwTimeSum += pwAvg * dt; pwTimeDen += dt; } else { pwAvg = null; }
    }

    // [NEW] 절대 고도(e2)도 세그먼트에 싣기 → 상세 고도 라인 정확도 향상
    const e2 = Number.isFinite(p2.se) ? p2.se : null;

    segments.push({
      lat1: p1.lat, lon1: p1.lon, lat2: p2.lat, lon2: p2.lon,
      d, dt, v, elevUp: segElevUp, hrAvg, cadAvg, pwAvg,
      e2
    });
  }
  if (pendingUp > 0) elevGain += pendingUp;

  const elapsedS = (points.at(-1).t - points[0].t) / 1000;
  const avgElapsed = totalDist / (elapsedS || Infinity);
  const avgMoving = totalDist / (movingTime || Infinity);
  const avgHr = hrTimeDen > 0 ? hrTimeSum / hrTimeDen : null;
  const avgCad = cadTimeDen > 0 ? cadTimeSum / cadTimeDen : null;
  const avgPw = pwTimeDen > 0 ? pwTimeSum / pwTimeDen : null;

  return {
    points: points.length,
    totalDistM: totalDist,
    elapsedS, movingS: movingTime,
    avgKmhElapsed: avgElapsed * 3.6,
    avgKmhMoving: avgMoving * 3.6,
    maxKmh: maxSpeedMps * 3.6,
    maxKmhSmooth: maxSpeedKmhSmoothed(segments, 5),
    elevGainM: elevGain,
    avgHr, maxHr, avgCad, maxCad, avgPw, maxPw,
    segments,
    firstLatLng: [points[0].lat, points[0].lon],
    lastLatLng: [points.at(-1).lat, points.at(-1).lon],
    hrTimeSum, hrTimeDen, cadTimeSum, cadTimeDen, pwTimeSum, pwTimeDen
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
        if (Number.isFinite(hrAvg)) { accHrSum += hrAvg * remainTime; accHrDen += remainTime; }
        if (Number.isFinite(cadAvg)) { accCadSum += cadAvg * remainTime; accCadDen += remainTime; }
        if (Number.isFinite(pwAvg)) { accPwSum += pwAvg * remainTime; accPwDen += remainTime; }
        remain = 0;
      } else {
        const ratio = need / remain;
        accDist += need; accTime += remainTime * ratio; accElev += Math.max(0, remainElev) * ratio;
        if (Number.isFinite(hrAvg)) { accHrSum += hrAvg * remainTime * ratio; accHrDen += remainTime * ratio; }
        if (Number.isFinite(cadAvg)) { accCadSum += cadAvg * remainTime * ratio; accCadDen += remainTime * ratio; }
        if (Number.isFinite(pwAvg)) { accPwSum += pwAvg * remainTime * ratio; accPwDen += remainTime * ratio; }

        const avgKmh = (accDist / accTime) * 3.6; const lapAvgHr = accHrDen > 0 ? accHrSum / accHrDen : null;
        const lapAvgCad = accCadDen > 0 ? accCadSum / accCadDen : null;
        const lapAvgPw = accPwDen > 0 ? accPwSum / accPwDen : null;
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
  const { method, fileCalories, totalElapsedS, weightKg, age, sex, powerKJ } = params;
  if (method === "none") return null;

  if (method === "auto") {
    if (Number.isFinite(powerKJ) && powerKJ > 0) return powerKJ;
    if (fileCalories != null && Number.isFinite(totalElapsedS) && totalElapsedS > 0) {
      return fileCalories * (durationS / totalElapsedS);
    }
    const hrEst = estimateCaloriesHR(avgHr, durationS, weightKg, age, sex);
    if (hrEst != null && hrEst > 0) return hrEst;
    return estimateCaloriesMET(avgKmh, durationS, weightKg, { useMovingTime: true, net: false });
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

/* ====== 요약 테이블: 지표 선택 ====== */
const SUMMARY_COLS_KEY = "summaryVisibleCols_v1";
const SUMMARY_COLUMNS = [
  { key: "total_km", label: "거리(km)" },
  { key: "elapsed", label: "경과시간" },
  { key: "moving", label: "이동시간" },
  { key: "avg_kmh_elapsed", label: "평균속도(경과)" },
  { key: "avg_kmh_moving", label: "평균속도(이동)" },
  { key: "max_kmh", label: "최대속도" },
  { key: "avg_pace", label: "평균페이스" },
  { key: "elev_gain_m", label: "누적상승" },
  { key: "avg_hr", label: "평균심박" },
  { key: "max_hr", label: "최대심박" },
  { key: "calories_kcal", label: "칼로리" },
  { key: "avg_cad", label: "평균케이던스" },
  { key: "max_cad", label: "최대케이던스" },
  { key: "avg_pw", label: "평균파워" },
  { key: "max_pw", label: "최대파워" },
  { key: "np", label: "NP" },
  { key: "if", label: "IF" },
  { key: "tss", label: "TSS" }
];
function getVisibleSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(SUMMARY_COLS_KEY) || "[]");
    if (Array.isArray(arr) && arr.length) return new Set(arr);
  } catch { }
  return new Set(SUMMARY_COLUMNS.map(c => c.key));
}
function saveVisibleSet(set) { localStorage.setItem(SUMMARY_COLS_KEY, JSON.stringify([...set])); }
function buildSummaryHeader() {
  const thead = document.querySelector("#summaryTable thead");
  if (!thead) return;
  const tr = document.createElement("tr");
  tr.innerHTML =
    `<th class="left" data-col="file">파일</th>` +
    SUMMARY_COLUMNS.map(c => `<th data-col="${c.key}">${c.label}</th>`).join("");
  thead.innerHTML = ""; thead.appendChild(tr);
}
function renderSummaryRow(row, { total = false } = {}) {
  const tb = document.querySelector("#summaryTable tbody"); if (!tb) return;
  const tr = document.createElement("tr"); if (total) tr.className = "total-row";
  const cells = [
    `<td class="left" data-col="file">${row.file ?? ""}</td>`,
    ...SUMMARY_COLUMNS.map(c => `<td data-col="${c.key}">${row[c.key] ?? ""}</td>`)
  ];
  tr.innerHTML = cells.join(""); tb.appendChild(tr);
}
function applySummaryColumnVisibility() {
  const visible = getVisibleSet();
  const allCells = document.querySelectorAll('#summaryTable [data-col]');
  allCells.forEach(el => {
    const key = el.getAttribute('data-col');
    if (key === "file") { el.style.display = ""; return; }
    el.style.display = visible.has(key) ? "" : "none";
  });
}
function ensureMetricSheet() {
  if (document.getElementById("metricSheet")) return;
  const sheet = document.createElement("div");
  sheet.id = "metricSheet"; sheet.className = "sheet";
  sheet.innerHTML = `
    <div class="grab"></div>
    <h3 style="margin:4px 0 12px;">표시할 지표 선택</h3>
    <div id="metricList" class="row" style="gap:10px;align-items:flex-start;"></div>
    <div class="row" style="justify-content:space-between;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="metricAllBtn" class="btn btn-secondary">전체</button>
        <button id="metricBasicBtn" class="btn btn-secondary">기본</button>
        <button id="metricPowerBtn" class="btn btn-secondary">파워·NP</button>
        <button id="metricClearBtn" class="btn btn-secondary">모두 숨김</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="metricCloseBtn" class="btn btn-secondary">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(sheet);

  const list = sheet.querySelector("#metricList");
  const visible = getVisibleSet();
  const mkItem = (c) => {
    const id = `metric_${c.key}`;
    const wrap = document.createElement("label");
    wrap.style.display = "inline-flex"; wrap.style.alignItems = "center"; wrap.style.gap = "8px";
    wrap.innerHTML = `<input type="checkbox" id="${id}" ${visible.has(c.key) ? "checked" : ""}/><span>${c.label}</span>`;
    wrap.querySelector("input").addEventListener("change", (e) => {
      const v = getVisibleSet();
      if (e.target.checked) v.add(c.key); else v.delete(c.key);
      saveVisibleSet(v); applySummaryColumnVisibility();
    });
    return wrap;
  };
  list.append(...SUMMARY_COLUMNS.map(mkItem));

  const setAndApply = (keys) => {
    const s = new Set(keys); saveVisibleSet(s);
    SUMMARY_COLUMNS.forEach(c => { const el = document.getElementById(`metric_${c.key}`); if (el) el.checked = s.has(c.key); });
    applySummaryColumnVisibility();
  };

  sheet.querySelector("#metricAllBtn").addEventListener("click", () => setAndApply(SUMMARY_COLUMNS.map(c => c.key)));
  sheet.querySelector("#metricBasicBtn").addEventListener("click", () => setAndApply(["total_km", "elapsed", "moving", "avg_kmh_elapsed", "max_kmh", "avg_pace", "elev_gain_m", "avg_hr", "calories_kcal"]));
  sheet.querySelector("#metricPowerBtn").addEventListener("click", () => setAndApply(["total_km", "elapsed", "moving", "avg_kmh_elapsed", "max_kmh", "avg_pace", "avg_cad", "max_cad", "avg_pw", "max_pw", "np", "if", "tss"]));
  sheet.querySelector("#metricClearBtn").addEventListener("click", () => setAndApply([]));
  sheet.querySelector("#metricCloseBtn").addEventListener("click", () => sheet.classList.remove("open"));
}
function closeSheetById(id) { document.getElementById(id)?.classList.remove("open"); }
document.getElementById("closeMetricSheetBtn")?.addEventListener("click", () => closeSheetById("metricSheet"));
document.getElementById("closeSheetBtn")?.addEventListener("click", () => closeSheetById("sheet"));
function injectMetricToolbar() {
  const tbl = document.getElementById("summaryTable");
  if (!tbl || document.getElementById("openMetricSheetBtn")) return;
  const bar = document.createElement("div");
  bar.className = "chart-toolbar"; bar.style.marginTop = "6px"; bar.style.justifyContent = "flex-end";
  bar.innerHTML = `
    <button id="openMetricSheetBtn" class="btn btn-secondary">지표 선택</button>
    <button id="metricShowAllBtn" class="btn btn-secondary">전체보기</button>
    <button id="metricShowBasicBtn" class="btn btn-secondary">기본</button>`;
  tbl.parentNode.insertBefore(bar, tbl);

  document.getElementById("openMetricSheetBtn").addEventListener("click", () => { ensureMetricSheet(); document.getElementById("metricSheet").classList.add("open"); });
  document.getElementById("metricShowAllBtn").addEventListener("click", () => { saveVisibleSet(new Set(SUMMARY_COLUMNS.map(c => c.key))); applySummaryColumnVisibility(); });
  document.getElementById("metricShowBasicBtn").addEventListener("click", () => {
    saveVisibleSet(new Set(["total_km", "elapsed", "moving", "avg_kmh_elapsed", "max_kmh", "avg_pace", "elev_gain_m", "avg_hr", "calories_kcal"]));
    applySummaryColumnVisibility();
  });
}
buildSummaryHeader();
injectMetricToolbar();

/* ===== 누적 이동거리 차트 ===== */
let cumChart = null;
const cumCard = document.getElementById("cumCard");
const cumHint = document.getElementById("cumHint");
const cumModeSel = document.getElementById("cumMode");

function renderCumulativeChart(labels, cumValues) {
  if (!window.Chart) return;
  const ctx = document.getElementById("cumChart")?.getContext("2d"); if (!ctx) return;
  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 300);
  gradient.addColorStop(0, "rgba(18,184,134,0.35)"); gradient.addColorStop(1, "rgba(18,184,134,0.02)");
  if (cumChart) cumChart.destroy();
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

/* ===== FTP 로컬 저장 ===== */
(function initFTPField() {
  const el = document.getElementById("ftpW");
  if (!el) return;
  const saved = localStorage.getItem("gpx_ftp_watt");
  if (saved != null && saved !== "" && !isNaN(+saved)) el.value = saved;
  el.addEventListener("change", () => {
    const v = el.value?.trim();
    if (v === "" || isNaN(+v)) localStorage.removeItem("gpx_ftp_watt");
    else localStorage.setItem("gpx_ftp_watt", String(Math.round(+v)));
  });
})();

/* ===== 옵션 시트 열고닫기 ===== */
const openSheetBtn = $("#openSheetBtn"), closeSheetBtn = $("#closeSheetBtn"), sheet = $("#sheet");
openSheetBtn?.addEventListener("click", () => sheet?.classList.add("open"));
closeSheetBtn?.addEventListener("click", () => sheet?.classList.remove("open"));

/* ===== 테이블/버튼 엘리먼트 ===== */
const elAnalyze = $("#analyzeBtn"), elExportSummary = $("#exportSummaryBtn"), elExportLaps = $("#exportLapsBtn");
const tbodySummary = $("#summaryTable tbody"), lapsSection = $("#lapsSection"), tbodyLaps = $("#lapsTable tbody");
let lastSummary = [], lastLaps = [];
let fileDistanceForChart = []; // {label, date(ms), km, fileName, elev}

/* ===== 랩 테이블 헤더 보강 ===== */
(function ensureLapsHeaderColumns() {
  const headRow = document.querySelector("#lapsTable thead tr");
  if (!headRow) return;
  const existing = Array.from(headRow.querySelectorAll("th")).map(th => th.textContent.trim());
  const need = ["구간평균케이던스", "구간평균파워"];
  for (const label of need) {
    if (!existing.includes(label)) {
      const th = document.createElement("th"); th.textContent = label; headRow.appendChild(th);
    }
  }
})();

/* ===== 누적 상승고도 차트(동적 카드) ===== */
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
  <div class="muted" id="elevHint"></div>`;
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
  gradient.addColorStop(0, "rgba(255,102,0,0.35)"); gradient.addColorStop(1, "rgba(255,102,0,0.02)");
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

/* =============================================================================
 * [NEW] 단일 파일 상세 그래프(거리-속도/고도/심박)
 * ============================================================================= */
let speedDistChart = null, elevDistChart = null, hrDistChart = null;

/** detailCard가 없으면 자동 생성해서 cumCard 아래 삽입 */
(function ensureDetailCard() {
  if (document.getElementById("detailCard")) return;
  const card = document.createElement("div");
  card.className = "card";
  card.id = "detailCard";
  card.style.display = "none";
  card.innerHTML = `
    <h3>🏁 단일 파일 상세 그래프</h3>

    <div class="chart-wrap" style="margin-top:8px;">
      <h4 style="margin:0 0 6px;font-size:14px;">Speed (km/h) — X: 이동거리(km)</h4>
      <canvas id="speedDistChart"></canvas>
    </div>

    <div class="chart-wrap" style="margin-top:16px;">
      <h4 style="margin:0 0 6px;font-size:14px;">Elevation (m) — X: 이동거리(km)</h4>
      <canvas id="elevDistChart"></canvas>
    </div>

    <div class="chart-wrap" style="margin-top:16px;">
      <h4 style="margin:0 0 6px;font-size:14px;">Heart Rate (bpm) — X: 이동거리(km)</h4>
      <canvas id="hrDistChart"></canvas>
    </div>`;
  (document.getElementById("cumCard") || document.body).after(card);
})();

const detailCard = document.getElementById("detailCard");

function buildDetailSeries(analysis) {
  const distKm = [], speedKmh = [], elevM = [], hrBpm = [];
  let accM = 0;
  const segs = analysis.segments || [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    accM += (s.d || 0);
    const vKmh = (Number.isFinite(s.v) ? s.v * 3.6 : null);
    const e2 = Number.isFinite(s.e2) ? s.e2 : null;     // analyzePoints에서 주입
    const hr = Number.isFinite(s.hrAvg) ? s.hrAvg : null;

    distKm.push(accM / 1000);
    speedKmh.push(vKmh);
    elevM.push(e2);
    hrBpm.push(hr);
  }
  return { distKm, speedKmh, elevM, hrBpm };
}


/* function lineOpts(yTitle, yTickUnit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y?.toFixed?.(1) ?? ctx.parsed.y} ${yTickUnit}` } }
    },
    scales: {
      x: { grid: { display: false }, title: { display: true, text: "이동거리 (km)" } },
      y: { title: { display: true, text: yTitle }, grid: { color: "rgba(0,0,0,.06)" } }
    }
  };
} */
// ✅ 거리축을 정수로 표기하는 공통 옵션
function lineOpts(yTitle, yTickUnit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          // 툴팁의 제목에도 정수 거리 표시
          title: (items) => {
            const raw = items?.[0]?.label;
            const num = Number(raw);
            return Number.isFinite(num) ? `이동거리 ${Math.round(num)} km` : (raw ?? "");
          },
          label: (ctx) => ` ${ctx.parsed.y?.toFixed?.(1) ?? ctx.parsed.y} ${yTickUnit}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        title: { display: true, text: "이동거리 (km)" },
        ticks: {
          autoSkip: true,
          maxTicksLimit: 12,            // 과도한 눈금 방지
          callback: function (value) {  // ← 여기서 정수 변환
            const lbl = this.getLabelForValue(value);
            const num = Number(lbl);
            if (!Number.isFinite(num)) return lbl ?? "";
            return Math.round(num);     // 소수점 제거(반올림). 버림은 Math.floor
          }
        }
      },
      y: {
        title: { display: true, text: yTitle },
        grid: { color: "rgba(0,0,0,.06)" }
      }
    }
  };
}

// ==== y값 크기에 따라 파랑→빨강 그라디언트 적용 (공용) ====
function makeYGradient(chart, lowColor = "#2f80ed", highColor = "#ff3b3b") {
  const { ctx, chartArea } = chart;
  if (!chartArea) return null; // chartArea가 없으면(초기) 나중에 다시 적용
  const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  g.addColorStop(0, lowColor);  // 낮은 값(아래) = 파랑
  g.addColorStop(1, highColor); // 높은 값(위) = 빨강
  return g;
}

function applyLineGradient(chart) {
  const g = makeYGradient(chart);
  if (!g) return; // 초기 렌더링 중에는 chartArea가 아직 없을 수 있음
  chart.data.datasets.forEach(ds => {
    ds.borderColor = g;
    ds.pointBackgroundColor = g;
  });
  chart.update("none");
}


function ctxOf(id) { const el = document.getElementById(id); return el ? el.getContext("2d") : null; }
function destroyDetailCharts() {
  [speedDistChart, elevDistChart, hrDistChart].forEach(c => c?.destroy?.());
  speedDistChart = elevDistChart = hrDistChart = null;
}

function renderDetailCharts(series) {
  if (!window.Chart || !detailCard) return;
  destroyDetailCharts();

  // Speed
  const sctx = ctxOf("speedDistChart");
  if (sctx) {
    const optsS = lineOpts("속도 (km/h)", "km/h");
    optsS.onResize = (c) => applyLineGradient(c);
    speedDistChart = new Chart(sctx, {
      type: "line",
      data: {
        labels: series.distKm,
        datasets: [{ label: "Speed (km/h)", data: series.speedKmh, tension: 0.25, fill: false, borderWidth: 2, pointRadius: 0 }]
      },
      options: optsS
    });
    applyLineGradient(speedDistChart); // ← 최초 적용
  }

  // Elevation
  const ectx = ctxOf("elevDistChart");
  if (ectx) {
    const optsE = lineOpts("고도 (m)", "m");
    optsE.onResize = (c) => applyLineGradient(c);
    elevDistChart = new Chart(ectx, {
      type: "line",
      data: {
        labels: series.distKm,
        datasets: [{ label: "Elevation (m)", data: series.elevM, tension: 0.25, fill: false, borderWidth: 2, pointRadius: 0 }]
      },
      options: optsE
    });
    applyLineGradient(elevDistChart); // ← 최초 적용
  }

  // Heart Rate
  const hctx = ctxOf("hrDistChart");
  if (hctx) {
    const optsH = lineOpts("심박 (bpm)", "bpm");
    optsH.onResize = (c) => applyLineGradient(c);
    hrDistChart = new Chart(hctx, {
      type: "line",
      data: {
        labels: series.distKm,
        datasets: [{ label: "Heart Rate (bpm)", data: series.hrBpm, tension: 0.25, fill: false, borderWidth: 2, pointRadius: 0 }]
      },
      options: optsH
    });
    applyLineGradient(hrDistChart); // ← 최초 적용
  }

  detailCard.style.display = "block";
}


function showDetailHideCumulative() {
  detailCard && (detailCard.style.display = "block");
  const cum = document.getElementById("cumCard");
  const elevC = document.getElementById("elevChart")?.closest(".card");
  if (cum) cum.style.display = "none";
  if (elevC) elevC.style.display = "none";
}
function hideDetailShowCumulative() {
  detailCard && (detailCard.style.display = "none");
  const cum = document.getElementById("cumCard");
  const elevC = document.getElementById("elevChart")?.closest(".card");
  if (cum) cum.style.display = "";
  if (elevC) elevC.style.display = "";
  destroyDetailCharts();
}

/* ===== 분석 실행 ===== */
elAnalyze?.addEventListener("click", async () => {
  try {
    /* if (elNativeInput?.files?.length) addFiles(elNativeInput.files); */
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
    const ftpW = numOr(parseFloat($("#ftpW")?.value), NaN);

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
      calories: 0, tss: 0
    };
    if (lapsSection) lapsSection.style.display = files.length === 1 ? "block" : "none";

    // [NEW] 단일 파일 상세 그래프용 시리즈 보관
    let detailSeries = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`처리 중 ${i + 1}/${files.length}… (${file.name})`);
      const text = await file.text();
      const { points, fileCalories } = parseGpxText(text);

      if (!points || points.length < 2) {
        const zeroRow = {
          file: file.name,
          total_km: 0, elapsed: "00:00:00", moving: "00:00:00",
          avg_kmh_elapsed: 0, avg_kmh_moving: 0, max_kmh: 0, avg_pace: "",
          elev_gain_m: 0, avg_hr: "", max_hr: "", calories_kcal: "",
          avg_cad: "", max_cad: "", avg_pw: "", max_pw: "", np: "", if: "", tss: ""
        };
        renderSummaryRow(zeroRow);
        continue;
      }

      const analysis = analyzePoints(points, {
        movingSpeedThreshold: movingThreshold, maxSpeedCapKmh: maxSpeedCap,
        minElevGain, useSmoothElevation
      });

      if (map && bounds) drawTrackLayer(file.name, analysis, colorMode, bounds);

      // [NEW] 단일 파일 상세 그래프 시리즈 생성
      if (files.length === 1) {
        detailSeries = buildDetailSeries(analysis);
      }

      // 랩(1개 파일일 때만)
      if (files.length === 1) {
        const laps = makeDistanceLaps(analysis, lapDistanceKm, {
          method, fileCalories, totalElapsedS: analysis.elapsedS, weightKg, age, sex
        });
        laps.forEach(lp => {
          /*const row = {
            file: file.name, lap: lp.lap, lap_km: round(lp.distKm, 3), lap_time: secToHMS(lp.timeS),
            lap_avg_kmh: round(lp.avgKmh, 2), lap_pace: lp.pace, lap_elev_up_m: round(lp.elevUpM, 1),
            lap_avg_hr: lp.avgHr ? Math.round(lp.avgHr) : "",
            lap_avg_cad: lp.avgCad ? Math.round(lp.avgCad) : "",
            lap_avg_pw: lp.avgPw ? Math.round(lp.avgPw) : "",
            lap_kcal: lp.kcal != null ? Math.round(lp.kcal) : ""
          }; */
          const row = {
            lap: lp.lap, lap_time: secToHMS(lp.timeS),
            lap_avg_kmh: round(lp.avgKmh, 2), lap_pace: lp.pace, lap_elev_up_m: round(lp.elevUpM, 1),
            lap_avg_hr: lp.avgHr ? Math.round(lp.avgHr) : "",
            lap_avg_cad: lp.avgCad ? Math.round(lp.avgCad) : "",
            lap_avg_pw: lp.avgPw ? Math.round(lp.avgPw) : "",
            lap_kcal: lp.kcal != null ? Math.round(lp.kcal) : ""
          };


          lastLaps.push(row);
          const tr2 = document.createElement("tr");
          /* tr2.innerHTML = `<td class="left">${row.file}</td><td>${row.lap}</td><td>${row.lap_km}</td><td>${row.lap_time}</td>
                           <td>${row.lap_avg_kmh}</td><td>${row.lap_pace}</td><td>${row.lap_elev_up_m}</td>
                           <td>${row.lap_avg_hr}</td><td>${row.lap_avg_cad}</td><td>${row.lap_avg_pw}</td><td>${row.lap_kcal}</td>`; */
          tr2.innerHTML = `<td class="left">${row.lap}</td>
          <td>${row.lap_time}</td>
                           <td>${row.lap_avg_kmh}</td><td>${row.lap_pace}</td><td>${row.lap_elev_up_m}</td>
                           <td>${row.lap_avg_hr}</td><td>${row.lap_avg_cad}</td><td>${row.lap_avg_pw}</td><td>${row.lap_kcal}</td>`;


          tbodyLaps?.appendChild(tr2);
        });
      }

      const displayMaxKmh = analysis.maxKmhSmooth ?? analysis.maxKmh;

      // NP/IF/TSS (이동 구간만)
      const np = normalizedPowerFromSegments(analysis.segments.filter(s => s.v >= movingThreshold), 30);
      const ifVal = computeIF(np, ftpW);
      const tss = computeTSS(analysis.movingS, np ?? NaN, ftpW);

      // 칼로리
      const powerKJ = totalWorkKJFromSegments(analysis.segments);
      let caloriesKcal = null;
      if (method === "auto" && fileCalories != null) caloriesKcal = fileCalories;
      else {
        const chosen = computeCaloriesForSegment(
          analysis.avgKmhMoving, (analysis.movingS || analysis.elapsedS), analysis.avgHr,
          { method, fileCalories: null, totalElapsedS: analysis.movingS || analysis.elapsedS, weightKg, age, sex, powerKJ }
        );
        caloriesKcal = chosen ?? null;
      }

      // 합계 누적
      agg.distM += analysis.totalDistM; agg.elapsedS += analysis.elapsedS; agg.movingS += analysis.movingS;
      agg.elevM += analysis.elevGainM; agg.maxKmh = Math.max(agg.maxKmh, displayMaxKmh || 0);
      if (analysis.maxHr != null) agg.maxHr = Math.max(agg.maxHr ?? analysis.maxHr, analysis.maxHr);
      if (analysis.maxCad != null) agg.maxCad = Math.max(agg.maxCad ?? analysis.maxCad, analysis.maxCad);
      if (analysis.maxPw != null) agg.maxPw = Math.max(agg.maxPw ?? analysis.maxPw, analysis.maxPw);
      agg.hrTimeSum += (analysis.hrTimeSum || 0); agg.hrTimeDen += (analysis.hrTimeDen || 0);
      agg.cadTimeSum += (analysis.cadTimeSum || 0); agg.cadTimeDen += (analysis.cadTimeDen || 0);
      agg.pwTimeSum += (analysis.pwTimeSum || 0); agg.pwTimeDen += (analysis.pwTimeDen || 0);
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
      renderSummaryRow(sumRow);

      // 누적 차트용 데이터
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

    // 합계 행
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
      renderSummaryRow(totalRow, { total: true });
    }

    // [표시 분기] 단일 파일이면 상세 3그래프 표시, 아니면 누적 차트 표시
    if (files.length === 1 && detailSeries) {
      showDetailHideCumulative();
      renderDetailCharts(detailSeries);
    } else {
      hideDetailShowCumulative();
      const { labels, cumulative, total } = makeCumulativeSeries(fileDistanceForChart, "file");
      renderCumulativeChart(labels, cumulative);
      if (labels.length && cumHint) {
        const first = labels[0]?.split(" · ")[0]; const last = labels.at(-1)?.split(" · ")[0];
        cumHint.textContent = `표시: FILE  ·  기간: ${first} ~ ${last}  ·  항목 ${labels.length}개  ·  총 ${total.toFixed(2)} km`;
      }
      updateElevationChart(document.getElementById("elevMode")?.value || "file");
    }

    if (map && bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.1));
    if (elExportSummary) elExportSummary.disabled = lastSummary.length === 0;
    if (elExportLaps) elExportLaps.disabled = lastLaps.length === 0 || (lapsSection?.style.display === "none");
    applySummaryColumnVisibility();
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

/* ===== 내보내기 ===== */
elExportSummary?.addEventListener("click", () => {
  const csv = toCSV(lastSummary); downloadCSV("gpx_summary.csv", csv); toast("요약 CSV 저장 완료");
});
elExportLaps?.addEventListener("click", () => {
  if (!lastLaps.length) { toast("랩 데이터가 없습니다"); return; }
  const csv = toCSV(lastLaps); downloadCSV("gpx_laps.csv", csv); toast("랩 CSV 저장 완료");
});
