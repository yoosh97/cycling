/* =============================================================================
 * GPX 모바일 분석기 – 단일파일 상세그래프(거리-속도/고도/심박) + 누적차트 + 지도 + 요약/랩
 *  - HTML에 detailCard가 없으면 JS가 자동 생성해서 cumCard 아래에 추가합니다.
 *  - 단일 파일 선택 시: 누적 차트 숨기고 상세 3차트 표시
 *  - 다중 파일 선택 시: 상세 3차트 숨기고 기존 누적 차트 표시
 *  - Chart.js / Leaflet / Bootstrap은 HTML에서 로드되어 있어야 함
 * 수정일자: 2025-08-18 (리팩터링)
 * ============================================================================= */


/* 샘플 다운로드 창 열기(별도 페이지/팝업) */
document.getElementById('downloadSample')?.addEventListener('click', (e) => {
  e.preventDefault();
  // 팝업 차단 회피: 사용자 클릭 직후 window.open
  const w = window.open(
    'sample-downloads.html',
    'gpxSamples',
    'width=620,height=740,noopener'
  );
  // 포커스 보장(브라우저별)
  try { w?.focus(); } catch { }
});


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
const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;         // 🧹 REFACTOR: 파일 키 유틸 단일화
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;











/* ===== Quadrant 유틸 ===== */
const median = (arr) => {
  const a = (arr || []).slice().filter(Number.isFinite).sort((x, y) => x - y);
  const n = a.length; if (!n) return NaN;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

function roundRectPath(ctx, x, y, w, h, r = 6) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ── 가이드선 플러그인 ── */
const quadCrosshair = {
  id: 'quadCrosshair',
  afterDraw(c, _args, opts) {
    if (!opts) return;
    const { x0, y0 } = opts;
    if (!(Number.isFinite(x0) && Number.isFinite(y0))) return;
    const { ctx, chartArea: { left, right, top, bottom }, scales: { x, y } } = c;
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#777';
    const px = x.getPixelForValue(x0); ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke();
    const py = y.getPixelForValue(y0); ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
    ctx.restore();
  }
};

/* ── 연결선 + 라벨 플러그인 ── */
const quadLabelPlugin = {
  id: 'quadLabelPlugin',
  afterDatasetsDraw(chart, _args, opts) {
    const target = opts?.target; if (!target) return;
    const meta = chart.getDatasetMeta(target.datasetIndex);
    const el = meta?.data?.[target.index]; if (!el) return;

    const { x, y } = el.getProps(['x', 'y'], true);
    const { chartArea } = chart;
    const ctx = chart.ctx;

    const linkX = Math.min(chartArea.right - 6, x + 24);
    const linkY = Math.max(chartArea.top + 6, y - 24);

    ctx.save();
    ctx.strokeStyle = '#333'; ctx.setLineDash([3, 2]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(linkX, linkY); ctx.stroke();
    ctx.setLineDash([]);

    const text = String(target.text || '');
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const padX = 6, padY = 4, h = 20, w = ctx.measureText(text).width + padX * 2;

    let bx = linkX + 8, by = linkY - h / 2;
    if (bx + w > chartArea.right) bx = chartArea.right - w - 2;
    if (by < chartArea.top) by = chartArea.top + 2;

    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.strokeStyle = '#bbb';
    roundRectPath(ctx, bx, by, w, h, 6);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#111'; ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + padX, by + h / 2);
    ctx.restore();
  }
};

if (window.Chart) {
  Chart.register(quadCrosshair, quadLabelPlugin);
}







/* ===== 토스트/오버레이 ===== */
const toastEl = $("#toast");
let toastTimer = null;
function toast(msg, ms = 1600) {
  if (!toastEl) { console.log(msg); return; }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}
const overlay = $("#overlay");
const progressText = $("#progressText");
const showProgress = (t) => { progressText && (progressText.textContent = t); overlay?.classList.add("show"); };
const setProgress = (t) => { progressText && (progressText.textContent = t); };
const hideProgress = () => overlay?.classList.remove("show");


/* ===== 파일 선택 ===== */
const elNativeInput = $("#gpxFiles"),
  elAddBtn = $("#addFilesBtn"),
  elClearBtn = $("#clearFilesBtn"),
  elChips = $("#fileChips");
let selectedFiles = [];

/* 인풋 오른쪽 카운트 라벨 1회 생성 */
(function ensureFileCountLabel() {
  if (!elNativeInput) return;
  if (document.getElementById('fileCountLabel')) return;
  const span = document.createElement('span');
  span.id = 'fileCountLabel';
  span.className = 'muted';
  span.textContent = '선택된 파일 없음';
  elNativeInput.insertAdjacentElement('afterend', span);
})();

function updateFileCountLabel() {
  const el = document.getElementById('fileCountLabel');
  if (!el) return;
  const n = selectedFiles.length;
  el.textContent = n === 0 ? '선택된 파일 없음'
    : n === 1 ? selectedFiles[0].name
      : `파일 ${n}개`;
}

/* 선택된 파일 칩 렌더 */
function renderChips() {
  if (!elChips) return;
  elChips.innerHTML = "";
  const label = document.createElement("div");
  label.className = "muted";
  elChips.appendChild(label);
  updateFileCountLabel();
  if (!selectedFiles.length) return;

  selectedFiles.forEach((f, i) => {
    const div = document.createElement("div");
    div.className = "chip";
    div.innerHTML = `<span title="${f.name}">${f.name}</span><button type="button" aria-label="삭제">삭제</button>`;
    div.querySelector("button").addEventListener("click", () => {
      selectedFiles.splice(i, 1);
      renderChips();
    });
    elChips.appendChild(div);
  });
}

/* 파일 추가/삭제/초기화 시 갱신 */
function addFiles(list) {
  const arr = Array.from(list || []);
  let added = 0;
  for (const f of arr) {
    const k = fileKey(f);                                           // 🧹 REFACTOR: fileKey 유틸 사용
    if (!selectedFiles.some(x => fileKey(x) === k)) {
      selectedFiles.push(f); added++;
    }
  }
  renderChips();
  toast(added ? `${added}개 파일 추가됨` : `이미 선택된 파일입니다`); // 🧹 REFACTOR: 중복 라벨 갱신 호출 제거(렌더 안에서 처리)
}
function clearSelected() {
  selectedFiles = [];
  renderChips();
  if (elNativeInput) elNativeInput.value = '';
  toast('선택 초기화 완료');
}

elNativeInput?.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
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
elClearBtn?.addEventListener("click", clearSelected);
renderChips();


/* ===== 지도 안전 초기화 (Leaflet 로드/DOM 가시성 보장) ===== */
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
  map.dragging[enabled ? "enable" : "disable"]();
  map.scrollWheelZoom[enabled ? "enable" : "disable"]();
  map.touchZoom[enabled ? "enable" : "disable"]();
  togglePanBtn && (togglePanBtn.textContent = `지도 이동: ${enabled ? "켜짐" : "꺼짐"}`);
  toast(enabled ? "지도를 이동할 수 있습니다" : "지도가 고정되었습니다");
}
togglePanBtn?.addEventListener("click", () => setMapPan(!panEnabled));

function colorFromValue(val, minVal, maxVal) {
  if (!isFinite(val) || !isFinite(minVal) || !isFinite(maxVal) || maxVal <= minVal) return "#888";
  const t = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal)));
  const hue = (1 - t) * 240;
  return `hsl(${hue},85%,50%)`;
}

/* 우하단 범례 */
function addLegend(minVal, maxVal, unitLabel) {
  if (!window.L) return; if (legendControl) legendControl.remove();
  legendControl = L.control({ position: 'bottomright' });
  legendControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend');
    div.style.background = "#fff";
    div.style.padding = "8px 10px";
    div.style.borderRadius = "6px";
    div.style.boxShadow = "0 1px 4px rgba(0,0,0,.2)";
    div.style.fontSize = "12px";
    div.innerHTML = `<div><strong>${unitLabel}</strong></div>
      <div style="height:10px;width:160px;background:linear-gradient(90deg,#3066ff,#21c36f,#ffd33d,#ff3b3b);border-radius:4px;margin:6px 0;"></div>
      <div style="display:flex;justify-content:space-between;"><span>${round(minVal, 0)}</span><span>${round((minVal + maxVal) / 2, 0)}</span><span>${round(maxVal, 0)}</span></div>`;
    return div;
  };
  legendControl.addTo(map);
}

/* 🧹 REFACTOR: 난수 색상 함수 하나로 통일 + 사용처도 이 함수로 */
function randomColorEx(seed = '') {
  seed = String(seed);
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  const sat = 70 + (Math.abs(h) % 21);
  const light = 40 + (Math.abs(h >> 3) % 21);
  return `hsl(${hue},${sat}%,${light}%)`;
}

/* 🧹 REFACTOR: 세그먼트 값 추출 공용화 */
const metricLabelMap = { speed: '속도 km/h', hr: '심박 bpm', power: '파워 W', cad: '케이던스 rpm' };
function segMetric(colorMode, s) {
  switch (colorMode) {
    case 'speed': return s.v * 3.6;
    case 'hr': return s.hrAvg ?? NaN;
    case 'power': return s.pwAvg ?? NaN;
    case 'cad': return s.cadAvg ?? NaN;
    default: return NaN;
  }
}
function addLegendByMode(colorMode, minV, maxV) {
  const label = metricLabelMap[colorMode];
  if (label) addLegend(minV, maxV, label);
}

function drawTrackLayer(fileName, analysis, colorMode, bounds) {
  if (!map) return;
  if (mapLayers[fileName]) {
    layerControl.removeLayer(mapLayers[fileName]);
    map.removeLayer(mapLayers[fileName]);
    delete mapLayers[fileName];
  }

  const group = L.layerGroup();
  mapLayers[fileName] = group;
  layerControl.addOverlay(group, fileName);

  // min/max 1회 계산 (중복 제거)
  let minMetric = Infinity, maxMetric = -Infinity;
  for (const s of analysis.segments) {
    const metric = segMetric(colorMode, s);
    if (isFinite(metric)) { minMetric = Math.min(minMetric, metric); maxMetric = Math.max(maxMetric, metric); }
  }
  if (minMetric === Infinity || maxMetric === -Infinity) { minMetric = 0; maxMetric = 1; }

  for (const s of analysis.segments) {
    const p1 = [s.lat1, s.lon1], p2 = [s.lat2, s.lon2];
    const metric = segMetric(colorMode, s);
    const color = (colorMode === 'mono') ? randomColorEx(fileName) : colorFromValue(metric, minMetric, maxMetric);
    L.polyline([p1, p2], { color, weight: 5, opacity: .9 }).addTo(group);
    bounds.extend(p1); bounds.extend(p2);
  }

  if (analysis.firstLatLng) {
    L.circleMarker(analysis.firstLatLng, { radius: 5, color: '#00a84f', fillColor: '#00a84f', fillOpacity: 1 })
      .bindPopup(`Start: ${fileName}`).addTo(group); bounds.extend(analysis.firstLatLng);
  }
  if (analysis.lastLatLng) {
    L.circleMarker(analysis.lastLatLng, { radius: 5, color: '#ff3b3b', fillColor: '#ff3b3b', fillOpacity: 1 })
      .bindPopup(`Finish: ${fileName}`).addTo(group); bounds.extend(analysis.lastLatLng);
  }

  addLegendByMode(colorMode, minMetric, maxMetric); // 🧹 REFACTOR
  group.addTo(map);
}


/* ===== 칼로리 ===== (동일) */
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


/* ===== GPX 파서 ===== (동일) */
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
  if (!Array.isArray(arr) || arr.length === 0) return [];
  if (win < 1) win = 1;
  if (win % 2 === 0) win -= 1;
  const half = Math.floor(win / 2);
  const res = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const s = Math.max(0, i - half);
    const e = Math.min(arr.length - 1, i + half);
    const slice = [];
    for (let j = s; j <= e; j++) {
      const v = arr[j];
      if (Number.isFinite(v)) slice.push(v);
    }
    slice.sort((a, b) => a - b);
    res[i] = slice.length ? slice[(slice.length - 1) >> 1] : arr[i];
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
/* 🧹 REFACTOR: 동치식으로 단순화된 TSS 유지 */
function computeTSS(durationS, np, ftp) {
  durationS = Number(durationS); np = Number(np); ftp = Number(ftp);
  if (!(durationS > 0) || !Number.isFinite(np) || !Number.isFinite(ftp) || ftp <= 0) return null;
  const IF = np / ftp;
  return (durationS / 3600) * IF * IF * 100;
}
function totalWorkKJFromSegments(segments) {
  let workJ = 0;
  for (const s of segments) workJ += (Number.isFinite(s.pwAvg) ? s.pwAvg : 0) * (s.dt || 0);
  return workJ / 1000;
}


/* ===== 분석 ===== */
function analyzePoints(points, opts) {
  const {
    movingSpeedThreshold = 1.0, maxSpeedCapKmh = 80, minElevGain = 1,
    useSmoothElevation = true, smoothWindow = 5,
    avgOnMovingOnly = true, cadenceMinRpm = 10, avgPowerIncludeZero = true
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
      if (de > 0) { pendingUp += de; } else if (de < 0) { pendingUp = Math.max(0, pendingUp + de); }
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

    const e2 = Number.isFinite(p2.se) ? p2.se : null;

    segments.push({ lat1: p1.lat, lon1: p1.lon, lat2: p2.lat, lon2: p2.lon, d, dt, v, elevUp: segElevUp, hrAvg, cadAvg, pwAvg, e2 });
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








/* ===== 랩 ===== (동일) */
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
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => (v == null) ? "" : String(v).replaceAll('"', '""');
  return [headers.join(","), ...rows.map(r => headers.map(h => `"${esc(r[h])}"`).join(","))].join("\n");
};
function downloadCSV(filename, csv, { bom = true, attach = true, delayRevokeMs = 1000 } = {}) {
  const content = (bom ? '\uFEFF' : '') + csv;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  if (typeof navigator !== 'undefined' && navigator.msSaveBlob) { navigator.msSaveBlob(blob, filename); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  if (attach) document.body.appendChild(a);
  a.click();
  if (attach) document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), delayRevokeMs);
}


/* ====== 요약 테이블: 지표 선택 ====== */
/* const SUMMARY_COLS_KEY = "summaryVisibleCols_v1"; */
const SUMMARY_COLS_KEY = "summaryVisibleCols_v2";
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
    const saved = JSON.parse(localStorage.getItem(SUMMARY_COLS_KEY) || "[]");
    const validKeys = new Set(SUMMARY_COLUMNS.map(c => c.key));
    const filtered = saved.filter(k => validKeys.has(k));
    return filtered.length ? new Set(filtered) : new Set(SUMMARY_COLUMNS.map(c => c.key));
  } catch {
    return new Set(SUMMARY_COLUMNS.map(c => c.key));
  }
}



function saveVisibleSet(set) { localStorage.setItem(SUMMARY_COLS_KEY, JSON.stringify([...set])); }
function buildSummaryHeader() {
  const thead = document.querySelector("#summaryTable thead");
  if (!thead) return;
  const tr = document.createElement("tr");
  tr.innerHTML =
    `<th class="left" data-col="file">파일</th>` +
    SUMMARY_COLUMNS.map(c => `<th data-col="${c.key}">${c.label}</th>`).join("");
  console.log(tr)
  thead.innerHTML = ""; thead.appendChild(tr);
}


function renderSummaryRow(row, { total = false } = {}) {
  const tbody = document.querySelector("#summaryTable tbody");
  const tfoot = document.querySelector("#summaryTable tfoot");
  if (!tbody || !tfoot) return;

  const tr = document.createElement("tr");
  if (total) tr.className = "total-row";

  const cells = [
    `<td class="left" data-col="file">${row.file ?? ""}</td>`,
    ...SUMMARY_COLUMNS.map(c => `<td data-col="${c.key}">${row[c.key] ?? ""}</td>`)
  ];
  tr.innerHTML = cells.join("");

  if (total) {
    tfoot.innerHTML = "";     // 합계는 1개만
    tfoot.appendChild(tr);
  } else {
    tbody.appendChild(tr);
  }
}

function applySummaryColumnVisibility() {
  const visible = getVisibleSet();
  document.querySelectorAll('#summaryTable [data-col]').forEach(el => {
    const key = el.getAttribute('data-col');
    if (key === "file") { el.style.display = ""; return; }
    el.style.display = visible.has(key) ? "" : "none";
  });
}




/* ===== 사분면 데이터 수집기 =====
 * 우선 요약 테이블 DOM을 파싱해서 수집합니다.
 * (내부에 summaryRows 변수가 있으면 그것을 사용하도록 쉽게 교체 가능)
 */
function collectSummaryForQuadrant() {
  const rows = Array.from(document.querySelectorAll('#summaryTable tbody tr'));
  const pts = [];
  for (const tr of rows) {
    const file = tr.querySelector('[data-col="file"]')?.textContent?.trim();
    const kmhStr = tr.querySelector('[data-col="avg_kmh_moving"]')?.textContent?.trim();
    const hrStr = tr.querySelector('[data-col="avg_hr"]')?.textContent?.trim();
    const x = parseFloat(kmhStr?.replace(/[^\d.]/g, ''));
    const y = parseFloat(hrStr?.replace(/[^\d.]/g, ''));
    if (file && Number.isFinite(x) && Number.isFinite(y)) {
      pts.push({ x, y, label: file });
    }
  }
  return pts;
}













/* 지표 선택 바텀시트 */
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
    wrap.innerHTML = `<input type="checkbox" id="${id}" value="${c.key}" ${visible.has(c.key) ? "checked" : ""}/><span>${c.label}</span>`;


    wrap.querySelector("input").addEventListener("change", (e) => {
      const v = getVisibleSet();
      if (e.target.checked) v.add(c.key); else v.delete(c.key);
      saveVisibleSet(v);
      applySummaryColumnVisibility();
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
document.getElementById("closeSheetBtn")?.addEventListener("click", () => closeSheetById("optionSheet"));
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
    saveVisibleSet(new Set(["total_km", "elapsed", "moving", "avg_kmh_elapsed", "avg_kmh_moving", "max_kmh", "avg_pace", "elev_gain_m", "avg_hr", "calories_kcal"]));
    applySummaryColumnVisibility();
  });
}
/* buildSummaryHeader(); */
injectMetricToolbar();





/* ===== 사분면(Quadrant) 렌더러 ===== */
let quadChart = null;
let quadHiIndex = -1;

function setQuadStatus(t) {
  const el = document.getElementById('quadStatus');
  if (el) el.textContent = t;
}

function redrawQuadrant() {
  // 0) Chart.js 로딩/캔버스 존재 가드
  if (!window.Chart) { console.warn('Chart.js 미로딩'); return; }
  const canvas = document.getElementById('quadChart');
  if (!canvas) { console.warn('#quadChart 캔버스 없음'); return; }

  const points = collectSummaryForQuadrant();
  if (!points.length) { setQuadStatus('요약 표에서 유효한 데이터가 없습니다'); return; }

  // 1) 안전한 모드/기준값 처리
  const modeEl = document.getElementById('quadMode');
  const mode = modeEl?.value ?? 'median';
  let x0, y0;

  if (mode === 'median') {
    x0 = median(points.map(p => p.x));
    y0 = median(points.map(p => p.y));
    const xEl = document.getElementById('quadX0'), yEl = document.getElementById('quadY0');
    if (xEl) xEl.value = Number.isFinite(x0) ? x0.toFixed(2) : '';
    if (yEl) yEl.value = Number.isFinite(y0) ? y0.toFixed(0) : '';
  } else {
    const xEl = document.getElementById('quadX0');
    const yEl = document.getElementById('quadY0');
    const xManual = parseFloat(xEl?.value);
    const yManual = parseFloat(yEl?.value);
    // 수동값이 비었으면 중앙값으로 폴백
    x0 = Number.isFinite(xManual) ? xManual : median(points.map(p => p.x));
    y0 = Number.isFinite(yManual) ? yManual : median(points.map(p => p.y));
  }
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const buckets = { q11: [], q10: [], q01: [], q00: [] };
  points.forEach(p => {
    const fast = p.x >= x0, high = p.y >= y0;
    const key = (fast && high) ? 'q11' : (fast && !high) ? 'q10' : (!fast && high) ? 'q01' : 'q00';
    buckets[key].push(p);
  });

  // 요약 박스 카운트 반영
  const setBox = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = `${n} 개`; };
  setBox('quadC11', buckets.q11.length);
  setBox('quadC10', buckets.q10.length);
  setBox('quadC01', buckets.q01.length);
  setBox('quadC00', buckets.q00.length);

  // "빠름·고심박(q11)"에서 최고값(심박 우선, 동률이면 평속) 찾기
  quadHiIndex = -1; let hiY = -Infinity, hiX = -Infinity;
  buckets.q11.forEach((p, i) => {
    if (p.y > hiY || (p.y === hiY && p.x > hiX)) { hiY = p.y; hiX = p.x; quadHiIndex = i; }
  });

  // 포인트 스타일
  const q11PointRadius = (ctx) => (ctx.dataIndex === quadHiIndex ? 6 : 4);
  const q11PointBorderWidth = (ctx) => (ctx.dataIndex === quadHiIndex ? 2 : 0);
  const q11PointBorderColor = '#111';

  // 차트 생성/갱신
  quadChart?.destroy();
  const ctx = document.getElementById('quadChart').getContext('2d');



  quadChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        { label: '빠름·고심박', data: buckets.q11, parsing: false, pointRadius: q11PointRadius, pointBorderWidth: q11PointBorderWidth, pointBorderColor: q11PointBorderColor, backgroundColor: css('--q1') },
        { label: '빠름·저심박', data: buckets.q10, parsing: false, pointRadius: 4, backgroundColor: css('--q2') },
        { label: '느림·고심박', data: buckets.q01, parsing: false, pointRadius: 4, backgroundColor: css('--q3') },
        { label: '느림·저심박', data: buckets.q00, parsing: false, pointRadius: 4, backgroundColor: css('--q4') }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,                // 제목 표시 여부
          text: '평균속도 × 평균심박 매트릭스', // 제목 텍스트
          font: {
            size: 20,                   // 글자 크기
            weight: 'bold'              // 글자 두께
          },
          color: '#333',                // 글자 색
          padding: {
            top: 10,
            bottom: 30
          },
          align: 'center'               // left | center | right
        },
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw.label} — ${ctx.raw.x.toFixed(2)} km/h, ${ctx.raw.y.toFixed(0)} bpm`
          }
        },
        quadCrosshair: { x0, y0 },
        quadLabelPlugin: (quadHiIndex >= 0) ? {
          target: { datasetIndex: 0, index: quadHiIndex, text: buckets.q11[quadHiIndex].label }
        } : {}
      },
      scales: {
        x: { title: { display: true, text: '평속 (km/h)' } },
        y: { title: { display: true, text: '평균심박 (bpm)' } }
      }
    }
  });

  setQuadStatus(`점 ${points.length}개 · 기준 X=${x0.toFixed(2)} / Y=${y0.toFixed(0)}`);
}

/* 카드 열기/닫기/버튼 이벤트 — 버튼이 없어도 항상 바인딩되도록 수정 */
(function bindQuadrantUI() {
  const openBtn = document.getElementById('openQuadrantBtn');   // 있을 수도, 없을 수도
  const card = document.getElementById('quadCard');
  const modeSel = document.getElementById('quadMode');
  const x0El = document.getElementById('quadX0');
  const y0El = document.getElementById('quadY0');
  const redrawBtn = document.getElementById('quadRedrawBtn');
  const savePng = document.getElementById('quadSavePngBtn');
  const closeBtn = document.getElementById('quadCloseBtn');

  if (!card) return; // 카드 자체가 없으면만 중단

  // (1) 열기 버튼이 있으면 동작 유지
  openBtn?.addEventListener('click', () => {
    card.style.display = '';
    // 요약표가 이미 차있다면 즉시 렌더
    requestAnimationFrame(() => redrawQuadrant());
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // (2) 기준 선택에 따라 수동 입력 enable/disable
  const applyManualEditable = () => {
    const manual = (modeSel?.value === 'manual');
    if (x0El) x0El.disabled = !manual;
    if (y0El) y0El.disabled = !manual;
  };
  modeSel?.addEventListener('change', applyManualEditable);
  applyManualEditable(); // 초기 1회 적용

  // (3) 새로고침 버튼
  redrawBtn?.addEventListener('click', () => {
    redrawQuadrant();
  });

  // (4) PNG 저장 버튼
  // PNG 저장 (비율 유지 + 1200x1200, 흰 배경)
  savePng?.addEventListener('click', () => {
    if (!window.Chart || !quadChart) {
      toast?.('차트가 아직 생성되지 않았습니다');
      return;
    }

    try {
      const src = quadChart.canvas;             // 원본 차트 캔버스
      const srcW = src.width;                   // 논리 픽셀(백스토어) 크기
      const srcH = src.height;

      const outW = 1200;                        // 고정 출력 크기
      const outH = 1200;

      // 1) 원본 비율 유지 스케일 계산 (레터박스)
      const scale = Math.min(outW / srcW, outH / srcH);
      const drawW = Math.round(srcW * scale);
      const drawH = Math.round(srcH * scale);

      // 중앙 정렬 오프셋
      const dx = Math.floor((outW - drawW) / 2);
      const dy = Math.floor((outH - drawH) / 2);

      // 2) 임시 캔버스에 그리기
      const tmp = document.createElement('canvas');
      tmp.width = outW;
      tmp.height = outH;
      const ctx = tmp.getContext('2d');

      // 배경 흰색(투명 PNG 원하면 이 줄 제거)
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, outW, outH);

      // 보간 품질 향상
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 3) 원본을 비율 유지하여 중앙에 그리기
      ctx.drawImage(src, dx, dy, drawW, drawH);

      // 4) 저장
      const a = document.createElement('a');
      a.href = tmp.toDataURL('image/png');
      a.download = 'quadrant.png';
      document.body.appendChild(a);
      a.click();
      a.remove();

      toast?.('PNG 저장 완료 (1200×1200, 비율 유지)');
    } catch (e) {
      console.error(e);
      toast?.('PNG 저장 중 오류');
    }
  });

  // (5) 닫기 버튼(있을 때만)
  closeBtn?.addEventListener('click', () => {
    card.style.display = 'none';
  });
})();






// ✅ 지표 선택 체크박스 클릭 이벤트 위임 (추가 코드)
document.getElementById("metricSheet")?.addEventListener("click", (e) => {
  const target = e.target;
  if (target.matches('input[type="checkbox"]')) {
    const key = target.value;
    const visible = getVisibleSet();
    if (target.checked) visible.add(key);
    else visible.delete(key);
    saveVisibleSet(visible);
    applySummaryColumnVisibility();
  }
});


/* ===== 누적/상승 차트 – 공용 로직으로 통합 ===== */

/* 🧹 REFACTOR: 주/월 키 유틸 재사용 */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
const getMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/* 🧹 REFACTOR: 그룹화/누적화를 일반화 */
function makeSeries(items, mode, valueKey, labelBuilder) {
  let groups = [];
  if (mode === "file") {
    groups = items.slice().sort((a, b) => a.date - b.date)
      .map(x => ({ key: x.date || 0, label: labelBuilder(x), val: Number(x[valueKey]) || 0 }));
  } else {
    const map = new Map();
    for (const it of items) {
      const d = new Date(it.date || 0);
      const key = mode === "week" ? getISOWeek(d) : getMonthKey(d);
      map.set(key, (map.get(key) || 0) + (Number(it[valueKey]) || 0));
    }
    groups = Array.from(map.entries()).map(([key, val]) => ({ key, label: key, val }))
      .sort((a, b) => (a.key > b.key ? 1 : -1));
  }
  const labels = groups.map(g => g.label);
  const cumulative = []; let acc = 0;
  for (const g of groups) { acc += g.val; cumulative.push(acc); }
  return { labels, cumulative, total: acc };
}

/* 🧹 REFACTOR: 라인 에어리어 차트 렌더 공용화 + chart 인스턴스 레지스트리 */
const chartRegistry = new Map();
function renderAreaLineChart(ctxId, { labels, data, color, label, yTitle, yUnit, decimals = 2 }) {
  if (!window.Chart) return;
  const ctx = document.getElementById(ctxId)?.getContext("2d");
  if (!ctx) return;
  const h = ctx.canvas.height || ctx.canvas.clientHeight || 300;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  const [c0, c1] = color;
  gradient.addColorStop(0, `${c0}59`); // 0.35 alpha
  gradient.addColorStop(1, `${c0}05`); // 0.02 alpha

  const prev = chartRegistry.get(ctxId);
  if (prev) prev.destroy();

  const chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label, data, tension: 0.35, fill: true, backgroundColor: gradient, borderColor: c1, borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 4, pointHitRadius: 12 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y.toFixed(decimals)} ${yUnit}` } }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 }, grid: { display: false } },
        y: { title: { display: true, text: yTitle }, ticks: { callback: v => `${v} ${yUnit}` }, grid: { color: "rgba(0,0,0,.06)" } }
      }
    }
  });
  chartRegistry.set(ctxId, chart);
  return chart;
}

/* 누적/상승 카드 참조 및 힌트 공용 표시 */
let cumChart = null;
const cumCard = document.getElementById("cumCard");
const cumHint = document.getElementById("cumHint");
const cumModeSel = document.getElementById("cumMode");

let elevChart = null;
const elevCard = (() => {
  const el = document.getElementById("elevChart")?.closest(".card");
  if (el) return el;
  // 없으면 동적 생성(기존 로직 유지)
  const card = document.createElement("div");
  card.className = "card"; card.style.display = "none";
  card.innerHTML = `
    <div class="chart-toolbar">
      <label for="elevMode" class="muted">표시: </label>
      <select id="elevMode" class="btn btn-outline-secondary muted" style="width: 100px; height: 30px; font-size: 14px;">
        <option value="file" selected>파일별</option>
        <option value="week">주간</option>
        <option value="month">월간</option>
      </select>
    </div>
    <div class="chart-wrap" style="margin-top:30px;">
      <h3 class="chartTitle">Cumulative Elevation Gain</h3>
      <canvas id="elevChart"></canvas>
    </div>
    <div class="muted" id="elevHint"></div>`;
  document.getElementById("cumCard")?.after(card);
  return card;
})();
const elevModeSel = elevCard.querySelector("#elevMode");
const elevHint = elevCard.querySelector("#elevHint");

/* 🧹 REFACTOR: 힌트 라벨 표시 공용화 */
function setRangeHint(el, { mode, labels, total, unit }) {
  if (!el) return;
  if (!labels.length) { el.textContent = ""; return; }
  const first = labels[0]?.split(" · ")[0];
  const last = labels.at(-1)?.split(" · ")[0];
  el.textContent = `표시: ${mode.toUpperCase()}  ·  기간: ${first} ~ ${last}  ·  항목 ${labels.length}개  ·  총 ${total.toFixed(unit === 'km' ? 2 : 1)} ${unit}`;
}

/* 누적 거리 */
function updateCumulativeChart(items, mode = "file") {
  const { labels, cumulative, total } = makeSeries(items, mode, 'km', (x) => x.label);
  cumChart = renderAreaLineChart("cumChart", {
    labels, data: cumulative, color: ["#12b886", "#12b886"], label: "누적 이동거리 (km)", yTitle: "거리(km)", yUnit: "km", decimals: 2
  });
  if (cumCard) cumCard.style.display = labels.length ? "block" : "none";
  setRangeHint(cumHint, { mode, labels, total, unit: 'km' });
}

/* 누적 상승 */
function updateElevationChart(items, mode = "file") {
  const { labels, cumulative, total } = makeSeries(items, mode, 'elev', (x) => x.label);
  if (labels.length) elevCard.style.display = "block"; else elevCard.style.display = "none";
  elevChart = renderAreaLineChart("elevChart", {
    labels, data: cumulative, color: ["#ff6600", "#ff6600"], label: "누적 상승고도 (m)", yTitle: "상승고도(m)", yUnit: "m", decimals: 1
  });
  setRangeHint(elevHint, { mode, labels, total, unit: 'm' });
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

/* ===== 옵션 시트 열고닫기 (id 수정) ===== */
const openSheetBtn = $("#openSheetBtn");
const closeSheetBtn = $("#closeSheetBtn");
const getOptionSheet = () =>
  document.getElementById("optionSheet") || document.getElementById("sheet");

// 열기/닫기
openSheetBtn?.addEventListener("click", () => getOptionSheet()?.classList.add("open"));
closeSheetBtn?.addEventListener("click", () => {
  const el = getOptionSheet();
  el?.classList.remove("open");
  // 숨김→표시 전환 시 지도 사이즈 재계산(지도 안 찌그러지게)
  setTimeout(() => map?.invalidateSize(), 0);
});

/* ===== 테이블/버튼 엘리먼트 ===== */
const elAnalyze = $("#analyzeBtn"), elExportSummary = $("#exportSummaryBtn"), elExportLaps = $("#exportLapsBtn");
const tbodySummary = $("#summaryTable tbody"), lapsSection = $("#lapsSection"), tbodyLaps = $("#lapsTable tbody");
let lastSummary = [], lastLaps = [];
let fileDistanceForChart = []; // {label, date(ms), km, fileName, elev}

/* 랩 테이블 헤더 보강 */
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


/* =============================================================================
 * 단일 파일 상세 그래프(거리-속도/고도/심박)
 * ============================================================================= */
let speedDistChart = null, elevDistChart = null, hrDistChart = null;
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
  for (const s of (analysis.segments || [])) {
    accM += (s.d || 0);
    distKm.push(accM / 1000);
    speedKmh.push(Number.isFinite(s.v) ? s.v * 3.6 : null);
    elevM.push(Number.isFinite(s.e2) ? s.e2 : null);
    hrBpm.push(Number.isFinite(s.hrAvg) ? s.hrAvg : null);
  }
  return { distKm, speedKmh, elevM, hrBpm };
}

/* 공통 옵션 (거리축 정수 표시 유지) */
function lineOpts(yTitle, yTickUnit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
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
          autoSkip: true, maxTicksLimit: 12,
          callback: function (value) {
            const lbl = this.getLabelForValue(value);
            const num = Number(lbl);
            return Number.isFinite(num) ? Math.round(num) : (lbl ?? "");
          }
        }
      },
      y: { title: { display: true, text: yTitle }, grid: { color: "rgba(0,0,0,.06)" } }
    }
  };
}

/* y 그라디언트 공용 */
function makeYGradient(chart, lowColor = "#2f80ed", midColor = "#21c36f", highColor = "#ff3b3b") {
  const { ctx, chartArea } = chart;
  if (!chartArea || chartArea.top === chartArea.bottom) return null;
  const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  g.addColorStop(0, lowColor); g.addColorStop(0.5, midColor); g.addColorStop(1, highColor);
  return g;
}
function applyLineGradient(chart) {
  const g = makeYGradient(chart);
  if (!g) return;
  chart.data.datasets.forEach(ds => { ds.borderColor = g; ds.pointBackgroundColor = g; });
  chart.update("none");
}
const ctxOf = (id) => document.getElementById(id)?.getContext("2d") || null;
function destroyDetailCharts() {
  [speedDistChart, elevDistChart, hrDistChart].forEach(c => c?.destroy?.());
  speedDistChart = elevDistChart = hrDistChart = null;
}
function renderDetailCharts(series) {
  if (!window.Chart || !detailCard) return;
  destroyDetailCharts();
  const sctx = ctxOf("speedDistChart");
  if (sctx) {
    const optsS = lineOpts("속도 (km/h)", "km/h"); optsS.onResize = (c) => applyLineGradient(c);
    speedDistChart = new Chart(sctx, {
      type: "line",
      data: { labels: series.distKm, datasets: [{ label: "Speed (km/h)", data: series.speedKmh, tension: 0.25, fill: false, borderWidth: 2, pointRadius: 0 }] },
      options: optsS
    }); applyLineGradient(speedDistChart);
  }
  const ectx = ctxOf("elevDistChart");
  if (ectx) {
    const optsE = lineOpts("고도 (m)", "m"); optsE.onResize = (c) => applyLineGradient(c);
    elevDistChart = new Chart(ectx, {
      type: "line",
      data: { labels: series.distKm, datasets: [{ label: "Elevation (m)", data: series.elevM, tension: 0.25, fill: false, borderWidth: 2, pointRadius: 0 }] },
      options: optsE
    }); applyLineGradient(elevDistChart);
  }
  const hctx = ctxOf("hrDistChart");
  if (hctx) {
    const optsH = lineOpts("심박 (bpm)", "bpm"); optsH.onResize = (c) => applyLineGradient(c);
    hrDistChart = new Chart(hctx, {
      type: "line",
      data: { labels: series.distKm, datasets: [{ label: "Heart Rate (bpm)", data: series.hrBpm, tension: 0.25, fill: false, borderWidth: 2, pointRadius: 0 }] },
      options: optsH
    }); applyLineGradient(hrDistChart);
  }
  detailCard.style.display = "block";
}

/* 🧹 REFACTOR: 상세/누적 뷰 토글 공용화 */
function setDetailMode(on) {
  const elevC = document.getElementById("elevChart")?.closest(".card");
  if (on) {
    detailCard && (detailCard.style.display = "block");
    if (cumCard) cumCard.style.display = "none";
    if (elevC) elevC.style.display = "none";
  } else {
    detailCard && (detailCard.style.display = "none");
    if (cumCard) cumCard.style.display = "";
    if (elevC) elevC.style.display = "";
    destroyDetailCharts();
  }
}


/* ===== 분석 실행 ===== */
elAnalyze?.addEventListener("click", async () => {
  try {
    const files = selectedFiles.slice();
    if (!files.length) { toast("GPX 파일을 선택해 주세요"); return; }

    // 분석 시작 시 기본으로 숨김
    document.getElementById('quadCard')?.style && (document.getElementById('quadCard').style.display = 'none');

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
    // sheet?.classList.remove("open");
    getOptionSheet()?.classList.remove("open");
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

      if (files.length === 1) detailSeries = buildDetailSeries(analysis);

      if (files.length === 1) {
        const laps = makeDistanceLaps(analysis, lapDistanceKm, {
          method, fileCalories, totalElapsedS: analysis.elapsedS, weightKg, age, sex
        });
        laps.forEach(lp => {
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
      const startTime = points?.[0]?.t instanceof Date ? points[0].t : null;
      const baseLabel = startTime ? ymd(startTime) : "0000-00-00";                     // 🧹 REFACTOR: ymd 유틸 사용
      const label = `${baseLabel} · ${file.name}`;
      const sumRow = {
        file: file.name,
        total_km: round(analysis.totalDistM / 1000, 2),
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
      console.log(sumRow)
      lastSummary.push(sumRow);
      renderSummaryRow(sumRow);

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



    // ============ 요약 테이블 정렬(합계 고정 + 화살표 클래스) ============
    function initSummarySorting() {
      const table = document.getElementById('summaryTable');
      if (!table || table.dataset.sortReady === '1') return;
      table.dataset.sortReady = '1';

      const thead = table.tHead;
      const tbody = table.tBodies[0]; // 데이터 행만

      thead.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-col]');
        if (!th) return;

        const col = th.dataset.col;
        const dir = th.classList.contains('sort-desc') ? 1 : -1;
        /* const dir = th.classList.contains('sort-asc') ? -1 : 1; */

        // 화살표 갱신
        thead.querySelectorAll('th[data-col]').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
        th.classList.add(dir === 1 ? 'sort-asc' : 'sort-desc');




        const rows = Array.from(tbody.rows); // ← tfoot 건드리지 않음
        rows.sort((a, b) => {
          const ta = a.querySelector(`[data-col="${col}"]`)?.textContent?.trim() ?? '';
          const tb = b.querySelector(`[data-col="${col}"]`)?.textContent?.trim() ?? '';
          const va = extractValue(ta);
          const vb = extractValue(tb);
          const cmp = (typeof va === 'number' && typeof vb === 'number')
            ? (va - vb)
            : String(va).localeCompare(String(vb), 'ko');
          return cmp * dir;
        });

        rows.forEach(r => tbody.appendChild(r)); // tbody만 재삽입
      });

      function extractValue(s) {
        const txt = (s || '').trim();
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(txt)) return hhmmssToSec(txt); // 03:47 or 01:44:37
        const num = parseFloat(txt.replace(/[^0-9.\-]/g, ''));
        if (!Number.isNaN(num)) return num;
        return txt.toLowerCase();
      }
      function hhmmssToSec(str) {
        const p = str.split(':').map(n => parseInt(n, 10)).reverse();
        return p.reduce((acc, v, i) => acc + (v || 0) * Math.pow(60, i), 0);
      }
    }

    // 페이지 로드 후 단 1회
    initSummarySorting();








    // [표시 분기]
    if (files.length === 1 && detailSeries) {
      const quadCard = document.getElementById('quadCard');
      quadCard.style.display = 'none';

      setDetailMode(true);                             // 🧹 REFACTOR
      renderDetailCharts(detailSeries);
    } else {
      quadCard.style.display = '';
      setDetailMode(false);                            // 🧹 REFACTOR
      updateCumulativeChart(fileDistanceForChart, "file");
      updateElevationChart(fileDistanceForChart, document.getElementById("elevMode")?.value || "file");
    }



    if (map && bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.1));
    if (elExportSummary) elExportSummary.disabled = lastSummary.length === 0;
    if (elExportLaps) elExportLaps.disabled = lastLaps.length === 0 || (lapsSection?.style.display === "none");
    applySummaryColumnVisibility();



    redrawQuadrant();     // ✅ 분석 후 자동 사분면 갱신

    hideProgress(); toast("분석 완료");
  } catch (err) { console.error(err); hideProgress(); toast(`오류: ${err.message || err}`); }
});

/* 그래프 모드 변경 */
cumModeSel?.addEventListener("change", () => {
  if (!fileDistanceForChart.length) { cumCard && (cumCard.style.display = "none"); return; }
  const mode = cumModeSel.value || "file";
  updateCumulativeChart(fileDistanceForChart, mode);
});
elevModeSel?.addEventListener("change", () => updateElevationChart(fileDistanceForChart, elevModeSel.value));

/* ===== 내보내기 ===== */
elExportSummary?.addEventListener("click", () => {
  const csv = toCSV(lastSummary); downloadCSV("gpx_summary.csv", csv); toast("주행 요약 CSV 저장 완료");
});
elExportLaps?.addEventListener("click", () => {
  if (!lastLaps.length) { toast("랩 데이터가 없습니다"); return; }
  const csv = toCSV(lastLaps); downloadCSV("gpx_laps.csv", csv); toast("랩(구간) 기록 CSV 저장 완료");
});






















