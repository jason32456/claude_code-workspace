import * as THREE from '../vendor/three.module.js';
import { mulberry32, range } from './rng.js';

export const TOWN_RADIUS = 78;

// A soft radial dot, generated rather than loaded — the repo forbids CDN assets
// and this is the only texture the world needs.
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let GLOW = null;

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  // The valley floor is flat where the town is and climbs into walls past ~105 m,
  // so the whole map reads as a bowl with one obvious low point.
  const t = Math.max(0, (r - 100) / 135);
  let h = 74 * t * t;
  const soften = Math.min(1, r / 95);
  h += 6.5 * Math.sin(x * 0.021) * Math.cos(z * 0.017) * soften;
  h += 3.2 * Math.sin(x * 0.048 + 1.3) * Math.sin(z * 0.041 - 0.7) * soften;
  // A shallow river cut running roughly north-south through the valley.
  const river = Math.exp(-Math.pow((x - 12 * Math.sin(z * 0.012)) / 26, 2));
  h -= 3.4 * river * soften;
  return h;
}

const HAZARD_KINDS = [
  { name: 'POWDER MILL', w: 13, d: 11, hgt: 13, attract: 1.0, color: 0x3a3128 },
  { name: 'HAY BARN', w: 15, d: 10, hgt: 10, attract: 0.8, color: 0x342b20 },
  { name: 'LUMBER YARD', w: 17, d: 12, hgt: 7, attract: 0.7, color: 0x2e2a22 },
  { name: 'THATCH ROW', w: 11, d: 9, hgt: 8, attract: 0.75, color: 0x2b2a2c },
  { name: 'GRANARY', w: 10, d: 10, hgt: 12, attract: 0.8, color: 0x322d26 },
];

export class World {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.group = new THREE.Group();
    scene.add(this.group);

    this.structures = [];
    this.jars = [];
    this.hazards = [];
    this.fires = 0;
    this.igniteCallback = null;

    this._buildTerrain();
    this._buildTown();
    this._buildTrees();
  }

  _buildTerrain() {
    const SEG = 128;
    const geo = new THREE.PlaneGeometry(520, 520, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(0x53663f);
    const hi = new THREE.Color(0x6d7488);
    const town = new THREE.Color(0x5e5f47);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const c = lo.clone().lerp(hi, Math.min(1, y / 55));
      if (Math.hypot(x, z) < TOWN_RADIUS) c.lerp(town, 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.terrain = new THREE.Mesh(geo, mat);
    this.group.add(this.terrain);
  }

  _addStructure(rec) {
    rec.id = this.structures.length;
    this.structures.push(rec);
    return rec;
  }

  _buildTown() {
    const rng = this.rng;

    // Five capacitor jars in a ring — the delivery points.
    const JARS = 5;
    for (let i = 0; i < JARS; i++) {
      const ang = (i / JARS) * Math.PI * 2 + 0.35;
      const rad = 44 + (i % 2) * 9;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const gy = heightAt(x, z);
      const poleH = 19;
      const g = new THREE.Group();
      g.position.set(x, gy, z);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.9, poleH, 8),
        new THREE.MeshLambertMaterial({ color: 0x3d4148 })
      );
      pole.position.y = poleH / 2;
      g.add(pole);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 5, 1.6, 16),
        new THREE.MeshLambertMaterial({ color: 0x2a2e33 })
      );
      base.position.y = 0.8;
      g.add(base);

      const glassMat = new THREE.MeshLambertMaterial({
        color: 0x2b4a63,
        emissive: new THREE.Color(0x14344d),
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.85,
      });
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.4, 6.4, 14), glassMat);
      glass.position.y = poleH + 2.4;
      g.add(glass);

      const capMat = new THREE.MeshLambertMaterial({ color: 0x6a5b3a });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.7, 14), capMat);
      cap.position.y = poleH + 5.9;
      g.add(cap);

      const spike = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.36, 5.5, 6),
        new THREE.MeshLambertMaterial({ color: 0x8a8f96 })
      );
      spike.position.y = poleH + 8.9;
      g.add(spike);

      // Ground ring that lights up as the jar fills.
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x2ad8ff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(6.5, 8.4, 28), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1.6;
      g.add(ring);

      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(7.4, 7.4, 13, 20, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x2ad8ff,
          transparent: true,
          opacity: 0.06,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      column.position.y = 6.5;
      g.add(column);

      this.group.add(g);

      const rec = this._addStructure({
        kind: 'jar',
        name: `JAR ${i + 1}`,
        pos: new THREE.Vector3(x, gy, z),
        head: new THREE.Vector3(x, gy + poleH + 11, z),
        baseAttract: 1.1,
        strikeRadius: 7.5,
        mesh: g,
        glass: glassMat,
        ring: ringMat,
        column: column.material,
        charge: 0,
        capacity: 120,
      });
      this.jars.push(rec);
    }

    // Hazards: the things that burn.
    const placed = [];
    for (let i = 0; i < 9; i++) {
      const kind = HAZARD_KINDS[i % HAZARD_KINDS.length];
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 40; tries++) {
        const ang = rng() * Math.PI * 2;
        const rad = range(rng, 16, 70);
        x = Math.cos(ang) * rad;
        z = Math.sin(ang) * rad;
        const clear = placed.every((p) => Math.hypot(p.x - x, p.z - z) > 21) &&
          this.jars.every((j) => Math.hypot(j.pos.x - x, j.pos.z - z) > 17);
        if (clear) break;
      }
      placed.push({ x, z });
      const gy = heightAt(x, z);
      const g = new THREE.Group();
      g.position.set(x, gy, z);
      g.rotation.y = rng() * Math.PI;

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(kind.w, kind.hgt, kind.d),
        new THREE.MeshLambertMaterial({ color: kind.color })
      );
      body.position.y = kind.hgt / 2;
      g.add(body);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(kind.w, kind.d) * 0.78, 5.5, 4),
        new THREE.MeshLambertMaterial({ color: 0x4a3a2a })
      );
      roof.position.y = kind.hgt + 2.6;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);

      // Lit windows: the reason the town is worth anything to you.
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffc074 });
      for (let w = 0; w < 4; w++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), winMat);
        const side = w % 2 === 0 ? 1 : -1;
        win.position.set(
          side * (kind.w / 2 + 0.06),
          kind.hgt * 0.45,
          (w < 2 ? -1 : 1) * kind.d * 0.22
        );
        win.rotation.y = side * Math.PI / 2;
        g.add(win);
      }

      const flameMat = new THREE.MeshBasicMaterial({
        color: 0xff8a2a,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(kind.w * 0.55, 20, 7), flameMat);
      flame.position.y = kind.hgt + 9;
      flame.visible = false;
      g.add(flame);

      if (!GLOW) GLOW = glowTexture();
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: GLOW,
          color: 0xff9440,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.scale.set(52, 40, 1);
      halo.position.y = kind.hgt + 8;
      halo.visible = false;
      g.add(halo);

      const fireLight = new THREE.PointLight(0xff8a30, 0, 95, 1.5);
      fireLight.position.y = kind.hgt + 6;
      g.add(fireLight);

      this.group.add(g);

      const rec = this._addStructure({
        kind: 'hazard',
        name: kind.name,
        pos: new THREE.Vector3(x, gy, z),
        head: new THREE.Vector3(x, gy + kind.hgt + 5, z),
        baseAttract: kind.attract,
        strikeRadius: Math.max(kind.w, kind.d) * 0.55 + 3,
        mesh: g,
        flame,
        flameMat,
        halo,
        fireLight,
        burning: false,
        burn: 0,
        spreadTimer: 0,
      });
      this.hazards.push(rec);
    }

    // Cottages. Purely scenery — too low to attract anything — but they are why
    // the valley looks like somewhere rather than a target range.
    for (let i = 0; i < 22; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 30; tries++) {
        const ang = rng() * Math.PI * 2;
        const rad = range(rng, 12, 74);
        x = Math.cos(ang) * rad;
        z = Math.sin(ang) * rad;
        const clear =
          placed.every((p) => Math.hypot(p.x - x, p.z - z) > 12) &&
          this.jars.every((j) => Math.hypot(j.pos.x - x, j.pos.z - z) > 11);
        if (clear) break;
      }
      placed.push({ x, z });
      const gy = heightAt(x, z);
      const w = range(rng, 5, 8);
      const d = range(rng, 5, 7.5);
      const h = range(rng, 4, 6);
      const g = new THREE.Group();
      g.position.set(x, gy, z);
      g.rotation.y = rng() * Math.PI;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: 0x3b3730 })
      );
      body.position.y = h / 2;
      g.add(body);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.72, 3.4, 4),
        new THREE.MeshLambertMaterial({ color: 0x4a3b2c })
      );
      roof.position.y = h + 1.6;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      if (rng() > 0.25) {
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 1.3),
          new THREE.MeshBasicMaterial({ color: 0xffc074 })
        );
        win.position.set(w / 2 + 0.05, h * 0.5, 0);
        win.rotation.y = Math.PI / 2;
        g.add(win);
      }
      this.group.add(g);
    }

    // Free protection: a spire and two rods. Bolts prefer these to the barns,
    // but they are fixed, so how much of the town they actually cover is luck.
    this._addSpire(0, 6);
    this._addRod(-58, -34);
    this._addRod(52, 46);
  }

  _addSpire(x, z) {
    const gy = heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, gy, z);
    const nave = new THREE.Mesh(
      new THREE.BoxGeometry(16, 11, 22),
      new THREE.MeshLambertMaterial({ color: 0x35373c })
    );
    nave.position.y = 5.5;
    g.add(nave);
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 26, 8.5),
      new THREE.MeshLambertMaterial({ color: 0x3c3e44 })
    );
    tower.position.set(0, 13, -9);
    g.add(tower);
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(6, 16, 4),
      new THREE.MeshLambertMaterial({ color: 0x2c3a40 })
    );
    spire.position.set(0, 34, -9);
    g.add(spire);
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.3, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0x9aa2ad })
    );
    tip.position.set(0, 45, -9);
    g.add(tip);
    this.group.add(g);
    this._addStructure({
      kind: 'decoy',
      name: 'SPIRE',
      pos: new THREE.Vector3(x, gy, z),
      head: new THREE.Vector3(x, gy + 48, z - 9),
      baseAttract: 4.2,
      strikeRadius: 9,
      mesh: g,
    });
  }

  _addRod(x, z) {
    const gy = heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, gy, z);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 1.1, 30, 6),
      new THREE.MeshLambertMaterial({ color: 0x4a4f57 })
    );
    mast.position.y = 15;
    g.add(mast);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x9aa2ad, emissive: 0x1a2530 })
    );
    ball.position.y = 30.5;
    g.add(ball);
    this.group.add(g);
    this._addStructure({
      kind: 'decoy',
      name: 'ROD',
      pos: new THREE.Vector3(x, gy, z),
      head: new THREE.Vector3(x, gy + 31, z),
      baseAttract: 3.6,
      strikeRadius: 7,
      mesh: g,
    });
  }

  _buildTrees() {
    const rng = this.rng;
    const trunkGeo = new THREE.CylinderGeometry(0.6, 0.9, 6, 5);
    const leafGeo = new THREE.ConeGeometry(4, 12, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x30251a });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2b4226 });
    const COUNT = 190;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, COUNT);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < COUNT * 6 && n < COUNT; i++) {
      const x = range(rng, -235, 235);
      const z = range(rng, -235, 235);
      const r = Math.hypot(x, z);
      if (r < TOWN_RADIUS + 14) continue;
      const y = heightAt(x, z);
      if (y > 52) continue;
      const s = range(rng, 0.7, 1.5);
      m.makeScale(s, s, s);
      m.setPosition(x, y + 3 * s, z);
      trunks.setMatrixAt(n, m);
      m.makeScale(s, s, s);
      m.setPosition(x, y + 11 * s, z);
      leaves.setMatrixAt(n, m);
      n++;
    }
    trunks.count = n;
    leaves.count = n;
    this.group.add(trunks);
    this.group.add(leaves);
  }

  /** Everything a leader can attach to, with its current attractiveness. */
  attractors(player) {
    const out = [];
    for (const s of this.structures) {
      let a = s.baseAttract;
      if (s.kind === 'hazard' && s.burning) a *= 0.5;
      if (s.kind === 'jar') a *= 1 + (1 - s.charge / s.capacity) * 0.35;
      a *= 1 + (s.head.y / 150) * 1.6;
      out.push({ pos: s.head, a, ref: s });
    }
    if (player && player.alive) {
      out.push({ pos: player.strikePoint(), a: player.attractiveness(), ref: player });
    }
    return out;
  }

  nearestJar(pos) {
    let best = null;
    let bestD = Infinity;
    for (const j of this.jars) {
      const d = pos.distanceTo(j.head);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    return { jar: best, dist: bestD };
  }

  totalCharge() {
    return this.jars.reduce((s, j) => s + j.charge, 0);
  }

  deliver(jar, amount) {
    const room = jar.capacity - jar.charge;
    const used = Math.min(room, amount);
    jar.charge += used;
    return used;
  }

  ignite(hazard) {
    if (hazard.burning) return false;
    hazard.burning = true;
    hazard.burn = 0.25;
    hazard.spreadTimer = 20;
    hazard.life = 42;
    hazard.flame.visible = true;
    hazard.halo.visible = true;
    this.fires++;
    if (this.igniteCallback) this.igniteCallback(hazard);
    return true;
  }

  douse(hazard) {
    if (!hazard.burning) return;
    hazard.burning = false;
    hazard.burn = 0;
    hazard.flame.visible = false;
    hazard.halo.visible = false;
    hazard.fireLight.intensity = 0;
    this.fires = Math.max(0, this.fires - 1);
  }

  reset() {
    for (const j of this.jars) j.charge = 0;
    for (const h of this.hazards) this.douse(h);
    this.fires = 0;
  }

  update(dt, t, rainAt) {
    for (const j of this.jars) {
      const f = j.charge / j.capacity;
      j.glass.emissiveIntensity = 0.2 + f * 2.6 + (f > 0.999 ? 0.5 : 0);
      j.glass.color.setHSL(0.53, 0.7, 0.18 + f * 0.4);
      j.ring.opacity = 0.12 + f * 0.5;
      j.column.opacity = 0.05 + f * 0.16;
    }
    for (const h of this.hazards) {
      if (!h.burning) continue;
      const wet = rainAt ? rainAt(h.pos.x, h.pos.z) : 0;
      if (wet > 0.55) {
        h.burn -= dt * 0.5;
        if (h.burn <= 0) {
          this.douse(h);
          continue;
        }
      } else {
        h.burn = Math.min(1, h.burn + dt * 0.22);
        h.life -= dt;
        if (h.life <= 0) {
          this.douse(h);
          continue;
        }
        h.spreadTimer -= dt;
        if (h.spreadTimer <= 0) {
          h.spreadTimer = 999;
          const near = this.hazards.filter(
            (o) => !o.burning && o.pos.distanceTo(h.pos) < 26
          );
          if (near.length) this.ignite(near[Math.floor(Math.random() * near.length)]);
        }
      }
      const flick = 0.75 + Math.sin(t * 18 + h.id) * 0.15 + Math.sin(t * 31 + h.id * 3) * 0.1;
      h.flame.scale.setScalar(h.burn * flick);
      h.flameMat.opacity = 0.55 + h.burn * 0.4;
      h.halo.material.opacity = h.burn * 0.34 * flick;
      h.halo.scale.setScalar(h.burn * flick * 1.1);
      h.fireLight.intensity = h.burn * 3.4 * flick;
    }
  }
}
