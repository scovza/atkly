// analytics.js — Analytics page rendering and data fetching.

const HEATMAP_GRID_SCALE = 0.5;

const HEATMAP_SIGMA_FACTOR = 0.06;

const HEATMAP_PERCENTILE = 0.99;

const HEATMAP_NOISE_FLOOR = 0.10;

const HEATMAP_ALPHA_MIN = 10;

const HEATMAP_ALPHA_RANGE = 100;

const HEATMAP_BLUR_FACTOR = 0.022;

const DOT_RADIUS = 2.0;

const DOT_ALPHA = 0.85;

const RESULT_COLORS = {
  'kill':      '#00e87a',  // Green
  'play':      '#9933ff',  // Purple
  'out':       '#ff3333',  // Red
  'blocked':   '#991111',  // Darker Red
  'block-out': '#991111',  // Darker Red (same bucket as blocked)
};

const TRAJ_LINE_ALPHA = 0.5;

const TRAJ_ARROW_ALPHA = 0.6;

const TRAJ_ARROW_SIZE = 7;

const TRAJ_CONTACT_DOT_RADIUS = 3;

const TRAJ_CONTACT_DOT_ALPHA = 0.7;

const FZ_X         = 3 / 15;       // normalized free-zone width  (0.2)
const FZ_Y         = 3 / 24;       // normalized free-zone height (0.125)
const COURT_NW     = 9 / 15;       // normalized court width      (0.6)
const COURT_NH     = 18 / 24;      // normalized court height     (0.75)
const NET_NY       = 0.5;          // net position in normalized Y
const HALF_NH      = COURT_NH / 2; // normalized half-court height (0.375)
const CANVAS_ASPECT = 15 / 24;     // canvas W:H ratio (~0.625)

const CONFIG = {
  analytics: {
    ui: {
      showHeatmap:      true,   // whether to render the density heatmap layer
      showAttackPoints: true,   // whether to draw per-attack colored dots
    },
    filters: {
      showBlockedAttacks: false, // when false, blocked/block-out excluded from heatmap density
    },
  },
  scout: {
    ui: {},
  },
};

// Full player list fetched once on load, used to populate filter dropdowns.
let players = [];

// Last fetched API responses, kept so toggles can re-render without a new fetch.
let _lastHeatPoints  = null;
let _lastTrajAttacks = null;

// Cached heatmap color buffer — invalidated when data or canvas size changes.
let _heatCache = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadPlayers();
  sizeCanvases();

  // Re-render both canvases on window resize to maintain aspect ratio.
  window.addEventListener('resize', () => {
    sizeCanvases();
    if (_lastHeatPoints)  renderHeatmap('heatmap-canvas', _lastHeatPoints);
    if (_lastTrajAttacks) renderTrajectoryMap('traj-canvas', _lastTrajAttacks);
  });

  injectToggleControls();

  await applyFilters();
  document.getElementById('apply-filters')?.addEventListener('click', applyFilters);
  document.getElementById('reset-filters')?.addEventListener('click', resetFilters);
});

function injectToggleControls() {
  const panel    = document.querySelector('.filter-panel');
  if (!panel) return;
  const applyBtn = document.getElementById('apply-filters');

  const wrapper = document.createElement('div');
  wrapper.className = 'filter-group';
  wrapper.style.cssText = 'margin-top:12px;border-top:1px solid var(--border,#1e3a55);padding-top:12px;';
  wrapper.innerHTML = `
    <div class="filter-label" style="margin-bottom:6px;text-transform:uppercase;font-size:10px;letter-spacing:.08em;color:var(--text-muted)">Display</div>

    <label class="toggle-row" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;font-size:12px;color:var(--text-primary,#d8e4f0);">
      <input type="checkbox" id="toggle-heatmap" checked style="accent-color:var(--accent,#006ecc);">
      Show Heatmap
    </label>

    <label class="toggle-row" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;font-size:12px;color:var(--text-primary,#d8e4f0);">
      <input type="checkbox" id="toggle-attack-points" checked style="accent-color:var(--accent,#006ecc);">
      Show Attack Points
    </label>

    <label class="toggle-row" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-primary,#d8e4f0);">
      <input type="checkbox" id="toggle-blocked" style="accent-color:var(--accent,#006ecc);">
      Include Blocked in Heatmap
    </label>
  `;

  if (applyBtn) panel.insertBefore(wrapper, applyBtn);
  else          panel.appendChild(wrapper);

  // All three toggles re-render from cached data — no network request needed.
  document.getElementById('toggle-heatmap').addEventListener('change', e => {
    CONFIG.analytics.ui.showHeatmap = e.target.checked;
    if (_lastHeatPoints) renderHeatmap('heatmap-canvas', _lastHeatPoints);
  });

  document.getElementById('toggle-attack-points').addEventListener('change', e => {
    CONFIG.analytics.ui.showAttackPoints = e.target.checked;
    if (_lastHeatPoints) renderHeatmap('heatmap-canvas', _lastHeatPoints);
  });

  document.getElementById('toggle-blocked').addEventListener('change', e => {
    CONFIG.analytics.filters.showBlockedAttacks = e.target.checked;
    // Blocked filter changes which points enter the density grid — must recompute.
    _heatCache = null;
    if (_lastHeatPoints) renderHeatmap('heatmap-canvas', _lastHeatPoints);
  });
}

function sizeCanvases() {
  ['heatmap-canvas', 'traj-canvas'].forEach(id => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const wrap   = canvas.parentElement;
    const availW = wrap.clientWidth  - 2;  // subtract border
    const availH = wrap.clientHeight - 2;
    let w, h;
    if (availH > 0 && availW / availH > CANVAS_ASPECT) {
      // height-constrained
      h = availH;
      w = Math.round(h * CANVAS_ASPECT);
    } else {
      // width-constrained
      w = availW;
      h = Math.round(w / CANVAS_ASPECT);
    }
    canvas.width        = w;
    canvas.height       = h;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
  });
}

async function loadPlayers() {
  const res = await fetch('/players/');
  players   = await res.json();

  const attackerSel = document.getElementById('f-attacker');
  const setterSel   = document.getElementById('f-setter');

  players.filter(p => p.role !== 'Setter').forEach(p => {
    attackerSel?.add(new Option(`#${p.number} ${p.surname}`, p.id));
  });
  players.filter(p => p.role === 'Setter').forEach(p => {
    setterSel?.add(new Option(`#${p.number} ${p.surname}`, p.id));
  });
}

function collectFilters() {
  const g = id => document.getElementById(id)?.value || '';
  return {
    attacker_id:      g('f-attacker'),
    setter_id:        g('f-setter'),
    rotation:         g('f-rotation'),
    first_touch_type: g('f-ft'),
    set_speed:        g('f-speed'),
    attack_type:      g('f-atype'),
    attack_zone:      g('f-zone'),
    kill:             g('f-kill'),
  };
}

async function applyFilters() {
  const filters = collectFilters();
  const params  = new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  );

  sizeCanvases();

  // Fetch all four endpoints in parallel.
  const [statsRes, heatRes, trajRes, setterRes] = await Promise.all([
    fetch(`/analytics/stats?${params}`),
    fetch(`/analytics/heatmap?${params}`),
    fetch(`/analytics/trajectories?${params}`),
    fetch('/analytics/setter-distribution'),
  ]);

  const [stats, heat, traj, setterDist] = await Promise.all([
    statsRes.json(), heatRes.json(), trajRes.json(), setterRes.json(),
  ]);

  // Cache responses so UI toggles can re-render without a new fetch.
  _lastHeatPoints  = heat;
  _lastTrajAttacks = traj;
  // New data means the heatmap density grid must be recomputed.
  _heatCache = null;

  renderStats(stats);
  renderZoneChart(stats.zone_distribution || {});
  renderTypeChart(stats.type_distribution || {});
  renderFTChart(stats.first_touch_stats   || {});
  renderHeatmap('heatmap-canvas', heat);
  renderTrajectoryMap('traj-canvas', traj);
  renderSetterDistribution(setterDist);
}

function resetFilters() {
  ['f-attacker', 'f-setter', 'f-rotation', 'f-ft', 'f-speed', 'f-atype', 'f-zone', 'f-kill'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const heatmapToggle  = document.getElementById('toggle-heatmap');
  const attackToggle   = document.getElementById('toggle-attack-points');
  const blockedToggle  = document.getElementById('toggle-blocked');

  if (heatmapToggle)  { heatmapToggle.checked  = true;  CONFIG.analytics.ui.showHeatmap      = true;  }
  if (attackToggle)   { attackToggle.checked    = true;  CONFIG.analytics.ui.showAttackPoints  = true;  }
  if (blockedToggle)  { blockedToggle.checked   = false; CONFIG.analytics.filters.showBlockedAttacks = false; }

  _heatCache = null;
  applyFilters();
}

function renderStats(stats) {
  set('stat-total',    stats.total    ?? 0);
  set('stat-kills',    stats.kills    ?? 0);
  set('stat-killpct',  stats.kill_pct  != null ? `${stats.kill_pct}%` : '—');
  set('stat-blocked',  stats.blocked  ?? 0);
  set('stat-blockpct', stats.block_pct != null ? `${stats.block_pct}%` : '—');
}

// Shorthand: set the textContent of an element by id.
function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderBarChart(containerId, data, fillClass = '') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';

  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const total   = entries.reduce((s, [, v]) => s + v, 0) || 1;

  if (!entries.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px 0">No data</div>';
    return;
  }

  entries.forEach(([key, val]) => {
    const pct = Math.round(val / total * 100);
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-key">${key}</span>
      <div class="bar-track"><div class="bar-fill ${fillClass}" style="width:${pct}%"></div></div>
      <span class="bar-val">${val}</span>
    `;
    el.appendChild(row);
  });
}

function renderZoneChart(data) { renderBarChart('zone-chart', data); }
function renderTypeChart(data) { renderBarChart('type-chart', data); }

function renderFTChart(ftStats) {
  const el = document.getElementById('ft-chart');
  if (!el) return;
  el.innerHTML = '';

  const entries = Object.entries(ftStats);
  if (!entries.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px 0">No data</div>';
    return;
  }

  // Sort by kill rate descending.
  entries.sort(([, a], [, b]) => (b.kills / (b.count || 1)) - (a.kills / (a.count || 1)));

  entries.forEach(([key, val]) => {
    const pct = val.count ? Math.round(val.kills / val.count * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-key">${key}</span>
      <div class="bar-track"><div class="bar-fill green" style="width:${pct}%"></div></div>
      <span class="bar-val">${pct}%</span>
    `;
    el.appendChild(row);
  });
}

function drawFullCourt(ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // Convert normalized scene coords to canvas pixels.
  const px  = nx => nx * W;
  const py  = ny => ny * H;
  // Convert court-relative coords (0=left edge, 1=right/bottom edge) to pixels.
  const cpx = nx => (FZ_X + nx * COURT_NW) * W;
  const cpy = ny => (FZ_Y + ny * COURT_NH) * H;

  const courtW = COURT_NW * W;
  const courtH = COURT_NH * H;
  const halfH  = HALF_NH  * H;
  const netY   = NET_NY   * H;

  // Scene background
  ctx.fillStyle = '#060910';
  ctx.fillRect(0, 0, W, H);

  // Free-zone tint (out-of-bounds areas around the court)
  ctx.fillStyle = '#090e14';
  ctx.fillRect(px(FZ_X), 0,             courtW, py(FZ_Y));       // top
  ctx.fillRect(px(FZ_X), py(1 - FZ_Y),  courtW, py(FZ_Y));       // bottom
  ctx.fillRect(0,         0,             px(FZ_X), H);            // left
  ctx.fillRect(px(1-FZ_X), 0,           px(FZ_X), H);            // right

  // Opponent half (top, dimmer)
  ctx.fillStyle = '#0a1825';
  ctx.fillRect(cpx(0), cpy(0), courtW, halfH);

  // Our half (bottom)
  ctx.fillStyle = '#0d1f35';
  ctx.fillRect(cpx(0), netY, courtW, halfH);

  // Alternating column fills for zone readability
  for (let col = 0; col < 3; col++) {
    const zx = cpx(col / 3);
    const zw = courtW / 3;

    // Our half — front row (near net)
    ctx.fillStyle = col % 2 === 0 ? '#0f2440' : '#0d2038';
    ctx.fillRect(zx, netY, zw, halfH / 2);
    // Our half — back row
    ctx.fillStyle = col % 2 === 0 ? '#0c1c30' : '#0b1a2c';
    ctx.fillRect(zx, netY + halfH / 2, zw, halfH / 2);

    // Opponent half (dimmer)
    ctx.fillStyle = '#0a1620';
    ctx.fillRect(zx, cpy(0), zw, halfH / 2);
    ctx.fillStyle = '#091420';
    ctx.fillRect(zx, cpy(0) + halfH / 2, zw, halfH / 2);
  }

  // Zone grid lines — our half
  ctx.strokeStyle = '#1e4a7a';
  ctx.lineWidth   = 1;
  for (let col = 1; col < 3; col++) {
    const lx = cpx(col / 3);
    ctx.beginPath(); ctx.moveTo(lx, netY); ctx.lineTo(lx, netY + halfH); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(cpx(0), netY + halfH / 2); ctx.lineTo(cpx(1), netY + halfH / 2); ctx.stroke();

  // Zone grid lines — opponent half (dimmer)
  ctx.strokeStyle = '#112234';
  ctx.lineWidth   = 1;
  for (let col = 1; col < 3; col++) {
    const lx = cpx(col / 3);
    ctx.beginPath(); ctx.moveTo(lx, cpy(0)); ctx.lineTo(lx, cpy(0) + halfH); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(cpx(0), cpy(0) + halfH / 2); ctx.lineTo(cpx(1), cpy(0) + halfH / 2); ctx.stroke();

  // Attack lines (dashed) — 3-metre lines
  ctx.setLineDash([5, 3]);
  ctx.strokeStyle = '#2a6aaa'; ctx.lineWidth = 1.5;
  const ourAtY = netY + halfH / 3;
  ctx.beginPath(); ctx.moveTo(cpx(0), ourAtY); ctx.lineTo(cpx(1), ourAtY); ctx.stroke();
  ctx.strokeStyle = '#122234'; ctx.lineWidth = 1;
  const oppAtY = netY - halfH / 3;
  ctx.beginPath(); ctx.moveTo(cpx(0), oppAtY); ctx.lineTo(cpx(1), oppAtY); ctx.stroke();
  ctx.setLineDash([]);

  // Court outer border
  ctx.strokeStyle = '#2a6aaa'; ctx.lineWidth = 2;
  ctx.strokeRect(cpx(0) + 1, cpy(0) + 1, courtW - 2, courtH - 2);

  // Endline extensions into free zone (subtle orientation cue)
  ctx.strokeStyle = '#0e2035'; ctx.lineWidth = 1;
  [cpy(0), cpy(1)].forEach(ey => {
    ctx.beginPath(); ctx.moveTo(0,      ey); ctx.lineTo(cpx(0), ey); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cpx(1), ey); ctx.lineTo(W,      ey); ctx.stroke();
  });

  // Net
  ctx.strokeStyle = '#006ecc'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cpx(0), netY); ctx.lineTo(cpx(1), netY); ctx.stroke();

  // Net posts
  ctx.fillStyle = '#006ecc';
  [cpx(0), cpx(1)].forEach(nx => ctx.fillRect(nx - 3, netY - 5, 6, 10));

  // Zone labels — our half
  const ourZones = [
    { id: 4, col: 0, row: 0 }, { id: 3, col: 1, row: 0 }, { id: 2, col: 2, row: 0 },
    { id: 5, col: 0, row: 1 }, { id: 6, col: 1, row: 1 }, { id: 1, col: 2, row: 1 },
  ];
  const fontSize = Math.max(9, Math.round(courtW / 18));
  ctx.font         = `700 ${fontSize}px 'Barlow Condensed', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#2a6aaa';
  ourZones.forEach(z => {
    ctx.fillText(`Z${z.id}`, cpx((z.col + 0.5) / 3), netY + (z.row + 0.5) * halfH / 2);
  });

  // Zone labels — opponent half (dimmer)
  const oppZones = [
    { id: 1, col: 0, row: 0 }, { id: 6, col: 1, row: 0 }, { id: 5, col: 2, row: 0 },
    { id: 2, col: 0, row: 1 }, { id: 3, col: 1, row: 1 }, { id: 4, col: 2, row: 1 },
  ];
  ctx.fillStyle = '#122030';
  oppZones.forEach(z => {
    ctx.fillText(`Z${z.id}`, cpx((z.col + 0.5) / 3), cpy(0) + (z.row + 0.5) * halfH / 2);
  });

  // OUT labels in free-zone corners
  const outSize = Math.max(7, Math.round(courtW / 28));
  ctx.font      = `600 ${outSize}px 'Barlow Condensed', sans-serif`;
  ctx.fillStyle = '#0e2030';
  ctx.fillText('OUT', px(FZ_X / 2),     py(FZ_Y / 2));
  ctx.fillText('OUT', px(1-FZ_X / 2),   py(FZ_Y / 2));
  ctx.fillText('OUT', px(FZ_X / 2),     py(1-FZ_Y / 2));
  ctx.fillText('OUT', px(1-FZ_X / 2),   py(1-FZ_Y / 2));

  // Side labels (rotated)
  const sideSize = Math.max(7, Math.round(courtW / 24));
  ctx.font = `700 ${sideSize}px 'Barlow Condensed', sans-serif`;

  ctx.save();
  ctx.translate(px(FZ_X / 2), netY + halfH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#1e3a55';
  ctx.fillText(typeof COURT_LABELS !== 'undefined' ? COURT_LABELS.attack_team : 'ATTACK TEAM', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(px(FZ_X / 2), cpy(0) + halfH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#0e2030';
  ctx.fillText(typeof COURT_LABELS !== 'undefined' ? COURT_LABELS.defense_team : 'DEFENSE TEAM', 0, 0);
  ctx.restore();
}

/**
 * Returns the display color hex for a given attack point object.
 * Works with both API shapes:
 *   - heatmap endpoint  → { result: "kill"|"play"|"out"|"blocked"|"block-out" }
 *   - trajectory endpoint (to_dict) → { kill: bool, blocked: bool, out: bool, block_out: bool }
 */
function resultColor(point) {
  if (point.result) return RESULT_COLORS[point.result] ?? RESULT_COLORS['play'];
  if (point.kill)                         return RESULT_COLORS['kill'];
  if (point.blocked || point.block_out)   return RESULT_COLORS['blocked'];
  if (point.out)                          return RESULT_COLORS['out'];
  return RESULT_COLORS['play'];
}

// Alias used by the trajectory renderer.
function attackColor(point) { return resultColor(point); }

/**
 * Maps a normalized density value t ∈ [0, 1] to an RGB triple.
 * Palette: deep blue (sparse) → cyan → green → yellow → hot red (dense).
 */
function heatColorRGB(t) {
  const stops = [
    [0.00, [20,  80,  200]],  // deep blue    (very sparse)
    [0.25, [10,  190, 230]],  // cyan
    [0.50, [40,  210, 80]],   // green
    [0.75, [230, 190, 20]],   // yellow-orange
    [1.00, [255, 30,  0]],    // hot red      (very dense)
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [lerp(c0[0],c1[0],f), lerp(c0[1],c1[1],f), lerp(c0[2],c1[2],f)];
    }
  }
  return [255, 30, 0];
}

// Legacy string form kept for any future callers.
function heatColor(t) {
  const [r, g, b] = heatColorRGB(t);
  return `rgb(${r},${g},${b})`;
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function renderHeatmap(canvasId, allPoints) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFullCourt(ctx);

  if (!CONFIG.analytics.ui.showHeatmap && !CONFIG.analytics.ui.showAttackPoints) return;

  const showBlocked = CONFIG.analytics.filters.showBlockedAttacks;

  // When showBlocked is false, remove blocked/block-out from the density input.
  // They still appear as dots if showAttackPoints is true.
  const heatPoints = allPoints.filter(p => {
    const r = p.result || '';
    const isBlocked = r === 'blocked' || r === 'block-out' || p.blocked || p.block_out;
    return showBlocked || !isBlocked;
  });

  const W = canvas.width, H = canvas.height;

  /* ── 1 & 2 & 3: density grid → percentile normalize → RGBA buffer ──*/
  if (CONFIG.analytics.ui.showHeatmap && heatPoints.length > 0) {

    // Cache key encodes point positions and canvas size.
    // The cache is also cleared externally in applyFilters() and the blocked toggle.
    const cacheKey = `${W}x${H}|${heatPoints.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(';')}`;

    let colorData;
    if (_heatCache && _heatCache.key === cacheKey) {
      // Re-use previously computed color buffer.
      colorData = _heatCache.colorData;
    } else {
      // Work at reduced resolution for speed; grid is upscaled at draw time.
      const GW   = Math.ceil(W * HEATMAP_GRID_SCALE);
      const GH   = Math.ceil(H * HEATMAP_GRID_SCALE);
      const grid = new Float32Array(GW * GH);  // Float32 accumulates without clipping

      // Gaussian sigma in grid pixels, derived from HEATMAP_SIGMA_FACTOR.
      const SIGMA = Math.round(Math.min(GW, GH) * HEATMAP_SIGMA_FACTOR);
      // Cut the kernel at 3σ — contribution beyond this is negligible.
      const REACH = Math.ceil(SIGMA * 3);

      // Precompute 1-D Gaussian weights for the separable convolution.
      const gauss1D = new Float32Array(2 * REACH + 1);
      for (let d = -REACH; d <= REACH; d++) {
        gauss1D[d + REACH] = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
      }

      // Separable 2-D Gaussian: horizontal pass writes into tmp, vertical pass
      // reads tmp and accumulates into grid.  O(n · REACH) instead of O(n · REACH²).
      const tmp = new Float32Array(GW * GH);

      // Horizontal pass: spread each point along X.
      heatPoints.forEach(({ x, y }) => {
        const gx0 = Math.round(x * GW);
        const gy0 = Math.round(y * GH);
        for (let dx = -REACH; dx <= REACH; dx++) {
          const gx = gx0 + dx;
          if (gx < 0 || gx >= GW) continue;
          tmp[gy0 * GW + gx] += gauss1D[dx + REACH];
        }
      });

      // Vertical pass: spread the horizontal result along Y.
      for (let gy = 0; gy < GH; gy++) {
        for (let gx = 0; gx < GW; gx++) {
          const v = tmp[gy * GW + gx];
          if (v === 0) continue;
          for (let dy = -REACH; dy <= REACH; dy++) {
            const gy2 = gy + dy;
            if (gy2 < 0 || gy2 >= GH) continue;
            grid[gy2 * GW + gx] += v * gauss1D[dy + REACH];
          }
        }
      }

      // Percentile normalization: collect non-zero cells, sort, pick ceiling.
      // Only the top (1 - HEATMAP_PERCENTILE) fraction of cells can reach t=1 (red).
      const nonZero = Array.from(grid).filter(v => v > 0);
      nonZero.sort((a, b) => a - b);
      const ceiling = nonZero[Math.floor(nonZero.length * HEATMAP_PERCENTILE)]
                   || nonZero[nonZero.length - 1]
                   || 1;

      // Build the RGBA color buffer at grid resolution.
      colorData = new Uint8ClampedArray(GW * GH * 4);
      for (let i = 0; i < GW * GH; i++) {
        const t = Math.min(grid[i] / ceiling, 1);
        if (t < HEATMAP_NOISE_FLOOR) continue;  // below noise floor → fully transparent
        const [r, g, b] = heatColorRGB(t);
        colorData[i * 4]     = r;
        colorData[i * 4 + 1] = g;
        colorData[i * 4 + 2] = b;
        // Alpha ramp: HEATMAP_ALPHA_MIN at t=0, HEATMAP_ALPHA_MIN+RANGE at t=1.
        colorData[i * 4 + 3] = Math.round(HEATMAP_ALPHA_MIN + t * HEATMAP_ALPHA_RANGE);
      }

      _heatCache = { key: cacheKey, colorData, GW, GH };
    }

    /* ── 4: blit with blur for smooth edges ─────────────────────────*/
    const { GW, GH } = _heatCache;
    const imgData    = new ImageData(colorData, GW, GH);
    const offB       = new OffscreenCanvas(GW, GH);
    offB.getContext('2d').putImageData(imgData, 0, 0);

    // Blur radius in canvas pixels, derived from HEATMAP_BLUR_FACTOR.
    const blurPx = Math.round(Math.min(W, H) * HEATMAP_BLUR_FACTOR);
    ctx.save();
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(offB, 0, 0, W, H);  // upscale grid → full canvas
    ctx.filter = 'none';
    ctx.restore();
  }

  /* ── 5: attack point dots, colored by result ────────────────────*/
  if (CONFIG.analytics.ui.showAttackPoints && allPoints.length > 0) {
    allPoints.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle   = resultColor(p);
      ctx.globalAlpha = DOT_ALPHA;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}

function renderTrajectoryMap(canvasId, attacks) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFullCourt(ctx);

  const W = canvas.width, H = canvas.height;

  // Draw trajectory lines with arrowheads.
  attacks.forEach(a => {
    if (a.contact_x == null || a.trajectory_end_x == null) return;
    const color = attackColor(a);

    const x1 = a.contact_x        * W;
    const y1 = a.contact_y        * H;
    const x2 = a.trajectory_end_x * W;
    const y2 = a.trajectory_end_y * H;

    // Line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = TRAJ_LINE_ALPHA;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Arrowhead at landing point
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const sz    = TRAJ_ARROW_SIZE;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - sz * Math.cos(angle - 0.42), y2 - sz * Math.sin(angle - 0.42));
    ctx.lineTo(x2 - sz * Math.cos(angle + 0.42), y2 - sz * Math.sin(angle + 0.42));
    ctx.closePath();
    ctx.fillStyle   = color;
    ctx.globalAlpha = TRAJ_ARROW_ALPHA;
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Draw contact-point dots on top of lines.
  attacks.forEach(a => {
    if (a.contact_x == null) return;
    ctx.beginPath();
    ctx.arc(a.contact_x * W, a.contact_y * H, TRAJ_CONTACT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle   = attackColor(a);
    ctx.globalAlpha = TRAJ_CONTACT_DOT_ALPHA;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function renderSetterDistribution(setterDist) {
  const container = document.getElementById('setter-dist-container');
  if (!container) return;
  container.innerHTML = '';

  if (!setterDist.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">No setter data yet.</div>';
    return;
  }

  setterDist.forEach(setter => {
    const card = document.createElement('div');
    card.className = 'setter-card';

    const attEntries  = Object.entries(setter.attacker_distribution).sort(([,a],[,b]) => b - a);
    const zoneEntries = Object.entries(setter.zone_distribution).sort(([,a],[,b]) => b - a);
    const total       = setter.total_sets;

    const makeRows = (entries, cls = '') => entries.map(([k, v]) => {
      const pct = Math.round(v / total * 100);
      return `<div class="bar-row">
        <span class="bar-key">${k}</span>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
        <span class="bar-val">${pct}%</span>
      </div>`;
    }).join('') || '<span style="color:var(--text-muted);font-size:11px">—</span>';

    card.innerHTML = `
      <div class="setter-card-header">
        <span class="setter-card-name">${setter.setter_name}</span>
        <span class="setter-card-count">${total} sets</span>
      </div>
      <div class="setter-charts-row">
        <div>
          <div class="setter-sub-title">Attacker Distribution</div>
          <div class="bar-chart">${makeRows(attEntries)}</div>
        </div>
        <div>
          <div class="setter-sub-title">Zone Distribution</div>
          <div class="bar-chart">${makeRows(zoneEntries, 'green')}</div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}
