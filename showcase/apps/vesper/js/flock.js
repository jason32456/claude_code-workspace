// The flock. Every bird is a row in a set of flat typed arrays, neighbours come
// from a uniform spatial hash, and the whole thing is allocation-free per frame
// because at 1200 birds the garbage collector is the only thing that can
// realistically ruin the frame budget.

import { MAX_BIRDS, FLOCK, STAMINA } from './config.js';

const TABLE = 1 << 13;
const MASK = TABLE - 1;

const DEAD = 0;
const MEMBER = 1;
const WILD = 2;

export class Flock {
  constructor() {
    const n = MAX_BIRDS;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.ppx = new Float32Array(n);
    this.ppy = new Float32Array(n);
    this.ppz = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.stamina = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.exposure = new Float32Array(n);
    this.state = new Uint8Array(n);
    this.group = new Int16Array(n);
    this.bank = new Float32Array(n);

    this.counts = new Int32Array(TABLE + 1);
    this.starts = new Int32Array(TABLE + 1);
    this.entries = new Int32Array(n);
    this.cellIdx = new Int32Array(n);

    this.count = 0;
    this.wildCount = 0;
    this.high = 0; // highest index ever used, so loops stay short

    this.cx = 0; this.cy = 0; this.cz = 0;
    this.vcx = 1; this.vcy = 0; this.vcz = 0;
    this.speed = FLOCK.cruiseLoose;
    this.radius = 20;
    this.avgStamina = 1;

    this.flashT = 0;
    this.flashX = 0; this.flashY = 0; this.flashZ = 0;

    this.deaths = [];
    this.recruitedThisFrame = 0;
    this.free = [];
  }

  reset() {
    this.state.fill(DEAD);
    this.count = 0;
    this.wildCount = 0;
    this.high = 0;
    this.free.length = 0;
    this.deaths.length = 0;
    this.flashT = 0;
    this.cx = 0; this.cy = 70; this.cz = 0;
    this.vcx = 1; this.vcy = 0; this.vcz = 0;
    this.radius = 20;
    this.avgStamina = 1;
  }

  alloc() {
    if (this.free.length) return this.free.pop();
    if (this.high < MAX_BIRDS) return this.high++;
    return -1;
  }

  spawn(x, y, z, vx, vy, vz, st, groupId) {
    const i = this.alloc();
    if (i < 0) return -1;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.ppx[i] = x; this.ppy[i] = y; this.ppz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.stamina[i] = 0.75 + Math.random() * 0.25;
    this.phase[i] = Math.random() * Math.PI * 2;
    this.exposure[i] = 0;
    this.bank[i] = 0;
    this.state[i] = st;
    this.group[i] = groupId;
    if (st === MEMBER) this.count++;
    else this.wildCount++;
    return i;
  }

  kill(i, record) {
    if (this.state[i] === DEAD) return;
    if (this.state[i] === MEMBER) this.count--;
    else this.wildCount--;
    if (record) this.deaths.push(this.px[i], this.py[i], this.pz[i]);
    this.state[i] = DEAD;
    this.py[i] = -9999;
    this.free.push(i);
  }

  convert(i) {
    if (this.state[i] !== WILD) return;
    this.state[i] = MEMBER;
    this.group[i] = -1;
    this.wildCount--;
    this.count++;
    this.recruitedThisFrame++;
  }

  flash() {
    this.flashT = FLOCK.flashDecay;
    this.flashX = this.cx;
    this.flashY = this.cy;
    this.flashZ = this.cz;
  }

  buildHash() {
    const { counts, starts, entries, cellIdx, px, py, pz, state } = this;
    counts.fill(0);
    const inv = 1 / FLOCK.perception;
    for (let i = 0; i < this.high; i++) {
      if (state[i] === DEAD) { cellIdx[i] = -1; continue; }
      const ix = Math.floor(px[i] * inv);
      const iy = Math.floor(py[i] * inv);
      const iz = Math.floor(pz[i] * inv);
      const h = ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & MASK;
      cellIdx[i] = h;
      counts[h]++;
    }
    let acc = 0;
    for (let c = 0; c < TABLE; c++) {
      starts[c] = acc;
      acc += counts[c];
      counts[c] = starts[c];
    }
    starts[TABLE] = acc;
    for (let i = 0; i < this.high; i++) {
      const h = cellIdx[i];
      if (h < 0) continue;
      entries[counts[h]++] = i;
    }
  }

  // ctx: { dt, lead:{x,y,z}, density, falcons, terrain, wind, groups, speedTarget }
  update(dt, ctx) {
    this.recruitedThisFrame = 0;
    this.ppx.set(this.px.subarray(0, this.high));
    this.ppy.set(this.py.subarray(0, this.high));
    this.ppz.set(this.pz.subarray(0, this.high));

    this.buildHash();

    const dens = ctx.density;
    const sepR = FLOCK.sepRadiusLoose + (FLOCK.sepRadiusTight - FLOCK.sepRadiusLoose) * dens;
    const sepR2 = sepR * sepR;
    const cohW = FLOCK.cohWeightLoose + (FLOCK.cohWeightTight - FLOCK.cohWeightLoose) * dens;
    const cruise = FLOCK.cruiseLoose + (FLOCK.cruiseTight - FLOCK.cruiseLoose) * dens;
    const per2 = FLOCK.perception * FLOCK.perception;
    const {
      px, py, pz, vx, vy, vz, state, group, stamina, entries, starts, counts,
    } = this;
    const terrain = ctx.terrain;
    const falcons = ctx.falcons;
    const lead = ctx.lead;
    const dir = ctx.leadDir;
    const inv = 1 / FLOCK.perception;

    const flashActive = this.flashT > 0;
    const flashK = flashActive ? (this.flashT / FLOCK.flashDecay) * FLOCK.flashImpulse : 0;

    let sx = 0, sy = 0, sz = 0, svx = 0, svy = 0, svz = 0, n = 0, sstam = 0;

    for (let i = 0; i < this.high; i++) {
      const st = state[i];
      if (st === DEAD) continue;
      const x = px[i], y = py[i], z = pz[i];

      // --- neighbourhood -------------------------------------------------
      let sepx = 0, sepy = 0, sepz = 0;
      let alix = 0, aliy = 0, aliz = 0;
      let cohx = 0, cohy = 0, cohz = 0;
      let nn = 0, ns = 0;
      const bx = Math.floor(x * inv), by = Math.floor(y * inv), bz = Math.floor(z * inv);
      for (let ox = -1; ox <= 1 && nn < FLOCK.neighbourCap; ox++) {
        for (let oy = -1; oy <= 1 && nn < FLOCK.neighbourCap; oy++) {
          for (let oz = -1; oz <= 1 && nn < FLOCK.neighbourCap; oz++) {
            const h = (((bx + ox) * 73856093) ^ ((by + oy) * 19349663) ^ ((bz + oz) * 83492791)) & MASK;
            const s = starts[h], e = counts[h];
            for (let k = s; k < e; k++) {
              const j = entries[k];
              if (j === i) continue;
              const dx = px[j] - x, dy = py[j] - y, dz = pz[j] - z;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 > per2 || d2 < 1e-6) continue;
              if (d2 < sepR2) {
                const inv2 = 1 / d2;
                sepx -= dx * inv2; sepy -= dy * inv2; sepz -= dz * inv2;
                ns++;
              }
              if (state[j] === st) {
                alix += vx[j]; aliy += vy[j]; aliz += vz[j];
                cohx += px[j]; cohy += py[j]; cohz += pz[j];
                nn++;
                if (nn >= FLOCK.neighbourCap) break;
              }
            }
          }
        }
      }

      let ax = 0, ay = 0, az = 0;
      if (ns > 0) {
        ax += sepx * FLOCK.sepWeight * 4;
        ay += sepy * FLOCK.sepWeight * 4;
        az += sepz * FLOCK.sepWeight * 4;
      }
      if (nn > 0) {
        const invn = 1 / nn;
        ax += (alix * invn - vx[i]) * FLOCK.aliWeight;
        ay += (aliy * invn - vy[i]) * FLOCK.aliWeight;
        az += (aliz * invn - vz[i]) * FLOCK.aliWeight;
        ax += (cohx * invn - x) * cohW;
        ay += (cohy * invn - y) * cohW;
        az += (cohz * invn - z) * cohW;
      }

      // --- intent --------------------------------------------------------
      const stam = stamina[i];
      if (st === MEMBER) {
        // Steer the *heading*, not a point: seeking a point 34 m ahead makes a
        // flock orbit it, which looks right and travels nowhere.
        const w = FLOCK.leadWeight * (0.32 + 0.68 * stam);
        ax += (dir.x * cruise - vx[i]) * w;
        ay += (dir.y * cruise - vy[i]) * w;
        az += (dir.z * cruise - vz[i]) * w;
        // and a weak pull to the lead point so the mass stays under the course
        ax += (lead.x - x) * w * 0.02;
        ay += (lead.y - y) * w * 0.05;
        az += (lead.z - z) * w * 0.02;
      } else {
        const g = ctx.groups[group[i]];
        if (g) {
          const dx = g.x - x, dz = g.z - z;
          const d = Math.hypot(dx, dz) || 1;
          const w = g.scattered ? -1.4 : FLOCK.wildHomeWeight;
          ax += (dx / d) * w * 3 + (-dz / d) * (g.scattered ? 0 : 3.2);
          az += (dz / d) * w * 3 + (dx / d) * (g.scattered ? 0 : 3.2);
          ay += (g.y - y) * 0.35;
        }
      }

      // --- predators ------------------------------------------------------
      for (let f = 0; f < falcons.length; f++) {
        const fa = falcons[f];
        if (!fa.active) continue;
        const dx = x - fa.x, dy = y - fa.y, dz = z - fa.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > FLOCK.predatorRadius * FLOCK.predatorRadius) continue;
        const d = Math.sqrt(d2) || 1;
        const k = FLOCK.predatorWeight / (d2 + 12);
        ax += (dx / d) * k; ay += (dy / d) * k; az += (dz / d) * k;
      }

      // --- flash expansion --------------------------------------------------
      if (flashActive && st === MEMBER) {
        const dx = x - this.flashX, dy = y - this.flashY, dz = z - this.flashZ;
        const d = Math.hypot(dx, dy, dz) || 1;
        ax += (dx / d) * flashK; ay += (dy / d) * flashK; az += (dz / d) * flashK;
      }

      // --- terrain / ceiling ------------------------------------------------
      const gy = terrain.heightAt(x, z);
      const clear = y - gy;
      if (clear < FLOCK.minClearance) {
        ay += (FLOCK.minClearance - clear) * 9;
        stamina[i] = Math.max(0, stam - dt * 0.05);
      }
      if (y > 250) ay -= (y - 250) * 4;


      // --- integrate ---------------------------------------------------------
      const am = Math.hypot(ax, ay, az);
      if (am > FLOCK.maxForce) {
        const s = FLOCK.maxForce / am;
        ax *= s; ay *= s; az *= s;
      }
      let nvx = vx[i] + ax * dt;
      let nvy = vy[i] + ay * dt;
      let nvz = vz[i] + az * dt;

      const target = st === MEMBER ? cruise * (0.55 + 0.45 * stam) : 15;
      let sp = Math.hypot(nvx, nvy, nvz);
      if (sp < 1e-4) { nvx = 1; nvy = 0; nvz = 0; sp = 1; }
      // pull speed toward the target rather than clamping, so the flock
      // accelerates and decelerates as a mass instead of snapping
      const want = Math.min(FLOCK.maxSpeed, Math.max(FLOCK.minSpeed, target));
      const blend = 1 - Math.exp(-dt * 2.6);
      const ns2 = sp + (want - sp) * blend;
      const sc = ns2 / sp;
      nvx *= sc; nvy *= sc; nvz *= sc;

      vx[i] = nvx; vy[i] = nvy; vz[i] = nvz;
      // Wind moves the air mass, not the birds: they hold their airspeed and get
      // carried, which is why you crab into a crosswind instead of fighting it.
      const nx = x + (nvx + ctx.wind.x) * dt;
      const ny = y + (nvy + ctx.wind.y) * dt;
      const nz = z + (nvz + ctx.wind.z) * dt;
      px[i] = nx;
      py[i] = Math.max(gy + 1.4, ny);
      pz[i] = nz;

      // bank angle follows lateral acceleration, purely cosmetic
      const lat = (nvx * az - nvz * ax) / (sp + 1);
      this.bank[i] += (Math.max(-1.1, Math.min(1.1, lat * 0.05)) - this.bank[i]) * Math.min(1, dt * 6);
      this.phase[i] += dt * (7 + sp * 0.22);

      // --- stamina ----------------------------------------------------------
      if (st === MEMBER) {
        const over = Math.max(0, sp - 20);
        let drain = STAMINA.drainBase + over * STAMINA.drainSpeed + dens * STAMINA.drainDensity;
        stamina[i] = Math.max(0, Math.min(1, stam - drain * dt + STAMINA.recover * dt * 0.35));
        sx += nx; sy += ny; sz += nz;
        svx += nvx; svy += nvy; svz += nvz;
        sstam += stamina[i];
        n++;
      }
    }

    if (n > 0) {
      const invn = 1 / n;
      this.cx = sx * invn; this.cy = sy * invn; this.cz = sz * invn;
      this.vcx = svx * invn; this.vcy = svy * invn; this.vcz = svz * invn;
      this.speed = Math.hypot(this.vcx, this.vcy, this.vcz);
      this.avgStamina = sstam * invn;
      let r2 = 0;
      for (let i = 0; i < this.high; i++) {
        if (state[i] !== MEMBER) continue;
        const dx = px[i] - this.cx, dy = py[i] - this.cy, dz = pz[i] - this.cz;
        r2 += dx * dx + dy * dy + dz * dz;
      }
      this.radius = Math.sqrt(r2 * invn) || 1;
      const invr = 1 / (this.radius * 1.9);
      for (let i = 0; i < this.high; i++) {
        if (state[i] !== MEMBER) continue;
        const dx = px[i] - this.cx, dy = py[i] - this.cy, dz = pz[i] - this.cz;
        this.exposure[i] = Math.min(1, Math.sqrt(dx * dx + dy * dy + dz * dz) * invr);
      }
    }

    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);

    this.recruit(dt, ctx.groups);
  }

  // Wild birds join if the flock arrives slowly and coherently; barrel through
  // and the group breaks up instead — the two things you want are opposed.
  recruit(dt, groups) {
    const slow = this.speed < 26;
    const fast = this.speed > 33;
    const { px, py, pz, state, group } = this;
    for (let i = 0; i < this.high; i++) {
      if (state[i] !== WILD) continue;
      const dx = px[i] - this.cx, dy = py[i] - this.cy, dz = pz[i] - this.cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 44 * 44) continue;
      const g = groups[group[i]];
      if (fast && g && !g.scattered) g.scattered = true;
      if (g && g.scattered) continue;
      if (slow && Math.random() < dt * 2.2) this.convert(i);
    }
  }

  // Local crowding around one bird, 0..1 — this is the confusion effect.
  localDensity(i) {
    const { px, py, pz, state, entries, starts, counts } = this;
    const x = px[i], y = py[i], z = pz[i];
    const inv = 1 / FLOCK.perception;
    const bx = Math.floor(x * inv), by = Math.floor(y * inv), bz = Math.floor(z * inv);
    let c = 0;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const h = (((bx + ox) * 73856093) ^ ((by + oy) * 19349663) ^ ((bz + oz) * 83492791)) & MASK;
          for (let k = starts[h]; k < counts[h]; k++) {
            const j = entries[k];
            if (j === i || state[j] !== MEMBER) continue;
            const dx = px[j] - x, dy = py[j] - y, dz = pz[j] - z;
            if (dx * dx + dy * dy + dz * dz < 100) c++;
          }
        }
      }
    }
    return Math.min(1, c / 26);
  }

  // Weighted by exposure cubed: falcons take stragglers, not the core.
  pickTarget() {
    let best = -1, bestScore = -1;
    const tries = 56;
    for (let t = 0; t < tries; t++) {
      const i = (Math.random() * this.high) | 0;
      if (this.state[i] !== MEMBER) continue;
      const e = this.exposure[i];
      const s = e * e * e + Math.random() * 0.05;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  }

  panic(x, y, z, strength) {
    const { px, py, pz, vx, vy, vz, state, stamina } = this;
    for (let i = 0; i < this.high; i++) {
      if (state[i] !== MEMBER) continue;
      const dx = px[i] - x, dy = py[i] - y, dz = pz[i] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 2500) continue;
      const d = Math.sqrt(d2) || 1;
      const k = strength * (1 - d / 50);
      vx[i] += (dx / d) * k; vy[i] += (dy / d) * k; vz[i] += (dz / d) * k;
      stamina[i] = Math.max(0, stamina[i] - 0.05);
    }
  }

  drainAll(amount) {
    const { state, stamina } = this;
    for (let i = 0; i < this.high; i++) {
      if (state[i] === MEMBER) stamina[i] = Math.max(0, stamina[i] - amount);
    }
  }

  feed(x, y, z, radius, dt) {
    const { px, py, pz, state, stamina } = this;
    const r2 = radius * radius;
    let fed = 0;
    for (let i = 0; i < this.high; i++) {
      if (state[i] !== MEMBER) continue;
      const dx = px[i] - x, dy = py[i] - y, dz = pz[i] - z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      stamina[i] = Math.min(1, stamina[i] + STAMINA.feedGain * dt);
      fed++;
    }
    return fed;
  }

  // Birds lose the flock in the dark, worst for whoever is furthest out.
  loseToDark(rate, dt) {
    let budget = rate * dt;
    if (budget <= 0) return 0;
    let lost = 0;
    while (budget > 0) {
      if (Math.random() > budget && budget < 1) break;
      budget -= 1;
      let worst = -1, we = -1;
      for (let t = 0; t < 30; t++) {
        const i = (Math.random() * this.high) | 0;
        if (this.state[i] !== MEMBER) continue;
        if (this.exposure[i] > we) { we = this.exposure[i]; worst = i; }
      }
      if (worst < 0) break;
      this.kill(worst, false);
      lost++;
    }
    return lost;
  }
}

export { DEAD, MEMBER, WILD };
