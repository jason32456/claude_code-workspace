import * as THREE from '../vendor/three.module.js';
import { MATS } from './config.js';

const AXES = ['x', 'y', 'z'];

// The building is a list of axis-aligned boxes. That one decision buys three
// things at once: cheap merged rendering, sphere-vs-AABB collision that can be
// run against the octopus's *current* squeeze radius, and a substrate lookup for
// camouflage that reads the same geometry the player is standing on.

export class World {
  constructor() {
    this.boxes = [];        // { min, max, mat, solid, id }
    this.water = [];        // { min, max, surface }
    this.lamps = [];        // { pos, range, power, zone }
    this.zoneLightsOn = { 1: true, 2: true, 3: true };
    this.group = new THREE.Group();
    this.dynamic = {};      // id -> { box, closedY, openY, t }
    this.build();
  }

  box(x0, x1, y0, y1, z0, z1, mat, opts = {}) {
    const b = {
      min: new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      max: new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      mat,
      solid: opts.solid !== false,
      id: opts.id || null,
      zone: opts.zone || 0,
    };
    this.boxes.push(b);
    return b;
  }

  pool(x0, x1, y0, y1, z0, z1, surface) {
    this.water.push({
      min: new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      max: new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      surface,
    });
  }

  lamp(x, y, z, range, power, zone) {
    this.lamps.push({ pos: new THREE.Vector3(x, y, z), range, power, zone });
  }

  build() {
    const M = MATS;
    const CH = 1.3;   // half-width of the drainage channel that runs the site

    // ---- shell -------------------------------------------------------------
    // Floor slabs, laid as panels so the channel and the sump are holes in the
    // ground rather than trigger volumes sitting on top of it.
    this.box(-10, -CH - 0.15, -0.7, 0, -28, 2, M.concrete);
    this.box(CH + 0.15, 10, -0.7, 0, -28, 2, M.concrete);
    this.box(-CH - 0.15, CH + 0.15, -0.7, 0, -28, -10.6, M.concrete);
    this.box(-10, -6.55, -0.7, 0, 2, 18, M.concrete);
    this.box(6.55, 10, -0.7, 0, 2, 18, M.concrete);
    this.box(-6.55, -CH - 0.15, -0.7, 0, 2, 5, M.concrete);
    this.box(CH + 0.15, 6.55, -0.7, 0, 2, 5, M.concrete);
    this.box(-6.55, 6.55, -0.7, 0, 17.5, 18, M.concrete);
    // outer walls + ceilings
    this.box(-10.4, -10, -0.7, 5.2, -28, 18, M.concrete);
    this.box(10, 10.4, -0.7, 5.2, -28, 18, M.concrete);
    this.box(-10.4, 10.4, -0.7, 5.2, -28.4, -28, M.concrete);
    this.box(-10, 10, 4.6, 5.0, -28, 2, M.concrete);
    this.box(-10, 10, 5.0, 5.4, 2, 18.2, M.concrete);

    // ---- zone 1 : the gallery ---------------------------------------------
    this.box(-6.6, 2.6, 0, 0.6, -26.5, -16.5, M.paint, { zone: 1 });
    const gy0 = 0.6, gy1 = 3.2;
    this.box(-6.6, -6.46, gy0, gy1, -26.5, -16.5, M.glass, { zone: 1 });
    this.box(2.46, 2.6, gy0, gy1, -26.5, -16.5, M.glass, { zone: 1 });
    this.box(-6.6, 2.6, gy0, gy1, -26.5, -26.36, M.glass, { zone: 1 });
    this.box(-6.6, 2.6, gy0, gy1, -16.64, -16.5, M.glass, { zone: 1 });
    this.box(-6.46, 2.46, 0.6, 0.85, -26.36, -16.64, M.gravel, { zone: 1 });
    this.pool(-6.46, 2.46, 0.85, 2.85, -26.36, -16.64, 2.85);

    // tank furniture — an arch you can pour through, boulders, two weed clumps
    this.box(-6.1, -5.3, 0.85, 2.25, -25.2, -24.0, M.rock, { zone: 1 });
    this.box(-4.0, -3.2, 0.85, 2.25, -25.2, -24.0, M.rock, { zone: 1 });
    this.box(-6.1, -3.2, 2.25, 2.62, -25.2, -24.0, M.rock, { zone: 1 });
    this.box(1.1, 2.3, 0.85, 1.5, -24.6, -23.2, M.rock, { zone: 1 });
    this.box(-5.6, -4.4, 0.85, 1.3, -18.6, -17.4, M.rock, { zone: 1 });
    // the jar. Somebody left the lid on but did not tighten it.
    this.box(-1.75, -1.15, 0.85, 1.26, -20.9, -20.3, M.glass, { zone: 1 });
    this.box(-1.79, -1.11, 1.26, 1.38, -20.94, -20.26, M.steel, { zone: 1, id: 'jarlid' });
    this.box(-4.6, -4.32, 0.85, 2.0, -22.6, -22.32, M.weed, { zone: 1, solid: false });
    this.box(1.5, 1.76, 0.85, 1.75, -18.4, -18.14, M.weed, { zone: 1, solid: false });

    // the cabinet beside the tank, with a standing tray of water on top
    this.box(3.3, 7.1, 0, 2.4, -25.4, -18, M.paint, { zone: 1 });
    this.box(3.9, 6.1, 2.4, 2.46, -23.6, -21.2, M.steel, { zone: 1 });
    this.box(3.9, 4.0, 2.46, 2.66, -23.6, -21.2, M.steel, { zone: 1 });
    this.box(6.0, 6.1, 2.46, 2.66, -23.6, -21.2, M.steel, { zone: 1 });
    this.box(3.9, 6.1, 2.46, 2.66, -23.6, -23.5, M.steel, { zone: 1 });
    this.box(3.9, 6.1, 2.46, 2.66, -21.3, -21.2, M.steel, { zone: 1 });
    this.pool(4.01, 5.99, 2.46, 2.62, -23.49, -21.31, 2.62);

    // crates, and a puddle where the floor has settled
    this.box(-9.4, -7.2, 0, 1.1, -26.6, -24.4, M.rust, { zone: 1 });
    this.box(-9.4, -8.2, 1.1, 2.0, -26.6, -25.4, M.rust, { zone: 1 });
    this.box(7.6, 9.6, -0.16, 0, -22, -13.4, M.wetcon, { zone: 1 });
    this.pool(7.6, 9.6, -0.16, -0.03, -22, -13.4, -0.03);

    // the dividing wall. The door is shut; the gap under it is 0.44 m, which is
    // wider than a beak and narrower than anything else in the building.
    this.box(-10, -1.2, -0.7, 4.6, -12.2, -11.8, M.concrete);
    this.box(1.2, 10, -0.7, 4.6, -12.2, -11.8, M.concrete);
    this.box(-1.2, 1.2, 0.44, 4.6, -12.2, -11.8, M.paint, { id: 'door' });

    this.lamp(-2, 4.2, -21, 16, 1.0, 1);
    this.lamp(4, 4.2, -15, 15, 0.8, 1);

    // ---- zone 2 : the wet room --------------------------------------------
    // the channel: bed, two side walls, a north end cap, water
    this.box(-CH, CH, -1.8, -1.5, -10.6, 5, M.tile);
    this.box(-CH - 0.15, -CH, -1.8, 0, -10.6, 5, M.tile);
    this.box(CH, CH + 0.15, -1.8, 0, -10.6, 5, M.tile);
    this.box(-CH, CH, -1.8, 0, -10.75, -10.6, M.tile);
    this.pool(-CH, CH, -1.5, -0.14, -10.6, 5.02, -0.14);

    // grating over the north half of the channel. One panel is loose.
    this.box(-CH, CH, 0, 0.12, -10.6, -10.4, M.steel, { zone: 2 });
    this.box(-CH, CH, 0, 0.12, -9.2, -2.0, M.steel, { zone: 2 });
    const grate = this.box(-CH, CH, 0, 0.12, -10.4, -9.2, M.steel, { zone: 2, id: 'grate' });
    this.dynamic.grate = { box: grate, closedY: 0, openY: -1.62, t: 0 };

    // shelf, light cord, pallets, bins
    this.box(-9.9, -8.4, 1.5, 1.66, -9.5, -5.2, M.steel, { zone: 2 });
    this.box(-9.5, -8.9, 1.66, 2.02, -8.6, -8.0, M.glass, { zone: 2 });
    this.box(-9.54, -8.86, 2.02, 2.14, -8.64, -7.96, M.steel, { zone: 2, id: 'jar2lid' });
    this.box(-5.3, -5.18, 2.2, 4.6, -6.1, -5.98, M.rust, { zone: 2, id: 'cordline' });
    this.box(-5.38, -5.10, 2.06, 2.24, -6.18, -5.90, M.rust, { zone: 2, id: 'cord' });
    this.box(3.2, 6.4, 0, 1.3, -10.6, -8.2, M.rust, { zone: 2 });
    this.box(3.2, 5.0, 1.3, 2.1, -10.6, -9.2, M.rust, { zone: 2 });
    this.box(-8.0, -6.6, 0, 1.0, -2.6, -1.2, M.paint, { zone: 2 });
    this.box(6.8, 8.2, 0, 1.8, -5.6, -4.2, M.paint, { zone: 2 });
    this.box(-7.4, -6.2, 0, 1.6, -8.0, -6.8, M.rust, { zone: 2 });

    // the sluice, and the valve on the wall beside it
    const gate = this.box(-CH, CH, -1.5, 0.05, 1.7, 1.95, M.steel, { zone: 2, id: 'sluice' });
    this.dynamic.sluice = { box: gate, closedY: -1.5, openY: -3.05, t: 0 };
    this.box(2.14, 2.26, 0.85, 1.12, 1.6, 1.95, M.steel, { zone: 2 });
    this.box(2.02, 2.38, 0.72, 1.26, 1.42, 1.60, M.steel, { zone: 2, id: 'valve' });

    // end wall: closed above the channel, with a dry doorway off to the right
    this.box(-10, -CH - 0.15, -0.7, 4.6, 1.95, 2.35, M.concrete);
    this.box(-CH - 0.15, CH + 0.15, 0, 4.6, 1.95, 2.35, M.concrete);
    this.box(CH + 0.15, 4.6, -0.7, 4.6, 1.95, 2.35, M.concrete);
    this.box(5.9, 10, -0.7, 4.6, 1.95, 2.35, M.concrete);
    this.box(4.6, 5.9, 2.3, 4.6, 1.95, 2.35, M.concrete);

    this.lamp(-4, 4.2, -8, 16, 1.0, 2);
    this.lamp(3.4, 4.2, -2, 16, 1.0, 2);

    // ---- zone 3 : the pump hall -------------------------------------------
    this.box(-6.4, 6.4, -2.8, -2.5, 5, 17.5, M.tile);
    this.box(-6.55, -6.4, -2.8, 0, 5, 17.5, M.tile);
    this.box(6.4, 6.55, -2.8, 0, 5, 17.5, M.tile);
    this.box(-6.4, -CH - 0.15, -2.8, 0, 4.85, 5, M.tile);
    this.box(CH + 0.15, 6.4, -2.8, 0, 4.85, 5, M.tile);
    this.pool(-6.4, 6.4, -2.5, -0.12, 5, 17.5, -0.12);

    // pump housing and its intake throat
    this.box(-7.6, -5.2, -2.5, -0.9, 13.4, 16.2, M.rust, { zone: 3 });
    this.box(-5.2, -4.75, -2.1, -1.3, 14.2, 15.4, M.rust, { zone: 3, id: 'intake' });
    this.box(-9.6, -8.2, -0.7, 2.4, 12.6, 16.6, M.paint, { zone: 3 });

    // overhead pipework, drums on the dry ledge
    for (let i = 0; i < 5; i++) {
      const y = 3.2 + (i % 2) * 0.55;
      this.box(-9.6, 9.6, y, y + 0.34, 6 + i * 2.3, 6.34 + i * 2.3, M.rust, { zone: 3 });
    }
    this.box(8.2, 9.6, 0, 0.9, 7, 12, M.rust, { zone: 3 });
    this.box(8.3, 9.5, 0.9, 2.0, 8.2, 9.6, M.rust, { zone: 3 });
    this.box(-9.6, -8.2, 0, 1.1, 5.6, 8.4, M.rust, { zone: 3 });

    // far wall, with a shutter pocket cut into it
    this.box(-10, -1.6, -2.8, 5.0, 17.5, 17.9, M.concrete);
    this.box(1.6, 10, -2.8, 5.0, 17.5, 17.9, M.concrete);
    this.box(-1.6, 1.6, 1.45, 5.0, 17.5, 17.9, M.concrete);
    const shutter = this.box(-1.6, 1.6, -2.5, -0.55, 17.5, 17.9, M.steel, { zone: 3, id: 'shutter' });
    this.dynamic.shutter = { box: shutter, closedY: -2.5, openY: -0.55, t: 0 };
    this.box(-0.95, -0.55, -1.72, -1.28, 17.32, 17.5, M.steel, { zone: 3, id: 'latchA' });
    this.box(0.55, 0.95, -1.72, -1.28, 17.32, 17.5, M.steel, { zone: 3, id: 'latchB' });

    // the outfall pipe, and the sea at the end of it
    this.box(-1.35, 1.35, -2.8, -2.5, 17.9, 26, M.rust);
    this.box(-1.6, -1.35, -2.8, -0.55, 17.9, 26, M.rust);
    this.box(1.35, 1.6, -2.8, -0.55, 17.9, 26, M.rust);
    this.box(-1.6, 1.6, -0.55, -0.3, 17.9, 26, M.rust);
    this.pool(-1.35, 1.35, -2.5, -0.56, 17.9, 26.2, -0.56);
    this.pool(-22, 22, -9, 1.6, 26, 44, 1.6);
    this.box(-22, 22, -9.3, -9, 26, 44, M.gravel);
    this.box(-9, -5, -9, -5.4, 30, 34, M.rock);
    this.box(4, 9, -9, -6.2, 33, 38, M.rock);

    this.lamp(0, 4.6, 8, 18, 0.9, 3);
    this.lamp(-5.5, 4.6, 15, 16, 0.8, 3);
    this.lamp(6, 4.6, 13, 16, 0.7, 3);

    this.buildMesh();
  }

  // ---- rendering -----------------------------------------------------------
  buildMesh() {
    const opaque = [], glassy = [];
    for (const b of this.boxes) (b.mat === MATS.glass ? glassy : opaque).push(b);

    this.meshOpaque = new THREE.Mesh(this.mergeBoxes(opaque),
      new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.meshGlass = new THREE.Mesh(this.mergeBoxes(glassy), new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.meshGlass.renderOrder = 2;
    this.group.add(this.meshOpaque, this.meshGlass);

    const wgeo = [];
    for (const w of this.water) {
      const g = new THREE.PlaneGeometry(w.max.x - w.min.x, w.max.z - w.min.z);
      g.rotateX(-Math.PI / 2);
      g.translate((w.min.x + w.max.x) / 2, w.surface, (w.min.z + w.max.z) / 2);
      wgeo.push(g);
    }
    this.meshWater = new THREE.Mesh(this.mergeGeoms(wgeo), new THREE.MeshBasicMaterial({
      color: 0x2c6c85, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.meshWater.renderOrder = 3;
    this.group.add(this.meshWater);

    this.lights = this.lamps.map((l) => {
      const pl = new THREE.PointLight(0xcfe4ef, l.power * 5.5, l.range, 1.15);
      pl.position.copy(l.pos);
      this.group.add(pl);
      return pl;
    });
  }

  mergeGeoms(list) {
    let vc = 0, ic = 0;
    for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), idx = new Uint32Array(ic);
    let vo = 0, io = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      vo += g.attributes.position.count; io += gi.length;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  // One merged buffer for the whole building. Per-vertex colour carries the
  // material tint, a per-face shade and a little per-box noise, which is what
  // stops a world made entirely of boxes from looking like it.
  mergeBoxes(boxes) {
    const n = boxes.length;
    const pos = new Float32Array(n * 24 * 3);
    const nor = new Float32Array(n * 24 * 3);
    const col = new Float32Array(n * 24 * 3);
    const idx = new Uint32Array(n * 36);
    const faces = [
      { n: [1, 0, 0], v: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], s: 0.92 },
      { n: [-1, 0, 0], v: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]], s: 0.86 },
      { n: [0, 1, 0], v: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], s: 1.1 },
      { n: [0, -1, 0], v: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], s: 0.55 },
      { n: [0, 0, 1], v: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]], s: 0.97 },
      { n: [0, 0, -1], v: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], s: 0.8 },
    ];
    const c = new THREE.Color();
    let vo = 0, io = 0;
    boxes.forEach((b, bi) => {
      b.vertStart = vo;
      const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
      const h = Math.sin(bi * 12.9898 + 4.1) * 43758.5453;
      const jitter = 0.9 + (h - Math.floor(h)) * 0.2;
      for (const f of faces) {
        for (const v of f.v) {
          pos[vo * 3] = b.min.x + v[0] * sx;
          pos[vo * 3 + 1] = b.min.y + v[1] * sy;
          pos[vo * 3 + 2] = b.min.z + v[2] * sz;
          nor[vo * 3] = f.n[0]; nor[vo * 3 + 1] = f.n[1]; nor[vo * 3 + 2] = f.n[2];
          c.setHex(b.mat.col);
          const g = f.s * jitter;
          col[vo * 3] = c.r * g; col[vo * 3 + 1] = c.g * g; col[vo * 3 + 2] = c.b * g;
          vo++;
        }
        const a = vo - 4;
        idx[io++] = a; idx[io++] = a + 1; idx[io++] = a + 2;
        idx[io++] = a; idx[io++] = a + 2; idx[io++] = a + 3;
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  // Slide a dynamic box and push the moved vertices straight into the buffer.
  setDynamic(key, t) {
    const d = this.dynamic[key];
    if (!d) return;
    const target = d.closedY + (d.openY - d.closedY) * t;
    const dy = target - d.box.min.y;
    if (Math.abs(dy) < 1e-5) return;
    d.t = t;
    d.box.min.y += dy; d.box.max.y += dy;
    const pos = this.meshOpaque.geometry.attributes.position;
    for (let i = 0; i < 24; i++) pos.array[(d.box.vertStart + i) * 3 + 1] += dy;
    pos.needsUpdate = true;
    this.meshOpaque.geometry.computeBoundingSphere();
  }

  setZoneLights(zone, on) {
    this.zoneLightsOn[zone] = on;
    this.lamps.forEach((l, i) => {
      if (l.zone === zone) this.lights[i].intensity = on ? l.power * 5.5 : 0;
    });
  }

  // ---- queries -------------------------------------------------------------
  waterAt(p) {
    for (const w of this.water) {
      if (p.x >= w.min.x && p.x <= w.max.x && p.z >= w.min.z && p.z <= w.max.z
        && p.y >= w.min.y && p.y <= w.surface) return w;
    }
    return null;
  }

  // Resolve a sphere against every solid box. The radius passed in is the
  // octopus's *squeezed* radius, which is the whole reason a 0.44 m gap under a
  // door is a route and not a wall.
  resolve(p, r, out) {
    out.length = 0;
    for (const b of this.boxes) {
      if (!b.solid) continue;
      if (p.x + r < b.min.x || p.x - r > b.max.x) continue;
      if (p.y + r < b.min.y || p.y - r > b.max.y) continue;
      if (p.z + r < b.min.z || p.z - r > b.max.z) continue;
      const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
      const cy = Math.max(b.min.y, Math.min(p.y, b.max.y));
      const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      let nx, ny, nz, depth;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d; nz = dz / d; depth = r - d;
      } else {
        const px = Math.min(p.x - b.min.x, b.max.x - p.x);
        const py = Math.min(p.y - b.min.y, b.max.y - p.y);
        const pz = Math.min(p.z - b.min.z, b.max.z - p.z);
        nx = ny = nz = 0;
        if (px <= py && px <= pz) { nx = p.x - b.min.x < b.max.x - p.x ? -1 : 1; depth = px + r; }
        else if (py <= pz) { ny = p.y - b.min.y < b.max.y - p.y ? -1 : 1; depth = py + r; }
        else { nz = p.z - b.min.z < b.max.z - p.z ? -1 : 1; depth = pz + r; }
      }
      p.x += nx * depth; p.y += ny * depth; p.z += nz * depth;
      out.push({ nx, ny, nz, mat: b.mat, box: b, depth });
    }
    return out;
  }

  // Nearest solid surface point within range — arms use this to find grips and
  // the skin uses it to find out what colour it should be turning.
  nearestSurface(p, range) {
    let best = null, bestD = range * range;
    for (const b of this.boxes) {
      if (!b.solid) continue;
      if (p.x + range < b.min.x || p.x - range > b.max.x) continue;
      if (p.y + range < b.min.y || p.y - range > b.max.y) continue;
      if (p.z + range < b.min.z || p.z - range > b.max.z) continue;
      const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
      const cy = Math.max(b.min.y, Math.min(p.y, b.max.y));
      const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = { box: b, x: cx, y: cy, z: cz, d: Math.sqrt(d2) };
      }
    }
    return best;
  }

  // Ray against the box list. Cheaper than raycasting the merged mesh, and it
  // hands back the box itself, which is what the arms actually need to know.
  raycast(o, d, maxDist, skipGlass = false) {
    let bestT = maxDist, hit = null;
    for (const b of this.boxes) {
      if (!b.solid) continue;
      if (skipGlass && b.mat === MATS.glass) continue;
      let t0 = 0, t1 = maxDist, ok = true;
      for (const ax of AXES) {
        const inv = 1 / (d[ax] || 1e-9);
        let lo = (b.min[ax] - o[ax]) * inv, hi = (b.max[ax] - o[ax]) * inv;
        if (lo > hi) { const t = lo; lo = hi; hi = t; }
        t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < bestT && t0 >= 0) { bestT = t0; hit = b; }
    }
    if (!hit) return null;
    return {
      box: hit,
      t: bestT,
      point: new THREE.Vector3(o.x + d.x * bestT, o.y + d.y * bestT, o.z + d.z * bestT),
    };
  }

  // Shove a point out of any solid it has ended up inside. The camera uses this
  // so that squeezing into a gap never puts the lens inside a wall.
  pushOut(p, r) {
    for (const b of this.boxes) {
      if (!b.solid || b.mat === MATS.glass) continue;
      if (p.x + r < b.min.x || p.x - r > b.max.x) continue;
      if (p.y + r < b.min.y || p.y - r > b.max.y) continue;
      if (p.z + r < b.min.z || p.z - r > b.max.z) continue;
      const px = Math.min(p.x - b.min.x, b.max.x - p.x) + r;
      const py = Math.min(p.y - b.min.y, b.max.y - p.y) + r;
      const pz = Math.min(p.z - b.min.z, b.max.z - p.z) + r;
      const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
      const cy = Math.max(b.min.y, Math.min(p.y, b.max.y));
      const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), k = (r - d) / d;
        p.x += dx * k; p.y += dy * k; p.z += dz * k;
      } else if (px <= py && px <= pz) p.x += p.x - b.min.x < b.max.x - p.x ? -px : px;
      else if (py <= pz) p.y += p.y - b.min.y < b.max.y - p.y ? -py : py;
      else p.z += p.z - b.min.z < b.max.z - p.z ? -pz : pz;
    }
  }

  illumination(p) {
    let lit = 0.04;
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      if (!this.zoneLightsOn[l.zone]) continue;
      const d = l.pos.distanceTo(p);
      if (d > l.range) continue;
      lit += l.power * (1 - d / l.range) ** 1.6;
    }
    if (p.y < -0.25) lit *= 0.4;   // below the lip of a channel you are in shade
    return Math.min(1.4, lit);
  }

  // Straight-line occlusion, slab test per box. Only line of sight is expensive
  // enough to need this.
  blocked(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return false;
    const ix = len / (dx || 1e-9), iy = len / (dy || 1e-9), iz = len / (dz || 1e-9);
    for (const box of this.boxes) {
      if (!box.solid) continue;
      let t0 = 0.001, t1 = 0.999, ok = true;
      let lo = (box.min.x - a.x) / len * ix, hi = (box.max.x - a.x) / len * ix;
      if (lo > hi) { const t = lo; lo = hi; hi = t; }
      t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
      if (t0 > t1) ok = false;
      if (ok) {
        lo = (box.min.y - a.y) / len * iy; hi = (box.max.y - a.y) / len * iy;
        if (lo > hi) { const t = lo; lo = hi; hi = t; }
        t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
        if (t0 > t1) ok = false;
      }
      if (ok) {
        lo = (box.min.z - a.z) / len * iz; hi = (box.max.z - a.z) / len * iz;
        if (lo > hi) { const t = lo; lo = hi; hi = t; }
        t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
        if (t0 > t1) ok = false;
      }
      if (ok) return true;
    }
    return false;
  }
}
