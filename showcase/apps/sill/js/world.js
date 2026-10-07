// The world lives in screen coordinates. Panes (browser windows, real or
// simulated) are the only containers: the union of visible pane rects is where
// water may be, their left/right/bottom edges are walls and their tops are open.
// Water whose pane disappears falls freely until it lands in another pane or
// drops off the bottom of the screen.

import { Fluid } from './fluid.js';
import { resolveLevel, LEVEL_COUNT } from './levels.js';

const SUBSTEPS = 2;
const FRAME = 1 / 60;
const GRAVITY = 2300;
const WALL = 5;              // particle radius used against walls and rock
const CARRY_MAX = 520;       // cap on velocity a moving wall can hand a particle
const MAX_SPEED = 2100;
const DRAIN_HALF = 24;
const PANE_TIMEOUT = 1500;
const POKE_R = 46;
const SIDE_CARRY = 0.8;      // share of a sideways move applied rigidly; the rest sloshes
const FREE = -1;

export class World {
  constructor() {
    this.fluid = null;
    this.cap = 0;
    this.panes = new Map();  // id -> pane
    this.nextKey = 1;
    this.active = [];        // visible panes this frame, with inner bounds
    this.level = null;
    this.levelIndex = 0;
    this.time = 0;
    this.seq = 0;
    this.pokes = [];
    this.events = [];
    this.stats = { spilled: 0, steam: 0, start: 0, done: -1 };
    this.springOn = [];
    this.emitAcc = [];
    this.rand = mulberry(1234567);
    this.snap = null;
  }

  setScreen(S) { this.screen = { x: S.x, y: S.y, w: S.w, h: S.h }; }

  loadLevel(index) {
    index = Math.max(0, Math.min(LEVEL_COUNT - 1, index | 0));
    this.levelIndex = index;
    this.level = resolveLevel(index, this.screen);
    const area = this.screen.w * this.screen.h;
    const cap = Math.round(Math.max(380, Math.min(1000, area / 1350)));
    if (!this.fluid || this.fluid.cap !== cap) {
      this.fluid = new Fluid(cap);
      this.cap = cap;
    }
    this.fluid.clear();
    this.springOn = this.level.springs.map(() => false);
    this.emitAcc = this.level.springs.map(() => 0);
    this.stats = { spilled: 0, steam: 0, start: this.time, done: -1 };
    this.events.push({ e: 'level', index });
    this.levelVersion = (this.levelVersion || 0) + 1;
  }

  // Rect is the pane's content area in screen pixels.
  setPane(id, r, now) {
    let p = this.panes.get(id);
    if (!p) {
      p = { id, key: this.nextKey++, x: r.x, y: r.y, w: r.w, h: r.h, visible: false, drain: null, seen: now, lx: r.x, lr: r.x + r.w, lb: r.y + r.h };
      this.panes.set(id, p);
    }
    p.x = r.x; p.y = r.y; p.w = r.w; p.h = r.h;
    p.visible = !!r.visible;
    p.drain = r.drain && r.drain.open ? { x: r.drain.x } : null;
    p.seen = now;
    return p.key;
  }

  removePane(id) { this.panes.delete(id); }

  poke(x, y, dx, dy) {
    if (this.pokes.length < 32) this.pokes.push({ x, y, dx, dy });
  }

  refreshPanes(now) {
    const act = this.active;
    act.length = 0;
    for (const p of this.panes.values()) {
      if (now - p.seen > PANE_TIMEOUT) { this.panes.delete(p.id); continue; }
      // Edge motion since the last step: a rising floor lifts its water as a
      // block (water is incompressible, a one-pass relaxation is not), and a
      // sideways move drags most of it along.
      const dl = p.x - p.lx, dr = p.x + p.w - p.lr, db = p.y + p.h - p.lb;
      p.lx = p.x; p.lr = p.x + p.w; p.lb = p.y + p.h;
      if (!p.visible || p.w < 2 * WALL + 4 || p.h < 2 * WALL + 4) continue;
      let cx = 0;
      if (dl > 0 && dr > 0) cx = Math.min(dl, dr);
      else if (dl < 0 && dr < 0) cx = Math.max(dl, dr);
      act.push({
        key: p.key, id: p.id, x: p.x, y: p.y, w: p.w, h: p.h,
        l: p.x + WALL, r: p.x + p.w - WALL, t: p.y, b: p.y + p.h - WALL,
        drain: p.drain,
        carryX: cx * SIDE_CARRY, carryY: db < 0 ? db : 0,
      });
    }
  }

  paneByKey(key) {
    const act = this.active;
    for (let k = 0; k < act.length; k++) if (act[k].key === key) return act[k];
    return null;
  }

  // Which visible pane contains (x, y)? Prefers `pref` when several do.
  containing(x, y, pref) {
    const act = this.active;
    let found = null;
    for (let k = 0; k < act.length; k++) {
      const p = act[k];
      let b = p.b;
      if (p.drain && Math.abs(x - p.drain.x) < DRAIN_HALF) b = p.y + p.h + WALL;
      if (x >= p.l && x <= p.r && y >= p.t && y <= b) {
        if (p.key === pref) return p;
        if (!found) found = p;
      }
    }
    return found;
  }

  step(now) {
    if (!this.level) return;
    this.refreshPanes(now);
    this.carry();
    const dt = FRAME / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) this.substep(dt, s === 0);
    this.emit();
    this.absorbAndLose();
    this.time += FRAME;
    this.seq++;
    this.pokes.length = 0;
  }

  carry() {
    const f = this.fluid;
    const act = this.active;
    let any = false;
    for (let k = 0; k < act.length; k++) if (act[k].carryX || act[k].carryY) { any = true; break; }
    if (!any) return;
    for (let i = 0; i < f.n; i++) {
      if (f.home[i] === FREE) continue;
      const p = this.paneByKey(f.home[i]);
      if (!p) continue;
      f.x[i] += p.carryX;
      f.y[i] += p.carryY;
    }
  }

  substep(dt, first) {
    const f = this.fluid;
    const { x, y, px, py, vx, vy, pushX, pushY } = f;
    const n = f.n;

    for (let i = 0; i < n; i++) vy[i] += GRAVITY * dt;

    if (first && this.pokes.length) {
      for (const pk of this.pokes) {
        const pvx = pk.dx / FRAME, pvy = pk.dy / FRAME;
        for (let i = 0; i < n; i++) {
          const ddx = x[i] - pk.x, ddy = y[i] - pk.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 > POKE_R * POKE_R) continue;
          const w = (1 - Math.sqrt(d2) / POKE_R) * 0.55;
          vx[i] += (pvx - vx[i]) * w;
          vy[i] += (pvy - vy[i]) * w;
        }
      }
    }

    f.buildHash();
    f.viscosity(dt);

    for (let i = 0; i < n; i++) {
      px[i] = x[i]; py[i] = y[i];
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      pushX[i] = 0; pushY[i] = 0;
    }

    f.buildHash();
    f.relax(dt);

    this.collideRocks();
    this.contain();

    const inv = 1 / dt;
    for (let i = 0; i < n; i++) {
      let nvx = (x[i] - px[i]) * inv;
      let nvy = (y[i] - py[i]) * inv;
      if (pushX[i] !== 0 || pushY[i] !== 0) {
        const cx = pushX[i] * inv, cy = pushY[i] * inv;
        nvx += clamp(cx, -CARRY_MAX, CARRY_MAX) - cx;
        nvy += clamp(cy, -CARRY_MAX, CARRY_MAX) - cy;
      }
      const sp2 = nvx * nvx + nvy * nvy;
      if (sp2 > MAX_SPEED * MAX_SPEED) {
        const k = MAX_SPEED / Math.sqrt(sp2);
        nvx *= k; nvy *= k;
      }
      vx[i] = nvx; vy[i] = nvy;
    }
  }

  collideRocks() {
    const f = this.fluid;
    const { x, y } = f;
    const rocks = this.level.rocks;
    const pots = this.level.pots;
    for (let i = 0; i < f.n; i++) {
      for (let k = 0; k < rocks.length; k++) {
        const rk = rocks[k];
        const abx = rk.bx - rk.ax, aby = rk.by - rk.ay;
        const apx = x[i] - rk.ax, apy = y[i] - rk.ay;
        const L2 = abx * abx + aby * aby;
        let t = L2 > 0 ? (apx * abx + apy * aby) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = rk.ax + abx * t, cy = rk.ay + aby * t;
        const dx = x[i] - cx, dy = y[i] - cy;
        const R = rk.r + WALL;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1e-3;
          const push = R - d;
          x[i] += (dx / d) * push;
          y[i] += (dy / d) * push;
        }
      }
      // A full pot is solid; a thirsty one is handled in absorbAndLose.
      for (let k = 0; k < pots.length; k++) {
        const p = pots[k];
        if (p.fill < p.need) continue;
        const l = p.x - WALL, r = p.x + p.w + WALL, t = p.y - WALL, b = p.y + p.h;
        if (x[i] > l && x[i] < r && y[i] > t && y[i] < b) {
          const dl = x[i] - l, dr = r - x[i], dt = y[i] - t;
          if (dt <= dl && dt <= dr) y[i] = t;
          else if (dl < dr) x[i] = l;
          else x[i] = r;
        }
      }
    }
  }

  contain() {
    const f = this.fluid;
    const { x, y, home, pushX, pushY } = f;
    for (let i = 0; i < f.n; i++) {
      const xi = x[i], yi = y[i];
      const inside = this.containing(xi, yi, home[i]);
      if (inside) { home[i] = inside.key; continue; }
      if (home[i] === FREE) continue;
      const H = this.paneByKey(home[i]);
      if (!H) { home[i] = FREE; continue; }
      // Out through the open top, or through an open sill: the particle is now
      // falling through the void.
      if (yi < H.t) { home[i] = FREE; continue; }
      if (H.drain && yi > H.b && Math.abs(xi - H.drain.x) < DRAIN_HALF) { home[i] = FREE; continue; }
      const cx = xi < H.l ? H.l : xi > H.r ? H.r : xi;
      const cy = yi > H.b ? H.b : yi;
      pushX[i] += cx - xi;
      pushY[i] += cy - yi;
      x[i] = cx; y[i] = cy;
    }
  }

  emit() {
    const lv = this.level;
    const f = this.fluid;
    f.buildHash();
    for (let k = 0; k < lv.springs.length; k++) {
      const sp = lv.springs[k];
      const ex = sp.x + sp.dx * 6, ey = sp.y + sp.dy * 6;
      const pane = this.containing(ex, ey, -2);
      this.springOn[k] = !!pane;
      if (!pane) { this.emitAcc[k] = 0; continue; }
      this.emitAcc[k] += sp.rate * FRAME;
      while (this.emitAcc[k] >= 1) {
        this.emitAcc[k] -= 1;
        if (f.n >= f.cap) break;
        if (f.densityAt(ex, ey) > 3.2) break;
        const j = (this.rand() - 0.5) * 7;
        const sv = sp.speed * (0.85 + this.rand() * 0.3);
        f.add(ex - sp.dy * j, ey + sp.dx * j, sp.dx * sv, sp.dy * sv, pane.key);
      }
    }
  }

  absorbAndLose() {
    const f = this.fluid;
    const lv = this.level;
    const { x, y, home } = f;
    let lostY = this.screen.y + this.screen.h;
    for (const p of this.active) lostY = Math.max(lostY, p.y + p.h);
    lostY += 260;
    const R2 = WALL + 2;

    for (let i = 0; i < f.n; i++) {
      const xi = x[i], yi = y[i];
      let gone = false;
      for (let k = 0; k < lv.pots.length; k++) {
        const p = lv.pots[k];
        if (p.fill >= p.need) continue;
        if (xi > p.x - R2 && xi < p.x + p.w + R2 && yi > p.y - R2 && yi < p.y + p.h) {
          p.fill++;
          if (p.fill >= p.need) {
            p.bloomAt = this.time;
            this.events.push({ e: 'bloom', pot: k, x: p.cx, y: p.y });
          }
          gone = true;
          break;
        }
      }
      if (!gone && lv.heat.length) {
        for (const hz of lv.heat) {
          const dx = xi - hz.x, dy = yi - hz.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < hz.r * hz.r) {
            const heat = 1 - Math.sqrt(d2) / hz.r;
            if (this.rand() < hz.rate * FRAME * (0.35 + heat)) {
              this.stats.steam++;
              if (this.events.length < 64) this.events.push({ e: 'steam', x: xi, y: yi });
              gone = true;
            }
            break;
          }
        }
      }
      if (!gone && home[i] === FREE && (yi > lostY || Math.abs(xi - this.screen.x) > 40000)) {
        this.stats.spilled++;
        gone = true;
      }
      if (gone) { f.remove(i); i--; }
    }

    if (this.stats.done < 0 && !lv.free && lv.pots.every((p) => p.fill >= p.need)) {
      this.stats.done = this.time;
      this.events.push({ e: 'complete', index: this.levelIndex, time: this.time - this.stats.start });
    }
  }

  // Static geometry, sent when the level changes or a pane joins.
  levelMessage() {
    const lv = this.level;
    return {
      t: 'level',
      version: this.levelVersion,
      index: lv.index, id: lv.id, name: lv.name, hint: lv.hint, free: lv.free,
      screen: lv.screen, scale: lv.scale,
      rocks: lv.rocks, springs: lv.springs, heat: lv.heat,
      pots: lv.pots.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, cx: p.cx, need: p.need, species: p.species, seed: p.seed })),
    };
  }

  // Per-frame state. Buffers are reused: postMessage clones them, and the
  // in-page simulated desktop reads them before the next step.
  snapshot() {
    const f = this.fluid;
    const n = f.n;
    let s = this.snap;
    if (!s || s.pos.length < f.cap * 2) {
      s = this.snap = {
        t: 'world',
        pos: new Float32Array(f.cap * 2),
        home: new Int32Array(f.cap),
        speed: new Uint8Array(f.cap),
      };
    }
    s.seq = this.seq;
    s.n = n;
    s.time = this.time;
    s.version = this.levelVersion;
    for (let i = 0; i < n; i++) {
      s.pos[2 * i] = f.x[i];
      s.pos[2 * i + 1] = f.y[i];
      s.home[i] = f.home[i];
      const sp = Math.hypot(f.vx[i], f.vy[i]);
      s.speed[i] = sp > 1020 ? 255 : sp / 4;
    }
    s.panes = this.active.map((p) => ({ key: p.key, id: p.id, x: p.x, y: p.y, w: p.w, h: p.h }));
    s.fills = this.level.pots.map((p) => p.fill);
    s.bloomAt = this.level.pots.map((p) => p.bloomAt);
    s.springOn = this.springOn.slice();
    s.stats = { spilled: this.stats.spilled, steam: this.stats.steam, elapsed: (this.stats.done >= 0 ? this.stats.done : this.time) - this.stats.start, done: this.stats.done >= 0 };
    s.events = this.events;
    this.events = [];
    return s;
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
