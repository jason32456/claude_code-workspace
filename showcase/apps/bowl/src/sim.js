// Hump yard simulation. Pure and deterministic: no DOM, no Three.js, so the
// bench can run it under Node.
import * as T from './track.js';
import { rng, SHIFTS, makeTrain, makeCar, resetCars } from './shifts.js';

export const DT = 1 / 40;
// Retarder clamp force per car: a fixed part plus a weight-responsive part, so
// heavy cars get more force but still slow less than empties.
export const MASTER_F = [40000, 0.65];
export const TRACK_F = [25000, 0.5];
export const EFF = 1.05;          // rotating wheelsets
export const RHO = 1.25;
export const GOOD = 1.78;         // 4 mph
export const FIRM = 2.7;          // 6 mph
export const HEAVY = 4.0;         // 9 mph
export const STATIC = 1.6;
export const HOLD = 12000;          // N per car, bowl inert retarders        // breakaway / rolling resistance

export const kmh = (v) => v * 3.6;
export const bodyLen = (b) => b.cars.reduce((a, c) => a + c.len, 0);
export const bodyMass = (b) => b.cars.reduce((a, c) => a + c.mass, 0);
export const rear = (b) => b.s - b.len;
export const leafOf = (b) => (b.bits[0] == null || b.bits[1] == null || b.bits[2] == null ? -1 : T.bitsLeaf(b.bits));

// Bits to draw / predict with: resolved, else planned, else as the switches lie.
export function pathBits(S, b) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    if (b.bits && b.bits[k] != null) out.push(b.bits[k]);
    else if (b.plan != null) out.push(T.leafBits(b.plan)[k]);
    else out.push(S.switches[T.switchIndex(k, out)]);
  }
  return out;
}

export function createSim(shiftIndex, opts = {}) {
  const sh = SHIFTS[shiftIndex];
  resetCars();
  const r = rng(opts.seed ?? sh.seed);
  const trains = sh.trains.map((n) => makeTrain(r, sh, n));
  const S = {
    shiftIndex, shift: sh, t: 0, r,
    coldF: 1 + Math.max(0, 5 - sh.temp) * 0.03,
    windPh: [r() * 6.283, r() * 6.283, r() * 6.283],
    wind: sh.windMean,
    bodies: [], nextId: 1,
    trains, trainIdx: 0, train: null, trainWait: 6,
    hump: sh.hump,
    switches: new Array(7).fill(0),
    swT: new Array(7).fill(-99),
    assign: Array(T.N_TRACKS).fill(null),
    order: {},                 // block -> tracks in the order they were opened
    input: { master: false, track: false },
    events: [], score: { couple: 0, damage: 0 },
    lastCouple: Array(T.N_TRACKS).fill(null),
    still: 0, done: false, result: null,
    nCars: 0, released: 0,
  };
  for (const [tr, blk] of Object.entries(sh.assign)) openTrack(S, +tr, blk);
  for (const st of sh.standing) {
    const cars = [];
    for (let i = 0; i < st.cars; i++) { const c = makeCar(r, sh, st.block); c.pre = true; cars.push(c); }
    addBody(S, { cars, s: st.front, v: 0, bits: T.leafBits(st.track), plan: st.track, pre: true });
  }
  S.nCars = trains.reduce((a, tr) => a + tr.reduce((x, c) => x + c.cars.length, 0), 0);
  return S;
}

function openTrack(S, tr, blk) {
  S.assign[tr] = blk;
  (S.order[blk] ||= []).includes(tr) || S.order[blk].push(tr);
}

function addBody(S, o) {
  const b = {
    id: S.nextId++, cars: o.cars, s: o.s, v: o.v, bits: o.bits ?? [null, null, null],
    plan: o.plan ?? null, manual: !!o.manual, pre: !!o.pre, block: o.cars[0].block,
    radar: null, rrEst: null, wasMoving: o.v > 0, born: S.t,
  };
  b.len = bodyLen(b); b.mass = bodyMass(b);
  S.bodies.push(b);
  return b;
}

export const windAt = (S, t) => {
  const p = S.windPh, sh = S.shift;
  return sh.windMean + sh.gust * (0.6 * Math.sin(0.13 * t + p[0]) + 0.35 * Math.sin(0.41 * t + p[1]) + 0.3 * Math.sin(1.07 * t + p[2]));
};

// Net driving force Fd (signed) and resistance magnitude R on a body.
export function forces(b, leaf, wind, coldF, master, track, rrOverride) {
  let Fd = 0, R = 0, off = 0;
  const vrel = b.v - wind;
  for (let j = 0; j < b.cars.length; j++) {
    const c = b.cars[j];
    const sc = b.s - off - c.len / 2;
    off += c.len;
    const mg = c.mass * T.G;
    Fd += mg * T.grade(sc, leaf);
    R += mg * ((rrOverride ?? c.rr * coldF) + T.curveRes(sc));
    if (master && sc > T.MASTER[0] && sc < T.MASTER[1]) R += MASTER_F[0] + MASTER_F[1] * c.mass;
    if (track && sc > T.TRACK_RET[0] && sc < T.TRACK_RET[1]) R += TRACK_F[0] + TRACK_F[1] * c.mass;
    Fd -= 0.5 * RHO * c.cda * (j === 0 ? 1 : 0.3) * vrel * Math.abs(vrel);
  }
  // Inert retarders in the bowl hold standing cars against the wind and stop
  // anything rolling back toward the ladder.
  if (b.v <= 1e-4 && b.s > T.BOWL) R += HOLD * b.cars.length;
  return { Fd, R };
}

export function integrate(b, Fd, R, dt) {
  const M = b.mass * EFF;
  const v0 = b.v;
  if (b.v > 1e-4) {
    b.v += ((Fd - R) / M) * dt;
    if (b.v < 0) b.v = 0;
  } else if (b.v < -1e-4) {
    b.v += ((Fd + R) / M) * dt;
    if (b.v > 0) b.v = 0;
  } else {
    b.v = 0;
    if (Fd > R * STATIC) b.v = ((Fd - R) / M) * dt;
    else if (Fd < -R * STATIC) b.v = ((Fd + R) / M) * dt;
  }
  b.s += 0.5 * (v0 + b.v) * dt;
}

function event(S, type, text, pts = 0, extra = {}) {
  const e = { t: S.t, type, text, pts, ...extra };
  S.events.push(e);
  return e;
}

// ---------- routing ----------

function roomByTrack(S) {
  const minRear = T.TRACK_END.slice();
  for (const b of S.bodies) {
    const L = leafOf(b);
    if (L >= 0 && rear(b) > T.CLEAR - 60) minRear[L] = Math.min(minRear[L], rear(b));
  }
  return minRear.map((m) => m - T.CLEAR - 8);
}

// Upcoming cuts in the order they will reach the ladder: rolling ones first,
// then the train's cuts from the crest back.
export function sequence(S) {
  const free = S.bodies.filter((b) => !b.pre && b.s < T.NODES[0] + 2 && b.wasMoving && leafOf(b) < 0 && b.bits[0] == null)
    .sort((a, b) => b.s - a.s);
  const out = free.map((b) => ({ kind: 'body', ref: b, cars: b.cars, block: b.block }));
  if (S.train) for (const c of S.train.cuts) out.push({ kind: 'cut', ref: c, cars: c.cars, block: c.block });
  for (let i = S.trainIdx + (S.train ? 1 : 0); i < S.trains.length; i++)
    for (const c of S.trains[i]) out.push({ kind: 'cut', ref: c, cars: c.cars, block: c.block, later: true });
  return out;
}

function autoPlan(S) {
  const room = roomByTrack(S);
  // Cuts already committed past the first switch still eat room on their track.
  for (const b of S.bodies) {
    if (b.pre || leafOf(b) >= 0 && rear(b) > T.CLEAR - 60) continue;
    if (b.bits[0] == null) continue;
    const L = T.bitsLeaf(pathBits(S, b));
    room[L] -= b.len;
  }
  for (const it of sequence(S)) {
    const c = it.ref;
    const len = it.cars.reduce((a, x) => a + x.len, 0);
    if (!c.manual) {
      const opts = S.order[it.block] || [];
      let best = null;
      for (const L of opts) if (S.assign[L] === it.block && room[L] >= len + 4) { best = L; break; }
      if (best == null) for (const L of opts) if (S.assign[L] === it.block && (best == null || room[L] > room[best])) best = L;
      c.plan = best;
    }
    if (c.plan != null) room[c.plan] -= len;
  }
}

// The cut the next number key applies to.
export function routeTarget(S) {
  const seq = sequence(S).filter((x) => !x.later);
  return seq.find((x) => x.ref.plan == null) || seq.find((x) => !x.ref.manual) || seq[0] || null;
}

export function route(S, tr) {
  const it = routeTarget(S);
  if (!it) return null;
  if (S.assign[tr] == null) {
    openTrack(S, tr, it.block);
    event(S, 'open', `Track ${tr + 1} opened for ${it.block}`);
  }
  it.ref.plan = tr;
  it.ref.manual = true;
  return it;
}

function switchOccupied(S, i) {
  const { k, prefix } = T.switchNode(i);
  const a = T.NODES[k] - 3, z = T.NODES[k] + T.FOUL;
  for (const b of S.bodies) {
    if (b.s < a || rear(b) > z) continue;
    let ok = true;
    for (let j = 0; j < k; j++) if (b.bits[j] !== prefix[j]) ok = false;
    if (ok) return true;
  }
  return false;
}

function router(S) {
  for (let i = 0; i < 7; i++) {
    const { k, prefix } = T.switchNode(i);
    const sn = T.NODES[k];
    let best = null, bestS = -Infinity;
    for (const b of S.bodies) {
      if (b.s >= sn - 1 || b.bits[k] != null || b.plan == null) continue;
      const pb = T.leafBits(b.plan);
      let ok = true;
      for (let j = 0; j < k; j++) if ((b.bits[j] ?? pb[j]) !== prefix[j]) ok = false;
      if (ok && b.s > bestS) { best = pb[k]; bestS = b.s; }
    }
    if (best == null && S.train && S.train.cuts[0]?.plan != null) {
      const pb = T.leafBits(S.train.cuts[0].plan);
      let ok = true;
      for (let j = 0; j < k; j++) if (pb[j] !== prefix[j]) ok = false;
      if (ok && !S.bodies.some((b) => b.s < sn && b.bits[k] == null && b.wasMoving && !b.pre)) best = pb[k];
    }
    if (best != null && S.switches[i] !== best && !switchOccupied(S, i)) {
      S.switches[i] = best;
      S.swT[i] = S.t;
    }
  }
}

// ---------- the step ----------

function trainStep(S, dt) {
  if (!S.train) {
    if (S.trainIdx >= S.trains.length) return;
    S.trainWait -= dt;
    if (S.trainWait > 0) return;
    S.train = { cuts: S.trains[S.trainIdx], front: -22, v: 0 };
    event(S, 'train', `Train ${S.trainIdx + 1} of ${S.trains.length} on the hump`);
    return;
  }
  const tr = S.train;
  const target = Math.max(0, Math.min(2.2, S.hump));
  const dv = target - tr.v;
  tr.v += Math.sign(dv) * Math.min(Math.abs(dv), 0.18 * dt);
  tr.front += tr.v * dt;
  let blocked = false;
  for (const b of S.bodies) {
    if (b.s > tr.front && rear(b) < tr.front + 0.3) { tr.front = rear(b) - 0.3; tr.v = 0; blocked = true; }
  }
  S.blocked = blocked ? (S.blocked || 0) + dt : 0;
  const c = tr.cuts[0];
  let off = 0, m = 0, mx = 0;
  for (const car of c.cars) { mx += car.mass * (off + car.len / 2); m += car.mass; off += car.len; }
  if (tr.front - mx / m >= 0.3) {
    const b = addBody(S, { cars: c.cars, s: tr.front, v: tr.v, plan: c.plan, manual: c.manual });
    b.wasMoving = true;
    S.released++;
    tr.front -= off;
    tr.cuts.shift();
    if (!tr.cuts.length) {
      S.train = null;
      S.trainIdx++;
      S.trainWait = 45;
    }
  }
}

// The rollability radar watches each cut on the steep part of the hump and
// backs rolling resistance out of the energy it gained: everything else in
// the balance (grade under each car, wind drag, speed) is measured.
function radarStep(S, b, ds) {
  if (b.pre) return;
  const firstCentre = b.s - b.cars[0].len / 2;
  if (!b.radar) {
    if (b.s < 5 || firstCentre >= T.MASTER[0] - 2) return;
    b.radar = { ke0: 0.5 * b.mass * EFF * b.v * b.v, s0: b.s, wg: 0, wd: 0, wn: 0 };
    return;
  }
  const rd = b.radar;
  if (rd.done) return;
  let off = 0;
  const vrel = b.v - S.wind;
  for (let j = 0; j < b.cars.length; j++) {
    const c = b.cars[j];
    const sc = b.s - off - c.len / 2;
    off += c.len;
    rd.wg += c.mass * T.G * T.grade(sc - ds / 2) * ds;
    rd.wn += c.mass * T.G * ds;
    rd.wd -= 0.5 * RHO * c.cda * (j === 0 ? 1 : 0.3) * vrel * Math.abs(vrel) * ds;
  }
  const dist = b.s - rd.s0;
  if (dist >= 35 || firstCentre >= T.MASTER[0] - 2) {
    rd.done = true;
    rd.dist = dist;
    if (dist < 6) { b.rrEst = 0.0026 * S.coldF; rd.guess = true; return; }
    const dke = 0.5 * b.mass * EFF * b.v * b.v - rd.ke0;
    b.rrEst = Math.max(0.0005, (rd.wg + rd.wd - dke) / rd.wn + 0.0002 * Math.sqrt(35 / dist) * S.r.gauss());
  }
}

function passSwitches(S, b, prevS) {
  for (let k = 0; k < 3; k++) {
    const sn = T.NODES[k];
    if (b.bits[k] == null && prevS < sn && b.s >= sn) {
      b.bits[k] = S.switches[T.switchIndex(k, b.bits)];
      if (b.plan != null && T.leafBits(b.plan)[k] !== b.bits[k] && !b.misrouted) {
        b.misrouted = true;
        const L = T.bitsLeaf(pathBits(S, b));
        event(S, 'misroute', `Misroute: ${b.block} cut meant for track ${b.plan + 1} is heading for ${L + 1} — switch ${k + 1} was still occupied`, 0, { leaf: L });
      }
    }
  }
}

function grade_(v, n) {
  if (v <= GOOD) return { cls: 'good', pts: 5 * n, label: 'good' };
  if (v <= FIRM) return { cls: 'firm', pts: 0, label: 'firm' };
  if (v <= HEAVY) return { cls: 'hard', pts: -30, label: 'damaging' };
  return { cls: 'smash', pts: -80, label: 'heavy damage' };
}

function collide(S) {
  let merged = true, guard = 0;
  while (merged && guard++ < 20) {
    merged = false;
    const bs = S.bodies;
    outer: for (let i = 0; i < bs.length; i++) {
      const A = bs[i];
      if (Math.abs(A.v) < 1e-4) continue;
      for (let j = 0; j < bs.length; j++) {
        if (i === j) continue;
        const B = bs[j];
        const lead = A.s >= B.s ? A : B, trail = lead === A ? B : A;
        const lr = rear(lead);
        if (trail.s < lr) continue;
        let ok = true;
        for (let k = 0; k < 3; k++) if (T.NODES[k] < lr && lead.bits[k] !== trail.bits[k]) ok = false;
        if (!ok) continue;
        const vrel = trail.v - lead.v;
        const mover = Math.abs(trail.v) >= Math.abs(lead.v) ? trail : lead;
        const nb = addBody(S, {
          cars: lead.cars.concat(trail.cars), s: lead.s,
          v: (lead.v * lead.mass + trail.v * trail.mass) / (lead.mass + trail.mass),
          bits: lead.bits.slice(), plan: lead.plan, manual: lead.manual, pre: lead.pre && trail.pre,
        });
        nb.wasMoving = true; nb.misrouted = lead.misrouted;
        if (lead.rrEst != null || trail.rrEst != null) nb.rrEst = lead.rrEst ?? trail.rrEst;
        S.bodies = S.bodies.filter((x) => x !== lead && x !== trail);
        if (vrel > 0.05 && !mover.pre) {
          const n = mover.cars.filter((c) => !c.pre).length;
          const g = grade_(vrel, n);
          const L = leafOf(nb);
          if (g.pts < 0) { S.score.damage += g.pts; mover.cars.forEach((c) => (c.damaged = true)); }
          else S.score.couple += g.pts;
          if (L >= 0) S.lastCouple[L] = { v: vrel, cls: g.cls, t: S.t };
          const where = lead.s < T.CLEAR ? ' in the ladder' : L >= 0 ? ` on track ${L + 1}` : '';
          event(S, 'couple', `${kmh(vrel).toFixed(1)} km/h coupling${where} — ${g.label}`, g.pts, { v: vrel, cls: g.cls, leaf: L, s: lr });
        }
        merged = true;
        break outer;
      }
    }
  }
}

export function step(S, dt = DT) {
  if (S.done) return;
  S.t += dt;
  S.wind = windAt(S, S.t);
  trainStep(S, dt);
  autoPlan(S);
  router(S);
  for (const b of S.bodies) {
    const prev = b.s;
    const leaf = leafOf(b);
    const { Fd, R } = forces(b, leaf, S.wind, S.coldF, S.input.master, S.input.track);
    integrate(b, Fd, R, dt);
    if (Math.abs(b.v) > 1e-4) b.wasMoving = true;
    radarStep(S, b, b.s - prev);
    passSwitches(S, b, prev);
    if (leaf >= 0 && b.s >= T.TRACK_END[leaf]) {
      if (b.v > GOOD && !b.pre) {
        const pts = b.v > HEAVY ? -80 : -30;
        S.score.damage += pts;
        event(S, 'bumper', `Hit the bumper on track ${leaf + 1} at ${kmh(b.v).toFixed(1)} km/h`, pts, { leaf, v: b.v });
      }
      b.s = T.TRACK_END[leaf];
      b.v = 0;
    }
  }
  collide(S);

  const moving = S.bodies.some((b) => Math.abs(b.v) > 1e-4);
  if (!S.train && S.trainIdx >= S.trains.length && !moving) S.still += dt; else S.still = 0;
  if (S.blocked > 90 && !S.done) {
    event(S, 'blocked', 'The hump has been blocked for 90 s — the shift is called off');
    finish(S);
  }
  if (S.still > 3 || S.t > S.shift.deadline + 900) finish(S);
}

// ---------- scoring ----------

export function evaluate(S) {
  const out = { placed: 0, misroute: 0, gaps: 0, gapM: 0, foul: 0, late: 0, couple: S.score.couple, damage: S.score.damage, nCars: S.nCars };
  for (let L = 0; L < T.N_TRACKS; L++) {
    const on = S.bodies.filter((b) => leafOf(b) === L).sort((a, b) => b.s - a.s);
    if (!on.length) continue;
    const blk = S.assign[L] ?? on[0].cars[0].block;
    for (const b of on) for (const c of b.cars) if (!c.pre) (c.block === blk ? out.placed += 10 : out.misroute -= 25);
    for (let i = 1; i < on.length; i++) {
      if (Math.abs(on[i].v) > 1e-3 || Math.abs(on[i - 1].v) > 1e-3) continue;
      const gap = rear(on[i - 1]) - on[i].s;
      if (gap > 1) { out.gapM += gap; out.gaps -= Math.min(150, 0.5 * gap); }
    }
    const last = on[on.length - 1];
    if (Math.abs(last.v) < 1e-3 && rear(last) < T.CLEAR) out.foul -= 40;
  }
  for (const b of S.bodies) if (leafOf(b) < 0 && !b.pre && b.s > 0) { out.misroute -= 25 * b.cars.length; out.foul -= 40; }
  let left = 0;
  if (S.train) for (const c of S.train.cuts) left += c.cars.length;
  for (let i = S.trainIdx + (S.train ? 1 : 0); i < S.trains.length; i++) for (const c of S.trains[i]) left += c.cars.length;
  if (S.done) out.misroute -= 25 * left;
  out.late = -Math.max(0, Math.round((S.done ? S.endT : S.t) - S.shift.deadline));
  if (!S.done && S.t < S.shift.deadline) out.late = 0;
  out.total = Math.round(out.placed + out.misroute + out.gaps + out.foul + out.late + out.couple + out.damage);
  out.max = S.nCars * 15;
  const f = out.total / out.max;
  out.medal = f >= 0.8 ? 'gold' : f >= 0.65 ? 'silver' : f >= 0.45 ? 'bronze' : null;
  return out;
}

function finish(S) {
  S.done = true;
  S.endT = S.t;
  S.result = evaluate(S);
  event(S, 'end', 'Shift complete');
}

// ---------- prediction ----------

// Rolls a body forward alone against the cars standing on its track, using the
// radar's rr estimate. Returns where it stops or couples and how fast.
export function predict(S, b, o = {}) {
  const bits = pathBits(S, b);
  const leaf = T.bitsLeaf(bits);
  let obst = T.TRACK_END[leaf], obstKind = 'bumper';
  const depth = o.depth ?? 0;
  for (const x of S.bodies) {
    if (x === b || x.s <= b.s) continue;
    const moving = Math.abs(x.v) > 1e-3;
    if ((moving ? T.bitsLeaf(pathBits(S, x)) : leafOf(x)) !== leaf) continue;
    let r = rear(x);
    // A cut still rolling ahead will be further on by the time we get there.
    if (moving && depth < 2) {
      const q = predict(S, x, { depth: depth + 1, wind: o.wind, rr: o.rr === null ? null : undefined, dt: 0.4 });
      r = Math.max(r, q.s - x.len);
    }
    if (r > b.s && r < obst) { obst = r; obstKind = 'couple'; }
  }
  const p = { cars: b.cars, s: b.s, v: b.v, mass: b.mass, len: b.len };
  const rrO = o.rr === undefined ? (b.rrEst ?? null) : o.rr;
  const dt = o.dt ?? 0.2;
  // Over a long roll the forecast mean is a better guess than this gust.
  const wind = o.wind ?? (S.shift.windMean * 0.6 + S.wind * 0.4);
  let master = !!o.master, track = !!o.track;
  const res = { leaf, v210: null, v245: null, obst };
  for (let i = 0, n = 500 / dt; i < n; i++) {
    const lf = p.s > T.CLEAR ? leaf : -1;
    if (o.masterUntil != null && p.s > o.masterUntil) master = false;
    const { Fd, R } = forces(p, lf, wind, S.coldF, master, track, rrO ?? undefined);
    const pv = p.s;
    integrate(p, Fd, R, dt);
    if (res.v210 == null && p.s >= T.TRACK_RET[0]) res.v210 = p.v;
    if (res.v245 == null && p.s >= T.TRACK_RET[1]) res.v245 = p.v;
    if (p.s >= obst) return { ...res, kind: obstKind, v: p.v, s: obst, gap: 0 };
    if (p.v <= 0 && pv >= p.s - 1e-6 && p.s > T.CLEAR) return { ...res, kind: 'stall', v: 0, s: p.s, gap: obst - p.s };
    if (p.v <= 0 && p.s < T.CLEAR && i > 50 && Fd <= R * STATIC) return { ...res, kind: 'stall', v: 0, s: p.s, gap: obst - p.s };
  }
  return { ...res, kind: 'stall', v: 0, s: p.s, gap: obst - p.s };
}

export function hash(S) {
  let h = 2166136261;
  const add = (x) => { h ^= Math.round(x * 1000); h = Math.imul(h, 16777619) >>> 0; };
  for (const b of S.bodies.slice().sort((a, b) => a.s - b.s)) { add(b.s); add(b.v); add(b.cars.length); add(leafOf(b)); }
  add(S.score.couple); add(S.score.damage); add(S.t);
  return h.toString(16);
}
