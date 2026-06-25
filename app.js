const SHEET_ID = '1CUlxoca4L0dj2XDAa7X5iRBHDQyzDfDG';
const SHEET_NAME = 'All';

let STATIONS = [];
let selected = new Map(); // id -> station

const els = {
  search: document.getElementById('search'),
  results: document.getElementById('results'),
  refreshBtn: document.getElementById('refreshBtn'),
  refreshStatus: document.getElementById('refreshStatus'),
  singlePanel: document.getElementById('singlePanel'),
  singleName: document.getElementById('singleName'),
  singleCoords: document.getElementById('singleCoords'),
  singleMap: document.getElementById('singleMap'),
  directionsLink: document.getElementById('directionsLink'),
  multiPanel: document.getElementById('multiPanel'),
  selCount: document.getElementById('selCount'),
  chips: document.getElementById('chips'),
  planRoute: document.getElementById('planRoute'),
  clearSel: document.getElementById('clearSel'),
  routeStatus: document.getElementById('routeStatus'),
  routeLink: document.getElementById('routeLink'),
};

fetch('stations.json').then(r => r.json()).then(data => {
  STATIONS = data;
  render(els.search.value);
});

// Google Sheets only allows cross-origin reads via the gviz JSONP callback,
// not a plain fetch() (no CORS headers on docs.google.com responses).
function fetchSheetViaJsonp() {
  return new Promise((resolve, reject) => {
    const prevHandler = window.google && window.google.visualization;
    window.google = window.google || {};
    window.google.visualization = window.google.visualization || {};
    window.google.visualization.Query = window.google.visualization.Query || {};
    window.google.visualization.Query.setResponse = (data) => {
      cleanup();
      resolve(data);
    };

    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out reaching Google Sheets'));
    }, 15000);

    function cleanup() {
      clearTimeout(timer);
      script.remove();
      if (prevHandler) window.google.visualization = prevHandler;
    }

    script.onerror = () => {
      cleanup();
      reject(new Error('Failed to load Google Sheet'));
    };
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function parseSheetRows(data) {
  const rows = (data.table && data.table.rows) || [];
  const out = [];
  for (const row of rows) {
    const c = row.c || [];
    const id = c[0] && c[0].v;
    const name = c[1] && c[1].v;
    const lat = c[2] && c[2].v;
    const lng = c[3] && c[3].v;
    if (!id || !name || typeof lat !== 'number' || typeof lng !== 'number') continue;
    out.push({ id: String(id), name: String(name), lat, lng });
  }
  return out;
}

async function refreshStations() {
  els.refreshBtn.disabled = true;
  els.refreshStatus.textContent = 'Checking Google Sheet for new stations...';
  try {
    const data = await fetchSheetViaJsonp();
    const fresh = parseSheetRows(data);
    if (fresh.length === 0) throw new Error('Sheet returned no rows');

    const existingIds = new Set(STATIONS.map(s => s.id));
    const newOnes = fresh.filter(s => !existingIds.has(s.id));

    STATIONS = fresh;
    render(els.search.value);

    if (newOnes.length > 0) {
      els.refreshStatus.textContent = `Found ${newOnes.length} new station(s). Total: ${STATIONS.length}.`;
    } else {
      els.refreshStatus.textContent = `No new stations found. Total: ${STATIONS.length}.`;
    }
  } catch (e) {
    els.refreshStatus.textContent = `Could not refresh from Google Sheet (${e.message}). Showing last known data.`;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

els.refreshBtn.addEventListener('click', refreshStations);

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function render(query) {
  const q = query.trim().toLowerCase();
  const matches = q
    ? STATIONS.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).slice(0, 100)
    : [];

  els.results.innerHTML = '';
  if (!q) {
    els.results.innerHTML = '<div class="empty">Start typing to search stations</div>';
    return;
  }
  if (matches.length === 0) {
    els.results.innerHTML = '<div class="empty">No stations found</div>';
    return;
  }
  for (const s of matches) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <input type="checkbox" data-id="${s.id}" ${selected.has(s.id) ? 'checked' : ''}>
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="id">${s.id} · ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</div>
      </div>
    `;
    const checkbox = row.querySelector('input');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.set(s.id, s);
      else selected.delete(s.id);
      updateMultiPanel();
    });
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
  els.directionsLink.textContent = 'Directions from my location';

  try {
    const loc = await getLocation();
    els.directionsLink.href = `https://www.google.com/maps/dir/?api=1&origin=${loc.lat},${loc.lng}&destination=${s.lat},${s.lng}&travelmode=driving`;
  } catch (e) {
    // fall back to Google Maps default current-location behavior
  }
  els.singlePanel.scrollIntoView({ behavior: 'smooth' });
}

function updateMultiPanel() {
  els.selCount.textContent = selected.size;
  els.chips.innerHTML = '';
  for (const s of selected.values()) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${s.name} <button data-id="${s.id}">&times;</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      selected.delete(s.id);
      updateMultiPanel();
      render(els.search.value);
    });
    els.chips.appendChild(chip);
  }
  els.multiPanel.style.display = selected.size >= 1 ? 'block' : 'none';
  els.planRoute.disabled = selected.size < 2;
  els.routeStatus.textContent = selected.size === 1
    ? 'Select at least one more station to plan a multi-stop route.'
    : '';
  els.routeLink.style.display = 'none';
}

els.search.addEventListener('input', () => render(els.search.value));

els.clearSel.addEventListener('click', () => {
  selected.clear();
  updateMultiPanel();
  render(els.search.value);
});

els.planRoute.addEventListener('click', async () => {
  if (selected.size < 2) {
    els.routeStatus.textContent = 'Select at least 2 stations to plan a route.';
    return;
  }
  els.routeLink.style.display = 'none';
  els.routeStatus.textContent = 'Getting your location...';
  let loc;
  try {
    loc = await getLocation();
  } catch (e) {
    els.routeStatus.textContent = 'Could not get your location. Please enable location access and try again.';
    return;
  }

  const stations = Array.from(selected.values());
  let farthest = stations[0];
  let maxDist = -1;
  for (const s of stations) {
    const d = haversine(loc.lat, loc.lng, s.lat, s.lng);
    if (d > maxDist) { maxDist = d; farthest = s; }
  }
  const rest = stations.filter(s => s.id !== farthest.id);

  const addrParts = [`${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`];
  for (const s of rest) addrParts.push(`${s.lat.toFixed(6)},${s.lng.toFixed(6)}`);
  addrParts.push(`${farthest.lat.toFixed(6)},${farthest.lng.toFixed(6)}`);

  const q = addrParts.map(encodeURIComponent).join('$');
  const url = `https://www.routexl.com/?q=${q}&lang=en`;

  els.routeStatus.textContent = `Start: your location → ${rest.length} stop(s) → Farthest: ${farthest.name}`;
  els.routeLink.href = url;
  els.routeLink.style.display = 'block';

  const opened = window.open(url, '_blank');
  if (!opened) {
    els.routeStatus.textContent += ' (Tap the button below to open — your browser blocked the automatic popup.)';
  }
});
