import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Echo } from './echo.js';
import { ChaseCam } from './camera.js';

const TICK = 1 / 60;

const SAVE_KEY = 'afterimage.save';

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return { unlocked: raw.unlocked || 0, best: raw.best || {} };
  } catch { return { unlocked: 0, best: {} }; }
}

export function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

export class Game {
  constructor(canvas, hud, sfx, input) {
    this.hud = hud;
    this.sfx = sfx;
    this.input = input;
    this.state = 'menu';
    this.save = loadSave();
    this.onWin = null;
    this.onPause = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06070f);
    this.scene.fog = new THREE.FogExp2(0x06070f, 0.017);

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 500);
    this.cam = new ChaseCam(this.camera);

    this.buildAmbience();

    this.player = new Player(this.scene);
    this.player.mesh.visible = false;
    this.echoes = [];
    this.world = null;
    this.frames = [];
    this.tickIndex = 0;
    this.elapsed = 0;
    this.acc = 0;
    this.last = performance.now();
    this._colliders = [];
    this._bodies = [];

    addEventListener('resize', () => this.resize());
    requestAnimationFrame(() => this.frame());
  }

  buildAmbience() {
    const hemi = new THREE.HemisphereLight(0x88a6ff, 0x101728, 1.15);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xd2e2ff, 2.1);
    key.position.set(22, 34, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const s = key.shadow.camera;
    s.left = -34; s.right = 34; s.top = 34; s.bottom = -34; s.near = 1; s.far = 110;
    key.shadow.bias = -0.0016;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xb478ff, 0.5);
    rim.position.set(-18, 12, -22);
    this.scene.add(rim);

    const grid = new THREE.GridHelper(400, 80, 0x24407a, 0x14203c);
    grid.position.y = -7;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    this.scene.add(grid);

    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 130;
      pos[i * 3 + 1] = Math.random() * 34 - 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 130;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x8fb4ff, size: 0.09, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    this.scene.add(this.dust);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ── level lifecycle ────────────────────────────────────────────────────
  startLevel(index) {
    this.levelIndex = index;
    const def = LEVELS[index];
    this.def = def;

    this.clearEchoes();
    if (this.world) this.world.dispose();
    this.world = new World(this.scene, def, this.sfx);

    this.player.mesh.visible = true;
    this._colliders = this.world.colliders;
    this.hud.setLevel(def, index, def.maxEchoes);
    this.hud.show(true);
    this.cam.reset(def.yaw || 0);
    this.resetTake(false, true);
    this.hud.hint(def.hint, 7);

    this.state = 'play';
    this.input.enabled = true;
    this.input.clearPressed();
    this.input.lock();
  }

  clearEchoes() {
    for (const e of this.echoes) e.dispose();
    this.echoes = [];
  }

  resetTake(bank, silent = false) {
    if (bank && this.frames.length > 4) {
      this.echoes.push(new Echo(this.scene, this.frames, this.echoes.length));
      this.sfx.bank();
    }
    this.frames = [];
    this.tickIndex = 0;
    this.world.reset();
    this.player.place(this.def.spawn, this.def.yaw || 0);
    for (const e of this.echoes) { e.reset(); e.update(0, this.player.body); }
    this.hud.setEchoes(this.echoes.length);
    this.hud.setCrystals(0, this.world.crystals.length);
    this.hud.setLoop(0, this.def.loop);

    if (!silent) {
      this.hud.flash();
      this.cam.kick(1.0);
      this.cam.fovKick = 9;
      this.sfx.rewind();
    }
  }

  rewind() {
    if (this.echoes.length >= this.def.maxEchoes) {
      this.hud.toast('echo limit — Z to undo', 'warn', 2);
      return;
    }
    this.resetTake(true);
  }

  undoEcho() {
    if (!this.echoes.length) { this.hud.toast('no echoes', 'warn', 1.2); return; }
    this.echoes.pop().dispose();
    this.resetTake(false);
    this.hud.toast('echo erased', '', 1.2);
  }

  retry() {
    this.resetTake(false);
    this.hud.toast('take restarted', '', 1.2);
  }

  restartLevel() {
    this.clearEchoes();
    this.resetTake(false, true);
    this.hud.hint(this.def.hint, 5);
  }

  // ── simulation ─────────────────────────────────────────────────────────
  simulate() {
    const world = this.world;
    const t = this.tickIndex * TICK;

    for (const e of this.echoes) {
      if (e.update(this.tickIndex, this.player.body)) {
        const s = world.switchNear(e.body.cx, e.body.cy, e.body.cz);
        if (s) world.toggleSwitch(s.id);
      }
    }

    this._colliders.length = 0;
    for (const c of world.static) this._colliders.push(c);
    for (const c of world.kinetic) this._colliders.push(c);
    for (const e of this.echoes) this._colliders.push(e.body);

    const wish = {
      x: (this.input.held.right ? 1 : 0) - (this.input.held.left ? 1 : 0),
      z: (this.input.held.fwd ? 1 : 0) - (this.input.held.back ? 1 : 0),
    };
    const jumpPressed = this.input.takePressed('jump');
    const usePressed = this.input.takePressed('use');

    const ev = this.player.step(TICK, wish, !!this.input.held.jump, jumpPressed, this.cam.yaw, this._colliders);
    if (ev.jumped) this.sfx.jump();
    if (ev.landed) this.sfx.land();

    if (usePressed) {
      const s = world.switchNear(this.player.body.cx, this.player.body.cy, this.player.body.cz);
      if (s) world.toggleSwitch(s.id);
    }

    this._bodies.length = 0;
    this._bodies.push(this.player.body);
    for (const e of this.echoes) this._bodies.push(e.body);
    world.update(t, TICK, this._bodies, this.elapsed);

    this.frames.push({
      x: this.player.body.cx, y: this.player.body.cy, z: this.player.body.cz,
      yaw: this.player.mesh.rotation.y, use: usePressed,
    });
    this.tickIndex++;

    this.hud.setCrystals(world.crystals.length - world.remaining, world.crystals.length);
    this.hud.setLoop(t, this.def.loop);

    if (world.hazardHit(this.player.body) || this.player.body.cy < -16) {
      this.sfx.hazard();
      this.resetTake(false);
      this.hud.toast(this.player.body.cy < -16 ? 'lost to the void' : 'vaporised', 'warn', 1.6);
      return;
    }

    if (world.onExit(this.player.body) && this.player.grounded) { this.finish(); return; }

    if (t >= this.def.loop) {
      if (this.echoes.length < this.def.maxEchoes) {
        this.resetTake(true);
        this.hud.toast('loop closed', '', 1.4);
      } else {
        this.resetTake(false);
        this.hud.toast('out of time', 'warn', 1.6);
      }
    }
  }

  finish() {
    this.state = 'won';
    this.input.enabled = false;
    this.input.unlock();
    this.sfx.win();
    this.cam.kick(0.6);

    const used = this.echoes.length;
    const id = this.def.id;
    const prev = this.save.best[id];
    const isBest = prev === undefined || used < prev;
    if (isBest) this.save.best[id] = used;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length - 1, this.levelIndex + 1));
    writeSave(this.save);

    if (this.onWin) this.onWin({ used, par: this.def.par, isBest, best: this.save.best[id], index: this.levelIndex });
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.unlock();
    if (this.onPause) this.onPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'play';
    this.input.enabled = true;
    this.input.clearPressed();
    this.input.lock();
  }

  toMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.unlock();
    this.hud.show(false);
    this.clearEchoes();
    if (this.world) this.world.dispose();
    this.world = new World(this.scene, LEVELS[0], this.sfx);
    this.player.mesh.visible = false;
    this._colliders = [];
  }

  // ── frame ──────────────────────────────────────────────────────────────
  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    this.elapsed += dt;
    this.hud.tick(dt);

    if (this.state === 'play') {
      const m = this.input.takeMouse();
      if (m.x || m.y) this.cam.aim(m.x, m.y);
      this.acc += dt;
      // Bounded catch-up: a slow machine runs the sim slightly slow rather than
      // spiralling, and recordings stay tick-exact either way.
      let guard = 0;
      while (this.acc >= TICK && guard++ < 12) {
        this.acc -= TICK;
        this.simulate();
        if (this.state !== 'play') break;
      }
    }

    if (this.world && this.state === 'menu') {
      // The title screen orbits a real chamber rather than an empty void.
      this.world.update(0, dt, [], this.elapsed);
      const a = this.elapsed * 0.07;
      this.camera.position.set(Math.sin(a) * 24, 11, Math.cos(a) * 24);
      this.camera.lookAt(0, 2, -2);
    } else if (this.world) {
      this.cam.update(dt, this.player.mesh.position, this._colliders);
    }

    this.dust.rotation.y = this.elapsed * 0.006;
    this.renderer.render(this.scene, this.camera);
  }
}
