import { buildCave } from './cave.js';
import { buildSilt, visibility } from './silt.js';
import { SITES } from './sites.js';

export const DT = 1 / 60;
export const G = 9.81;
export const MASS = 160;
export const RADIUS = 0.45;
export const REACH = 2.2;
export const THRUST = { frog: 74, flutter: 170, back: 30, touch: 58 };
export const SAC = { rest: 0.085, frog: 0.14, flutter: 0.27, back: 0.12, touch: 0.12 };
const CDA_F = 0.13, CDA_S = 0.4;
const BREATH = { rest: 4.5, frog: 3.6, flutter: 2.4, back: 3.8, touch: 3.6 };
const TANK_GAS_KG = 5.8;

export const ata = (y) => 1 + Math.max(0, -y) / 10;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function forwardOf(yaw, pitch) {
  return [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
}

export function closestOnSeg(p, a, b) {
  const ab = sub(b, a);
  const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9;
  let t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return { q, t, d: dist(p, q) };
}

// Wing gas is held as a surface-equivalent volume so Boyle's law is exact:
// the litres it displaces at depth are wingS / ATA.
export function neutralVolume(gas, gas0) {
  return 7.0 - TANK_GAS_KG * (1 - gas / gas0);
}

export function createSim(siteIndex, opts = {}) {
  const site = SITES[siteIndex];
  const cave = opts.cave || buildCave(site);
  const silt = buildSilt(cave);
  const B = cave.basin;
  const n1 = cave.nodes[site.route[1]];
  const yaw = Math.atan2(n1.p[2] - B.p[2], n1.p[0] - B.p[0]);
  const pos = [B.p[0] + Math.cos(yaw) * 2.5, B.p[1] - 0.5, B.p[2] + Math.sin(yaw) * 2.5];
  const S = {
    siteIndex, site, cave, silt,
    t: 0, steps: 0, done: false, result: null,
    diver: {
      pos, vel: [0, 0, 0], yaw, pitch: -0.15,
      wingS: neutralVolume(site.gas, site.gas) * ata(pos[1]),
      gas: site.gas, mode: 'rest', phase: 0, breath: 0, kick: 0,
      contact: 0, lastContact: -9, touching: null, vis: 40, ata: ata(pos[1]),
    },
    reel: { ties: [], broken: false, wear: 0, cap: site.reel, everBroken: false, wrapped: false },
    light: { primary: true, backup: false, failed: false },
    input: { fwd: 0, flutter: false, back: 0, yaw: 0, pitch: 0, inflate: false, dump: false, touch: false },
    actions: [],
    events: [],
    stats: { contacts: 0, offline: 0, maxDepth: 0, gasAtTurn: null, turnT: null, breaks: 0, left: false, track: [] },
    objective: false,
    msg: null,
  };
  return S;
}

function toast(S, text, kind = 'info') {
  S.toastLog = S.toastLog || {};
  if (S.toastLog[text] != null && S.t - S.toastLog[text] < 2.5) return;
  S.toastLog[text] = S.t;
  S.events.push({ type: 'toast', text, kind, t: S.t });
}

export function lineSegments(S) {
  const out = [];
  const P = S.cave.perm;
  if (P) for (let i = 1; i < P.pts.length; i++) out.push({ a: P.pts[i - 1], b: P.pts[i], kind: 'perm', i });
  const T = S.reel.ties;
  for (let i = 1; i < T.length; i++) out.push({ a: T[i - 1].p, b: T[i].p, kind: 'own', i });
  return out;
}

export function lineUsed(S) {
  const T = S.reel.ties;
  let L = 0;
  for (let i = 1; i < T.length; i++) L += dist(T[i - 1].p, T[i].p);
  if (T.length && !S.reel.broken) L += dist(T[T.length - 1].p, S.diver.pos);
  return L;
}

function fixedLength(S) {
  const T = S.reel.ties;
  let L = 0;
  for (let i = 1; i < T.length; i++) L += dist(T[i - 1].p, T[i].p);
  return L;
}

export function nearestAnchor(S, p = S.diver.pos, free = true) {
  const used = new Set(S.reel.ties.filter((t) => t.kind === 'anchor').map((t) => t.id));
  let best = null, bd = Infinity;
  for (const a of S.cave.anchors) {
    if (free && used.has(a.id)) continue;
    const d = dist(a.p, p);
    if (d < bd) { bd = d; best = a; }
  }
  return best ? { a: best, d: bd } : null;
}

export function nearestPerm(S, p = S.diver.pos) {
  const P = S.cave.perm;
  if (!P) return null;
  let best = null;
  for (let i = 1; i < P.pts.length; i++) {
    const c = closestOnSeg(p, P.pts[i - 1], P.pts[i]);
    if (!best || c.d < best.d) best = { ...c, seg: i - 1 };
  }
  return best;
}

export function lineChafes(S, a, b) {
  const L = dist(a, b);
  for (let s = 0.5; s < L - 0.5; s += 0.35) {
    const t = s / L;
    if (S.cave.D(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t) > 0.08) return true;
  }
  return false;
}

function doTie(S) {
  const R = S.reel, D = S.diver;
  if (R.broken) {
    const last = R.ties[R.ties.length - 1];
    if (dist(last.p, D.pos) < REACH) {
      R.broken = false; R.wear = 0;
      toast(S, 'Spliced back into your line', 'good');
      S.events.push({ type: 'tie', p: last.p });
    } else toast(S, 'The line has parted. Find your last tie-off and splice in', 'bad');
    return;
  }
  const na = nearestAnchor(S);
  if (!R.ties.length) {
    const np = nearestPerm(S);
    if (np && np.d < 1.8 && (!na || !na.a.primary || na.d > REACH)) {
      R.ties.push({ kind: 'perm', p: np.q, seg: np.seg });
      toast(S, 'Jumped: reel tied into the gold line', 'good');
      S.events.push({ type: 'tie', p: np.q });
      return;
    }
    if (!na || na.d > REACH) { toast(S, 'No rock to tie to within reach', 'warn'); return; }
    if (!na.a.primary) { toast(S, 'Your first tie-off goes on the primary knob in open water', 'warn'); return; }
  } else if (!na || na.d > REACH) { toast(S, 'No tie-off point within reach. Look for a rock knob', 'warn'); return; }
  const last = R.ties[R.ties.length - 1];
  if (last && fixedLength(S) + dist(last.p, na.a.p) > R.cap) { toast(S, 'Not enough line left on the reel', 'warn'); return; }
  R.ties.push({ kind: 'anchor', id: na.a.id, p: na.a.p });
  R.wear = 0;
  S.events.push({ type: 'tie', p: na.a.p });
  if (R.ties.length === 1) toast(S, 'Primary tie-off made. Line is running', 'good');
}

function doUntie(S) {
  const R = S.reel, D = S.diver;
  if (!R.ties.length) { toast(S, 'Reel is stowed', 'info'); return; }
  if (R.broken) { toast(S, 'Splice in first (E)', 'warn'); return; }
  const last = R.ties[R.ties.length - 1];
  if (dist(last.p, D.pos) > REACH) { toast(S, 'Swim back to your last tie-off to untie it', 'warn'); return; }
  R.ties.pop();
  R.wear = 0;
  S.events.push({ type: 'untie', p: last.p });
  if (!R.ties.length) toast(S, last.kind === 'perm' ? 'Reel off the gold line. Follow the arrows home' : 'Reel stowed. All line recovered', 'good');
}

function castDown(cave, p, max) {
  for (let s = 0; s < max; s += 0.15) if (cave.D(p[0], p[1] - s, p[2]) > 0) return s;
  return -1;
}
function castUp(cave, p, max) {
  for (let s = 0; s < max; s += 0.2) if (cave.D(p[0], p[1] + s, p[2]) > 0) return s;
  return -1;
}

export function step(S, dt = DT) {
  if (S.done) return;
  const D = S.diver, I = S.input, cave = S.cave, site = S.site, R = S.reel;
  S.t += dt; S.steps++;

  while (S.actions.length) {
    const a = S.actions.shift();
    if (a === 'tie') doTie(S);
    else if (a === 'untie') doUntie(S);
    else if (a === 'light') {
      if (S.light.failed) { S.light.backup = !S.light.backup; toast(S, S.light.backup ? 'Backup light on' : 'Backup light off', 'info'); }
      else toast(S, 'Primary light is fine', 'info');
    }
  }

  D.yaw += I.yaw * 1.6 * dt;
  D.pitch = Math.max(-1.35, Math.min(1.35, D.pitch + I.pitch * 1.2 * dt));
  const fwd = forwardOf(D.yaw, D.pitch);
  D.ata = ata(D.pos[1]);

  // Touch contact: find the line to slide along.
  D.touching = null;
  let tdir = null;
  if (I.touch) {
    let best = null;
    if (R.ties.length && !R.broken) {
      const last = R.ties[R.ties.length - 1];
      const d = dist(last.p, D.pos);
      best = { q: D.pos, d: 0, exit: last.p, kind: 'live', rem: d };
    }
    if (!best) {
      for (const s of lineSegments(S)) {
        const c = closestOnSeg(D.pos, s.a, s.b);
        if (c.d > 1.6) continue;
        const rem = dist(c.q, s.a);
        const score = c.d + (rem < 0.3 && I.fwd ? 0.5 : 0);
        if (!best || score < best.score) best = { q: c.q, d: c.d, exit: s.a, kind: s.kind, rem, score, seg: s };
      }
    }
    if (best) {
      D.touching = best;
      const e = sub(best.exit, best.q);
      const el = len(e);
      if (el > 0.05) tdir = [e[0] / el, e[1] / el, e[2] / el];
    }
  }

  let mode = 'rest';
  let thrust = [0, 0, 0];
  if (D.touching) {
    mode = 'touch';
    const dir = I.fwd ? tdir : I.back ? (tdir ? tdir.map((v) => -v) : null) : null;
    if (dir && !(D.touching.kind === 'live' && I.fwd && D.touching.rem < 0.9)) {
      thrust = dir.map((v) => v * THRUST.touch);
      const ty = Math.atan2(dir[2], dir[0]);
      let dy = ty - D.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      D.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 1.4 * dt);
      D.pitch += (Math.asin(Math.max(-1, Math.min(1, dir[1]))) - D.pitch) * Math.min(1, 1.2 * dt);
    }
    if (D.touching.kind !== 'live') {
      const off = sub(D.touching.q, D.pos);
      const ol = len(off);
      if (ol > 0.35) { const k = 90 * (ol - 0.35); thrust = thrust.map((v, i) => v + (off[i] / ol) * k); }
    }
    if (D.touching.kind === 'perm') {
      for (const ar of cave.perm.arrows) {
        if (dist(ar.p, D.pos) < 1.3 && (!ar.felt || S.t - ar.felt > 6)) {
          ar.felt = S.t;
          const ex = sub(cave.perm.pts[ar.seg], cave.perm.pts[ar.seg + 1]);
          const dot = (ex[0] * fwd[0] + ex[1] * fwd[1] + ex[2] * fwd[2]) / (len(ex) || 1);
          S.events.push({ type: 'arrow', ahead: dot > 0, t: S.t });
        }
      }
    }
  } else if (I.fwd) {
    mode = I.flutter ? 'flutter' : 'frog';
    thrust = fwd.map((v) => v * THRUST[mode]);
  } else if (I.back) {
    mode = 'back';
    thrust = fwd.map((v) => -v * THRUST.back);
  }
  D.mode = mode;

  // Breathing, gas, and the lungs' small part in buoyancy.
  const stress = D.vis < 2.5 || (S.stats.left && !onLine(S)) || (!S.light.primary && !S.light.backup) ? 1.3 : 1;
  const period = BREATH[mode] / (stress > 1 ? 1.25 : 1);
  const prevB = D.breath;
  D.breath = (D.breath + dt / period) % 1;
  if (D.breath < prevB) exhale(S);
  D.gas = Math.max(0, D.gas - SAC[mode] * D.ata * stress * dt);

  if (I.inflate) D.wingS = Math.min(20 * D.ata, D.wingS + 1.2 * D.ata * dt);
  if (I.dump) D.wingS = Math.max(0, D.wingS - 1.8 * D.ata * dt);
  const lung = 0.7 * Math.sin(D.breath * Math.PI * 2);
  const net = G * (D.wingS / D.ata + lung - neutralVolume(D.gas, site.gas));

  const u = cave.flow(D.pos[0], D.pos[1], D.pos[2]);
  const rv = sub(D.vel, u);
  const vf = rv[0] * fwd[0] + rv[1] * fwd[1] + rv[2] * fwd[2];
  const vs = [rv[0] - fwd[0] * vf, rv[1] - fwd[1] * vf, rv[2] - fwd[2] * vf];
  const vsl = len(vs);
  const drag = [0, 1, 2].map((k) => -500 * CDA_F * Math.abs(vf) * vf * fwd[k] - 500 * CDA_S * vsl * vs[k] - 6 * rv[k]);
  const F = [thrust[0] + drag[0], thrust[1] + drag[1] + net, thrust[2] + drag[2]];
  for (let k = 0; k < 3; k++) { D.vel[k] += (F[k] / MASS) * dt; D.pos[k] += D.vel[k] * dt; }

  if (D.pos[1] > -0.5) { D.pos[1] = -0.5; if (D.vel[1] > 0) D.vel[1] = 0; }

  // Tether: the reel cannot pay out more line than it holds.
  if (R.ties.length && !R.broken) {
    const last = R.ties[R.ties.length - 1].p;
    const maxLive = Math.max(0.5, R.cap - fixedLength(S));
    const off = sub(D.pos, last);
    const L = len(off);
    if (L > maxLive) {
      const nrm = off.map((v) => v / L);
      for (let k = 0; k < 3; k++) D.pos[k] = last[k] + nrm[k] * maxLive;
      const vr = D.vel[0] * nrm[0] + D.vel[1] * nrm[1] + D.vel[2] * nrm[2];
      if (vr > 0) for (let k = 0; k < 3; k++) D.vel[k] -= nrm[k] * vr;
      if (!R.atEnd) toast(S, 'End of the reel. You can go no further on this line', 'warn');
      R.atEnd = true;
    } else R.atEnd = false;
  }

  collide(S);

  // Fins push water back and down. Near a silty floor that lifts silt.
  D.phase += dt * (mode === 'flutter' ? 2.6 : mode === 'rest' ? 0 : 1.1);
  if (mode === 'frog' || mode === 'flutter' || mode === 'back') {
    const fin = [D.pos[0] - fwd[0] * 0.9, D.pos[1] - fwd[1] * 0.9 - 0.2, D.pos[2] - fwd[2] * 0.9];
    const hmax = mode === 'flutter' ? 2.8 : 1.0;
    const h = castDown(cave, fin, hmax);
    if (h >= 0) {
      const p = [fin[0], fin[1] - h + 0.5, fin[2]];
      const k = S.silt.slotAt(p[0], p[1], p[2]);
      const fs = k >= 0 && S.silt.floor[k] > 0 ? S.silt.floor[k] : site.silt * 0.6;
      const rate = (mode === 'flutter' ? 10 : mode === 'back' ? 0.4 : 0.6) * (1 - h / hmax) ** 2 * fs;
      S.silt.add(p[0], p[1], p[2], rate * dt);
    }
  }

  if ((S.steps % 6) === 0) S.silt.step(dt * 6);
  D.vis = visibility(site.clarity, S.silt.sample(D.pos[0], D.pos[1] + 0.2, D.pos[2]));

  // Chafe: the live line runs straight from the last tie-off to the diver.
  R.wrapped = false;
  if (R.ties.length && !R.broken) {
    const last = R.ties[R.ties.length - 1].p;
    if (lineChafes(S, last, D.pos)) {
      R.wrapped = true;
      R.wear += dt * 24;
      if (R.wear >= 100) {
        R.broken = true; R.everBroken = true; R.wear = 0; S.stats.breaks++;
        toast(S, 'LINE PARTED. It sawed through on the rock', 'bad');
        S.events.push({ type: 'break', p: D.pos.slice() });
      }
    } else R.wear = Math.max(0, R.wear - dt * 6);
  }

  // Bookkeeping.
  const B = cave.basin;
  const inBasin = Math.hypot(D.pos[0] - B.p[0], D.pos[2] - B.p[2]) < B.r * 0.95;
  if (!inBasin && dist(D.pos, B.p) > B.r + 6) S.stats.left = true;
  if (S.stats.left && !inBasin && !onLine(S)) S.stats.offline += dt;
  S.stats.maxDepth = Math.max(S.stats.maxDepth, -D.pos[1]);
  if ((S.steps % 60) === 0) S.stats.track.push([D.pos[0], D.pos[1], D.pos[2], D.vis]);

  const T = cave.target;
  if (!S.objective && dist(D.pos, T.p) < T.r * 0.75) {
    S.objective = true; S.stats.gasAtTurn = D.gas; S.stats.turnT = S.t;
    toast(S, `${site.goal} reached. Turn the dive`, 'good');
    S.events.push({ type: 'objective' });
  }
  if (site.lightFail && S.objective && !S.light.failed && dist(D.pos, T.p) > T.r + 22) {
    S.light.failed = true; S.light.primary = false;
    toast(S, 'PRIMARY LIGHT FAILED. Backup: B', 'bad');
    S.events.push({ type: 'lightfail' });
  }
  if (S.stats.left && inBasin && D.pos[1] > -2.2) return finish(S, true);
  if (D.gas <= 0) return finish(S, false, 'Out of gas');
}

export function onLine(S) {
  const R = S.reel;
  if (R.ties.length && !R.broken) return true;
  for (const s of lineSegments(S)) if (closestOnSeg(S.diver.pos, s.a, s.b).d < 2.5) return true;
  return false;
}

function exhale(S) {
  const D = S.diver, site = S.site;
  const head = [D.pos[0], D.pos[1] + 0.3, D.pos[2]];
  S.events.push({ type: 'bubble', p: head });
  if (site.ceilSilt > 0) {
    const s = castUp(S.cave, head, 4);
    if (s >= 0) {
      const k = S.silt.slotAt(head[0], head[1] + s - 0.6, head[2]);
      const cs = k >= 0 && S.silt.ceil[k] > 0 ? S.silt.ceil[k] : site.ceilSilt * 0.5;
      S.silt.add(head[0], head[1] + s - 0.6, head[2], 0.45 * cs * (1 - s / 4));
    }
  }
}

function collide(S) {
  const D = S.diver, cave = S.cave;
  let hit = false, floorHit = false, speed = 0;
  for (let it = 0; it < 3; it++) {
    const d = cave.D(D.pos[0], D.pos[1], D.pos[2]);
    if (d <= -RADIUS) break;
    const n = cave.grad(D.pos[0], D.pos[1], D.pos[2]);
    const push = d + RADIUS;
    for (let k = 0; k < 3; k++) D.pos[k] -= n[k] * push;
    const vn = D.vel[0] * n[0] + D.vel[1] * n[1] + D.vel[2] * n[2];
    if (vn > 0) { for (let k = 0; k < 3; k++) D.vel[k] -= n[k] * vn * 1.05; speed = Math.max(speed, vn); }
    for (let k = 0; k < 3; k++) D.vel[k] *= 0.985;
    hit = true;
    if (n[1] < -0.55) floorHit = true;
  }
  if (!hit) { D.contact = 0; return; }
  if (S.t - D.lastContact > 0.8 && speed > 0.1) {
    S.stats.contacts++;
    S.events.push({ type: 'contact', floor: floorHit, speed });
  }
  if (speed > 0.02 || D.mode !== 'rest') D.lastContact = S.t;
  D.contact = 1;
  const p = [D.pos[0], D.pos[1] - (floorHit ? 0.2 : 0), D.pos[2]];
  const amt = (floorHit ? S.site.silt * 2.2 : 0.25) * (0.15 + speed * 4) * DT;
  S.silt.add(p[0], p[1], p[2], amt);
}

export function finish(S, exited, reason = null) {
  const D = S.diver, site = S.site, R = S.reel;
  const gasFrac = D.gas / site.gas;
  const thirds = exited && D.gas >= site.gas / 3;
  const rows = [];
  if (exited) rows.push(['Surfaced', 1000]);
  if (S.objective) rows.push(['Objective', 1000]);
  if (exited) rows.push([`Gas left ${Math.round(D.gas)} bar`, Math.round(gasFrac * 1000)]);
  if (thirds) rows.push(['Rule of thirds kept', 500]);
  if (exited) rows.push(R.ties.length ? [`Line left in the cave (${R.ties.length} ties)`, -80 * R.ties.length] : ['All line recovered', 400]);
  if (S.stats.contacts) rows.push([`${S.stats.contacts} contacts`, -15 * S.stats.contacts]);
  const siltPen = Math.min(800, Math.round(S.silt.raised * 2));
  if (siltPen) rows.push([`Silt raised (${S.silt.raised.toFixed(1)})`, -siltPen]);
  if (S.stats.offline > 1) rows.push([`${Math.round(S.stats.offline)} s off the line`, -Math.round(S.stats.offline * 10)]);
  if (S.stats.breaks) rows.push([`Line parted ×${S.stats.breaks}`, -150 * S.stats.breaks]);
  const score = Math.max(0, rows.reduce((a, r) => a + r[1], 0));
  let medal = 'fail';
  if (exited) medal = 'bronze';
  if (exited && S.objective && gasFrac >= 0.2 && S.stats.offline < 30) medal = 'silver';
  if (exited && S.objective && thirds && !R.ties.length && S.stats.contacts < 5 && !S.stats.breaks && S.stats.offline < 10 && siltPen < 150) medal = 'gold';
  S.done = true;
  S.result = { exited, reason, rows, score, medal, gas: D.gas, time: S.t, objective: S.objective };
  S.events.push({ type: 'done' });
}

export function hash(S) {
  const D = S.diver;
  return [D.pos.map((v) => v.toFixed(4)).join(','), D.gas.toFixed(4), S.silt.raised.toFixed(4), S.reel.ties.length, S.stats.contacts].join('|');
}
