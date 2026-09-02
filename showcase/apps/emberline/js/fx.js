import * as THREE from 'three';
import { N, CELL, WORLD } from './config.js';
import { cellCentre } from './terrain.js';

function sprite(draw, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const flameTex = () =>
  sprite((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s * 0.62, 1, s / 2, s * 0.55, s * 0.5);
    g.addColorStop(0, 'rgba(255,244,200,1)');
    g.addColorStop(0.25, 'rgba(255,176,54,0.92)');
    g.addColorStop(0.6, 'rgba(214,74,14,0.42)');
    g.addColorStop(1, 'rgba(90,20,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

const smokeTex = () =>
  sprite((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.34)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, 96);

const dotTex = () =>
  sprite((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,190,120,0.7)');
    g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, 32);

const FLAMES = 620;
const SMOKE = 520;
const DROPS = 420;

export class Effects {
  constructor(scene, terrain, fog) {
    this.t = terrain;
    this.fog = fog;
    this.scene = scene;
    this.time = 0;

    this.flame = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: flameTex(), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.78,
      }),
      FLAMES
    );
    this.flame.frustumCulled = false;
    scene.add(this.flame);

    this.smoke = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: smokeTex(), transparent: true, depthWrite: false,
        opacity: 0.58,
      }),
      SMOKE
    );
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 2;
    scene.add(this.smoke);

    this.drop = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: dotTex(), transparent: true, depthWrite: false,
        opacity: 0.9,
      }),
      DROPS
    );
    this.drop.frustumCulled = false;
    scene.add(this.drop);

    this.smokeP = Array.from({ length: SMOKE }, () => ({ life: 0 }));
    this.dropP = Array.from({ length: DROPS }, () => ({ life: 0 }));
    this.smokeHead = 0;
    this.dropHead = 0;
    this.spawnAcc = 0;

    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  spawnSmoke(x, y, z, big) {
    const p = this.smokeP[this.smokeHead];
    this.smokeHead = (this.smokeHead + 1) % SMOKE;
    p.life = 1;
    p.age = 0;
    p.max = big ? 15 + Math.random() * 10 : 6 + Math.random() * 5;
    p.x = x + (Math.random() - 0.5) * 12;
    p.y = y + 4;
    p.z = z + (Math.random() - 0.5) * 12;
    p.rise = big ? 15 + Math.random() * 12 : 8 + Math.random() * 6;
    p.size = big ? 30 + Math.random() * 22 : 18 + Math.random() * 12;
    p.grow = big ? 9 : 5;
    p.rot = Math.random() * 6.28;
    p.dark = 0.07 + Math.random() * 0.1;
  }

  spawnDrop(x, y, z, vx, vy, vz, kind) {
    const p = this.dropP[this.dropHead];
    this.dropHead = (this.dropHead + 1) % DROPS;
    p.life = 1;
    p.age = 0;
    p.max = kind === 'water' ? 1.4 : 2.6;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.kind = kind;
    p.size = kind === 'water' ? 3 + Math.random() * 3 : 2 + Math.random() * 2.5;
  }

  update(dt, camera, fire, wind) {
    this.time += dt;
    const q = camera.quaternion;
    const w = fire.windVec();
    const ws = wind.speed;

    // ── flames ──────────────────────────────────────────────────────────
    const burning = fire.burning;
    const count = Math.min(FLAMES, burning.length);
    const stride = burning.length > FLAMES ? burning.length / FLAMES : 1;
    let f = 0;
    for (; f < count; f++) {
      const k = burning[Math.floor(f * stride) % burning.length];
      const c = cellCentre(k);
      const life = fire.burn[k] / Math.max(0.001, fire.burnMax[k]);
      const inten = Math.min(1, life * 1.8) * (0.55 + 0.45 * Math.sin(this.time * 9 + k));
      const h = this.t.cellH[k];
      const sz = (7 + inten * 15) * (this.t.model[k] === 3 ? 1.6 : 1);
      this._p.set(c.x + Math.sin(this.time * 3 + k) * 2, h + sz * 0.38, c.z + Math.cos(this.time * 2.5 + k) * 2);
      this._s.set(sz * 0.75, sz, 1);
      this._m.compose(this._p, q, this._s);
      this.flame.setMatrixAt(f, this._m);
      this._c.setRGB(0.88, 0.34 + inten * 0.26, 0.07);
      this.flame.setColorAt(f, this._c);
    }
    for (; f < FLAMES; f++) this.flame.setMatrixAt(f, this._hidden);
    this.flame.instanceMatrix.needsUpdate = true;
    if (this.flame.instanceColor) this.flame.instanceColor.needsUpdate = true;

    // ── smoke spawn from the front ──────────────────────────────────────
    if (burning.length) {
      this.spawnAcc += dt * Math.min(70, 8 + burning.length * 0.5);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        const k = burning[(Math.random() * burning.length) | 0];
        const c = cellCentre(k);
        this.spawnSmoke(c.x, this.t.cellH[k], c.z, this.t.model[k] === 3);
      }
    }

    const fogC = this.fog.color;
    for (let i = 0; i < SMOKE; i++) {
      const p = this.smokeP[i];
      if (p.life <= 0) { this.smoke.setMatrixAt(i, this._hidden); continue; }
      p.age += dt;
      const u = p.age / p.max;
      if (u >= 1) { p.life = 0; this.smoke.setMatrixAt(i, this._hidden); continue; }
      p.x += w.x * ws * dt * 0.85;
      p.z += w.z * ws * dt * 0.85;
      p.y += p.rise * dt * (1 - u * 0.55);
      const sz = p.size + p.grow * p.age;
      this._p.set(p.x, p.y, p.z);
      this._s.set(sz, sz, 1);
      this._m.compose(this._p, q, this._s);
      this.smoke.setMatrixAt(i, this._m);
      const fade = Math.min(1, u * 4) * (1 - u);
      const d = p.dark;
      this._c.setRGB(
        d + (fogC.r - d) * (1 - fade),
        d * 0.95 + (fogC.g - d) * (1 - fade),
        d * 0.9 + (fogC.b - d) * (1 - fade)
      );
      this.smoke.setColorAt(i, this._c);
    }
    this.smoke.instanceMatrix.needsUpdate = true;
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;

    // ── slurry / water / ember particles ────────────────────────────────
    for (let i = 0; i < DROPS; i++) {
      const p = this.dropP[i];
      if (p.life <= 0) { this.drop.setMatrixAt(i, this._hidden); continue; }
      p.age += dt;
      p.vy -= 26 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const g = this.t.heightAt(p.x, p.z);
      if (p.age > p.max || p.y < g) { p.life = 0; this.drop.setMatrixAt(i, this._hidden); continue; }
      const sz = p.size * (1 + p.age * 0.3);
      this._p.set(p.x, p.y, p.z);
      this._s.set(sz, sz, 1);
      this._m.compose(this._p, q, this._s);
      this.drop.setMatrixAt(i, this._m);
      if (p.kind === 'water') this._c.setRGB(0.7, 0.85, 1);
      else if (p.kind === 'ember') this._c.setRGB(1, 0.5, 0.1);
      else this._c.setRGB(0.86, 0.22, 0.08);
      this.drop.setColorAt(i, this._c);
    }

    // Spotting embers ride the fire sim, not the particle pool.
    for (const e of fire.embers) {
      const idx = this.dropHead;
      this.spawnDrop(e.x, e.y, e.z, 0, 0, 0, 'ember');
      this.dropP[idx].vy = 0;
      this.dropP[idx].max = 0.2;
    }

    this.drop.instanceMatrix.needsUpdate = true;
    if (this.drop.instanceColor) this.drop.instanceColor.needsUpdate = true;
  }
}
