import { REACH, nearestAnchor, nearestPerm, lineUsed, forwardOf, G, neutralVolume } from './sim.js';

const $ = (id) => document.getElementById(id);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createHud() {
  const H = { toasts: $('toasts'), last: {} };
  H.toast = (text, kind = 'info') => {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    H.toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), kind === 'bad' ? 4200 : 3000);
    setTimeout(() => el.remove(), kind === 'bad' ? 4800 : 3600);
    while (H.toasts.children.length > 4) H.toasts.firstChild.remove();
  };
  H.arrow = (ahead) => {
    const el = $('arrowcue');
    el.textContent = ahead ? '▲ ARROW · exit is the way you face' : '▼ ARROW · exit is behind you';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  };
  const set = (id, v) => { if (H.last[id] !== v) { H.last[id] = v; $(id).textContent = v; } };
  const cls = (id, c, on) => $(id).classList.toggle(c, on);

  H.begin = (S) => {
    set('h-site', S.site.name);
    set('h-obj', S.site.objective);
  };

  H.update = (S) => {
    const D = S.diver, R = S.reel, site = S.site;
    set('h-clock', fmt(S.t));
    const depth = Math.max(0, -D.pos[1]);
    set('g-depth', depth.toFixed(1));
    set('g-ata', `${D.ata.toFixed(2)} ATA · max ${S.stats.maxDepth.toFixed(0)} m`);
    set('g-gas', Math.round(D.gas).toString());
    const turn = Math.round((site.gas * 2) / 3);
    set('g-turnp', S.objective ? `turned · exit ≥ ${Math.round(site.gas / 3)}` : `turn at ${turn}`);
    $('g-gasfill').style.width = `${(D.gas / site.gas) * 100}%`;
    cls('g-gasbox', 'warn', !S.objective && D.gas < turn);
    cls('g-gasbox', 'bad', D.gas < site.gas / 4);
    set('g-vis', D.vis >= 39.5 ? '40+' : D.vis.toFixed(1));
    $('g-visfill').style.width = `${Math.min(100, (D.vis / 40) * 100)}%`;
    cls('g-visbox', 'bad', D.vis < 2);
    cls('g-visbox', 'warn', D.vis < 6 && D.vis >= 2);
    const net = G * (D.wingS / D.ata - neutralVolume(D.gas, site.gas));
    set('g-buoy', `${net >= 0 ? '+' : '−'}${Math.abs(net / G).toFixed(1)} kg`);
    set('g-vz', `${D.vel[1] >= 0 ? '▲' : '▼'} ${Math.abs(D.vel[1]).toFixed(2)} m/s`);
    $('g-buoyneedle').style.left = `${50 + Math.max(-48, Math.min(48, net * 3))}%`;
    cls('g-buoybox', 'warn', Math.abs(D.vel[1]) > 0.35);
    const fwd = forwardOf(D.yaw, 0);
    const hdg = ((Math.atan2(fwd[0], -fwd[2]) * 180) / Math.PI + 360) % 360;
    set('g-hdg', `${Math.round(hdg).toString().padStart(3, '0')}° ${DIRS[Math.round(hdg / 45) % 8]}`);
    set('g-mode', D.mode === 'rest' ? 'drifting' : D.mode === 'touch' ? 'touch contact' : `${D.mode} kick`);

    const used = lineUsed(S);
    set('r-line', `${used.toFixed(0)} / ${R.cap} m`);
    $('r-linefill').style.width = `${Math.min(100, (used / R.cap) * 100)}%`;
    set('r-ties', R.ties.length ? `${R.ties.length} tie-off${R.ties.length > 1 ? 's' : ''}${R.ties[0].kind === 'perm' ? ' (jump)' : ''}` : 'reel stowed');
    $('r-wearfill').style.width = `${R.wear}%`;
    cls('r-wearbox', 'bad', R.wrapped);
    set('r-wear', R.broken ? 'PARTED' : R.wrapped ? 'CHAFING' : R.wear > 1 ? 'worn' : 'clear');
    cls('r-wearbox', 'broken', R.broken);
    set('r-light', S.light.primary ? 'primary' : S.light.backup ? 'backup' : 'DARK');
    cls('r-lightbox', 'bad', !S.light.primary && !S.light.backup);
    cls('r-lightbox', 'warn', !S.light.primary && S.light.backup);
    set('r-contacts', String(S.stats.contacts));

    set('prompt', promptFor(S));
    cls('prompt', 'hidden', !H.last.prompt);
    cls('touchcue', 'show', !!D.touching);
    if (D.touching) set('touchcue', D.touching.kind === 'live' ? 'ON YOUR LINE · W toward last tie-off' : D.touching.kind === 'perm' ? 'ON THE GOLD LINE · W toward exit' : 'ON YOUR LAID LINE · W toward exit');
    cls('vignette', 'silt', D.vis < 3);
    $('vignette').style.opacity = String(Math.max(0, Math.min(1, (4 - D.vis) / 3)) * 0.9);
  };

  return H;
}

export function promptFor(S) {
  const D = S.diver, R = S.reel;
  const last = R.ties[R.ties.length - 1];
  if (R.broken) return last && dist(last.p, D.pos) < REACH ? 'E · splice into your line' : 'LINE PARTED · find your last tie-off';
  if (R.wrapped) return 'LINE CHAFING on rock · back up or tie off';
  if (last && dist(last.p, D.pos) < REACH && (S.objective || R.ties.length > 1 || S.stats.left) && dist(last.p, D.pos) < 1.6) return 'Q · untie and reel in    E · tie off at another knob';
  const na = nearestAnchor(S);
  if (!R.ties.length) {
    const np = nearestPerm(S);
    if (np && np.d < 1.8) return 'E · jump: tie your reel into the gold line';
    if (na && na.a.primary && na.d < REACH) return 'E · primary tie-off';
    if (!S.stats.left && !S.objective) return 'Find the orange-flagged knob on the basin floor and tie your primary';
  }
  if (na && na.d < REACH && R.ties.length) return 'E · tie off here';
  if (S.objective && R.ties.length) return 'Follow your line out · hold G for touch contact';
  return '';
}

export function drawMap(canvas, S) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.clientWidth * 2, Hh = canvas.height = canvas.clientHeight * 2;
  const cave = S.cave;
  const lo = cave.lo, hi = cave.hi;
  const sc = Math.min(W / (hi[0] - lo[0]), Hh / (hi[2] - lo[2])) * 0.92;
  const ox = (W - (hi[0] - lo[0]) * sc) / 2, oz = (Hh - (hi[2] - lo[2]) * sc) / 2;
  const X = (x) => ox + (x - lo[0]) * sc, Z = (z) => oz + (z - lo[2]) * sc;
  ctx.fillStyle = '#0b1217'; ctx.fillRect(0, 0, W, Hh);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const P of cave.prims) {
    ctx.strokeStyle = '#2b3740'; ctx.fillStyle = '#2b3740';
    if (P.t === 'c') { ctx.lineWidth = (P.ra + P.rb) * sc; ctx.beginPath(); ctx.moveTo(X(P.a[0]), Z(P.a[2])); ctx.lineTo(X(P.b[0]), Z(P.b[2])); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(X(P.c[0]), Z(P.c[2]), P.r * sc, 0, Math.PI * 2); ctx.fill(); }
  }
  // Silt left behind.
  const sl = S.silt;
  for (let k = 0; k < sl.W; k++) {
    const c = sl.c[k];
    if (c < 0.08) continue;
    ctx.fillStyle = `rgba(176,140,96,${Math.min(0.5, c * 0.25)})`;
    ctx.fillRect(X(sl.pos[k * 3]) - 1.5 * sc / 2, Z(sl.pos[k * 3 + 2]) - 1.5 * sc / 2, 1.5 * sc, 1.5 * sc);
  }
  if (cave.perm) {
    ctx.strokeStyle = '#e9b93a'; ctx.lineWidth = 2.5; ctx.beginPath();
    cave.perm.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[2])) : ctx.moveTo(X(p[0]), Z(p[2]))));
    ctx.stroke();
  }
  const tr = S.stats.track;
  for (let i = 1; i < tr.length; i++) {
    const v = tr[i][3];
    ctx.strokeStyle = v < 2 ? '#e0603a' : v < 8 ? '#e0b04a' : '#62c7d6';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(tr[i - 1][0]), Z(tr[i - 1][2])); ctx.lineTo(X(tr[i][0]), Z(tr[i][2])); ctx.stroke();
  }
  ctx.fillStyle = '#f4f4ee';
  for (const t of S.reel.ties) { ctx.beginPath(); ctx.arc(X(t.p[0]), Z(t.p[2]), 5, 0, Math.PI * 2); ctx.fill(); }
  const T = cave.target;
  ctx.fillStyle = S.objective ? '#7fe08a' : '#f0f0f0';
  ctx.font = `${22}px system-ui, sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('★', X(T.p[0]), Z(T.p[2]) + 8);
  ctx.fillStyle = '#9fe6f2'; ctx.fillText('◎', X(cave.basin.p[0]), Z(cave.basin.p[2]) + 8);
  ctx.font = `${20}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.fillStyle = '#8aa0ac';
  ctx.fillText('track: ', 16, Hh - 18);
  [['#62c7d6', 'clear'], ['#e0b04a', 'murky'], ['#e0603a', 'silt-out']].forEach(([c, l], i) => { ctx.fillStyle = c; ctx.fillText(l, 90 + i * 110, Hh - 18); });
}
