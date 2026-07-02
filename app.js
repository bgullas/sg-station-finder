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

  // Auto-compute (E − G) × sin(angle°)
  if (s.copeE !== null && s.copeG !== null && s.angle !== null) {
    const result = (s.copeE - s.copeG) * Math.sin(s.angle * Math.PI / 180);
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
  if (mStation.copeE === null) {
    els.depthResult.style.display = 'none';
    els.mStatus.textContent = 'Cannot compute: Col E (Cope-Side Invert) is not recorded for this station.';
    return;
  }
  const depth = mStation.copeE - wl;
  els.depthVal.textContent = depth.toFixed(3) + ' m';
  els.depthResult.className = 'result-box ' + (depth > 0 ? 'positive' : depth < 0 ? 'negative' : 'neutral');
  els.depthResult.style.display = 'block';
  els.mStatus.textContent = `Col E (${mStation.copeE.toFixed(3)}) − Water Level (${wl.toFixed(3)}) = ${depth.toFixed(3)} m`;
}

els.msearch.addEventListener('input', () => renderMeasure(els.msearch.value));
els.waterLevel.addEventListener('input', computeDepth);
