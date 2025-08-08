/* ===== 유틸 ===== */
const $ = (sel) => document.querySelector(sel);
const round = (n, d=2) => Number.isFinite(n) ? Number(n.toFixed(d)) : "";
const numOr = (v, fallback) => Number.isFinite(v) ? v : fallback;

const secToHMS = (s=0) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  return [h,m,ss].map(v=>String(v).padStart(2,"0")).join(":");
};
const paceMinPerKm = (kmh) => {
  if (!isFinite(kmh) || kmh <= 0) return "";
  const minPerKm = 60 / kmh; const mm = Math.floor(minPerKm); const ss = Math.round((minPerKm-mm)*60);
  return `${mm}:${String(ss).padStart(2,"0")}`;
};
const toRad = (d) => d * Math.PI / 180;
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dlat = toRad(lat2 - lat1), dlon = toRad(lon2 - lon1);
  const a = Math.sin(dlat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dlon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/* ===== 토스트/오버레이 ===== */
const toastEl = $("#toast"); let toastTimer = null;
function toast(msg, ms=1600) { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastTimer);
  toastTimer=setTimeout(()=> toastEl.classList.remove("show"), ms); }
const overlay=$("#overlay"), progressText=$("#progressText");
const showProgress=(t)=>{progressText.textContent=t; overlay.classList.add("show");};
const setProgress=(t)=>{progressText.textContent=t;};
const hideProgress=()=>overlay.classList.remove("show");

/* ===== 파일 선택 ===== */
const elNativeInput=$("#gpxFiles"), elAddBtn=$("#addFilesBtn"), elClearBtn=$("#clearFilesBtn"), elChips=$("#fileChips");
let selectedFiles=[]; const fileKey=(f)=>`${f.name}|${f.size}|${f.lastModified}`;
function renderChips(){ elChips.innerHTML=""; if(!selectedFiles.length){elChips.insertAdjacentHTML("beforeend",`<div class="muted">선택된 파일 없음</div>`); return;}
  selectedFiles.forEach((f,i)=>{ const div=document.createElement("div"); div.className="chip";
    div.innerHTML=`<span title="${f.name}">${f.name}</span><button type="button" aria-label="삭제">삭제</button>`;
    div.querySelector("button").addEventListener("click",()=>{selectedFiles.splice(i,1); renderChips();});
    elChips.appendChild(div); });}
function addFiles(list){const arr=Array.from(list||[]); let added=0; for(const f of arr){const k=fileKey(f);
  if(!selectedFiles.some(x=>fileKey(x)===k)){selectedFiles.push(f); added++;}}
  if(added) renderChips(); toast(added?`${added}개 파일 추가됨`:`이미 선택된 파일입니다`);}
function clearSelected(){selectedFiles=[]; renderChips(); elNativeInput.value=""; toast("선택 초기화 완료");}
elNativeInput.addEventListener("change",(e)=> addFiles(e.target.files));
elAddBtn.addEventListener("click", async ()=> {
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple:true,
        types:[{description:"GPX Files", accept: {"application/gpx+xml":[".gpx"], "text/xml":[".gpx"], "application/xml":[".gpx"]}}]
      });
      const files = await Promise.all(handles.map(h=>h.getFile()));
      addFiles(files);
    } catch(e){ if(e?.name!=="AbortError") console.warn(e); }
  } else {
    const input=document.createElement("input"); input.type="file"; input.accept=".gpx"; input.multiple=true; input.style.display="none";
    document.body.appendChild(input); input.addEventListener("change",()=>{ addFiles(input.files); document.body.removeChild(input); }, {once:true});
    input.click();
  }
});
elClearBtn.addEventListener("click", clearSelected); renderChips();

/* ===== 지도 ===== */
let map, layerControl, legendControl;
const mapLayers = {};
const colorModeSel=$("#colorMode"); const togglePanBtn=$("#togglePanBtn"); let panEnabled=false;

function initMap(){
  if(!window.L){ console.warn("Leaflet 로드 실패"); return; }
  map = L.map('map', { zoomControl:true, dragging:false, scrollWheelZoom:false, touchZoom:false, tap:false });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);
  layerControl = L.control.layers({ OpenStreetMap: osm }, {}, { collapsed: true }).addTo(map);
  map.setView([36.5,127.8],7);
}
initMap();
function setMapPan(enabled){
  panEnabled=!!enabled; if(!map) return;
  map.dragging[enabled?"enable":"disable"](); map.scrollWheelZoom[enabled?"enable":"disable"](); map.touchZoom[enabled?"enable":"disable"]();
  togglePanBtn.textContent = `지도 이동: ${enabled?"켜짐":"꺼짐"}`;
  toast(enabled?"지도를 이동할 수 있습니다":"지도가 고정되었습니다");
}
togglePanBtn.addEventListener("click", ()=> setMapPan(!panEnabled));

function colorFromValue(val,minVal,maxVal){ if(!isFinite(val)||!isFinite(minVal)||!isFinite(maxVal)||maxVal<=minVal) return "#888";
  const t=Math.min(1,Math.max(0,(val-minVal)/(maxVal-minVal))); const hue=(1-t)*240; return `hsl(${hue},85%,50%)`; }
function addLegend(minVal,maxVal,unitLabel){
  if(!window.L) return; if(legendControl) legendControl.remove();
  legendControl = L.control({position:'bottomright'}); legendControl.onAdd=function(){
    const div=L.DomUtil.create('div','legend'); div.style.background="#fff"; div.style.padding="8px 10px"; div.style.borderRadius="6px";
    div.style.boxShadow="0 1px 4px rgba(0,0,0,.2)"; div.style.fontSize="12px";
    div.innerHTML=`<div><strong>${unitLabel}</strong></div>
      <div style="height:10px;width:160px;background:linear-gradient(90deg,#3066ff,#21c36f,#ffd33d,#ff3b3b);border-radius:4px;margin:6px 0;"></div>
      <div style="display:flex;justify-content:space-between;"><span>${round(minVal,0)}</span><span>${round((minVal+maxVal)/2,0)}</span><span>${round(maxVal,0)}</span></div>`;
    return div; }; legendControl.addTo(map);
}
function randomColor(seed){ let h=0; for(let i=0;i<seed.length;i++) h=((h<<5)-h)+seed.charCodeAt(i); const hue=Math.abs(h)%360; return `hsl(${hue},80%,45%)`; }
function drawTrackLayer(fileName, analysis, colorMode, bounds){
  if(!map) return;
  if(mapLayers[fileName]){ layerControl.removeLayer(mapLayers[fileName]); map.removeLayer(mapLayers[fileName]); delete mapLayers[fileName]; }
  const group=L.layerGroup(); mapLayers[fileName]=group; layerControl.addOverlay(group, fileName);

  let minMetric=Infinity,maxMetric=-Infinity;
  for(const s of analysis.segments){
    const metric=(colorMode==='hr')?(s.hrAvg ?? NaN):(colorMode==='speed')?(s.v*3.6):NaN;
    if(isFinite(metric)){ minMetric=Math.min(minMetric,metric); maxMetric=Math.max(maxMetric,metric); }
  }
  if(minMetric===Infinity||maxMetric===-Infinity){ minMetric=0; maxMetric=1; }

  for(const s of analysis.segments){
    const p1=[s.lat1,s.lon1], p2=[s.lat2,s.lon2];
    const metric=(colorMode==='hr')?(s.hrAvg ?? NaN):(colorMode==='speed')?(s.v*3.6):NaN;
    const color=(colorMode==='mono')?randomColor(fileName):colorFromValue(metric,minMetric,maxMetric);
    L.polyline([p1,p2],{color,weight:5,opacity:.9}).addTo(group);
    bounds.extend(p1); bounds.extend(p2);
  }
  if(analysis.firstLatLng){ L.circleMarker(analysis.firstLatLng,{radius:5,color:'#00a84f',fillColor:'#00a84f',fillOpacity:1}).bindPopup(`Start: ${fileName}`).addTo(group); bounds.extend(analysis.firstLatLng); }
  if(analysis.lastLatLng){ L.circleMarker(analysis.lastLatLng,{radius:5,color:'#ff3b3b',fillColor:'#ff3b3b',fillOpacity:1}).bindPopup(`Finish: ${fileName}`).addTo(group); bounds.extend(analysis.lastLatLng); }
  if(colorMode==='speed') addLegend(minMetric,maxMetric,'속도 km/h'); else if(colorMode==='hr') addLegend(minMetric,maxMetric,'심박 bpm');
  group.addTo(map);
}

/* ===== 칼로리 ===== */
function kcalPerMinKeytel(hr,w,age,sex){ if(!isFinite(hr)||!isFinite(w)||!isFinite(age)||!sex) return null;
  if(sex==="male") return (-55.0969+0.6309*hr+0.1988*w+0.2017*age)/4.184;
  if(sex==="female") return (-20.4022+0.4472*hr-0.1263*w+0.074*age)/4.184; return null;}
function metFromSpeedKmh(kmh){ if(!isFinite(kmh)||kmh<=0) return 1.2; if(kmh<16) return 4; if(kmh<19) return 6; if(kmh<22) return 8; if(kmh<25) return 10; if(kmh<30) return 12; return 16;}
function estimateCaloriesHR(avgHR,dur,w,age,sex){ const perMin=kcalPerMinKeytel(avgHR,w,age,sex); return (perMin!=null)? perMin*(dur/60):null; }
function estimateCaloriesMET(avgKmh,dur,w){ if(!isFinite(w)) return null; return metFromSpeedKmh(avgKmh)*w*(dur/3600); }

/* ===== GPX 파서 ===== */
function parseGpxText(xml){
  const dom=new DOMParser().parseFromString(xml,"application/xml");
  const perr=dom.getElementsByTagName("parsererror"); if(perr && perr.length) throw new Error("GPX XML 파싱 실패");
  const trkpts=Array.from(dom.getElementsByTagName("trkpt"));
  const pts=trkpts.map(pt=>{
    const lat=parseFloat(pt.getAttribute("lat")); const lon=parseFloat(pt.getAttribute("lon"));
    const timeEl=pt.getElementsByTagName("time")[0]; const eleEl=pt.getElementsByTagName("ele")[0];
    let hr=null; const ext=pt.getElementsByTagName("extensions")[0];
    if(ext){ const all=ext.getElementsByTagName("*"); for(const x of all){ if(x.localName && x.localName.toLowerCase()==="hr"){ const v=parseFloat(x.textContent.trim()); if(Number.isFinite(v)){ hr=v; break; }}}}
    const t=timeEl? new Date(timeEl.textContent.trim()):null; const ele=eleEl? parseFloat(eleEl.textContent.trim()):null;
    return (Number.isFinite(lat)&&Number.isFinite(lon)&&t)? {lat,lon,t,ele,hr}:null;
  }).filter(Boolean);
  pts.sort((a,b)=> a.t-b.t);
  const unique=[]; for(let i=0;i<pts.length;i++){ if(i===0 || pts[i].t-pts[i-1].t!==0) unique.push(pts[i]); }
  const nodes=dom.getElementsByTagName("*"); let fileCalories=0, anyCal=false;
  for(const n of nodes){ if(n.localName && n.localName.toLowerCase()==="calories"){ const v=parseFloat(n.textContent.trim()); if(Number.isFinite(v)){ fileCalories+=v; anyCal=true; } } }
  return { points: unique, fileCalories: anyCal? fileCalories : null };
}

/* ===== 고도 스무딩 ===== */
function medianSmooth(arr, win=5){
  const half=Math.floor(win/2); const res=new Array(arr.length);
  for(let i=0;i<arr.length;i++){
    const s=Math.max(0,i-half), e=Math.min(arr.length-1,i+half);
    const slice=arr.slice(s,e+1).filter(Number.isFinite).sort((a,b)=>a-b);
    res[i]=slice.length? slice[Math.floor(slice.length/2)] : arr[i];
  }
  return res;
}

/* ===== 5초 롤링 최대속도 ===== */
function maxSpeedKmhSmoothed(segments, windowS = 5) {
  let i = 0, j = 0, sumD = 0, sumT = 0, maxKmh = 0;
  const dtArr = segments.map(s => s.dt);
  const dArr  = segments.map(s => s.d);
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

/* ===== 분석 ===== */
function analyzePoints(points, opts){
  const {
    movingSpeedThreshold=1.0, maxSpeedCapKmh=80, minElevGain=1,
    useSmoothElevation=true, smoothWindow=5
  } = opts || {};
  const speedCap = Number.isFinite(maxSpeedCapKmh) ? maxSpeedCapKmh : 80;
  const moveThr  = Number.isFinite(movingSpeedThreshold) ? movingSpeedThreshold : 1.0;

  if(points.length<2){
    return { points:points.length, totalDistM:0, elapsedS:0, movingS:0, avgKmhElapsed:0, avgKmhMoving:0,
      maxKmh:0, maxKmhSmooth:0, elevGainM:0, avgHr:null, maxHr:null, segments:[], firstLatLng:null, lastLatLng:null,
      hrTimeSum:0, hrTimeDen:0 };
  }

  if(useSmoothElevation){
    const raw = points.map(p=>p.ele);
    const smoothed = medianSmooth(raw, smoothWindow);
    for(let i=0;i<points.length;i++){ points[i].se = Number.isFinite(smoothed[i]) ? smoothed[i] : points[i].ele; }
  } else {
    for(const p of points) p.se = p.ele;
  }

  let totalDist=0, movingTime=0, maxSpeedMps=0, elevGain=0;
  let maxHr=null, hrTimeSum=0, hrTimeDen=0;
  let pendingUp=0;

  const segments=[];
  for(let i=0;i<points.length-1;i++){
    const p1=points[i], p2=points[i+1];
    const dt=(p2.t - p1.t)/1000;
    if(dt<=0 || dt>3600) continue;

    const d=haversine(p1.lat,p1.lon,p2.lat,p2.lon);
    const v=d/dt; const vKmh=v*3.6;
    if(vKmh>speedCap) continue;

    totalDist += d;
    if(v>=moveThr) movingTime += dt;
    if(v>maxSpeedMps) maxSpeedMps = v;

    if(Number.isFinite(p1.se) && Number.isFinite(p2.se)){
      const de = p2.se - p1.se;
      if(de > 0){ pendingUp += de; }
      else if(de < 0){ pendingUp = Math.max(0, pendingUp + de); }
      if(pendingUp >= minElevGain){ elevGain += pendingUp; pendingUp = 0; }
    }

    const segElevUp = (Number.isFinite(p1.se)&&Number.isFinite(p2.se)) ? Math.max(0, p2.se - p1.se) : 0;

    if(Number.isFinite(p1.hr)) maxHr = Math.max(maxHr ?? p1.hr, p1.hr);
    if(Number.isFinite(p2.hr)) maxHr = Math.max(maxHr ?? p2.hr, p2.hr);
    let hrAvg=null;
    if(Number.isFinite(p1.hr) && Number.isFinite(p2.hr)){ hrAvg=(p1.hr+p2.hr)/2; hrTimeSum += hrAvg*dt; hrTimeDen += dt; }

    segments.push({ lat1:p1.lat, lon1:p1.lon, lat2:p2.lat, lon2:p2.lon, d, dt, v, elevUp: segElevUp, hrAvg });
  }
  if(pendingUp > 0) elevGain += pendingUp;

  const elapsedS=(points.at(-1).t - points[0].t)/1000;
  const avgElapsed= totalDist/(elapsedS || Infinity);
  const avgMoving = totalDist/(movingTime || Infinity);
  const avgHr = hrTimeDen>0 ? hrTimeSum/hrTimeDen : null;

  return {
    points: points.length,
    totalDistM: totalDist,
    elapsedS, movingS: movingTime,
    avgKmhElapsed: avgElapsed*3.6,
    avgKmhMoving:  avgMoving*3.6,
    maxKmh: maxSpeedMps*3.6,
    maxKmhSmooth: maxSpeedKmhSmoothed(segments, 5),
    elevGainM: elevGain,
    avgHr, maxHr,
    segments,
    firstLatLng: [points[0].lat, points[0].lon],
    lastLatLng:  [points.at(-1).lat, points.at(-1).lon],
    hrTimeSum, hrTimeDen
  };
}

/* ===== 랩 ===== */
function makeDistanceLaps(analysis, lapDistanceKm, calorieParams){
  const laps=[]; const lapDistM=lapDistanceKm*1000;
  let accDist=0, accTime=0, accElev=0, accHrSum=0, accHrDen=0, lapIdx=1;
  for(const seg of analysis.segments){
    let remain=seg.d, remainTime=seg.dt, remainElev=seg.elevUp, hrAvg=seg.hrAvg;
    while(remain>0){
      const need=lapDistM-accDist;
      if(remain<=need){
        accDist+=remain; accTime+=remainTime; accElev+=Math.max(0,remainElev);
        if(Number.isFinite(hrAvg)){ accHrSum+=hrAvg*remainTime; accHrDen+=remainTime; }
        remain=0;
      }else{
        const ratio=need/remain;
        accDist+=need; accTime+=remainTime*ratio; accElev+=Math.max(0,remainElev)*ratio;
        if(Number.isFinite(hrAvg)){ accHrSum+=hrAvg*remainTime*ratio; accHrDen+=remainTime*ratio; }
        const avgKmh=(accDist/accTime)*3.6; const lapAvgHr=accHrDen>0? accHrSum/accHrDen : null;
        const kcal=computeCaloriesForSegment(avgKmh, accTime, lapAvgHr, calorieParams);
        laps.push({ lap:lapIdx++, distKm:accDist/1000, timeS:accTime, avgKmh, pace:paceMinPerKm(avgKmh), elevUpM:accElev, avgHr:lapAvgHr, kcal });
        remain-=need; remainTime*=(1-ratio); remainElev*=(1-ratio);
        accDist=0; accTime=0; accElev=0; accHrSum=0; accHrDen=0;
      }
    }
  }
  return laps;
}
function computeCaloriesForSegment(avgKmh,durationS,avgHr,params){
  const { method, fileCalories, totalElapsedS, weightKg, age, sex } = params;
  if(method==="none") return null;
  if(method==="auto"){
    if(fileCalories!=null && isFinite(totalElapsedS) && totalElapsedS>0) return fileCalories*(durationS/totalElapsedS);
    const hrEst=estimateCaloriesHR(avgHr,durationS,weightKg,age,sex); if(hrEst!=null && hrEst>0) return hrEst;
    return estimateCaloriesMET(avgKmh,durationS,weightKg);
  }
  if(method==="hr")  return estimateCaloriesHR(avgHr,durationS,weightKg,age,sex);
  if(method==="met") return estimateCaloriesMET(avgKmh,durationS,weightKg);
  return null;
}

/* ===== CSV ===== */
const toCSV=(rows)=>{ if(!rows.length) return ""; const headers=Object.keys(rows[0]);
  const esc=(v)=> (v==null)?"":String(v).replaceAll('"','""');
  return [headers.join(","), ...rows.map(r=> headers.map(h=>`"${esc(r[h])}"`).join(","))].join("\n"); };
const downloadCSV=(filename,csv)=>{ const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); };

/* ===== 누적 이동거리 차트 ===== */
let cumChart = null;
const cumCard = document.getElementById("cumCard");
const cumHint = document.getElementById("cumHint");
const cumModeSel = document.getElementById("cumMode");

function renderCumulativeChart(labels, cumValues) {
  if (!window.Chart) return;
  const ctx = document.getElementById("cumChart").getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 300);
  gradient.addColorStop(0, "rgba(18,184,134,0.35)");
  gradient.addColorStop(1, "rgba(18,184,134,0.02)");
  if (cumChart) { cumChart.destroy(); }
  cumChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "누적 이동거리 (km)",
        data: cumValues,
        tension: 0.35,
        fill: true,
        backgroundColor: gradient,
        borderColor: "#12b886",
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        pointHitRadius: 12,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y.toFixed(2)} km` } }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 }, grid: { display: false } },
        y: { title: { display: true, text: "거리(km)" }, ticks: { callback: v=>`${v} km` }, grid: { color: "rgba(0,0,0,.06)" } }
      }
    }
  });
  cumCard.style.display = labels.length ? "block" : "none";
}

/* 주간/월간 키 생성 (ISO 주) */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2,"0")}`;
}
function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}

/* 수집 데이터 → 라벨/누적값 생성 */
function makeCumulativeSeries(items, mode) {
  // items: [{label, date:ms, km, fileName}]
  let groups = [];
  if (mode === "file") {
    // 파일별(시작시간 오름차순)
    groups = items
      .slice()
      .sort((a,b)=> a.date - b.date)
      .map(x => ({ key: x.date || 0, label: `${x.label}`, km: x.km }));
  } else if (mode === "week") {
    const map = new Map();
    for (const it of items) {
      const d = new Date(it.date || 0);
      const key = getISOWeek(d);
      map.set(key, (map.get(key)||0) + it.km);
    }
    groups = Array.from(map.entries())
      .map(([key, km]) => ({ key, label: key, km }))
      .sort((a,b) => (a.key > b.key ? 1 : -1));
  } else if (mode === "month") {
    const map = new Map();
    for (const it of items) {
      const d = new Date(it.date || 0);
      const key = getMonthKey(d);
      map.set(key, (map.get(key)||0) + it.km);
    }
    groups = Array.from(map.entries())
      .map(([key, km]) => ({ key, label: key, km }))
      .sort((a,b) => (a.key > b.key ? 1 : -1));
  }
  const labels = groups.map(g => g.label);
  const cumulative = [];
  let acc = 0;
  for (const g of groups) { acc += g.km; cumulative.push(Number(acc.toFixed(3))); }
  return { labels, cumulative, total: acc };
}

/* ===== UI / 상태 ===== */
const openSheetBtn=$("#openSheetBtn"), closeSheetBtn=$("#closeSheetBtn"), sheet=$("#sheet");
openSheetBtn.addEventListener("click",()=> sheet.classList.add("open"));
closeSheetBtn.addEventListener("click",()=> sheet.classList.remove("open"));

const elAnalyze=$("#analyzeBtn"), elExportSummary=$("#exportSummaryBtn"), elExportLaps=$("#exportLapsBtn");
const tbodySummary=$("#summaryTable tbody"), lapsSection=$("#lapsSection"), tbodyLaps=$("#lapsTable tbody");
let lastSummary=[], lastLaps=[];
let fileDistanceForChart = []; // {label, date(ms), km, fileName}

/* ===== 분석 실행 ===== */
elAnalyze.addEventListener("click", async ()=>{
  try{
    if(elNativeInput.files?.length) addFiles(elNativeInput.files);
    const files=selectedFiles.slice();
    if(!files.length){ toast("GPX 파일을 선택해 주세요"); return; }

    const movingThreshold=numOr(parseFloat($("#movingThreshold").value), 1.0);
    const lapDistanceKm  =numOr(parseFloat($("#lapDistanceKm").value),   1.0);
    const minElevGain    =numOr(parseFloat($("#minElevGain").value),     1.0);
    const maxSpeedCap    =numOr(parseFloat($("#maxSpeedCap").value),    80.0);
    const method         =$("#calorieMethod").value;
    const weightKg       =numOr(parseFloat($("#weightKg").value),        NaN);
    const age            =numOr(parseFloat($("#age").value),             NaN);
    const sex            =$("#sex").value;
    const useSmoothElevation = $("#useSmoothElevation").checked;

    tbodySummary.innerHTML=""; tbodyLaps.innerHTML=""; lastSummary=[]; lastLaps=[];
    fileDistanceForChart = [];
    sheet.classList.remove("open");
    showProgress("파일 파싱 준비 중…");

    if(map){
      Object.keys(mapLayers).forEach(k=>{ layerControl.removeLayer(mapLayers[k]); map.removeLayer(mapLayers[k]); delete mapLayers[k]; });
    }
    const bounds=(window.L && L.latLngBounds)? L.latLngBounds() : null;
    const colorMode=colorModeSel.value;

    const agg={ points:0, distM:0, elapsedS:0, movingS:0, elevM:0, maxKmh:0, maxHr:null, hrTimeSum:0, hrTimeDen:0, calories:0 };
    lapsSection.style.display = files.length===1 ? "block" : "none";

    for(let i=0;i<files.length;i++){
      const file=files[i];
      setProgress(`처리 중 ${i+1}/${files.length}… (${file.name})`);
      const text=await file.text();
      const { points, fileCalories } = parseGpxText(text);
      if(!points || points.length<2){
        const tr=document.createElement("tr");
        tr.innerHTML=`<td class="left">${file.name}</td><td>0</td><td>0</td><td>00:00:00</td><td>00:00:00</td>
                      <td>0</td><td>0</td><td>0</td><td></td><td>0</td><td></td><td></td><td></td>`;
        tbodySummary.appendChild(tr);
        continue;
      }

      const analysis = analyzePoints(points, {
        movingSpeedThreshold:movingThreshold, maxSpeedCapKmh:maxSpeedCap,
        minElevGain, useSmoothElevation
      });

      if(map && bounds) drawTrackLayer(file.name, analysis, colorMode, bounds);

      // 랩(1개 파일일 때만)
      if(files.length===1){
        const laps = makeDistanceLaps(analysis, lapDistanceKm, {
          method, fileCalories, totalElapsedS: analysis.elapsedS, weightKg, age, sex
        });
        laps.forEach(lp=>{
          const row={ file:file.name, lap:lp.lap, lap_km:round(lp.distKm,3), lap_time:secToHMS(lp.timeS),
            lap_avg_kmh:round(lp.avgKmh,2), lap_pace:lp.pace, lap_elev_up_m:round(lp.elevUpM,1),
            lap_avg_hr: lp.avgHr? Math.round(lp.avgHr):"", lap_kcal: lp.kcal!=null? Math.round(lp.kcal):"" };
          lastLaps.push(row);
          const tr2=document.createElement("tr");
          tr2.innerHTML=`<td class="left">${row.file}</td><td>${row.lap}</td><td>${row.lap_km}</td><td>${row.lap_time}</td>
                         <td>${row.lap_avg_kmh}</td><td>${row.lap_pace}</td><td>${row.lap_elev_up_m}</td>
                         <td>${row.lap_avg_hr}</td><td>${row.lap_kcal}</td>`;
          tbodyLaps.appendChild(tr2);
        });
      }

      const displayMaxKmh = analysis.maxKmhSmooth ?? analysis.maxKmh;

      // 칼로리
      let caloriesKcal=null;
      if(method==="auto" && fileCalories!=null) caloriesKcal=fileCalories;
      else {
        const chosen = computeCaloriesForSegment(
          analysis.avgKmhElapsed, analysis.elapsedS, analysis.avgHr,
          { method, fileCalories:null, totalElapsedS:analysis.elapsedS, weightKg, age, sex }
        );
        caloriesKcal = chosen!=null ? chosen : null;
      }

      // 합계 누적
      agg.points+=analysis.points; agg.distM+=analysis.totalDistM; agg.elapsedS+=analysis.elapsedS;
      agg.movingS+=analysis.movingS; agg.elevM+=analysis.elevGainM; agg.maxKmh=Math.max(agg.maxKmh, displayMaxKmh || 0);
      if(analysis.maxHr!=null) agg.maxHr=Math.max(agg.maxHr ?? analysis.maxHr, analysis.maxHr);
      agg.hrTimeSum+=(analysis.hrTimeSum||0); agg.hrTimeDen+=(analysis.hrTimeDen||0);
      if(caloriesKcal!=null) agg.calories+=caloriesKcal;

      const sumRow={
        file:file.name, points:analysis.points, total_km:round(analysis.totalDistM/1000,3),
        elapsed:secToHMS(analysis.elapsedS), moving:secToHMS(analysis.movingS),
        avg_kmh_elapsed:round(analysis.avgKmhElapsed,2), avg_kmh_moving:round(analysis.avgKmhMoving,2),
        max_kmh:round(displayMaxKmh,2), avg_pace: paceMinPerKm(analysis.avgKmhElapsed),
        elev_gain_m:round(analysis.elevGainM,1),
        avg_hr: analysis.avgHr? Math.round(analysis.avgHr):"",
        max_hr: analysis.maxHr? Math.round(analysis.maxHr):"",
        calories_kcal: caloriesKcal!=null? Math.round(caloriesKcal):""
      };
      lastSummary.push(sumRow);
      const tr=document.createElement("tr");
      tr.innerHTML=`<td class="left">${sumRow.file}</td><td>${sumRow.points}</td><td>${sumRow.total_km}</td>
                    <td>${sumRow.elapsed}</td><td>${sumRow.moving}</td><td>${sumRow.avg_kmh_elapsed}</td>
                    <td>${sumRow.avg_kmh_moving}</td><td>${sumRow.max_kmh}</td><td>${sumRow.avg_pace}</td>
                    <td>${sumRow.elev_gain_m}</td><td>${sumRow.avg_hr}</td><td>${sumRow.max_hr}</td><td>${sumRow.calories_kcal}</td>`;
      $("#summaryTable tbody").appendChild(tr);

      // 그래프용 데이터 수집
      const startTime = points?.[0]?.t instanceof Date ? points[0].t : null;
      const baseLabel = startTime
        ? `${startTime.getFullYear()}-${String(startTime.getMonth()+1).padStart(2,"0")}-${String(startTime.getDate()).padStart(2,"0")}`
        : "0000-00-00";
      const label = `${baseLabel} · ${file.name}`;
      fileDistanceForChart.push({
        label, date: startTime ? +startTime : 0, km: (analysis.totalDistM||0)/1000, fileName: file.name
      });
    }

    if(agg.elapsedS>0 || agg.distM>0){
      const totalAvgKmhElapsed=(agg.distM/(agg.elapsedS||Infinity))*3.6;
      const totalAvgKmhMoving =(agg.distM/(agg.movingS||Infinity))*3.6;
      const totalRow={
        file:"합계", points:agg.points, total_km:round(agg.distM/1000,3),
        elapsed:secToHMS(agg.elapsedS), moving:secToHMS(agg.movingS),
        avg_kmh_elapsed:round(totalAvgKmhElapsed,2), avg_kmh_moving:round(totalAvgKmhMoving,2),
        max_kmh:round(agg.maxKmh,2), avg_pace: paceMinPerKm(totalAvgKmhElapsed),
        elev_gain_m:round(agg.elevM,1),
        avg_hr: agg.hrTimeDen>0 ? Math.round(agg.hrTimeSum/agg.hrTimeDen) : "",
        max_hr: agg.maxHr!=null ? Math.round(agg.maxHr) : "",
        calories_kcal: agg.calories ? Math.round(agg.calories) : ""
      };
      lastSummary.push(totalRow);
      const trT=document.createElement("tr"); trT.className="total-row";
      trT.innerHTML=`<td class="left">${totalRow.file}</td><td>${totalRow.points}</td><td>${totalRow.total_km}</td>
                     <td>${totalRow.elapsed}</td><td>${totalRow.moving}</td><td>${totalRow.avg_kmh_elapsed}</td>
                     <td>${totalRow.avg_kmh_moving}</td><td>${totalRow.max_kmh}</td><td>${totalRow.avg_pace}</td>
                     <td>${totalRow.elev_gain_m}</td><td>${totalRow.avg_hr}</td><td>${totalRow.max_hr}</td><td>${totalRow.calories_kcal}</td>`;
      $("#summaryTable tbody").appendChild(trT);
    }

    // 그래프 최초 렌더(파일별)
    updateCumulativeChart("file");

    if(map && bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.1));
    elExportSummary.disabled = lastSummary.length===0;
    elExportLaps.disabled = lastLaps.length===0 || lapsSection.style.display==="none";
    hideProgress(); toast("분석 완료");

  }catch(err){ console.error(err); hideProgress(); toast(`오류: ${err.message||err}`); }
});

/* 그래프 모드 변경 */
cumModeSel?.addEventListener("change", ()=> {
  const mode = cumModeSel.value || "file";
  updateCumulativeChart(mode);
});

function updateCumulativeChart(mode="file") {
  if (!fileDistanceForChart.length) { cumCard.style.display="none"; return; }
  const { labels, cumulative, total } = makeCumulativeSeries(fileDistanceForChart, mode);
  renderCumulativeChart(labels, cumulative);
  if (labels.length) {
    const first = labels[0].split(" · ")[0];
    const last  = labels.at(-1).split(" · ")[0];
    cumHint.textContent = `표시: ${mode.toUpperCase()}  ·  기간: ${first} ~ ${last}  ·  항목 ${labels.length}개  ·  총 ${total.toFixed(2)} km`;
  } else {
    cumHint.textContent = "";
  }
}

/* ===== 내보내기 ===== */
elExportSummary.addEventListener("click", ()=>{ const csv=toCSV(lastSummary); downloadCSV("gpx_summary.csv", csv); toast("요약 CSV 저장 완료"); });
elExportLaps.addEventListener("click", ()=>{ if(!lastLaps.length){ toast("랩 데이터가 없습니다"); return; } const csv=toCSV(lastLaps); downloadCSV("gpx_laps.csv", csv); toast("랩 CSV 저장 완료"); });
