const SHEET_ID = '1CUlxoca4L0dj2XDAa7X5iRBHDQyzDfDG';
const SHEET_NAME = 'All';

let STATIONS = [];
let selected = new Map();

// ── Tab switching ──────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── DOM refs ───────────────────────────────────────────────────
const els = {
  // Finder tab
  search:        document.getElementById('search'),
  results:       document.getElementById('results'),
  refreshBtn:    document.getElementById('refreshBtn'),
  refreshStatus: document.getElementById('refreshStatus'),
  singlePanel:   document.getElementById('singlePanel'),
  singleName:    document.getElementById('singleName'),
  singleCoords:  document.getElementById('singleCoords'),
  singleMap:     document.getElementById('singleMap'),
  directionsLink:document.getElementById('directionsLink'),
  multiPanel:    document.getElementById('multiPanel'),
  selCount:      document.getElementById('selCount'),
  chips:         document.getElementById('chips'),
  planRoute:     document.getElementById('planRoute'),
  clearSel:      document.getElementById('clearSel'),
  routeStatus:   document.getElementById('routeStatus'),
  routeLink:     document.getElementById('routeLink'),
  // Measurements tab
  msearch:       document.getElementById('msearch'),
  mresults:      document.getElementById('mresults'),
  mPanel:        document.getElementById('mPanel'),
  mStationName:  document.getElementById('mStationName'),
  mStationId:    document.getElementById('mStationId'),
  copeE:         document.getElementById('copeE'),
  copeG:         document.getElementById('copeG'),
  copeAngle:     document.getElementById('copeAngle'),
  copeOffset:    document.getElementById('copeOffset'),
  depthEF:       document.getElementById('depthEF'),
  waterLevel:    document.getElementById('waterLevel'),
  depthResult:   document.getElementById('depthResult'),
  depthVal:      document.getElementById('depthVal'),
  mStatus:       document.getElementById('mStatus'),
};

// ── Load bundled data ──────────────────────────────────────────
fetch('stations.json').then(r => r.json()).then(data => {
  STATIONS = data;
  renderFinder(els.search.value);
  renderMeasure(els.msearch.value);
});

// ── Google Sheets live fetch (JSONP) ───────────────────────────
function fetchSheetViaJsonp() {
  return new Promise((resolve, reject) => {
    window.google = window.google || {};
    window.google.visualization = window.google.visualization || {};
    window.google.visualization.Query = window.google.visualization.Query || {};
    window.google.visualization.Query.setResponse = (data) => { cleanup(); resolve(data); };

    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out')); }, 15000);
    function cleanup() { clearTimeout(timer); script.remove(); }
    script.onerror = () => { cleanup(); reject(new Error('Network error')); };
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function parseSheetRows(data) {
  const out = [];
  for (const row of (data.table && data.table.rows) || []) {
    const c = row.c || [];
    const id   = c[0]?.v;
    const name = c[1]?.v;
    const lat  = c[2]?.v;
    const lng  = c[3]?.v;
    if (!id || !name || typeof lat !== 'number' || typeof lng !== 'number') continue;
    out.push({
      id: String(id), name: String(name), lat, lng,
      copeE: typeof c[4]?.v === 'number' ? c[4].v : null,
      copeF: typeof c[5]?.v === 'number' ? c[5].v : null,
      copeG: typeof c[6]?.v === 'number' ? c[6].v : null,
      angle: typeof c[7]?.v === 'number' ? c[7].v : null,
      offset: typeof c[8]?.v === 'number' ? c[8].v : null,
    });
  }
  return out;
}

async function refreshStations() {
  els.refreshBtn.disabled = true;
  els.refreshStatus.textContent = 'Checking Google Sheet for new stations…';
  try {
    const data  = await fetchSheetViaJsonp();
    const fresh = parseSheetRows(data);
    if (!fresh.length) throw new Error('Sheet returned no rows');

    const existingIds = new Set(STATIONS.map(s => s.id));
    const newOnes = fresh.filter(s => !existingIds.has(s.id));
    STATIONS = fresh;
    renderFinder(els.search.value);
    renderMeasure(els.msearch.value);

    els.refreshStatus.textContent = newOnes.length
      ? `Found ${newOnes.length} new station(s). Total: ${STATIONS.length}.`
      : `No new stations. Total: ${STATIONS.length}.`;
  } catch (e) {
    els.refreshStatus.textContent = `Could not refresh (${e.message}). Showing last known data.`;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

els.refreshBtn.addEventListener('click', refreshStations);

// ── Utilities ──────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*toR)*Math.cos(lat2*toR)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      e => reject(e),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function matchStations(query) {
  const q = query.trim().toLowerCase();
  return q ? STATIONS.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).slice(0, 100) : [];
}

// ── Finder tab ─────────────────────────────────────────────────
function renderFinder(query) {
  const q = query.trim();
  els.results.innerHTML = '';
  if (!q) { els.results.innerHTML = '<div class="empty">Start typing to search stations</div>'; return; }
  const matches = matchStations(q);
  if (!matches.length) { els.results.innerHTML = '<div class="empty">No stations found</div>'; return; }
  for (const s of matches) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <input type="checkbox" ${selected.has(s.id) ? 'checked' : ''}>
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="sid">${s.id} · ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</div>
      </div>`;
    const cb = row.querySelector('input');
    cb.addEventListener('change', () => { selected[cb.checked ? 'set' : 'delete'](s.id, s); updateMultiPanel(); });
    row.querySelector('.info').addEventListener('click', () => showSingle(s));
    els.results.appendChild(row);
  }
}

async function showSingle(s) {
  els.singlePanel.style.display = 'block';
  els.singleName.textContent = s.name;
  els.singleCoords.textContent = `${s.id} · ${s.lat}, ${s.lng}`;
  els.singleMap.src = `https://maps.google.com/maps?q=${s.lat},${s.lng}&z=16&output=embed`;
  els.directionsLink.href = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving`;
  try {
    const loc = await getLocation();
    els.directionsLink.href = `https://www.google.com/maps/dir/?api=1&origin=${loc.lat},${loc.lng}&destination=${s.lat},${s.lng}&travelmode=driving`;
  } catch {}
  els.singlePanel.scrollIntoView({ behavior: 'smooth' });
}

function updateMultiPanel() {
  els.selCount.textContent = selected.size;
  els.chips.innerHTML = '';
  for (const s of selected.values()) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${s.name} <button>&times;</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      selected.delete(s.id); updateMultiPanel(); renderFinder(els.search.value);
    });
    els.chips.appendChild(chip);
  }
  els.multiPanel.style.display = selected.size >= 1 ? 'block' : 'none';
  els.planRoute.disabled = selected.size < 2;
  els.routeStatus.textContent = selected.size === 1 ? 'Select at least one more station to plan a route.' : '';
  els.routeLink.style.display = 'none';
}

els.search.addEventListener('input', () => renderFinder(els.search.value));
els.clearSel.addEventListener('click', () => { selected.clear(); updateMultiPanel(); renderFinder(els.search.value); });

els.planRoute.addEventListener('click', async () => {
  if (selected.size < 2) return;
  els.routeLink.style.display = 'none';
  els.routeStatus.textContent = 'Getting your location…';
  let loc;
  try { loc = await getLocation(); }
  catch { els.routeStatus.textContent = 'Could not get your location. Please enable location access and try again.'; return; }

  const stations = Array.from(selected.values());
  let farthest = stations[0], maxDist = -1;
  for (const s of stations) { const d = haversine(loc.lat, loc.lng, s.lat, s.lng); if (d > maxDist) { maxDist = d; farthest = s; } }
  const rest = stations.filter(s => s.id !== farthest.id);

  const parts = [`${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`];
  for (const s of rest) parts.push(`${s.lat.toFixed(6)},${s.lng.toFixed(6)}`);
  parts.push(`${farthest.lat.toFixed(6)},${farthest.lng.toFixed(6)}`);

  const url = `https://www.routexl.com/?q=${parts.map(encodeURIComponent).join('$')}&lang=en`;
  els.routeStatus.textContent = `Start: your location → ${rest.length} stop(s) → Farthest: ${farthest.name}`;
  els.routeLink.href = url;
  els.routeLink.style.display = 'block';
  const opened = window.open(url, '_blank');
  if (!opened) els.routeStatus.textContent += ' (Tap the button below if the popup was blocked.)';
});

// ── Measurements tab ───────────────────────────────────────────
let mStation = null;

function renderMeasure(query) {
  const q = query.trim();
  els.mresults.innerHTML = '';
  if (!q) { els.mresults.innerHTML = '<div class="empty">Start typing to search a station</div>'; return; }
  const matches = matchStations(q);
  if (!matches.length) { els.mresults.innerHTML = '<div class="empty">No stations found</div>'; return; }
  for (const s of matches) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="info"><div class="name">${s.name}</div><div class="sid">${s.id}</div></div>`;
    row.addEventListener('click', () => selectMStation(s));
    els.mresults.appendChild(row);
  }
}

function fmtCope(v) {
  if (v === null || v === undefined) return '<span class="na">N/A</span>';
  return v.toFixed(3);
}

function selectMStation(s) {
  mStation = s;
  els.mPanel.style.display = 'block';
  els.mStationName.textContent = s.name;
  els.mStationId.textContent = s.id;

  els.copeE.innerHTML = fmtCope(s.copeE);
  els.copeG.innerHTML = fmtCope(s.copeG);
  els.copeAngle.innerHTML = s.angle !== null ? `${s.angle}°` : '<span class="na">N/A</span>';
  els.copeOffset.innerHTML = s.offset !== null ? fmtCope(s.offset) : '<span class="na">—</span>';

  // Auto-compute (E − G − offset) / sin(angle)
  if (s.copeE !== null && s.copeG !== null && s.angle !== null) {
    const off = s.offset ?? 0;
    const result = (s.copeE - s.copeG - off) / Math.sin(s.angle * Math.PI / 180);
    els.depthEF.textContent = result.toFixed(3);
    els.depthEF.className = 'big-result-val';
  } else {
    els.depthEF.textContent = 'N/A';
    els.depthEF.className = 'big-result-val na';
  }

  els.waterLevel.value = '';
  els.depthResult.style.display = 'none';
  els.mStatus.textContent = s.copeE === null
    ? 'No Cope level (Col E) recorded yet for this station.'
    : '';
  els.mPanel.scrollIntoView({ behavior: 'smooth' });
}

function computeDepth() {
  if (!mStation) return;
  const wl = parseFloat(els.waterLevel.value);
  if (isNaN(wl)) { els.depthResult.style.display = 'none'; return; }
  if (mStation.copeE === null || mStation.angle === null) {
    els.depthResult.style.display = 'none';
    els.mStatus.textContent = 'Cannot compute: Cope (E) or Angle not recorded for this station.';
    return;
  }
  const off = mStation.offset ?? 0;
  const depth = (mStation.copeE - wl - off) / Math.sin(mStation.angle * Math.PI / 180);
  els.depthVal.textContent = depth.toFixed(3) + ' m';
  els.depthResult.className = 'result-box ' + (depth > 0 ? 'positive' : depth < 0 ? 'negative' : 'neutral');
  els.depthResult.style.display = 'block';
  const offNote = off !== 0 ? ` − offset(${off})` : '';
  els.mStatus.textContent = `(E(${mStation.copeE.toFixed(3)}) − WL(${wl.toFixed(3)})${offNote}) ÷ sin(${mStation.angle}°) = ${depth.toFixed(3)} m`;
}

els.msearch.addEventListener('input', () => renderMeasure(els.msearch.value));
els.waterLevel.addEventListener('input', computeDepth);

// ── Send Data tab ──────────────────────────────────────────────

// Per-station session state (keyed by station ID suffix e.g. "WWS499")
const sdBattery  = new Map(); // { base, current }
const sdAlertSt  = new Map(); // { level, prevPct, hasReading }

const RISE_THRESH = [50, 75, 90, 100];

function sdGetAlertState(sid) {
  if (!sdAlertSt.has(sid)) sdAlertSt.set(sid, { level: 0, prevPct: 0, hasReading: false });
  return sdAlertSt.get(sid);
}

function sdGetBattery(sid) {
  if (!sdBattery.has(sid)) {
    const base = 12 + Math.random(); // random in [12, 13)
    sdBattery.set(sid, { val: parseFloat(base.toFixed(2)) });
  }
  const b = sdBattery.get(sid);
  const drift = (Math.random() < 0.5 ? -0.01 : 0.01);
  b.val = parseFloat(Math.min(13, Math.max(12, b.val + drift)).toFixed(2));
  return b.val;
}

function sdComputeRaw(levelM) {
  // 4-20mA sensor, 5m H2O range, 150Ω shunt, ADS1115 gain-1 (FSR ±4.096V)
  const currentMa = 4 + (levelM / 5) * 16;
  const voltageV  = (currentMa / 1000) * 150;
  return Math.round((voltageV / 4.096) * 32767);
}

function sdComputeAlert(sid, pct, deltaPct) {
  const st = sdGetAlertState(sid);
  const fall = RISE_THRESH.map(t => t - deltaPct);
  let newLevel = st.level;

  if (!st.hasReading) {
    newLevel = 0;
    for (let i = RISE_THRESH.length - 1; i >= 0; i--) {
      if (pct >= RISE_THRESH[i]) { newLevel = i + 1; break; }
    }
    st.hasReading = true;
  } else if (pct > st.prevPct) {
    let candidate = 0;
    for (let i = RISE_THRESH.length - 1; i >= 0; i--) {
      if (pct >= RISE_THRESH[i]) { candidate = i + 1; break; }
    }
    if (candidate > st.level) newLevel = candidate;
  } else if (pct < st.prevPct) {
    let candidate = 0;
    for (let i = fall.length - 1; i >= 0; i--) {
      if (pct >= fall[i]) { candidate = i + 1; break; }
    }
    if (candidate < st.level) newLevel = candidate;
  }

  st.prevPct  = pct;
  st.level    = newLevel;
  return newLevel;
}

function sdBuildPayload(commit) {
  const suffix  = document.getElementById('sdStation').value.trim().toUpperCase();
  const levelRaw = parseFloat(document.getElementById('sdLevel').value);
  const delta   = parseFloat(document.getElementById('sdDelta').value) || 2;

  if (!suffix) return { err: 'Enter a station ID (e.g. WWS499)' };
  if (isNaN(levelRaw) || levelRaw < 0) return { err: 'Enter a valid water level (metres)' };

  const sid    = 'WLC21_' + suffix;
  const wa     = parseFloat(levelRaw.toFixed(3));
  const wl     = Math.round(wa * 100);           // % vs 1m reference
  const raw    = sdComputeRaw(wa);
  const pct    = wl;                             // same as wl (both are level/1m × 100)
  const al     = sdComputeAlert(suffix, pct, delta);
  const bl     = commit ? sdGetBattery(suffix) : (() => {
    const b = sdBattery.get(suffix);
    return b ? b.val : parseFloat((12 + Math.random()).toFixed(2));
  })();
  const md     = document.getElementById('sdMd').checked  ? 'M' : 'N';
  const md2    = document.getElementById('sdMd2').checked ? 'H' : 'L';
  const ts_r   = Math.floor(Date.now() / 1000);

  const payload = {
    sid, sp: 'SingTel', ts_r,
    wa, wl, raw,
    al, alcl: 0,
    md, md2,
    bl, ss: -67,
    fw: 'm.1', err: ''
  };
  const topic = `pubc21wl/${sid}`;
  return { payload, topic, sid };
}

function sdShowStatus(msg, type) {
  const el = document.getElementById('sdStatus');
  el.textContent = msg;
  el.className = 'send-status ' + (type || 'info');
  if (!msg) el.className = 'status';
}

// Persist settings to localStorage
function sdLoadSettings() {
  const ep = localStorage.getItem('sd_endpoint') || '';
  const dl = localStorage.getItem('sd_delta') || '2';
  document.getElementById('sdEndpoint').value = ep;
  document.getElementById('sdDelta').value    = dl;
}
function sdSaveSettings() {
  localStorage.setItem('sd_endpoint', document.getElementById('sdEndpoint').value.trim());
  localStorage.setItem('sd_delta',    document.getElementById('sdDelta').value);
}
document.getElementById('sdEndpoint').addEventListener('change', sdSaveSettings);
document.getElementById('sdDelta').addEventListener('change', sdSaveSettings);
sdLoadSettings();

// Station suffix → uppercase on input
document.getElementById('sdStation').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase();
});

// Toggle labels
document.getElementById('sdMd').addEventListener('change',  e => {
  document.getElementById('sdMdVal').textContent  = e.target.checked ? 'M' : 'N';
});
document.getElementById('sdMd2').addEventListener('change', e => {
  document.getElementById('sdMd2Val').textContent = e.target.checked ? 'H' : 'L';
});

// Preview button
document.getElementById('sdPreviewBtn').addEventListener('click', () => {
  const result = sdBuildPayload(false);
  if (result.err) { sdShowStatus(result.err, 'err'); return; }
  const { payload, topic } = result;
  document.getElementById('sdJson').textContent =
    `// Topic: ${topic}\n` + JSON.stringify(payload, null, 2);
  document.getElementById('sdPreviewPanel').style.display = 'block';
  sdShowStatus('', '');
});

// Send button
document.getElementById('sdSendBtn').addEventListener('click', async () => {
  const endpoint = document.getElementById('sdEndpoint').value.trim();
  if (!endpoint) {
    sdShowStatus('Enter a Lambda endpoint URL in Settings before sending.', 'err');
    return;
  }
  const result = sdBuildPayload(true);   // commits battery drift
  if (result.err) { sdShowStatus(result.err, 'err'); return; }
  const { payload, topic } = result;

  // Show preview too
  document.getElementById('sdJson').textContent =
    `// Topic: ${topic}\n` + JSON.stringify(payload, null, 2);
  document.getElementById('sdPreviewPanel').style.display = 'block';

  sdShowStatus('Sending…', 'info');
  document.getElementById('sdSendBtn').disabled = true;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, payload })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sdShowStatus(`Sent OK · al=${payload.al} · wl=${payload.wl}% · ${new Date().toLocaleTimeString()}`, 'ok');
  } catch (e) {
    sdShowStatus(`Send failed: ${e.message}`, 'err');
  } finally {
    document.getElementById('sdSendBtn').disabled = false;
  }
});
