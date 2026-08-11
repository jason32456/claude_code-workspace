import * as THREE from '../vendor/three.module.js';
import {
  BUILDINGS, GAME, WAVES, PLANET, TERRAIN, UPGRADE, VENT_POWER,
  SOLAR_ADJACENCY,
} from './config.js';
import { buildPlanet, tileWorldPos } from './planet.js';
import { computeFlowField, sealsSurface } from './pathing.js';
import { createRenderer, sunDirection } from './render.js';
import { Effects } from './effects.js';
import { EnemyManager } from './enemies.js';
import { Building, updateBuilding, ventMarker } from './structures.js';
import { Controls } from './input.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { mulberry32 } from './noise.js';

const Z = new THREE.Vector3(0, 0, 1);

export class Game {
  constructor(canvas) {
    this.view = createRenderer(canvas);
    this.scene = this.view.scene;
    this.fx = new Effects(this.scene);
    this.audio = new Audio();
    this.enemyMgr = new EnemyManager(this.scene);
    this.enemies = this.enemyMgr.list;
    this.controls = new Controls(canvas, this.view.camera, this);
    this.hud = new Hud(this);

    this.phase = 'title';
    this.paused = false;
    this.sunDir = new THREE.Vector3(1, 0, 0);
    this.powerScale = 1;
    this.totalWaves = WAVES.length;
    this.best = Number(localStorage.getItem('nightside.best') || 0);

    this.hoverRing = makeRing(0.42, 0.54, 0x46e0a0);
    this.selectRing = makeRing(0.46, 0.58, 0x4fd6ff);
    this.rangeRing = makeRangeRing();
    this.scene.add(this.hoverRing, this.selectRing, this.rangeRing);

    this.newPlanet((Math.random() * 1e9) | 0);
    this.clock = new THREE.Clock();
    this.controls.spin = 0.06;
    this.faceSun();
  }

  // ── setup ──────────────────────────────────────────────────────────
  newPlanet(seed) {
    if (this.planetGroup) this.scene.remove(this.planetGroup);
    for (const b of this.buildings ?? []) this.scene.remove(b.group);
    for (const m of this.ventMarkers ?? []) this.scene.remove(m);
    this.enemyMgr.clear();
    this.fx.reset();

    const p = buildPlanet(seed);
    this.seed = seed;
    this.rand = mulberry32(seed ^ 0x9e3779b9);
    this.tiles = p.tiles;
    this.planetGroup = p.group;
    this.planetMesh = p.mesh;
    this.faceTile = p.faceTile;
    this.ventIds = p.ventIds;
    this.land = p.land;
    this.scene.add(p.group);

    this.ventMarkers = this.ventIds.map((id) => {
      const m = ventMarker();
      m.position.copy(tileWorldPos(this.tiles[id]));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.tiles[id].center);
      this.scene.add(m);
      return m;
    });

    this.blocked = new Uint8Array(this.tiles.length);
    for (const t of this.tiles) {
      this.blocked[t.id] = (t.type === TERRAIN.PLAIN || t.type === TERRAIN.ORE) ? 0 : 1;
    }
    this.reflow();

    this.buildings = [];
    this.alloy = GAME.startAlloy;
    this.integrity = GAME.startIntegrity;
    this.charge = 0;
    this.elapsed = PLANET.dayLength * 0.12;
    this.wave = 0;
    this.waveTime = 0;
    this.pending = [];
    this.timer = GAME.firstBuildGap;
    this.kills = 0;
    this.leaks = 0;
    this.selectedBuild = null;
    this.selectedBuilding = null;
    this.hoverId = -1;
    this.production = 0;
    this.demand = 0;
    this.powerScale = 1;
    this.phase = this.phase === 'title' ? 'title' : 'build';
    this.selectRing.visible = false;
    this.rangeRing.visible = false;
  }

  reflow() {
    this.flow = computeFlowField(this.tiles, this.ventIds, this.blocked);
  }

  // Open looking at the terminator, so the first thing on screen is the
  // mechanic: lit ground on one side, the landing zone on the other.
  faceSun() {
    sunDirection(this.elapsed, this.sunDir);
    this.controls.theta = Math.atan2(this.sunDir.x, this.sunDir.z) + 0.55;
    this.controls.phi = Math.PI * 0.44;
    this.controls.apply();
  }

  begin() {
    this.audio.start();
    this.phase = 'build';
    this.timer = GAME.firstBuildGap;
    this.controls.spin = 0;
    this.faceSun();
    this.hud.enterGame();
    this.hud.toast('BUILD PHASE');
  }

  restart() {
    this.newPlanet((Math.random() * 1e9) | 0);
    this.phase = 'build';
    this.timer = GAME.firstBuildGap;
    this.paused = false;
    this.faceSun();
    this.hud.enterGame();
    this.hud.toast('NEW PLANET');
  }

  // ── selection & building ───────────────────────────────────────────
  selectBuild(key) {
    this.selectedBuild = this.selectedBuild === key ? null : key;
    this.selectedBuilding = null;
    this.selectRing.visible = false;
  }

  clearSelection() {
    this.selectedBuild = null;
    this.selectedBuilding = null;
    this.selectRing.visible = false;
    this.rangeRing.visible = false;
  }

  clickTile(id) {
    if (this.phase === 'title' || id === undefined || id < 0) return;
    const tile = this.tiles[id];
    if (this.selectedBuild) { this.tryPlace(this.selectedBuild, tile); return; }
    if (tile.building) {
      this.selectedBuilding = tile.building;
      this.selectRing.visible = true;
      placeRing(this.selectRing, tile);
      this.showRange(tile, tile.building.def.range);
    } else {
      this.clearSelection();
    }
  }

  placementError(type, tile) {
    const def = BUILDINGS[type];
    if (tile.isVent) return 'core vent';
    if (tile.building) return 'occupied';
    if (tile.type === TERRAIN.RIDGE) return 'ridge';
    if (tile.type === TERRAIN.BASIN) return 'water';
    if (def.oreOnly && tile.type !== TERRAIN.ORE) return 'needs ferrite';
    if (this.alloy < def.cost) return 'not enough alloy';
    if (def.blocks && sealsSurface(this.tiles, this.ventIds, this.blocked, tile.id)) return 'would seal the surface';
    return null;
  }

  tryPlace(type, tile) {
    const err = this.placementError(type, tile);
    if (err) { this.hud.toast(err.toUpperCase(), true); this.audio.deny(); return; }
    const def = BUILDINGS[type];
    this.alloy -= def.cost;
    const b = new Building(type, tile);
    this.scene.add(b.group);
    this.buildings.push(b);
    if (def.blocks) { this.blocked[tile.id] = 1; this.reflow(); }
    this.audio.place();
    this.fx.sparkBurst(b.worldPos, 0x8fd8ff, 8, 1.6);
  }

  upgradeSelected() {
    const b = this.selectedBuilding;
    if (!b || b.level >= UPGRADE.maxLevel) return;
    if (this.alloy < b.upgradeCost) { this.hud.toast('NOT ENOUGH ALLOY', true); this.audio.deny(); return; }
    this.alloy -= b.upgradeCost;
    b.level++;
    b.maxHp = Math.round(b.maxHp * 1.35);
    b.hp = b.maxHp;
    b.group.scale.setScalar(1 + (b.level - 1) * 0.14);
    this.audio.place();
    this.fx.sparkBurst(b.worldPos, 0xffd48a, 10, 2);
  }

  sellSelected() {
    const b = this.selectedBuilding;
    if (!b) return;
    this.alloy += b.sellValue;
    this.removeBuilding(b);
    this.clearSelection();
    this.audio.place();
  }

  removeBuilding(b) {
    this.scene.remove(b.group);
    b.tile.building = null;
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    if (b.def.blocks) { this.blocked[b.tile.id] = 0; this.reflow(); }
    if (this.selectedBuilding === b) this.clearSelection();
  }

  damageBuilding(b, amount) {
    b.hp -= amount;
    this.fx.sparkBurst(b.worldPos, 0xff9a6a, 4, 1.4);
    if (b.hp <= 0) {
      this.fx.blast(b.worldPos, 0.9, 0xff8b4d);
      this.removeBuilding(b);
    }
  }

  // ── combat helpers used by structures/enemies ──────────────────────
  damage(enemy, amount) {
    if (enemy.dead) return;
    enemy.hp -= amount;
    enemy.flash = 0.2;
    if (enemy.hp <= 0) {
      enemy.dead = true;
      this.kills++;
      this.alloy += enemy.def.reward;
      this.fx.sparkBurst(enemy.pos, enemy.def.color, 12, 2.6);
      this.audio.kill();
    }
  }

  splashDamage(pos, radius, amount) {
    for (const e of this.enemies) {
      if (e.dead || e.def.flying) continue;
      const d = e.pos.distanceTo(pos);
      if (d <= radius) this.damage(e, amount * (1 - 0.45 * (d / radius)));
    }
  }

  leak(enemy) {
    enemy.dead = true;
    this.leaks++;
    this.integrity -= enemy.def.leak;
    this.fx.blast(enemy.pos, 1.5, 0xff5f68);
    this.audio.leak();
    this.hud.toast(`VENT BREACHED −${enemy.def.leak}`, true);
    if (this.integrity <= 0) this.endRun(false);
  }

  buildingNear(pos, range) {
    let best = null, bestD = range;
    for (const b of this.buildings) {
      const d = b.worldPos.distanceTo(pos);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  nearestVent(dir) {
    let best = this.tiles[this.ventIds[0]], bestDot = -2;
    for (const id of this.ventIds) {
      const d = this.tiles[id].center.dot(dir);
      if (d > bestDot) { bestDot = d; best = this.tiles[id]; }
    }
    return best;
  }

  get hpScale() { return GAME.hpScale(Math.max(1, this.wave)); }
  get alloyRate() {
    return this.buildings.reduce((s, b) => s + (b.def.alloy ? b.scaled('alloy') : 0), 0);
  }
  get powerCap() {
    return this.buildings.reduce((s, b) => s + (b.def.storage ? b.scaled('storage') : 0), 0);
  }
  get powerFrac() {
    const cap = this.powerCap;
    return cap > 0 ? this.charge / cap : (this.production > this.demand ? 1 : 0);
  }

  // ── waves ──────────────────────────────────────────────────────────
  callWave() {
    if (this.phase !== 'build') return;
    const bonus = Math.floor(this.timer * GAME.earlyCallBonus);
    this.alloy += bonus;
    if (bonus > 0) this.hud.toast(`EARLY CALL +${bonus} ◈`);
    this.startWave();
  }

  startWave() {
    this.wave++;
    const comp = WAVES[this.wave - 1];
    const dur = GAME.waveDuration(this.wave);
    this.pending = [];
    for (const [type, count] of Object.entries(comp)) {
      let left = count;
      while (left > 0) {
        const n = Math.min(GAME.podSize, left);
        left -= n;
        this.pending.push({ time: this.rand() * dur * 0.72, type, count: n });
      }
    }
    this.pending.sort((a, b) => a.time - b.time);
    this.waveTime = 0;
    this.phase = 'wave';
    this.audio.wave();
    this.hud.toast(`WAVE ${this.wave} INBOUND`);
  }

  updateWave(dt) {
    if (this.phase === 'build') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave();
      return;
    }
    if (this.phase !== 'wave') return;
    this.waveTime += dt;
    while (this.pending.length && this.pending[0].time <= this.waveTime) {
      const pod = this.pending.shift();
      this.dropPod(pod.type, pod.count);
    }
    if (!this.pending.length && !this.enemies.length && !this.fx.pods.length) {
      if (this.wave >= this.totalWaves) { this.endRun(true); return; }
      this.phase = 'build';
      this.timer = GAME.buildGap;
      this.hud.toast(`WAVE ${this.wave} CLEARED`);
    }
  }

  // Pods aim for the dark, and inside the dark they aim for the gaps —
  // so a defended night side pushes the landing zone somewhere else.
  pickLandingTile() {
    const usable = (t) => !this.blocked[t.id] && !t.isVent && !t.building;
    const band = (t) => {
      const d = this.flow.dist[t.id];
      return d >= GAME.dropBand[0] && d <= GAME.dropBand[1];
    };
    const cands = [];
    // First choice: dark ground, close enough to a vent that the walk is a
    // fight rather than a commute.
    for (let i = 0; i < 140 && cands.length < 16; i++) {
      const t = this.tiles[this.land[(this.rand() * this.land.length) | 0]];
      if (!usable(t) || t.sun > GAME.nightThreshold || !band(t)) continue;
      cands.push(t);
    }
    if (!cands.length) {
      for (let i = 0; i < 80 && cands.length < 10; i++) {
        const t = this.tiles[this.land[(this.rand() * this.land.length) | 0]];
        if (usable(t) && band(t)) cands.push(t);
      }
    }
    if (!cands.length) {
      for (let i = 0; i < 40 && cands.length < 6; i++) {
        const t = this.tiles[this.land[(this.rand() * this.land.length) | 0]];
        if (usable(t)) cands.push(t);
      }
    }
    if (!cands.length) return this.tiles[this.land[0]];
    let best = cands[0], bestScore = -Infinity;
    for (const t of cands) {
      const p = tileWorldPos(t);
      let near = Infinity;
      for (const b of this.buildings) {
        if (!b.isTurret) continue;
        near = Math.min(near, b.worldPos.distanceTo(p));
      }
      const score = Math.min(near, 12) + this.rand() * 2.5;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  dropPod(type, count) {
    const tile = this.pickLandingTile();
    const target = tileWorldPos(tile, 0.2);
    this.fx.pod(target, GAME.podFall, tile.id, () => {
      const spots = [tile.id, ...tile.neighbours.filter((n) => !this.blocked[n])];
      for (let i = 0; i < count; i++) {
        const at = spots[(this.rand() * spots.length) | 0];
        const e = this.enemyMgr.spawn(type, at, this);
        if (e) e.t = this.rand() * 0.6;
      }
    });
  }

  endRun(win) {
    this.phase = win ? 'won' : 'over';
    if (this.wave > this.best) {
      this.best = this.wave;
      localStorage.setItem('nightside.best', String(this.best));
    }
    if (win) this.audio.win(); else this.audio.lose();
    this.hud.showEnd(win, {
      'Waves survived': `${win ? this.totalWaves : Math.max(0, this.wave - 1)} / ${this.totalWaves}`,
      'Blight destroyed': this.kills,
      'Vent breaches': this.leaks,
      'Core integrity': `${Math.max(0, Math.ceil(this.integrity))}%`,
      'Structures standing': this.buildings.length,
      'Best run': `wave ${this.best}`,
    });
  }

  togglePause() {
    if (this.phase === 'title' || this.phase === 'over' || this.phase === 'won') return;
    this.paused = !this.paused;
    this.hud.el.pause.textContent = this.paused ? '▶' : '❚❚';
    this.hud.toast(this.paused ? 'PAUSED' : 'RESUMED');
  }

  toggleMute() {
    const muted = this.audio.toggle();
    this.hud.el.mute.textContent = muted ? '🔇' : '♪';
  }

  showRange(tile, range) {
    if (!range) { this.rangeRing.visible = false; return; }
    updateRangeRing(this.rangeRing, tile, range);
    this.rangeRing.visible = true;
  }

  solarLinks(b) {
    let n = 0;
    for (const nb of b.tile.neighbours) {
      if (this.tiles[nb].building?.type === 'SOLAR') n++;
    }
    return n;
  }

  solarOutput(b) {
    return b.scaled('solar') * b.tile.sun * (1 + SOLAR_ADJACENCY * this.solarLinks(b));
  }

  // ── power grid ─────────────────────────────────────────────────────
  updatePower(dt) {
    let production = VENT_POWER * this.ventIds.length;
    let demand = 0;
    for (const b of this.buildings) {
      if (b.def.solar) production += this.solarOutput(b);
      demand += b.def.idlePower ?? 0;
      if (b.isTurret && b.target && b.def.firePower) demand += b.def.firePower;
    }
    this.production = production;
    this.demand = demand;
    const cap = this.powerCap;
    const net = production - demand;
    if (net >= 0) {
      this.charge = Math.min(cap, this.charge + net * dt);
      this.powerScale = 1;
    } else {
      const need = -net * dt;
      if (this.charge >= need) {
        this.charge -= need;
        this.powerScale = 1;
      } else {
        const available = production + (dt > 0 ? this.charge / dt : 0);
        this.powerScale = demand > 0 ? Math.max(0, Math.min(1, available / demand)) : 1;
        this.charge = 0;
      }
    }
  }

  // ── main loop ──────────────────────────────────────────────────────
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const live = !this.paused && (this.phase === 'build' || this.phase === 'wave');

    if (this.phase !== 'title' && live) this.elapsed += dt;
    sunDirection(this.elapsed, this.sunDir);
    this.view.setSun(this.sunDir);
    for (const t of this.tiles) t.sun = Math.max(0, t.center.dot(this.sunDir));

    if (live) {
      this.audio.tick(dt);
      this.updatePower(dt);
      this.alloy += this.alloyRate * dt;
      for (const b of this.buildings) updateBuilding(b, dt, this);
      this.enemyMgr.update(dt, this);
      this.updateWave(dt);
    }
    this.fx.update(live ? dt : 0);
    this.enemyMgr.syncInstances();

    const pulse = 1 + Math.sin(this.elapsed * 3) * 0.08;
    for (const m of this.ventMarkers) {
      for (const part of m.userData.pulse) part.scale.setScalar(pulse);
    }

    const hover = this.controls.update(dt, this.planetMesh, this.faceTile);
    this.updateHoverRing(hover);
    this.hud.update(dt);
    this.view.renderer.render(this.scene, this.view.camera);
  }

  updateHoverRing(id) {
    this.hoverId = id;
    if (this.phase === 'title' || id === undefined || id < 0) {
      this.hoverRing.visible = false;
      return;
    }
    const tile = this.tiles[id];
    this.hoverRing.visible = true;
    placeRing(this.hoverRing, tile);
    if (this.selectedBuild) {
      const err = this.placementError(this.selectedBuild, tile);
      this.hoverRing.material.color.setHex(err ? 0xff5f68 : 0x46e0a0);
      const range = BUILDINGS[this.selectedBuild].range;
      if (range && !err) this.showRange(tile, range);
      else if (!this.selectedBuilding) this.rangeRing.visible = false;
    } else {
      this.hoverRing.material.color.setHex(0x8fb4cc);
    }
  }
}

function makeRing(inner, outer, color) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 30),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
  );
  m.visible = false;
  m.renderOrder = 3;
  return m;
}

function placeRing(ring, tile) {
  ring.position.copy(tile.center).multiplyScalar(PLANET.radius * tile.radius + 0.05);
  ring.quaternion.setFromUnitVectors(Z, tile.center);
}

function makeRangeRing() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
  const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({
    color: 0x4fd6ff, transparent: true, opacity: 0.55,
  }));
  line.visible = false;
  line.frustumCulled = false;
  return line;
}

// A turret's reach is a small circle on the sphere, not a flat disc — drawing
// it correctly is what makes range legible near the horizon.
function updateRangeRing(line, tile, range) {
  const R = PLANET.radius;
  const theta = 2 * Math.asin(Math.min(1, range / (2 * R)));
  const c = tile.center;
  const u = new THREE.Vector3(0, 1, 0);
  if (Math.abs(c.y) > 0.9) u.set(1, 0, 0);
  u.crossVectors(u, c).normalize();
  const v = new THREE.Vector3().crossVectors(c, u);
  const arr = line.geometry.attributes.position.array;
  const p = new THREE.Vector3();
  for (let i = 0; i < 97; i++) {
    const a = (i / 96) * Math.PI * 2;
    p.copy(c).multiplyScalar(Math.cos(theta))
      .addScaledVector(u, Math.sin(theta) * Math.cos(a))
      .addScaledVector(v, Math.sin(theta) * Math.sin(a))
      .multiplyScalar(R * 1.012);
    arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
  }
  line.geometry.attributes.position.needsUpdate = true;
}
