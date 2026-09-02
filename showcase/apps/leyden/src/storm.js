import * as THREE from '../vendor/three.module.js';
import { heightAt } from './world.js';
import { CLOUD_BASE, WORLD_HALF } from './scene.js';

const STEP = 4.6;
const MAX_STEPS = 210;
const CANDIDATES = 14;
// Floor added to the normalised gradient before the eta exponent. Without it the
// walk is a deterministic hill-climb and every bolt lands on the same target.
const WANDER = 0.62;

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class Storm {
  constructor(scene, world, sceneCtl) {
    this.scene = scene;
    this.world = world;
    this.sceneCtl = sceneCtl;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.tex = blobTexture();
    this.cells = [];
    this.bolts = [];
    this.rainCells = [];
    this.config = null;
    this.timer = 0;
    this.onAttach = null;
    this.onThunder = null;
    this.onWarn = null;
    this.charging = [];

    this.deck = new THREE.Group();
    this.group.add(this.deck);
    this._buildDeck();
  }

  _buildDeck() {
    // A flat under-cloud haze so the ceiling reads as solid from below.
    for (let i = 0; i < 150; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.tex,
          color: 0x1a2130,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        })
      );
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * 620;
      s.position.set(
        Math.cos(ang) * rad,
        CLOUD_BASE + 6 + Math.random() * 78,
        Math.sin(ang) * rad
      );
      const sc = 110 + Math.random() * 150;
      s.scale.set(sc, sc * 0.62, 1);
      this.deck.add(s);
    }
  }

  begin(config) {
    this.config = config;
    this.timer = 0;
    this.nextFire = config.firstDelay ?? 4;
    this.charging = [];
    this._clearBolts();
    this._buildCells(config);
    this._buildRain(config);
  }

  _buildCells(config) {
    for (const c of this.cells) this.group.remove(c.group);
    this.cells = [];
    const n = config.cells;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.9;
      const rad = config.cellRadius[0] + Math.random() * (config.cellRadius[1] - config.cellRadius[0]);
      const g = new THREE.Group();
      g.position.set(Math.cos(ang) * rad, CLOUD_BASE, Math.sin(ang) * rad);

      const puffs = [];
      for (let k = 0; k < 11; k++) {
        const m = new THREE.SpriteMaterial({
          map: this.tex,
          color: 0x232b3b,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        });
        const s = new THREE.Sprite(m);
        s.position.set(
          (Math.random() - 0.5) * 62,
          Math.random() * 26,
          (Math.random() - 0.5) * 62
        );
        const sc = 40 + Math.random() * 46;
        s.scale.set(sc, sc * 0.7, 1);
        g.add(s);
        puffs.push(m);
      }

      const coreMat = new THREE.SpriteMaterial({
        map: this.tex,
        color: 0x6fd0ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const core = new THREE.Sprite(coreMat);
      core.scale.set(78, 52, 1);
      core.position.y = 2;
      g.add(core);

      this.group.add(g);
      this.cells.push({
        group: g,
        puffs,
        coreMat,
        drift: new THREE.Vector3(
          (Math.random() - 0.5) * config.drift,
          0,
          (Math.random() - 0.5) * config.drift
        ),
        state: 'idle',
        warn: 0,
        cooldown: 0,
      });
    }
  }

  _buildRain(config) {
    for (const r of this.rainCells) this.group.remove(r.mesh);
    this.rainCells = [];
    for (let i = 0; i < (config.rainCells || 0); i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 40 + Math.random() * 120;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(38, 46, CLOUD_BASE, 14, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x4a6a8c,
          transparent: true,
          opacity: 0.055,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      mesh.position.set(Math.cos(ang) * rad, CLOUD_BASE / 2, Math.sin(ang) * rad);
      this.group.add(mesh);
      this.rainCells.push({
        mesh,
        radius: 42,
        vel: new THREE.Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9),
      });
    }
  }

  windAt(t) {
    const c = this.config;
    if (!c) return new THREE.Vector3();
    const g = c.gust;
    return new THREE.Vector3(
      c.wind[0] + Math.sin(t * 0.31) * g + Math.sin(t * 0.77 + 1.4) * g * 0.5,
      Math.sin(t * 0.53 + 2.1) * g * 0.35,
      c.wind[1] + Math.cos(t * 0.27 + 0.6) * g + Math.cos(t * 0.61) * g * 0.5
    );
  }

  rainAt(x, z) {
    let m = 0;
    for (const r of this.rainCells) {
      const d = Math.hypot(x - r.mesh.position.x, z - r.mesh.position.z);
      m = Math.max(m, Math.max(0, 1 - d / r.radius));
    }
    return m;
  }

  /** Potential used to score a leader's next step. */
  _phi(p, attractors) {
    let s = 0.34 / (p.y - heightAt(p.x, p.z) + 18);
    for (let i = 0; i < attractors.length; i++) {
      const a = attractors[i];
      const dx = p.x - a.pos.x;
      const dy = p.y - a.pos.y;
      const dz = p.z - a.pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 7;
      s += a.a / (d * Math.sqrt(d));
    }
    return s;
  }

  /** Striking distance grows with attractiveness, as it does in the real thing. */
  _reach(a) {
    const base = a.ref && a.ref.strikeRadius ? a.ref.strikeRadius : 9;
    return base * (1 + Math.min(1.7, a.a * 0.11));
  }

  /**
   * Dielectric-breakdown walk. Each step samples a cone of candidates and picks
   * one with probability proportional to potential^eta, so raising your own
   * attractiveness bends the distribution without ever guaranteeing the hit.
   */
  _growLeader(start, attractors, eta, branchP) {
    const pts = [start.clone()];
    const branches = [];
    let dir = new THREE.Vector3((Math.random() - 0.5) * 0.5, -1, (Math.random() - 0.5) * 0.5).normalize();
    let tip = start.clone();
    let attached = null;

    const cand = new THREE.Vector3();
    const scores = new Float64Array(CANDIDATES);
    const dirs = [];
    for (let i = 0; i < CANDIDATES; i++) dirs.push(new THREE.Vector3());

    for (let step = 0; step < MAX_STEPS; step++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < CANDIDATES; i++) {
        const d = dirs[i];
        d.set(
          dir.x * 0.85 + (Math.random() - 0.5) * 1.5,
          dir.y * 0.85 - 0.22 + (Math.random() - 0.5) * 0.9,
          dir.z * 0.85 + (Math.random() - 0.5) * 1.5
        ).normalize();
        cand.copy(tip).addScaledVector(d, STEP);
        const phi = this._phi(cand, attractors);
        scores[i] = phi;
        if (phi < lo) lo = phi;
        if (phi > hi) hi = phi;
      }
      // Normalised contrast: what steers the bolt is the local gradient, not the
      // absolute potential, so a distant attractor cannot swamp a near one.
      const span = hi - lo || 1e-9;
      let total = 0;
      for (let i = 0; i < CANDIDATES; i++) {
        const w = Math.pow((scores[i] - lo) / span + WANDER, eta);
        scores[i] = w;
        total += w;
      }
      let r = Math.random() * total;
      let chosen = CANDIDATES - 1;
      for (let i = 0; i < CANDIDATES; i++) {
        r -= scores[i];
        if (r <= 0) {
          chosen = i;
          break;
        }
      }
      dir.copy(dirs[chosen]);
      tip = tip.clone().addScaledVector(dir, STEP);
      pts.push(tip.clone());

      if (Math.random() < branchP && step > 3) {
        branches.push(this._growBranch(tip, dir, attractors, eta, 4 + Math.floor(Math.random() * 14)));
      }

      const g = heightAt(tip.x, tip.z);
      if (tip.y <= g + 0.5) {
        tip.y = g;
        attached = { ref: null, kind: 'ground', pos: tip.clone() };
        break;
      }
      for (let i = 0; i < attractors.length; i++) {
        const a = attractors[i];
        if (tip.distanceTo(a.pos) < this._reach(a)) {
          attached = { ref: a.ref, kind: a.ref && a.ref.kind ? a.ref.kind : 'player', pos: a.pos.clone() };
          pts.push(a.pos.clone());
          break;
        }
      }
      if (attached) break;
    }

    if (!attached) {
      const g = heightAt(tip.x, tip.z);
      attached = { ref: null, kind: 'ground', pos: new THREE.Vector3(tip.x, g, tip.z) };
    }
    return { pts, branches, attached };
  }

  _growBranch(start, dir, attractors, eta, budget) {
    const pts = [start.clone()];
    let d = dir.clone();
    let tip = start.clone();
    const cand = new THREE.Vector3();
    for (let step = 0; step < budget; step++) {
      let best = null;
      let bestScore = -1;
      for (let i = 0; i < 6; i++) {
        const nd = new THREE.Vector3(
          d.x * 0.6 + (Math.random() - 0.5) * 1.9,
          d.y * 0.6 - 0.2 + (Math.random() - 0.5) * 1.1,
          d.z * 0.6 + (Math.random() - 0.5) * 1.9
        ).normalize();
        cand.copy(tip).addScaledVector(nd, STEP * 0.9);
        const s = Math.pow(this._phi(cand, attractors), eta) * (0.4 + Math.random());
        if (s > bestScore) {
          bestScore = s;
          best = nd;
        }
      }
      d = best;
      tip = tip.clone().addScaledVector(d, STEP * 0.9);
      pts.push(tip.clone());
      if (tip.y <= heightAt(tip.x, tip.z)) break;
    }
    return pts;
  }

  fireCell(cell, player) {
    const attractors = this.world.attractors(player);
    const start = cell.group.position.clone();
    start.y -= 4;
    start.x += (Math.random() - 0.5) * 62;
    start.z += (Math.random() - 0.5) * 62;
    const eta = this.config.eta;
    const result = this._growLeader(start, attractors, eta, this.config.branch);
    this._spawnBolt(result, player);
    return result;
  }

  /** Adds the high-frequency kink a 4.6 m walk is too coarse to produce. */
  _jitter(pts) {
    if (pts.length < 2) return pts;
    const out = [pts[0]];
    const up = new THREE.Vector3(0, 1, 0);
    const seg = new THREE.Vector3();
    const perp = new THREE.Vector3();
    for (let i = 0; i < pts.length - 1; i++) {
      seg.subVectors(pts[i + 1], pts[i]);
      perp.crossVectors(seg, up).normalize();
      const bi = new THREE.Vector3().crossVectors(seg, perp).normalize();
      const mid = pts[i].clone().addScaledVector(seg, 0.5);
      const k = 1.5;
      mid.addScaledVector(perp, (Math.random() - 0.5) * k * 2);
      mid.addScaledVector(bi, (Math.random() - 0.5) * k * 2);
      out.push(mid, pts[i + 1]);
    }
    return out;
  }

  _spawnBolt(result, player) {
    const pts = this._jitter(result.pts);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
    const seg = Math.min(340, Math.max(8, pts.length));
    const coreGeo = new THREE.TubeGeometry(curve, seg, 1.15, 6, false);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xeaf6ff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);

    const glowGeo = new THREE.TubeGeometry(curve, seg, 5.2, 6, false);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x6fb8ff,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);

    const segPts = [];
    for (const br of result.branches) {
      for (let i = 0; i < br.length - 1; i++) {
        segPts.push(br[i], br[i + 1]);
      }
    }
    let branchMesh = null;
    let branchMat = null;
    if (segPts.length) {
      const bg = new THREE.BufferGeometry().setFromPoints(segPts);
      branchMat = new THREE.LineBasicMaterial({
        color: 0xbfe4ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      branchMesh = new THREE.LineSegments(bg, branchMat);
      branchMesh.visible = false;
    }

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xdcf2ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 3, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(result.attached.pos).add(new THREE.Vector3(0, 0.6, 0));

    this.group.add(core, glow, ring);
    if (branchMesh) this.group.add(branchMesh);

    const coreCount = coreGeo.index.count;
    coreGeo.setDrawRange(0, 0);
    glowGeo.setDrawRange(0, 0);

    this.bolts.push({
      core,
      coreMat,
      coreGeo,
      glow,
      glowMat,
      glowGeo,
      coreCount,
      branchMesh,
      branchMat,
      ring,
      ringMat,
      age: 0,
      struck: false,
      attached: result.attached,
      length: result.pts.length * STEP,
      player,
    });
  }

  _clearBolts() {
    for (const b of this.bolts) this._disposeBolt(b);
    this.bolts = [];
  }

  _disposeBolt(b) {
    this.group.remove(b.core, b.glow, b.ring);
    b.coreGeo.dispose();
    b.glowGeo.dispose();
    b.coreMat.dispose();
    b.glowMat.dispose();
    b.ring.geometry.dispose();
    b.ringMat.dispose();
    if (b.branchMesh) {
      this.group.remove(b.branchMesh);
      b.branchMesh.geometry.dispose();
      b.branchMat.dispose();
    }
  }

  update(dt, t, player, paused) {
    if (!this.config) return;
    this.timer += dt;

    for (const c of this.cells) {
      c.group.position.x += c.drift.x * dt;
      c.group.position.z += c.drift.z * dt;
      const r = Math.hypot(c.group.position.x, c.group.position.z);
      if (r > WORLD_HALF - 20) {
        c.drift.x *= -1;
        c.drift.z *= -1;
      }
      if (c.state === 'charging') {
        c.warn -= dt;
        const f = 1 - Math.max(0, c.warn) / this.config.warn;
        const flick = 0.6 + 0.4 * Math.sin(t * (6 + f * 30));
        c.coreMat.opacity = f * f * 0.55 * flick;
        for (const m of c.puffs) m.color.setRGB(0.14 + f * 0.25, 0.17 + f * 0.3, 0.24 + f * 0.4);
        if (c.warn <= 0) {
          c.state = 'idle';
          c.cooldown = this.config.cellCooldown;
          c.coreMat.opacity = 0.9;
          for (const m of c.puffs) m.color.setHex(0x232b3b);
          const res = this.fireCell(c, player);
          if (this.onFired) this.onFired(res);
        }
      } else {
        c.cooldown = Math.max(0, c.cooldown - dt);
        c.coreMat.opacity *= Math.pow(0.02, dt);
      }
    }

    this.charging = this.cells.filter((c) => c.state === 'charging');

    if (!paused) {
      this.nextFire -= dt;
      if (this.nextFire <= 0) {
        const n = this.config.simultaneous;
        const ready = this.cells.filter((c) => c.state === 'idle' && c.cooldown <= 0);
        for (let i = 0; i < n && ready.length; i++) {
          const idx = Math.floor(Math.random() * ready.length);
          const cell = ready.splice(idx, 1)[0];
          cell.state = 'charging';
          cell.warn = this.config.warn;
          if (this.onWarn) this.onWarn(cell);
        }
        this.nextFire =
          this.config.cadence[0] + Math.random() * (this.config.cadence[1] - this.config.cadence[0]);
      }
    }

    for (const r of this.rainCells) {
      r.mesh.position.x += r.vel.x * dt;
      r.mesh.position.z += r.vel.z * dt;
      if (Math.hypot(r.mesh.position.x, r.mesh.position.z) > WORLD_HALF - 30) {
        r.vel.x *= -1;
        r.vel.z *= -1;
      }
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.age += dt;
      const LEADER = 0.17;
      if (b.age < LEADER) {
        const f = b.age / LEADER;
        const count = Math.floor(b.coreCount * f);
        b.coreGeo.setDrawRange(0, count);
        b.glowGeo.setDrawRange(0, count);
        b.coreMat.opacity = 0.3;
        b.glowMat.opacity = 0.08;
      } else {
        b.coreGeo.setDrawRange(0, b.coreCount);
        b.glowGeo.setDrawRange(0, b.coreCount);
        if (!b.struck) {
          b.struck = true;
          if (b.branchMesh) b.branchMesh.visible = true;
          this.sceneCtl.pulse(b.attached.pos, 950);
          if (this.onAttach) this.onAttach(b.attached, b);
          if (this.onThunder) {
            const d = player ? player.pos.distanceTo(b.attached.pos) : 100;
            this.onThunder(d, 1);
          }
        }
        const a = b.age - LEADER;
        const decay = Math.exp(-a * 5.5);
        const flick = 0.55 + 0.45 * Math.sin(a * 62) * Math.sin(a * 23 + 1);
        b.coreMat.opacity = Math.min(1, decay * (0.6 + flick));
        b.glowMat.opacity = decay * 0.55;
        if (b.branchMat) b.branchMat.opacity = decay * 0.85;
        b.ringMat.opacity = Math.max(0, (1 - a * 2.4) * 0.55);
        const rs = 1 + a * 46;
        b.ring.scale.setScalar(rs);
      }
      if (b.age > 1.1) {
        this._disposeBolt(b);
        this.bolts.splice(i, 1);
      }
    }
  }

  /** The cell currently charging, for the HUD warning arrow. */
  activeWarning() {
    return this.charging.length ? this.charging[0] : null;
  }

  dispose() {
    this._clearBolts();
  }
}
