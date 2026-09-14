// The reef. A 128×128 value-noise heightfield, classified into five substrates,
// coloured per vertex, and dressed with instanced boulders, coral and seagrass.
//
// Substrates are not decoration: each one carries a camouflage signature
// (hue / lightness / texture) that the octopus's skin has to drift toward. Where
// you choose to stop is most of the hiding.

import * as THREE from '../vendor/three.module.js';
import { mulberry32, makeFbm, clamp, lerp, range } from './rng.js';

export const SUB = {
  SAND:     { id: 0, name: 'sand',     sig: { h: 0.11, l: 0.84, t: 0.05 }, col: [0.37, 0.33, 0.25], hard: false },
  RUBBLE:   { id: 1, name: 'rubble',   sig: { h: 0.09, l: 0.46, t: 0.50 }, col: [0.27, 0.25, 0.21], hard: true },
  CORAL:    { id: 2, name: 'coral',    sig: { h: 0.94, l: 0.58, t: 0.82 }, col: [0.33, 0.20, 0.22], hard: true },
  SEAGRASS: { id: 3, name: 'seagrass', sig: { h: 0.28, l: 0.32, t: 0.62 }, col: [0.13, 0.21, 0.12], hard: false },
  ROCK:     { id: 4, name: 'rock',     sig: { h: 0.54, l: 0.26, t: 0.28 }, col: [0.19, 0.22, 0.23], hard: true },
};
export const SUB_BY_ID = [SUB.SAND, SUB.RUBBLE, SUB.CORAL, SUB.SEAGRASS, SUB.ROCK];

const GRID = 128;

export class Reef {
  constructor(cfg) {
    this.cfg = cfg;
    this.seed = cfg.seed;
    this.size = cfg.size || 34;          // half-extent in metres
    this.group = new THREE.Group();

    const rnd = mulberry32(cfg.seed);
    this.rnd = rnd;

    const base = makeFbm(cfg.seed + 11, 4, 0.5, 2.1);
    const detail = makeFbm(cfg.seed + 29, 3, 0.55, 2.6);
    const patch = makeFbm(cfg.seed + 47, 2, 0.5, 2.0);
    const patch2 = makeFbm(cfg.seed + 71, 2, 0.5, 2.0);

    const S = this.size;
    const channelAng = range(rnd, -0.6, 0.6);
    const channelW = cfg.channel || 0;

    // ── height field ───────────────────────────────────────────────────────
    this.h = new Float32Array((GRID + 1) * (GRID + 1));
    this.sub = new Uint8Array((GRID + 1) * (GRID + 1));

    const relief = cfg.relief ?? 1;
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        const x = (i / GRID) * 2 * S - S;
        const z = (j / GRID) * 2 * S - S;
        let y = (base(x * 0.035, z * 0.035) - 0.5) * 7.0 * relief;
        y += (detail(x * 0.16, z * 0.16) - 0.5) * 1.5 * relief;

        // A sand channel scoured through the reef — flat, exposed, quick.
        if (channelW > 0) {
          const d = Math.abs(x * Math.cos(channelAng) + z * Math.sin(channelAng));
          const k = clamp(1 - d / channelW, 0, 1);
          y = lerp(y, -2.4 + (detail(x * 0.1, z * 0.1) - 0.5) * 0.5, k * k * (3 - 2 * k));
        }

        // Rim: the reef falls away into the blue at the edges.
        const r = Math.max(Math.abs(x), Math.abs(z)) / S;
        if (r > 0.82) y -= (r - 0.82) * 26;

        this.h[j * (GRID + 1) + i] = y;
      }
    }

    // ── substrate classification ──────────────────────────────────────────
    const coralBias = cfg.coral ?? 1;
    const grassBias = cfg.grass ?? 1;
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        const idx = j * (GRID + 1) + i;
        const x = (i / GRID) * 2 * S - S;
        const z = (j / GRID) * 2 * S - S;
        const y = this.h[idx];
        const slope = this._slopeAtIndex(i, j);
        const pc = patch(x * 0.07 + 3, z * 0.07 + 3) * coralBias;
        const pg = patch2(x * 0.055 - 5, z * 0.055 - 5) * grassBias;

        let s;
        if (slope > 0.75) s = SUB.ROCK.id;
        else if (pc > 0.63) s = SUB.CORAL.id;
        else if (pg > 0.62 && slope < 0.35) s = SUB.SEAGRASS.id;
        else if (y < -1.6 + (cfg.sandLevel ?? 0)) s = SUB.SAND.id;
        else if (slope > 0.34) s = SUB.RUBBLE.id;
        else s = pc > 0.5 ? SUB.RUBBLE.id : SUB.SAND.id;
        this.sub[idx] = s;
      }
    }

    this._buildTerrain();
    this._scatter(rnd);
    this._placeDen(rnd);
    this._placeCrevices(rnd);
    this._placeTraps(rnd);
    this._marineSnow(rnd);
  }

  // ── field queries ────────────────────────────────────────────────────────
  _slopeAtIndex(i, j) {
    const g = GRID, at = (a, b) => this.h[clamp(b, 0, g) * (g + 1) + clamp(a, 0, g)];
    const step = (2 * this.size) / GRID;
    const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * step);
    const dz = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
    return Math.hypot(dx, dz);
  }

  _gridPos(x, z) {
    const u = ((x + this.size) / (2 * this.size)) * GRID;
    const v = ((z + this.size) / (2 * this.size)) * GRID;
    return [clamp(u, 0, GRID - 0.001), clamp(v, 0, GRID - 0.001)];
  }

  heightAt(x, z) {
    const [u, v] = this._gridPos(x, z);
    const i = Math.floor(u), j = Math.floor(v);
    const fu = u - i, fv = v - j;
    const g = GRID + 1;
    const a = this.h[j * g + i], b = this.h[j * g + i + 1];
    const c = this.h[(j + 1) * g + i], d = this.h[(j + 1) * g + i + 1];
    return lerp(lerp(a, b, fu), lerp(c, d, fu), fv);
  }

  normalAt(x, z) {
    const e = 0.4;
    const hL = this.heightAt(x - e, z), hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e), hU = this.heightAt(x, z + e);
    const n = new THREE.Vector3(hL - hR, 2 * e, hD - hU);
    return n.normalize();
  }

  substrateAt(x, z) {
    const [u, v] = this._gridPos(x, z);
    const idx = Math.round(v) * (GRID + 1) + Math.round(u);
    return SUB_BY_ID[this.sub[idx]] || SUB.SAND;
  }

  inBounds(x, z) {
    const lim = this.size * 0.80;
    return Math.abs(x) < lim && Math.abs(z) < lim;
  }

  // ── terrain mesh ─────────────────────────────────────────────────────────
  _buildTerrain() {
    const S = this.size;
    const geo = new THREE.PlaneGeometry(S * 2, S * 2, GRID, GRID);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const jitter = mulberry32(this.seed + 5);

    for (let k = 0; k < pos.count; k++) {
      const i = k % (GRID + 1);
      const j = Math.floor(k / (GRID + 1));
      const idx = j * (GRID + 1) + i;
      pos.setY(k, this.h[idx]);
      const s = SUB_BY_ID[this.sub[idx]];
      const v = 0.82 + jitter() * 0.36;
      colors[k * 3] = s.col[0] * v;
      colors[k * 3 + 1] = s.col[1] * v;
      colors[k * 3 + 2] = s.col[2] * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.uniforms = { uTime: { value: 0 }, uCaustic: { value: this.cfg.caustics ?? 0.30 } };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uCaustic = this.uniforms.uCaustic;
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;'
      );
      sh.fragmentShader = `
        uniform float uTime; uniform float uCaustic; varying vec3 vWPos;
        float cwave(vec2 p, float t){
          return sin(p.x*1.63 + t*0.85) + sin(p.y*1.27 - t*0.66) + sin((p.x+p.y)*0.91 + t*1.24);
        }
        float caustics(vec2 p, float t){
          float a = 1.0 - abs(cwave(p, t) * 0.333);
          float b = 1.0 - abs(cwave(p * 1.73 + 4.0, t * 1.13) * 0.333);
          return pow(max(a * b, 0.0), 7.0);
        }
      ` + sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         gl_FragColor.rgb += vec3(0.26,0.44,0.52) * caustics(vWPos.xz * 0.5, uTime) * uCaustic;`
      );
    };
    this.terrainMat = mat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false;
    this.group.add(mesh);
    this.terrain = mesh;
  }

  // ── boulders, coral, grass ───────────────────────────────────────────────
  _scatter(rnd) {
    this.obstacles = [];

    const S = this.size;
    const bGeo = new THREE.IcosahedronGeometry(1, 0);
    // Squash them so they read as sea-worn boulders rather than dice.
    const bp = bGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      bp.setXYZ(i, bp.getX(i) * (0.8 + rnd() * 0.5), bp.getY(i) * (0.6 + rnd() * 0.4), bp.getZ(i) * (0.8 + rnd() * 0.5));
    }
    bGeo.computeVertexNormals();

    const count = this.cfg.boulders ?? 130;
    const bMesh = new THREE.InstancedMesh(bGeo, new THREE.MeshLambertMaterial({ vertexColors: false, color: 0x4a545a }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 12) {
      const x = range(rnd, -S * 0.78, S * 0.78);
      const z = range(rnd, -S * 0.78, S * 0.78);
      const s = this.substrateAt(x, z);
      if (s === SUB.SAND && rnd() > 0.12) continue;
      if (s === SUB.SEAGRASS && rnd() > 0.3) continue;
      const r = range(rnd, 0.42, 1.25);
      const y = this.heightAt(x, z);
      p.set(x, y + r * 0.35, z);
      e.set(range(rnd, -0.35, 0.35), rnd() * Math.PI * 2, range(rnd, -0.35, 0.35));
      q.setFromEuler(e);
      const hy = r * range(rnd, 0.5, 0.9);
      sc.set(r, hy, r * range(rnd, 0.8, 1.3));
      m.compose(p, q, sc);
      bMesh.setMatrixAt(placed, m);
      // `top` is what the camera uses to decide whether it can see over this
      // rock, so it has to be the real top of the mesh, not an estimate.
      this.obstacles.push({ x, z, r: r * 0.82, hard: true, top: y + r * 0.35 + hy });
      placed++;
    }
    bMesh.count = placed;
    bMesh.instanceMatrix.needsUpdate = true;
    this.group.add(bMesh);

    // Coral heads — brain corals and fans, only on coral substrate.
    const cGeo = new THREE.SphereGeometry(1, 7, 5);
    const cMesh = new THREE.InstancedMesh(cGeo, new THREE.MeshLambertMaterial({ color: 0x8a4c56 }), 90);
    let c = 0, cg = 0;
    while (c < 90 && cg++ < 900) {
      const x = range(rnd, -S * 0.78, S * 0.78);
      const z = range(rnd, -S * 0.78, S * 0.78);
      if (this.substrateAt(x, z) !== SUB.CORAL) continue;
      const r = range(rnd, 0.5, 1.5);
      const y = this.heightAt(x, z);
      p.set(x, y + r * 0.25, z);
      q.setFromEuler(e.set(0, rnd() * 6.28, 0));
      sc.set(r, r * 0.6, r * range(rnd, 0.8, 1.2));
      m.compose(p, q, sc);
      cMesh.setMatrixAt(c, m);
      this.obstacles.push({ x, z, r: r * 0.7, hard: true, top: y + r * 0.85 });
      c++;
    }
    cMesh.count = c;
    cMesh.instanceMatrix.needsUpdate = true;
    this.group.add(cMesh);

    // Sea fans — flat, tall, catch the moonlight.
    const fGeo = new THREE.CircleGeometry(1, 7);
    const fMat = new THREE.MeshLambertMaterial({ color: 0x9a5f42, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const fMesh = new THREE.InstancedMesh(fGeo, fMat, 60);
    let f = 0, fg = 0;
    while (f < 60 && fg++ < 700) {
      const x = range(rnd, -S * 0.76, S * 0.76);
      const z = range(rnd, -S * 0.76, S * 0.76);
      const s = this.substrateAt(x, z);
      if (s !== SUB.CORAL && s !== SUB.ROCK) continue;
      const r = range(rnd, 0.45, 1.0);
      const y = this.heightAt(x, z);
      p.set(x, y + r * 0.75, z);
      q.setFromEuler(e.set(range(rnd, -0.2, 0.2), rnd() * 6.28, range(rnd, -0.15, 0.15)));
      sc.set(r, r, r);
      m.compose(p, q, sc);
      fMesh.setMatrixAt(f, m);
      f++;
    }
    fMesh.count = f;
    fMesh.instanceMatrix.needsUpdate = true;
    this.group.add(fMesh);

    // Seagrass — thin blades, dense, no collision.
    const gGeo = new THREE.ConeGeometry(0.038, 1, 3, 1, true);
    gGeo.translate(0, 0.5, 0);
    const gMesh = new THREE.InstancedMesh(gGeo, new THREE.MeshLambertMaterial({ color: 0x2c4620, side: THREE.DoubleSide }), 900);
    let g = 0, gg = 0;
    while (g < 900 && gg++ < 9000) {
      const x = range(rnd, -S * 0.78, S * 0.78);
      const z = range(rnd, -S * 0.78, S * 0.78);
      if (this.substrateAt(x, z) !== SUB.SEAGRASS) continue;
      const hgt = range(rnd, 0.32, 0.85);
      p.set(x, this.heightAt(x, z), z);
      q.setFromEuler(e.set(range(rnd, -0.3, 0.3), rnd() * 6.28, range(rnd, -0.3, 0.3)));
      sc.set(1, hgt, 1);
      m.compose(p, q, sc);
      gMesh.setMatrixAt(g, m);
      g++;
    }
    gMesh.count = g;
    gMesh.instanceMatrix.needsUpdate = true;
    this.group.add(gMesh);
    this.grass = gMesh;
  }

  // ── the den ──────────────────────────────────────────────────────────────
  _placeDen(rnd) {
    let best = null;
    for (let i = 0; i < 400; i++) {
      const x = range(rnd, -this.size * 0.5, this.size * 0.5);
      const z = range(rnd, -this.size * 0.5, this.size * 0.5);
      const s = this.substrateAt(x, z);
      if (!s.hard) continue;
      const y = this.heightAt(x, z);
      if (!best || y > best.y) best = { x, z, y };
      if (i > 200 && best) break;
    }
    const d = best || { x: 0, z: 0, y: this.heightAt(0, 0) };
    this.den = { x: d.x, z: d.z, y: d.y, r: 1.9 };

    // A rock arch with a mouth narrow enough that you have to squeeze in.
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x39403f });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      if (a > 4.3) continue;                       // leave a wide mouth
      const r = 2.9;
      const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(range(rnd, 0.9, 1.4), 0), mat);
      rock.position.set(d.x + bx, this.heightAt(d.x + bx, d.z + bz) + 0.3, d.z + bz);
      rock.rotation.set(rnd(), rnd() * 6.28, rnd());
      rock.scale.y = 0.8;
      g.add(rock);
      this.obstacles.push({ x: d.x + bx, z: d.z + bz, r: 1.0, hard: true, top: rock.position.y + 0.8 });
    }
    // The hollow itself — a dark floor you can see your own arms against.
    const mouth = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 18),
      new THREE.MeshBasicMaterial({ color: 0x040a10 })
    );
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.set(d.x, d.y + 0.03, d.z);
    g.add(mouth);

    // Shells the octopus has middened around its door — a real octopus tell.
    const shellMat = new THREE.MeshLambertMaterial({ color: 0xd8cfb4 });
    const shellGeo = new THREE.SphereGeometry(0.16, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const shells = new THREE.InstancedMesh(shellGeo, shellMat, 40);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 40; i++) {
      const a = rnd() * 6.28, r = range(rnd, 1.4, 3.4);
      const x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r;
      p.set(x, this.heightAt(x, z) + 0.04, z);
      q.setFromEuler(e.set(range(rnd, -0.3, 0.3), rnd() * 6.28, range(rnd, -0.3, 0.3)));
      sc.setScalar(range(rnd, 0.7, 1.6));
      m.compose(p, q, sc);
      shells.setMatrixAt(i, m);
    }
    shells.instanceMatrix.needsUpdate = true;
    g.add(shells);

    this.group.add(g);
    this.denGroup = g;
  }

  // ── crevices ─────────────────────────────────────────────────────────────
  _placeCrevices(rnd) {
    this.crevices = [];
    const n = this.cfg.crevices ?? 14;
    const morayChance = this.cfg.morayChance ?? 0;
    const mat = new THREE.MeshBasicMaterial({ color: 0x030a10 });
    let guard = 0;
    while (this.crevices.length < n && guard++ < n * 40) {
      const x = range(rnd, -this.size * 0.72, this.size * 0.72);
      const z = range(rnd, -this.size * 0.72, this.size * 0.72);
      if (!this.substrateAt(x, z).hard) continue;
      if (Math.hypot(x - this.den.x, z - this.den.z) < 6) continue;
      if (this.crevices.some((c) => Math.hypot(c.x - x, c.z - z) < 5)) continue;

      const y = this.heightAt(x, z);
      const roll = rnd();
      const occupant = roll < morayChance ? 'moray' : roll < morayChance + 0.45 ? 'shrimp' : 'empty';
      const cre = { x, z, y, occupant, probed: false, cooldown: 0 };

      // Two shoulders of rock with a slot between them.
      const ang = rnd() * Math.PI;
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(range(rnd, 1.0, 1.5), 0),
          new THREE.MeshLambertMaterial({ color: 0x464f52 }));
        const off = 1.05;
        rock.position.set(x + Math.cos(ang) * off * s, y + 0.45, z + Math.sin(ang) * off * s);
        rock.rotation.set(rnd(), rnd() * 6.28, rnd());
        g.add(rock);
        this.obstacles.push({ x: rock.position.x, z: rock.position.z, r: 0.95, hard: true, top: rock.position.y + 0.8 });
      }
      const slot = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 7), mat);
      slot.position.set(x, y + 0.35, z);
      slot.scale.set(1, 0.7, 1);
      g.add(slot);
      cre.mesh = slot;
      this.group.add(g);
      this.crevices.push(cre);
    }
  }

  // ── fish traps ───────────────────────────────────────────────────────────
  _placeTraps(rnd) {
    this.traps = [];
    const n = this.cfg.traps ?? 0;
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0;
      for (let k = 0; k < 60; k++) {
        x = range(rnd, -this.size * 0.6, this.size * 0.6);
        z = range(rnd, -this.size * 0.6, this.size * 0.6);
        if (Math.hypot(x - this.den.x, z - this.den.z) > 10) break;
      }
      const y = this.heightAt(x, z);
      const g = new THREE.Group();
      const wire = new THREE.MeshLambertMaterial({ color: 0x6d7a63, wireframe: true });
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 1.1, 10, 2, true), wire);
      cage.position.set(x, y + 0.55, z);
      g.add(cage);
      const lid = new THREE.Mesh(new THREE.CircleGeometry(1.35, 10), wire);
      lid.rotation.x = -Math.PI / 2;
      lid.position.set(x, y + 1.1, z);
      g.add(lid);
      const funnel = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.8, 8, 1, true), wire);
      funnel.position.set(x, y + 0.5, z);
      g.add(funnel);
      const bait = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xc8735a }));
      bait.position.set(x, y + 0.3, z);
      g.add(bait);
      // A rope up to a surface float.
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 14, 4),
        new THREE.MeshBasicMaterial({ color: 0x9aa79b }));
      rope.position.set(x + 0.2, y + 7, z);
      g.add(rope);
      this.group.add(g);
      this.traps.push({ x, y, z, r: 1.5, bait: true, group: g, baitMesh: bait });
    }
  }

  // ── marine snow ──────────────────────────────────────────────────────────
  _marineSnow(rnd) {
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const S = this.size;
    for (let i = 0; i < N; i++) {
      pos[i * 3] = range(rnd, -S, S);
      pos[i * 3 + 1] = range(rnd, -6, 14);
      pos[i * 3 + 2] = range(rnd, -S, S);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xbfe6e0, size: 0.075, transparent: true, opacity: 0.55, depthWrite: false,
    });
    this.snow = new THREE.Points(geo, mat);
    this.group.add(this.snow);
  }

  // ── collision ────────────────────────────────────────────────────────────
  // Push a point out of every boulder it is inside. `radius` shrinks when the
  // octopus squeezes, which is the whole trick: the gaps do not change, you do.
  resolve(x, z, radius) {
    let ox = x, oz = z;
    for (let pass = 0; pass < 2; pass++) {
      for (const o of this.obstacles) {
        const dx = ox - o.x, dz = oz - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + radius;
        if (d < min && d > 1e-4) {
          const push = (min - d) / d;
          ox += dx * push;
          oz += dz * push;
        }
      }
    }
    const lim = this.size * 0.80;
    ox = clamp(ox, -lim, lim);
    oz = clamp(oz, -lim, lim);
    return [ox, oz];
  }

  nearestHardCover(x, z) {
    let best = null, bd = 1e9;
    for (const o of this.obstacles) {
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bd) { bd = d; best = o; }
    }
    return { obstacle: best, dist: bd };
  }

  update(dt, t) {
    this.uniforms.uTime.value = t;
    if (this.snow) {
      const p = this.snow.geometry.attributes.position;
      const arr = p.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= dt * 0.13;
        arr[i] += Math.sin(t * 0.3 + arr[i + 2] * 0.1) * dt * 0.06;
        if (arr[i + 1] < -7) arr[i + 1] = 14;
      }
      p.needsUpdate = true;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
