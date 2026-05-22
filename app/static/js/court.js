/*
 * court.js — SVG volleyball court renderer and step-based interaction.
 *
 * Coordinate model: full scene (court + 3m free zone each side)
 *   Width:  9m court + 6m free = 15m total → FZ_X = 3/15 = 0.200
 *   Height: 18m court + 6m free = 24m total → FZ_Y = 3/24 = 0.125
 *   Net at y = 0.5; our half = bottom, opponent half = top.
 */

const Court = (() => {
  const COURT_W = 9, COURT_H = 18, FREE = 3;
  const TOTAL_W = COURT_W + FREE * 2;
  const TOTAL_H = COURT_H + FREE * 2;

  const FZ_X       = FREE / TOTAL_W;
  const FZ_Y       = FREE / TOTAL_H;
  const COURT_NW   = COURT_W / TOTAL_W;
  const COURT_NH   = COURT_H / TOTAL_H;
  const NET_Y      = 0.5;
  const HALF_H     = COURT_NH / 2;
  const ATLINE_OFFSET = HALF_H / 3;
  const ROW_H      = [1 / 3, 2 / 3];

  function rowTopOffset(row) {
    let off = 0;
    for (let r = 0; r < row; r++) off += ROW_H[r];
    return off;
  }

  const OUR_ZONES = [
    { id: 4, col: 0, row: 0 }, { id: 3, col: 1, row: 0 }, { id: 2, col: 2, row: 0 },
    { id: 5, col: 0, row: 1 }, { id: 6, col: 1, row: 1 }, { id: 1, col: 2, row: 1 },
  ];

  const OPP_ZONES = [
    { id: 1, col: 0, row: 1 }, { id: 6, col: 1, row: 1 }, { id: 5, col: 2, row: 1 },
    { id: 2, col: 0, row: 0 }, { id: 3, col: 1, row: 0 }, { id: 4, col: 2, row: 0 },
  ];

  let svg = null;
  let W = 0, H = 0;
  let totalRect = {};

  let step = 0;
  const ALL_STEPS = ['reception', 'set', 'approach', 'contact', 'trajectory'];
  let STEPS = [...ALL_STEPS];
  const points = {};

  let onStepChange = null;
  let onComplete   = null;

  function toSVG(nx, ny) {
    return { x: totalRect.x + nx * totalRect.w, y: totalRect.y + ny * totalRect.h };
  }

  function toNorm(svgX, svgY) {
    return { x: (svgX - totalRect.x) / totalRect.w, y: (svgY - totalRect.y) / totalRect.h };
  }

  function courtOrigin() { return toSVG(FZ_X, FZ_Y); }
  function courtSize()   { return { w: totalRect.w * COURT_NW, h: totalRect.h * COURT_NH }; }

  function init(svgEl, callbacks = {}) {
    svg          = svgEl;
    onStepChange = callbacks.onStepChange || null;
    onComplete   = callbacks.onComplete   || null;
    resize();
    window.addEventListener('resize', resize);
    svg.addEventListener('click', handleClick);
  }

  function resize() {
    const parent = svg.parentElement;
    W = parent.clientWidth;
    H = parent.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width',  W);
    svg.setAttribute('height', H);

    const PAD   = 24;
    const ratio = TOTAL_W / TOTAL_H;
    const aW    = W - PAD * 2;
    const aH    = H - PAD * 2;
    let tW, tH;
    if (aW / aH < ratio) { tW = aW; tH = tW / ratio; }
    else                  { tH = aH; tW = tH * ratio; }

    totalRect = { x: (W - tW) / 2, y: (H - tH) / 2, w: tW, h: tH };
    drawStatic();
    redrawPoints();
  }

  function ourZoneRect(zone, co, cs, halfH_px) {
    const colW = cs.w / 3;
    return {
      x: co.x + zone.col * colW,
      y: (co.y + halfH_px) + rowTopOffset(zone.row) * halfH_px,
      w: colW,
      h: ROW_H[zone.row] * halfH_px,
    };
  }

  function oppZoneRect(zone, co, cs, halfH_px) {
    const colW = cs.w / 3;
    return {
      x: co.x + zone.col * colW,
      y: co.y + (1 - rowTopOffset(zone.row) - ROW_H[zone.row]) * halfH_px,
      w: colW,
      h: ROW_H[zone.row] * halfH_px,
    };
  }

  function drawStatic() {
    const old = svg.querySelector('#court-static');
    if (old) old.remove();

    const g        = svgG('court-static');
    const co       = courtOrigin();
    const cs       = courtSize();
    const halfH_px = cs.h / 2;
    const netY     = co.y + halfH_px;

    g.appendChild(rect(0, 0, W, H, '#080c12', 0, null));
    g.appendChild(rect(totalRect.x, totalRect.y, totalRect.w, totalRect.h, '#0a1018', 0, null));
    g.appendChild(rect(co.x, co.y, cs.w, halfH_px, '#0b1a2a', 0, null));
    g.appendChild(rect(co.x, netY,  cs.w, halfH_px, '#0d1f35', 0, null));

    OUR_ZONES.forEach(zone => {
      const zr = ourZoneRect(zone, co, cs, halfH_px);
      g.appendChild(rect(zr.x, zr.y, zr.w, zr.h, zone.row === 0 ? '#0f2540' : '#0c1c30', 0, null));
    });
    OPP_ZONES.forEach(zone => {
      const zr = oppZoneRect(zone, co, cs, halfH_px);
      g.appendChild(rect(zr.x, zr.y, zr.w, zr.h, zone.row === 0 ? '#0c1828' : '#0a1520', 0, null));
    });

    OUR_ZONES.forEach(zone => {
      const zr = ourZoneRect(zone, co, cs, halfH_px);
      g.appendChild(rect(zr.x, zr.y, zr.w, zr.h, 'none', 1, '#1e4a7a'));
    });
    OPP_ZONES.forEach(zone => {
      const zr = oppZoneRect(zone, co, cs, halfH_px);
      g.appendChild(rect(zr.x, zr.y, zr.w, zr.h, 'none', 1, '#132a42'));
    });

    const ourAtL = line(co.x, netY + halfH_px / 3, co.x + cs.w, netY + halfH_px / 3, '#2a6aaa', 1.5);
    ourAtL.setAttribute('stroke-dasharray', '7 4');
    g.appendChild(ourAtL);

    const oppAtL = line(co.x, netY - halfH_px / 3, co.x + cs.w, netY - halfH_px / 3, '#1a3a5a', 1);
    oppAtL.setAttribute('stroke-dasharray', '7 4');
    g.appendChild(oppAtL);

    g.appendChild(rect(co.x, co.y, cs.w, cs.h, 'none', 2, '#2a6aaa'));
    g.appendChild(line(co.x, netY, co.x + cs.w, netY, '#3a8aee', 3));
    [co.x, co.x + cs.w].forEach(px => g.appendChild(rect(px - 3, netY - 4, 6, 8, '#4a9aff', 0, null)));
    g.appendChild(rect(totalRect.x, totalRect.y, totalRect.w, totalRect.h, 'none', 1, '#12283a'));
    [co.x, co.x + cs.w].forEach(sx => {
      g.appendChild(line(sx, totalRect.y, sx, co.y, '#0f2035', 1));
      g.appendChild(line(sx, co.y + cs.h, sx, totalRect.y + totalRect.h, '#0f2035', 1));
    });
    [co.y, co.y + cs.h].forEach(ey => {
      g.appendChild(line(totalRect.x, ey, co.x, ey, '#0f2035', 1));
      g.appendChild(line(co.x + cs.w, ey, totalRect.x + totalRect.w, ey, '#0f2035', 1));
    });

    OUR_ZONES.forEach(zone => {
      const zr = ourZoneRect(zone, co, cs, halfH_px);
      g.appendChild(text(zr.x + zr.w / 2, zr.y + zr.h / 2, `Z${zone.id}`, '#2a6aaa', Math.max(9, cs.w / 28), 'Barlow Condensed, sans-serif', '700'));
    });
    OPP_ZONES.forEach(zone => {
      const zr = oppZoneRect(zone, co, cs, halfH_px);
      g.appendChild(text(zr.x + zr.w / 2, zr.y + zr.h / 2, `Z${zone.id}`, '#1a3a5a', Math.max(8, cs.w / 32), 'Barlow Condensed, sans-serif', '600'));
    });

    svg.insertBefore(g, svg.firstChild);
  }

  function redrawPoints() {
    const old = svg.querySelector('#court-dynamic');
    if (old) old.remove();

    const g = svgG('court-dynamic');

    if (points.approach && points.contact) {
      const a = toSVG(points.approach.x, points.approach.y);
      const c = toSVG(points.contact.x,  points.contact.y);
      g.appendChild(arrowLine(a.x, a.y, c.x, c.y, '#ffaa00', 2));
    }
    if (points.set && points.contact) {
      const s = toSVG(points.set.x,     points.set.y);
      const c = toSVG(points.contact.x, points.contact.y);
      g.appendChild(setCurve(s, c, '#00d4ff'));
    }
    if (points.contact && points.trajectory) {
      const c = toSVG(points.contact.x,    points.contact.y);
      const t = toSVG(points.trajectory.x, points.trajectory.y);
      g.appendChild(arrowLine(c.x, c.y, t.x, t.y, '#00ff88', 2.5));
    }

    if (points.reception)  drawMarker(g, points.reception,  '#ff6699', 'R');
    if (points.set)        drawMarker(g, points.set,        '#00d4ff', 'S');
    if (points.approach)   drawMarker(g, points.approach,   '#ffaa00', 'A');
    if (points.contact)    drawMarker(g, points.contact,    '#ffdd00', 'X');
    if (points.trajectory) drawMarker(g, points.trajectory, '#00ff88', '▸');

    svg.appendChild(g);
  }

  function drawMarker(g, norm, color, label) {
    const p = toSVG(norm.x, norm.y);
    g.appendChild(circle(p.x, p.y, 11, 'none', 1.5, color + '55'));
    g.appendChild(circle(p.x, p.y, 5,  color,  0,   null));
    g.appendChild(text(p.x + 10, p.y - 9, label, color, 10, 'Barlow Condensed, sans-serif', '700'));
  }

  function clampToScene(norm) {
    return { x: Math.max(0, Math.min(1, norm.x)), y: Math.max(0, Math.min(1, norm.y)) };
  }

  function handleClick(e) {
    const bounds = svg.getBoundingClientRect();
    const norm   = clampToScene(toNorm(e.clientX - bounds.left, e.clientY - bounds.top));

    points[STEPS[step]] = norm;
    redrawPoints();

    const prev = step;
    step = Math.min(step + 1, STEPS.length - 1);
    if (onStepChange) onStepChange(step, STEPS[step]);
    if (prev === STEPS.length - 1 && onComplete) onComplete({ ...points });
  }

  function reset() {
    Object.keys(points).forEach(k => delete points[k]);
    step = 0;
    redrawPoints();
    if (onStepChange) onStepChange(0, STEPS[0]);
  }

  function setActiveSteps(activeList) {
    STEPS = ALL_STEPS.filter(s => activeList.includes(s));
    step  = 0;
    Object.keys(points).forEach(k => delete points[k]);
    redrawPoints();
    if (onStepChange) onStepChange(0, STEPS[0]);
  }

  function renderAttackOverlay(attacks) {
    const old = svg.querySelector('#court-overlay');
    if (old) old.remove();

    const g = svgG('court-overlay');
    g.setAttribute('opacity', '0.75');

    attacks.forEach(a => {
      const color = a.kill ? '#00ff88' : (a.blocked ? '#ff4466' : (a.out ? '#f5a623' : '#4a9aff'));
      if (a.contact_x != null && a.trajectory_end_x != null) {
        const c   = toSVG(a.contact_x, a.contact_y);
        const t   = toSVG(a.trajectory_end_x, a.trajectory_end_y);
        const arr = arrowLine(c.x, c.y, t.x, t.y, color, 1.5);
        arr.setAttribute('opacity', '0.55');
        g.appendChild(arr);
      }
      if (a.contact_x != null) {
        const c   = toSVG(a.contact_x, a.contact_y);
        const dot = circle(c.x, c.y, 4, color, 0, null);
        dot.setAttribute('opacity', '0.65');
        g.appendChild(dot);
      }
    });

    svg.appendChild(g);
  }

  function getPoints()   { return { ...points }; }
  function getStep()     { return step; }
  function getStepName() { return STEPS[step]; }

  /* SVG helpers */
  function svgG(id) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (id) g.id = id;
    return g;
  }

  function el(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => { if (v !== null) e.setAttribute(k, v); });
    return e;
  }

  function rect(x, y, w, h, fill, sw, stroke) {
    return el('rect', { x, y, width: w, height: h, fill, 'stroke-width': sw, stroke });
  }

  function circle(cx, cy, r, fill, sw, stroke) {
    return el('circle', { cx, cy, r, fill, 'stroke-width': sw, stroke });
  }

  function line(x1, y1, x2, y2, stroke, sw) {
    return el('line', { x1, y1, x2, y2, stroke, 'stroke-width': sw });
  }

  function text(x, y, content, fill, size, fontFamily, fontWeight) {
    const t = el('text', { x, y, fill, 'font-size': size, 'font-family': fontFamily, 'font-weight': fontWeight, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    t.textContent = content;
    return t;
  }

  function setCurve(s, c, color) {
    const midX = (s.x + c.x) / 2, midY = (s.y + c.y) / 2;
    const dx = c.x - s.x, dy = c.y - s.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const d   = `M ${s.x} ${s.y} Q ${midX - dy / len * len * 0.3} ${midY + dx / len * len * 0.3 - len * 0.25} ${c.x} ${c.y}`;
    return el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': '5 3', opacity: 0.9 });
  }

  function arrowLine(x1, y1, x2, y2, color, sw) {
    const g     = svgG(null);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const sz    = 9;
    g.appendChild(line(x1, y1, x2, y2, color, sw));
    g.appendChild(el('polygon', {
      points: `${x2},${y2} ${x2 - sz * Math.cos(angle - 0.42)},${y2 - sz * Math.sin(angle - 0.42)} ${x2 - sz * Math.cos(angle + 0.42)},${y2 - sz * Math.sin(angle + 0.42)}`,
      fill: color,
    }));
    return g;
  }

  const constants = { FZ_X, FZ_Y, COURT_NW, COURT_NH, NET_Y, HALF_H, ATLINE_OFFSET };

  return { init, reset, getPoints, getStep, getStepName, renderAttackOverlay, resize, constants, setActiveSteps };
})();
