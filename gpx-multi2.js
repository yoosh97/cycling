/* ===== 콘솔 핑거프린트 ===== */
console.log("[GPX] script loaded");

/* ===== 모바일 친화 다중 파일 선택 ===== */
const elNativeInput = document.getElementById("gpxFiles");
const elAddBtn = document.getElementById("addFilesBtn");
const elClearBtn = document.getElementById("clearFilesBtn");
const elChips = document.getElementById("fileChips");

// 선택 목록(중복 방지)
let selectedFiles = []; // Array<File>

function fileKey(f) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}
function addFiles(filesLike) {
  const list = Array.from(filesLike || []);
  let added = 0;
  for (const f of list) {
    const key = fileKey(f);
    if (!selectedFiles.some(x => fileKey(x) === key)) {
      selectedFiles.push(f);
      added++;
    }
  }
  if (added) renderChips();
}
function removeFileByIndex(idx) {
  selectedFiles.splice(idx, 1);
  renderChips();
}
function clearSelected() {
  selectedFiles = [];
  renderChips();
  // 네이티브 input도 초기화(같은 파일 다시 선택 가능)
  elNativeInput.value = "";
}
function renderChips() {
  elChips.innerHTML = "";
  if (!selectedFiles.length) {
    elChips.insertAdjacentHTML("beforeend", `<div class="muted">선택된 파일 없음</div>`);
    return;
  }
  selectedFiles.forEach((f, i) => {
    const li = document.createElement("div");
    li.className = "chip";
    li.innerHTML = `<span title="${f.name}">${f.name}</span><button type="button" aria-label="삭제">삭제</button>`;
    li.querySelector("button").addEventListener("click", () => removeFileByIndex(i));
    elChips.appendChild(li);
  });
}

/* 네이티브 multiple input으로도 병합 */
elNativeInput.addEventListener("change", (e) => {
  addFiles(e.target.files);
});

/* File System Access API 경로 (안드로이드 크롬 등) */
async function pickWithFSAccess() {
  try {
    const handles = await window.showOpenFilePicker({
      multiple: true,
      types: [{ description: "GPX Files", accept: { "application/gpx+xml": [".gpx"], "text/xml": [".gpx"] } }]
    });
    const files = await Promise.all(handles.map(h => h.getFile()));
    addFiles(files);
  } catch (e) {
    if (e?.name !== "AbortError") console.warn("FS Access picker 실패:", e);
  }
}

/* fallback: 숨김 input를 동적으로 눌러 한 번 더 추가 */
function pickWithHiddenInput() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gpx";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      addFiles(input.files);
      document.body.removeChild(input);
      resolve();
    }, { once: true });
    input.click();
  });
}

/* “파일 추가” 버튼: FS Access 지원 시 그 경로, 아니면 fallback */
elAddBtn.addEventListener("click", async () => {
  if (window.showOpenFilePicker) await pickWithFSAccess();
  else await pickWithHiddenInput();
});
elClearBtn.addEventListener("click", clearSelected);

// 초기 렌더
renderChips();

/* ===== 공통 유틸 ===== */
const toRad = (d) => d * Math.PI / 180;
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dlat = toRad(lat2 - lat1);
  const dlon = toRad(lon2 - lon1);
  const a = Math.sin(dlat/2)**2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
const secToHMS = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map(v => String(v).padStart(2, "0")).join(":");
};
const paceMinPerKm = (avgSpeedKmh) => {
  if (!isFinite(avgSpeedKmh) || avgSpeedKmh <= 0) return "";
  const minPerKm = 60 / avgSpeedKmh;
  const mm = Math.floor(minPerKm);
  const ss = Math.round((minPerKm - mm) * 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
};
const round = (n, d=2) => Number.isFinite(n) ? Number(n.toFixed(d)) : "";

/* ===== HR/칼로리 ===== */
function kcalPerMinKeytel(avgHR, weightKg, age, sex) {
  if (!isFinite(avgHR) || !isFinite(weightKg) || !isFinite(age) || !sex) return null;
  if (sex === "male")   return (-55.0969 + 0.6309*avgHR + 0.1988*weightKg + 0.2017*age) / 4.184;
  if (sex === "female") return (-20.4022 + 0.4472*avgHR - 0.1263*weightKg + 0.074*age) / 4.184;
  return null;
}
function metFromSpeedKmh(kmh) {
  if (!isFinite(kmh) || kmh <= 0) return 1.2;
  if (kmh < 16) return 4.0;
  if (kmh < 19) return 6.0;
  if (kmh < 22) return 8.0;
  if (kmh < 25) return 10.0;
  if (kmh < 30) return 12.0;
  return 16.0;
}
function estimateCaloriesHR(avgHR, durationS, weightKg, age, sex) {
  const perMin = kcalPerMinKeytel(avgHR, weightKg, age, sex);
  return (perMin != null) ? perMin * (durationS/60) : null;
}
function estimateCaloriesMET(avgSpeedKmh, durationS, weightKg) {
  if (!isFinite(weightKg)) return null;
  const met = metFromSpeedKmh(avgSpeedKmh);
  return met * weightKg * (durationS/3600);
}

/* ===== GPX 파서 ===== */
function parseGpxText(xmlText) {
  const dom = new DOMParser().parseFromString(xmlText, "application/xml");
  const perr = dom.getElementsByTagName("parsererror");
  if (perr && perr.length) {
    throw new Error("GPX XML 파싱 실패: 파일이 손상되었거나 형식이 맞지 않습니다.");
  }
  const trkpts = Array.from(dom.getElementsByTagName("trkpt"));

  // 파일 내 calories 총합 시도
  const nodes = dom.getElementsByTagName("*");
  let fileCalories = 0, anyCalories = false;
  for (const n of nodes) {
    if (n.localName && n.localName.toLowerCase() === "calories") {
      const v = parseFloat(n.textContent.trim());
      if (Number.isFinite(v)) { fileCalories += v; anyCalories = true; }
    }
  }

  const pts = trkpts.map(pt => {
    const lat = parseFloat(pt.getAttribute("lat"));
    const lon = parseFloat(pt.getAttribute("lon"));
    const timeEl = pt.getElementsByTagName("time")[0];
    const eleEl  = pt.getElementsByTagName("ele")[0];

    // HR
    let hr = null;
    const ext = pt.getElementsByTagName("extensions")[0];
    if (ext) {
      const all = ext.getElementsByTagName("*");
      for (const x of all) {
        if (x.localName && x.localName.toLowerCase() === "hr") {
          const v = parseFloat(x.textContent.trim());
          if (Number.isFinite(v)) { hr = v; break; }
        }
      }
    }

    const t = timeEl ? new Date(timeEl.textContent.trim()) : null;
    const ele = eleEl ? parseFloat(eleEl.textContent.trim()) : null;
    return (Number.isFinite(lat) && Number.isFinite(lon) && t)
      ? {lat, lon, t, ele, hr}
      : null;
  }).filter(Boolean);

  // 시간 정렬 + 중복 타임스탬프 제거
  pts.sort((a,b)=> a.t - b.t);
  const unique = [];
  for (let i=0;i<pts.length;i++){
    if (i===0 || pts[i].t - pts[i-1].t !== 0) unique.push(pts[i]);
  }
  return { points: unique, fileCalories: anyCalories ? fileCalories : null };
}

/* ===== 분석 (좌표 포함) ===== */
function analyzePoints(points, opts) {
  const {
    movingSpeedThreshold = 1.0, // m/s
    maxSpeedCapKmh = 120,
    minElevGain = 1
  } = opts;

  if (points.length < 2) {
    return {
      points: points.length,
      totalDistM: 0, elapsedS: 0, movingS: 0,
      avgKmhElapsed: 0, avgKmhMoving: 0,
      maxKmh: 0, elevGainM: 0,
      avgHr: null, maxHr: null,
      segments: [],
      firstLatLng: null,
      lastLatLng: null,
      hrTimeSum: 0,
      hrTimeDen: 0
    };
  }

  let totalDist = 0, movingTime = 0, maxSpeedMps = 0, elevGain = 0;
  let maxHr = null;
  let hrTimeSum = 0, hrTimeDen = 0;

  const segments = []; // {lat1,lon1,lat2,lon2, d, dt, v, elevUp, hrAvg}
  for (let i=0;i<points.length-1;i++){
    const p1 = points[i], p2 = points[i+1];
    const dt = (p2.t - p1.t) / 1000;
    if (dt <= 0 || dt > 3600) continue;

    const d = haversine(p1.lat, p1.lon, p2.lat, p2.lon);
    const v = d / dt;
    const vKmh = v * 3.6;
    if (vKmh > maxSpeedCapKmh) continue;

    totalDist += d;
    if (v >= movingSpeedThreshold) movingTime += dt;
    if (v > maxSpeedMps) maxSpeedMps = v;

    if (Number.isFinite(p1.ele) && Number.isFinite(p2.ele)) {
      const de = p2.ele - p1.ele;
      if (de > minElevGain) elevGain += de;
    }

    if (Number.isFinite(p1.hr)) maxHr = Math.max(maxHr ?? p1.hr, p1.hr);
    if (Number.isFinite(p2.hr)) maxHr = Math.max(maxHr ?? p2.hr, p2.hr);

    let hrAvg = null;
    if (Number.isFinite(p1.hr) && Number.isFinite(p2.hr)) {
      hrAvg = (p1.hr + p2.hr) / 2;
      hrTimeSum += hrAvg * dt;
      hrTimeDen += dt;
    }

    segments.push({
      lat1: p1.lat, lon1: p1.lon,
      lat2: p2.lat, lon2: p2.lon,
      d, dt, v,
      elevUp: Math.max(0, (Number.isFinite(p1.ele)&&Number.isFinite(p2.ele) ? (p2.ele - p1.ele) : 0)),
      hrAvg
    });
  }

  const elapsedS = (points[points.length-1].t - points[0].t)/1000;
  const avgElapsed = totalDist / (elapsedS || Infinity);
  const avgMoving  = totalDist / (movingTime || Infinity);
  const avgHr = hrTimeDen > 0 ? hrTimeSum / hrTimeDen : null;

  return {
    points: points.length,
    totalDistM: totalDist,
    elapsedS,
    movingS: movingTime,
    avgKmhElapsed: avgElapsed * 3.6,
    avgKmhMoving:  avgMoving * 3.6,
    maxKmh: maxSpeedMps * 3.6,
    elevGainM: elevGain,
    avgHr, maxHr,
    segments,
    firstLatLng: [points[0].lat, points[0].lon],
    lastLatLng:  [points[points.length-1].lat, points[points.length-1].lon],
    hrTimeSum,  // Σ(hr_avg * dt)
    hrTimeDen   // Σ(dt)
  };
}

/* ===== 랩 계산 (거리 기준) ===== */
function makeDistanceLaps(analysis, lapDistanceKm, calorieParams) {
  const laps = [];
  const lapDistM = lapDistanceKm * 1000;
  let accDist = 0, accTime = 0, accElevUp = 0, accHrTimeSum = 0, accHrTimeDen = 0;
  let currentLapIdx = 1;

  for (const seg of analysis.segments) {
    let remain = seg.d;
    let remainTime = seg.dt;
    let remainElev = seg.elevUp;
    let hrAvg = seg.hrAvg;

    while (remain > 0) {
      const need = lapDistM - accDist;
      if (remain <= need) {
        accDist += remain;
        accTime += remainTime;
        accElevUp += Math.max(0, remainElev);
        if (Number.isFinite(hrAvg)) { accHrTimeSum += hrAvg * remainTime; accHrTimeDen += remainTime; }
        remain = 0;
      } else {
        const ratio = need / remain;
        accDist += need;
        accTime += remainTime * ratio;
        accElevUp += Math.max(0, remainElev) * ratio;
        if (Number.isFinite(hrAvg)) { accHrTimeSum += hrAvg * remainTime * ratio; accHrTimeDen += remainTime * ratio; }

        const avgKmh = (accDist / accTime) * 3.6;
        const lapAvgHr = accHrTimeDen > 0 ? accHrTimeSum / accHrTimeDen : null;

        const lapKcal = computeCaloriesForSegment(avgKmh, accTime, lapAvgHr, calorieParams);

        laps.push({
          lap: currentLapIdx++,
          distanceKm: accDist / 1000,
          timeS: accTime,
          avgKmh,
          pace: paceMinPerKm(avgKmh),
          elevUpM: accElevUp,
          avgHr: lapAvgHr,
          kcal: lapKcal
        });

        remain -= need;
        remainTime *= (1 - ratio);
        remainElev *= (1 - ratio);
        accDist = 0; accTime = 0; accElevUp = 0; accHrTimeSum = 0; accHrTimeDen = 0;
      }
    }
  }
  return laps;
}

/* ===== 칼로리 공용 ===== */
function computeCaloriesForSegment(avgKmh, durationS, avgHr, params) {
  const { method, fileCalories, totalElapsedS, weightKg, age, sex } = params;
  if (method === "none") return null;

  if (method === "auto") {
    if (fileCalories != null && isFinite(totalElapsedS) && totalElapsedS > 0) {
      return fileCalories * (durationS / totalElapsedS);
    }
    const hrEst = estimateCaloriesHR(avgHr, durationS, weightKg, age, sex);
    if (hrEst != null && hrEst > 0) return hrEst;
    const metEst = estimateCaloriesMET(avgKmh, durationS, weightKg);
    return metEst != null ? metEst : null;
  }
  if (method === "hr") {
    const hrEst = estimateCaloriesHR(avgHr, durationS, weightKg, age, sex);
    return hrEst != null ? hrEst : null;
  }
  if (method === "met") {
    const metEst = estimateCaloriesMET(avgKmh, durationS, weightKg);
    return metEst != null ? metEst : null;
  }
  return null;
}

/* ===== CSV ===== */
const toCSV = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => (v == null) ? "" : String(v).replaceAll('"','""');
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => `"${esc(r[h])}"`).join(","))
  ];
  return lines.join("\n");
};
const downloadCSV = (filename, csv) => {
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/* ===== Leaflet 지도 (안전 가드) ===== */
let map, layerControl, legendControl;
const mapLayers = {}; // filename -> L.LayerGroup

function initMapSafe() {
  if (!window.L) {
    console.warn("Leaflet이 로드되지 않아 지도 기능을 건너뜁니다.");
    return null;
  }
  if (map) return map;

  map = L.map('map', { zoomControl: true });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  layerControl = L.control.layers({ OpenStreetMap: osm }, {}, { collapsed: false }).addTo(map);
  map.setView([36.5, 127.8], 7);
  return map;
}

function colorFromValue(val, minVal, maxVal) {
  if (!isFinite(val) || !isFinite(minVal) || !isFinite(maxVal) || maxVal <= minVal) return '#888';
  const t = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal)));
  const hue = (1 - t) * 240;
  return `hsl(${hue}, 85%, 50%)`;
}
function addLegend(minVal, maxVal, unitLabel) {
  if (!window.L) return;
  if (legendControl) legendControl.remove();

  legendControl = L.control({ position: 'bottomright' });
  legendControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `
      <div><strong>${unitLabel}</strong></div>
      <div class="bar"></div>
      <div class="scale"><span>${round(minVal,0)}</span><span>${round((minVal+maxVal)/2,0)}</span><span>${round(maxVal,0)}</span></div>
    `;
    return div;
  };
  legendControl.addTo(map);
}
function randomColor(seedText) {
  let hash = 0;
  for (let i=0;i<seedText.length;i++) hash = ((hash<<5)-hash) + seedText.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 80%, 45%)`;
}
function drawTrackLayer(fileName, analysis, colorMode, boundsCollector) {
  if (!window.L || !map) return;

  if (mapLayers[fileName]) {
    layerControl.removeLayer(mapLayers[fileName]);
    map.removeLayer(mapLayers[fileName]);
    delete mapLayers[fileName];
  }

  const group = L.layerGroup();
  mapLayers[fileName] = group;
  layerControl.addOverlay(group, fileName);

  let minMetric = Infinity, maxMetric = -Infinity;

  for (const s of analysis.segments) {
    const metric = (colorMode === 'hr') ? (s.hrAvg ?? NaN) :
                   (colorMode === 'speed') ? (s.v * 3.6) : NaN;
    if (isFinite(metric)) {
      minMetric = Math.min(minMetric, metric);
      maxMetric = Math.max(maxMetric, metric);
    }
  }
  if (minMetric === Infinity || maxMetric === -Infinity) { minMetric = 0; maxMetric = 1; }

  for (const s of analysis.segments) {
    const p1 = [s.lat1, s.lon1], p2 = [s.lat2, s.lon2];
    const metric = (colorMode === 'hr') ? (s.hrAvg ?? NaN) :
                   (colorMode === 'speed') ? (s.v * 3.6) : NaN;

    const color = (colorMode === 'mono') ? randomColor(fileName) :
                  colorFromValue(metric, minMetric, maxMetric);

    L.polyline([p1, p2], { color, weight: 5, opacity: 0.85 }).addTo(group);

    boundsCollector.extend(p1);
    boundsCollector.extend(p2);
  }

  if (analysis.firstLatLng) {
    L.circleMarker(analysis.firstLatLng, { radius: 5, color:'#00a84f', fillColor:'#00a84f', fillOpacity:1 })
      .bindPopup(`Start: ${fileName}`).addTo(group);
    boundsCollector.extend(analysis.firstLatLng);
  }
  if (analysis.lastLatLng) {
    L.circleMarker(analysis.lastLatLng, { radius: 5, color:'#ff3b3b', fillColor:'#ff3b3b', fillOpacity:1 })
      .bindPopup(`Finish: ${fileName}`).addTo(group);
    boundsCollector.extend(analysis.lastLatLng);
  }

  if (colorMode === 'speed') addLegend(minMetric, maxMetric, '속도 km/h');
  else if (colorMode === 'hr') addLegend(minMetric, maxMetric, '심박 bpm');

  group.addTo(map);
}

/* ===== UI 바인딩 ===== */
const elAnalyze = document.getElementById("analyzeBtn");
const elExportSummary = document.getElementById("exportSummaryBtn");
const elExportLaps = document.getElementById("exportLapsBtn");
const tbodySummary = document.querySelector("#summaryTable tbody");
const tbodyLaps = document.querySelector("#lapsTable tbody");
const elColorMode = document.getElementById("colorMode");

let lastSummary = [];
let lastLaps = [];

/* 지도 초기화(안전) */
const mapInstance = initMapSafe();

elAnalyze.addEventListener("click", async () => {
  console.log("[GPX] analyze clicked");
  try {
    // 기존 input에서 고른 항목도 병합(모바일에서 기존 input만 쓴 경우 대비)
    if (elNativeInput.files && elNativeInput.files.length) {
      addFiles(elNativeInput.files);
    }

    const files = selectedFiles.slice();
    console.log("[GPX] files:", files.map(f=>f.name));
    if (files.length === 0) {
      alert("GPX 파일을 선택해 주세요. (파일 추가 버튼 또는 파일 입력 사용)");
      return;
    }

    const movingThreshold = parseFloat(document.getElementById("movingThreshold").value || "1.0");
    const lapDistanceKm = parseFloat(document.getElementById("lapDistanceKm").value || "1");
    const minElevGain = parseFloat(document.getElementById("minElevGain").value || "1");
    const maxSpeedCap = parseFloat(document.getElementById("maxSpeedCap").value || "120");

    const method = document.getElementById("calorieMethod").value;
    const weightKg = parseFloat(document.getElementById("weightKg").value);
    const age = parseFloat(document.getElementById("age").value);
    const sex = document.getElementById("sex").value;

    tbodySummary.innerHTML = "";
    tbodyLaps.innerHTML = "";
    lastSummary = [];
    lastLaps = [];

    // 지도 레이어 초기화
    if (mapInstance) {
      Object.keys(mapLayers).forEach(k => {
        layerControl.removeLayer(mapLayers[k]);
        map.removeLayer(mapLayers[k]);
        delete mapLayers[k];
      });
    }

    const colorMode = elColorMode.value;
    const bounds = (window.L && L.latLngBounds) ? L.latLngBounds() : null;

    // 합계 누적자
    const agg = {
      points: 0, distM: 0, elapsedS: 0, movingS: 0, elevM: 0,
      maxKmh: 0, maxHr: null, hrTimeSum: 0, hrTimeDen: 0, calories: 0
    };

    for (const file of files) {
      try {
        const text = await file.text();

        const { points, fileCalories } = parseGpxText(text);
        if (!points || points.length < 2) {
          console.warn(`[GPX] ${file.name}: 유효한 좌표/시간 포인트가 부족`);
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td class="left">${file.name}</td>
            <td>0</td><td>0</td>
            <td>00:00:00</td><td>00:00:00</td>
            <td>0</td><td>0</td><td>0</td>
            <td></td><td>0</td><td></td><td></td><td></td>
          `;
          tbodySummary.appendChild(tr);
          continue;
        }

        const analysis = analyzePoints(points, {
          movingSpeedThreshold: movingThreshold,
          maxSpeedCapKmh: maxSpeedCap,
          minElevGain
        });

        if (mapInstance && bounds) {
          drawTrackLayer(file.name, analysis, colorMode, bounds);
        } else {
          console.warn("Leaflet 미로딩 → 지도 생략");
        }

        const calorieParams = { method, fileCalories, totalElapsedS: analysis.elapsedS, weightKg, age, sex };
        const laps = makeDistanceLaps(analysis, lapDistanceKm, calorieParams);

        let caloriesKcal = null;
        if (method === "auto" && fileCalories != null) {
          caloriesKcal = fileCalories;
        } else {
          const chosen = computeCaloriesForSegment(
            analysis.avgKmhElapsed, analysis.elapsedS, analysis.avgHr,
            { method, fileCalories: null, totalElapsedS: analysis.elapsedS, weightKg, age, sex }
          );
          caloriesKcal = chosen != null ? chosen : null;
        }

        // 합계 누적
        agg.points  += analysis.points;
        agg.distM   += analysis.totalDistM;
        agg.elapsedS+= analysis.elapsedS;
        agg.movingS += analysis.movingS;
        agg.elevM   += analysis.elevGainM;
        agg.maxKmh   = Math.max(agg.maxKmh, analysis.maxKmh || 0);
        if (analysis.maxHr != null) agg.maxHr = Math.max(agg.maxHr ?? analysis.maxHr, analysis.maxHr);
        agg.hrTimeSum += (analysis.hrTimeSum || 0);
        agg.hrTimeDen += (analysis.hrTimeDen || 0);
        if (caloriesKcal != null) agg.calories += caloriesKcal;

        // 요약
        const sumRow = {
          file: file.name,
          points: analysis.points,
          total_km: round(analysis.totalDistM / 1000, 3),
          elapsed: secToHMS(analysis.elapsedS),
          moving: secToHMS(analysis.movingS),
          avg_kmh_elapsed: round(analysis.avgKmhElapsed, 2),
          avg_kmh_moving: round(analysis.avgKmhMoving, 2),
          max_kmh: round(analysis.maxKmh, 2),
          avg_pace: paceMinPerKm(analysis.avgKmhElapsed),
          elev_gain_m: round(analysis.elevGainM, 1),
          avg_hr: analysis.avgHr ? Math.round(analysis.avgHr) : "",
          max_hr: analysis.maxHr ? Math.round(analysis.maxHr) : "",
          calories_kcal: caloriesKcal != null ? Math.round(caloriesKcal) : ""
        };
        lastSummary.push(sumRow);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="left">${sumRow.file}</td>
          <td>${sumRow.points}</td>
          <td>${sumRow.total_km}</td>
          <td>${sumRow.elapsed}</td>
          <td>${sumRow.moving}</td>
          <td>${sumRow.avg_kmh_elapsed}</td>
          <td>${sumRow.avg_kmh_moving}</td>
          <td>${sumRow.max_kmh}</td>
          <td>${sumRow.avg_pace}</td>
          <td>${sumRow.elev_gain_m}</td>
          <td>${sumRow.avg_hr}</td>
          <td>${sumRow.max_hr}</td>
          <td>${sumRow.calories_kcal}</td>
        `;
        tbodySummary.appendChild(tr);

        // 랩
        laps.forEach(lp => {
          const lapRow = {
            file: file.name,
            lap: lp.lap,
            lap_km: round(lp.distanceKm, 3),
            lap_time: secToHMS(lp.timeS),
            lap_avg_kmh: round(lp.avgKmh, 2),
            lap_pace: lp.pace,
            lap_elev_up_m: round(lp.elevUpM, 1),
            lap_avg_hr: lp.avgHr ? Math.round(lp.avgHr) : "",
            lap_kcal: lp.kcal != null ? Math.round(lp.kcal) : ""
          };
          lastLaps.push(lapRow);

          const tr2 = document.createElement("tr");
          tr2.innerHTML = `
            <td class="left">${lapRow.file}</td>
            <td>${lapRow.lap}</td>
            <td>${lapRow.lap_km}</td>
            <td>${lapRow.lap_time}</td>
            <td>${lapRow.lap_avg_kmh}</td>
            <td>${lapRow.lap_pace}</td>
            <td>${lapRow.lap_elev_up_m}</td>
            <td>${lapRow.lap_avg_hr}</td>
            <td>${lapRow.lap_kcal}</td>
          `;
          tbodyLaps.appendChild(tr2);
        });

      } catch (fileErr) {
        console.error(`[GPX] ${file.name} 처리 중 오류:`, fileErr);
        alert(`${file.name} 처리 중 오류: ${fileErr.message || fileErr}`);
      }
    }

    // 합계 행
    if (agg.elapsedS > 0 || agg.distM > 0) {
      const totalAvgKmhElapsed = (agg.distM / (agg.elapsedS || Infinity)) * 3.6;
      const totalAvgKmhMoving  = (agg.distM / (agg.movingS || Infinity)) * 3.6;
      const totalPace          = paceMinPerKm(totalAvgKmhElapsed);
      const totalAvgHr         = agg.hrTimeDen > 0 ? Math.round(agg.hrTimeSum / agg.hrTimeDen) : "";

      const totalRow = {
        file: "합계",
        points: agg.points,
        total_km: round(agg.distM / 1000, 3),
        elapsed: secToHMS(agg.elapsedS),
        moving:  secToHMS(agg.movingS),
        avg_kmh_elapsed: round(totalAvgKmhElapsed, 2),
        avg_kmh_moving:  round(totalAvgKmhMoving, 2),
        max_kmh: round(agg.maxKmh, 2),
        avg_pace: totalPace,
        elev_gain_m: round(agg.elevM, 1),
        avg_hr: totalAvgHr,
        max_hr: agg.maxHr != null ? Math.round(agg.maxHr) : "",
        calories_kcal: agg.calories ? Math.round(agg.calories) : ""
      };

      const trT = document.createElement("tr");
      trT.className = "total-row";
      trT.innerHTML = `
        <td class="left">${totalRow.file}</td>
        <td>${totalRow.points}</td>
        <td>${totalRow.total_km}</td>
        <td>${totalRow.elapsed}</td>
        <td>${totalRow.moving}</td>
        <td>${totalRow.avg_kmh_elapsed}</td>
        <td>${totalRow.avg_kmh_moving}</td>
        <td>${totalRow.max_kmh}</td>
        <td>${totalRow.avg_pace}</td>
        <td>${totalRow.elev_gain_m}</td>
        <td>${totalRow.avg_hr}</td>
        <td>${totalRow.max_hr}</td>
        <td>${totalRow.calories_kcal}</td>
      `;
      tbodySummary.appendChild(trT);
      lastSummary.push(totalRow);
    }

    if (mapInstance && bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.1));

    elExportSummary.disabled = lastSummary.length === 0;
    elExportLaps.disabled = lastLaps.length === 0;

  } catch (err) {
    console.error("[GPX] 전체 처리 오류:", err);
    alert(`오류: ${err.message || err}`);
  }
});

/* CSV 버튼 */
document.getElementById("exportSummaryBtn").addEventListener("click", () => {
  const csv = toCSV(lastSummary);
  downloadCSV("gpx_summary.csv", csv);
});
document.getElementById("exportLapsBtn").addEventListener("click", () => {
  const csv = toCSV(lastLaps);
  downloadCSV("gpx_laps.csv", csv);
});
