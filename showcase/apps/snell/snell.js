// Snell: one beam of white light crosses your desktop. Every window carries a
// glass prism or a mirror at its centre, and the beam is only visible through
// windows. Each window broadcasts its screen rect and element; every window
// traces the same light path from that shared list, so no window is in charge.

const params = new URLSearchParams(location.search);
const id = Math.random().toString(36).slice(2, 10);
const chan = 'BroadcastChannel' in window ? new BroadcastChannel('snell') : null;
const peers = new Map();
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');

const WAVES = [400, 435, 470, 505, 540, 575, 610, 645, 680];
const RGB = WAVES.map(waveRGB);
// Sensor positions come from scripts/levels.mjs: it places reference windows,
// traces the real dispersion and puts each sensor where its colour lands.
const LEVELS = [
  { name: 'Split', hint: 'A white beam enters from the left edge of your screen. Move a window into it: the prism splits the light. Rotate with the wheel, a drag, or the arrow keys, until the colours land on their sensors.', src: [0, 0.32], sensors: [[0.736, 0.861, 'red'], [0.727, 0.883, 'green'], [0.699, 0.944, 'violet']] },
  { name: 'Down', hint: 'The sensors are below the beam. Make one window a mirror (press M) to turn the light down, and catch it in a prism window.', src: [0, 0.2], sensors: [[0.448, 0.943, 'red'], [0.458, 0.931, 'green'], [0.486, 0.888, 'violet']] },
  { name: 'Up', hint: 'The beam enters low and the sensors are high. Mirror it up, then split it.', src: [0, 0.88], sensors: [[0.411, 0.064, 'red'], [0.423, 0.085, 'green'], [0.473, 0.196, 'violet']] },
];
const BANDS = { red: [620, 700], green: [490, 560], violet: [390, 450] };

let level = clampLevel(+(params.get('level') ?? localStore('snell.level') ?? 0));
let kind = params.get('kind') || (params.has('pane') ? 'prism' : 'prism');
let rot = +(params.get('rot') || 0);
let forced = params.get('rect') ? params.get('rect').split(',').map(Number) : null;
let dpr = Math.min(2, window.devicePixelRatio || 1);
let won = false;
let time = 0;

function localStore(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {}
  return null;
}
function clampLevel(i) { return Math.max(0, Math.min(LEVELS.length - 1, i | 0)); }

function readRect() {
  if (forced) return { x: forced[0], y: forced[1], w: forced[2], h: forced[3] };
  const side = Math.max(0, (outerWidth - innerWidth) / 2);
  const top = Math.max(0, outerHeight - innerHeight - side);
  return { x: screenX + side, y: screenY + top, w: innerWidth, h: innerHeight };
}
function screenRect() {
  if (params.get('screen')) { const [x, y, w, h] = params.get('screen').split(',').map(Number); return { x, y, w, h }; }
  return { x: screen.availLeft ?? 0, y: screen.availTop ?? 0, w: screen.availWidth, h: screen.availHeight };
}
const S = screenRect();

// ----- sharing ---------------------------------------------------------------

let me = { id, rect: readRect(), kind, rot, visible: true, level };
function announce() {
  me = { id, rect: readRect(), kind, rot, visible: document.visibilityState === 'visible', level, t: Date.now() };
  chan?.postMessage(me);
}
if (chan) chan.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'level') { setLevel(m.level, false); return; }
  if (m.type === 'bye') { peers.delete(m.id); return; }
  peers.set(m.id, { ...m, seen: Date.now() });
};
addEventListener('pagehide', () => chan?.postMessage({ type: 'bye', id }));
setInterval(() => { if (document.visibilityState !== 'visible') announce(); }, 300);

function setLevel(i, broadcast = true) {
  level = clampLevel(i);
  won = false;
  localStore('snell.level', String(level));
  if (broadcast) chan?.postMessage({ type: 'level', level });
  showHint();
}

function windows() {
  const now = Date.now();
  const list = [me];
  for (const [k, p] of peers) {
    if (now - p.seen > 1200) { peers.delete(k); continue; }
    list.push(p);
  }
  return list.filter((w) => w.visible);
}

// ----- optics ----------------------------------------------------------------

// Cauchy dispersion, exaggerated so a single prism fans the spectrum widely.
const index = (nm) => 1.45 + 0.021 / ((nm / 1000) ** 2);

function element(w) {
  const cx = w.rect.x + w.rect.w / 2, cy = w.rect.y + w.rect.h / 2;
  const R = Math.min(w.rect.w, w.rect.h) * 0.3;
  if (w.kind === 'clear') return { kind: 'clear', cx, cy, edges: [] };
  if (w.kind === 'mirror') {
    const a = w.rot + Math.PI / 4;
    const dx = Math.cos(a) * R * 1.25, dy = Math.sin(a) * R * 1.25;
    return { kind: 'mirror', cx, cy, edges: [[cx - dx, cy - dy, cx + dx, cy + dy]] };
  }
  const pts = [0, 1, 2].map((k) => {
    const a = w.rot - Math.PI / 2 + (k * 2 * Math.PI) / 3;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
  });
  return { kind: 'prism', cx, cy, pts, edges: [0, 1, 2].map((k) => [...pts[k], ...pts[(k + 1) % 3]]) };
}

function segHit(ox, oy, dx, dy, x1, y1, x2, y2) {
  const ex = x2 - x1, ey = y2 - y1;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - ox) * ey - (y1 - oy) * ex) / den;
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
  if (t <= 1e-6 || u < 0 || u > 1) return null;
  let nx = ey, ny = -ex;
  const L = Math.hypot(nx, ny);
  return { t, nx: nx / L, ny: ny / L };
}

function trace(elements, lv) {
  const segs = [];
  const hits = new Set();
  const sensors = lv.sensors.map(([fx, fy, band]) => ({ x: S.x + fx * S.w, y: S.y + fy * S.h, band }));
  const sx = S.x + lv.src[0] * S.w, sy = S.y + lv.src[1] * S.h;
  const far = 4 * (S.w + S.h);
  WAVES.forEach((nm, wi) => {
    let ox = sx, oy = sy, dx = 1, dy = 0, inside = -1;
    const n = index(nm);
    for (let bounce = 0; bounce < 40; bounce++) {
      let best = null, bestEl = -1;
      elements.forEach((el, k) => {
        for (const e of el.edges) {
          const h = segHit(ox, oy, dx, dy, ...e);
          if (h && (!best || h.t < best.t)) { best = h; bestEl = k; }
        }
      });
      const t = best ? best.t : far;
      const ex = ox + dx * t, ey = oy + dy * t;
      segs.push([ox, oy, ex, ey, wi]);
      for (const s of sensors) {
        if (hits.has(s)) continue;
        const [lo, hi] = BANDS[s.band];
        if (nm < lo || nm > hi) continue;
        const px = s.x - ox, py = s.y - oy;
        const along = px * dx + py * dy;
        if (along < 0 || along > t) continue;
        if (Math.abs(px * dy - py * dx) < 12) hits.add(s);
      }
      if (!best) break;
      const el = elements[bestEl];
      let nx = best.nx, ny = best.ny;
      if (el.kind === 'mirror') {
        const d = dx * nx + dy * ny;
        dx -= 2 * d * nx; dy -= 2 * d * ny;
      } else {
        // Outward normal: the triangle's centre is on the other side.
        if ((ex - el.cx) * nx + (ey - el.cy) * ny < 0) { nx = -nx; ny = -ny; }
        const entering = dx * nx + dy * ny < 0;
        const n1 = entering ? 1 : n, n2 = entering ? n : 1;
        const inx = entering ? nx : -nx, iny = entering ? ny : -ny;
        const eta = n1 / n2;
        const cosi = -(dx * inx + dy * iny);
        const k = 1 - eta * eta * (1 - cosi * cosi);
        if (k < 0) {
          dx += 2 * cosi * inx; dy += 2 * cosi * iny; // total internal reflection
        } else {
          const f = eta * cosi - Math.sqrt(k);
          dx = eta * dx + f * inx; dy = eta * dy + f * iny;
          inside = entering ? bestEl : -1;
        }
        const L = Math.hypot(dx, dy); dx /= L; dy /= L;
      }
      ox = ex + dx * 0.01; oy = ey + dy * 0.01;
    }
  });
  return { segs, sensors, hits, src: [sx, sy] };
}

// ----- drawing -----------------------------------------------------------------

const stars = [];
{
  let a = 1234567;
  const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  for (let i = 0; i < 420; i++) stars.push([S.x + rnd() * S.w, S.y + rnd() * S.h, rnd()]);
}

function draw() {
  const r = me.rect;
  const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.setTransform(dpr, 0, 0, dpr, -r.x * dpr, -r.y * dpr);
  const g = ctx.createLinearGradient(0, S.y, 0, S.y + S.h);
  g.addColorStop(0, '#0a0d1c'); g.addColorStop(1, '#04050b');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  for (const [x, y, b] of stars) {
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
    ctx.fillStyle = `rgba(200,210,255,${0.15 + 0.35 * b * (0.7 + 0.3 * Math.sin(time * (0.5 + b) + x))})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  // Faint grid fixed to the screen, so a moving window visibly slides over it.
  ctx.strokeStyle = 'rgba(120,140,220,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(r.x / 80) * 80; x < r.x + r.w; x += 80) { ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); }
  for (let y = Math.ceil(r.y / 80) * 80; y < r.y + r.h; y += 80) { ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); }
  ctx.stroke();

  const wins = windows();
  const elements = wins.map(element);
  const lv = LEVELS[level];
  const res = trace(elements, lv);

  // Elements behind the light.
  elements.forEach((el, k) => {
    const mine = wins[k].id === id;
    if (el.kind === 'prism') {
      ctx.beginPath();
      el.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      const pg = ctx.createLinearGradient(el.pts[0][0], el.pts[0][1], el.cx, el.cy + 40);
      pg.addColorStop(0, 'rgba(180,210,255,0.16)'); pg.addColorStop(1, 'rgba(120,150,230,0.05)');
      ctx.fillStyle = pg; ctx.fill();
      ctx.strokeStyle = mine ? 'rgba(210,230,255,0.75)' : 'rgba(210,230,255,0.45)';
      ctx.lineWidth = 1.4; ctx.stroke();
    } else if (el.kind === 'mirror') {
      const [x1, y1, x2, y2] = el.edges[0];
      ctx.strokeStyle = 'rgba(230,236,255,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,180,255,0.25)'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  });

  // The light: additive, so the nine wavelengths sum back to white where they overlap.
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const pass of [[10, 0.05], [4, 0.12], [1.6, 0.55]]) {
    ctx.lineWidth = pass[0];
    for (const [x1, y1, x2, y2, wi] of res.segs) {
      const [cr, cg, cb] = RGB[wi];
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${pass[1]})`;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
  const [sx, sy] = res.src;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 40);
  sg.addColorStop(0, 'rgba(255,255,255,0.9)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 40, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  for (const s of res.sensors) {
    const lit = res.hits.has(s);
    const c = { red: '255,90,80', green: '90,255,140', violet: '170,120,255' }[s.band];
    if (lit) {
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 46);
      lg.addColorStop(0, `rgba(${c},0.8)`); lg.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(s.x, s.y, 46, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = `rgba(${c},${lit ? 1 : 0.55})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(s.x, s.y, 3.5 + (lit ? 1.5 * Math.sin(time * 6) : 0), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${c},${lit ? 1 : 0.35})`; ctx.fill();
  }

  // Arrows to sensors and the source when they are off this window.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const targets = [...res.sensors.map((s) => [s.x, s.y, { red: '#ff6a5c', green: '#62ff95', violet: '#b48cff' }[s.band]]), [sx, sy, '#ffffff']];
  for (const [tx, ty, col] of targets) {
    const lx = tx - r.x, ly = ty - r.y;
    if (lx >= 0 && lx <= r.w && ly >= 0 && ly <= r.h) continue;
    const cx = r.w / 2, cy = r.h / 2, dxx = lx - cx, dyy = ly - cy;
    const k = Math.min((cx - 22) / Math.abs(dxx || 1e-6), (cy - 22) / Math.abs(dyy || 1e-6));
    const ax = cx + dxx * k, ay = cy + dyy * k, ang = Math.atan2(dyy, dxx);
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
    ctx.fillStyle = col; ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  const all = res.hits.size === res.sensors.length;
  hud.querySelector('.lv').textContent = `${level + 1} · ${lv.name}`;
  hud.querySelector('.lit').textContent = `${res.hits.size}/${res.sensors.length} sensors lit`;
  document.querySelector('.kind').textContent = { prism: 'Prism', mirror: 'Mirror', clear: 'Clear' }[kind];
  document.body.classList.toggle('won', all);
  if (all && !won) { won = true; document.title = 'Lit · Snell'; }
  if (!all && won) won = false;
  window.__snell.state = { lit: res.hits.size, sensors: res.sensors.length, windows: wins.length, segs: res.segs.length };
}

function waveRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else r = 1;
  const f = nm < 420 ? 0.4 + 0.6 * (nm - 380) / 40 : nm > 650 ? 0.4 + 0.6 * (700 - nm) / 50 : 1;
  return [r, g, b].map((v) => Math.round(255 * Math.pow(v * f, 0.8)));
}

// ----- input --------------------------------------------------------------------

function rotate(d) { rot += d; }
addEventListener('wheel', (e) => { e.preventDefault(); rotate(e.deltaY * 0.0025); }, { passive: false });
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') rotate(-0.05);
  else if (e.key === 'ArrowRight') rotate(0.05);
  else if (e.key === 'm' || e.key === 'M') toggleKind();
});
let dragX = null;
canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (dragX != null) { rotate((e.clientX - dragX) * 0.008); dragX = e.clientX; } });
canvas.addEventListener('pointerup', () => { dragX = null; });
function toggleKind() { kind = { prism: 'mirror', mirror: 'clear', clear: 'prism' }[kind]; }
document.getElementById('kind').addEventListener('click', toggleKind);
document.getElementById('new').addEventListener('click', () => {
  const w = 380, h = 320;
  let left = screenX + outerWidth + 14;
  if (left + w > S.x + S.w) left = Math.max(S.x, screenX - w - 14);
  const url = new URL(location.href);
  url.search = `?pane=1&kind=${kind === 'prism' ? 'mirror' : 'prism'}`;
  const win = open(url.href, `snell-${Date.now()}`, `popup=yes,width=${w},height=${h},left=${Math.round(left)},top=${Math.round(screenY + 60)}`);
  if (!win) alert('Your browser blocked the new window. Allow pop-ups for this page, or open this address in another window yourself.');
});
document.getElementById('next').addEventListener('click', () => setLevel((level + 1) % LEVELS.length));
document.getElementById('prev').addEventListener('click', () => setLevel((level + LEVELS.length - 1) % LEVELS.length));

function showHint() {
  const h = document.getElementById('hint');
  if (params.has('pane') || innerWidth < 560) { h.hidden = true; return; }
  h.hidden = false;
  h.querySelector('.t').textContent = LEVELS[level].hint;
}
document.getElementById('hint-x').addEventListener('click', () => { document.getElementById('hint').hidden = true; });

window.__snell = {
  id,
  setRect(x, y, w, h) { forced = [x, y, w, h]; },
  setRot(a) { rot = a; },
  setKind(k) { kind = k; },
  level: (i) => setLevel(i),
  state: null,
};

let last = performance.now();
function frame(now) {
  time += Math.min(0.1, (now - last) / 1000);
  last = now;
  dpr = Math.min(2, devicePixelRatio || 1);
  announce();
  draw();
  requestAnimationFrame(frame);
}
showHint();
requestAnimationFrame(frame);
