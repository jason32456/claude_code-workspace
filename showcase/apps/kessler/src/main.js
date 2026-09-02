import * as THREE from '../vendor/three.module.js';
import { createScene } from './scene.js';
import { World } from './world.js';
import { DebrisField } from './debris.js';
import { Player, TUNE } from './player.js';
import { closestLocal } from './collide.js';
import { DebrisCrates } from './crates.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { makeRng } from './rng.js';

const SHIFTS = [
  { quota: 3, o2: 240, debris: 6, ringRate: 6, crates: 8, hint: 'Kick off the airlock collar and cross to the first crate on one impulse. Aim with the mouse — the camera is your thrust vector.' },
  { quota: 5, o2: 235, debris: 9, ringRate: 8, crates: 11, hint: 'Crates on the ring ride round with it. Anchor there and you rotate too — and a kick off the ring inherits its speed.' },
  { quota: 7, o2: 230, debris: 13, ringRate: 10, crates: 14, hint: 'A full rack is 108 kg of you. Every kick gets weaker as you fill it — bank early rather than hauling six home.' },
  { quota: 9, o2: 225, debris: 17, ringRate: 12, crates: 17, hint: 'Stranded with no gas? Throw a crate. You lose the salvage and gain the delta-v — that trade is the whole job.' },
  { quota: 12, o2: 220, debris: 22, ringRate: 14, crates: 20, hint: 'Last shift. The breach jets push hard enough to cross the yard for free if you enter them straight.' },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    const s = createScene(this.canvas);
    Object.assign(this, s);

    this.input = new Input(this.canvas);
    this.hud = new Hud();
    this.audio = new Audio();
    this.player = new Player(this.scene);
    this.crates = new DebrisCrates(this.scene);

    this.state = 'menu';
    this.shift = 1;
    this.score = 0;
    this.shake = 0;
    this.prevSpace = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 200;
    this.tmp = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.best = Number(localStorage.getItem('kessler.best') || 0);

    this.bindUi();
    this.showBest();
    this.last = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  // ---------- ui ----------

  bindUi() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    on('btn-start', () => { this.shift = 1; this.score = 0; this.brief(); });
    on('btn-dive', () => this.beginShift());
    on('btn-next', () => {
      if (this.failed || this.shift > SHIFTS.length) this.toMenu();
      else this.brief();
    });
    on('btn-resume', () => this.resume());
    on('btn-abort', () => this.toMenu());

    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'play') this.pause();
        else if (this.state === 'pause') this.resume();
      }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        const b = { menu: 'btn-start', brief: 'btn-dive', result: 'btn-next', pause: 'btn-resume' }[this.state];
        if (b) document.getElementById(b).click();
      }
      if (e.code === 'KeyM' && this.audio.ready) this.audio.muted = !this.audio.muted;
    });

    document.addEventListener('pointerlockchange', () => {
      if (this.state === 'play' && this.hadLock && !this.input.locked) this.pause();
      this.hadLock = this.input.locked;
    });

    this.canvas.addEventListener('mousedown', () => {
      if (this.state === 'pause') this.resume();
    });

    if (matchMedia('(pointer: coarse)').matches) {
      document.getElementById('best-line').textContent = 'DESKTOP ONLY — NEEDS A MOUSE AND KEYBOARD';
    }
  }

  showBest() {
    if (this.best > 0 && !matchMedia('(pointer: coarse)').matches) {
      document.getElementById('best-line').textContent = `BEST RUN — ${this.best} PTS`;
    }
  }

  overlay(id) {
    for (const o of ['menu', 'briefing', 'result', 'pause']) {
      document.getElementById(o).classList.toggle('hidden', o !== id);
    }
    this.hud.show(id === null || id === 'pause');
    this.input.enabled = id === null;
    // A button that keeps focus eats the first SPACE — which is the first kick.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  toMenu() {
    this.state = 'menu';
    this.overlay('menu');
    this.input.releaseLock();
    this.hud.show(false);
    this.showBest();
    this.teardown();
  }

  brief() {
    const cfg = SHIFTS[this.shift - 1];
    this.state = 'brief';
    document.getElementById('brief-title').textContent = `SHIFT ${this.shift}`;
    document.getElementById('brief-quota').textContent = `${cfg.quota} crates`;
    document.getElementById('brief-o2').textContent = `${cfg.o2} s`;
    document.getElementById('brief-debris').textContent = `${cfg.debris} tracked`;
    document.getElementById('brief-ring').textContent = `${cfg.ringRate} °/s`;
    document.getElementById('brief-hint').textContent = cfg.hint;
    this.overlay('briefing');
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.overlay('pause');
    this.input.releaseLock();
    this.audio.servo(0);
  }

  resume() {
    if (this.state !== 'pause') return;
    this.state = 'play';
    this.overlay(null);
    this.input.requestLock();
    this.input.takeLook();
  }

  // ---------- lifecycle ----------

  teardown() {
    if (this.world) { this.world.dispose(); this.world = null; }
    if (this.debris) { this.debris.dispose(); this.debris = null; }
    this.crates.clear();
  }

  beginShift() {
    this.audio.init();
    this.audio.resume();
    this.teardown();

    const cfg = SHIFTS[this.shift - 1];
    this.cfg = cfg;
    const rng = makeRng(0x5eed + this.shift * 7919);
    this.world = new World(this.scene, rng, cfg);
    this.debris = new DebrisField(this.scene, rng, cfg.debris);

    const p = this.player;
    p.world = this.world;
    p.reset(this.world.dockPosition(new THREE.Vector3()));
    p.o2 = p.o2Max = cfg.o2;
    p.gas = 100;
    p.hull = 100;
    p.banked = 0;
    p.yaw = Math.PI / 2;
    p.pitch = 0;
    p.updateLook(0, 0);
    p.dropTether();
    this.standOnAirlock();

    this.failed = false;
    this.dockCooldown = 0;
    this.state = 'play';
    this.overlay(null);
    this.input.requestLock();
    this.input.takeLook();   // drop deltas accumulated while the overlay was up
    this.hud.toast(`SHIFT ${this.shift} — RETURN ${cfg.quota} CRATES`, 3);

    this.camera.position.copy(p.pos)
      .addScaledVector(p.forward, -6.4)
      .addScaledVector(p.up, 1.5)
      .addScaledVector(p.right, 1.15);
  }

  // Every shift starts with boots on the airlock module, not adrift.
  standOnAirlock() {
    const p = this.player;
    const col = this.world.airlockBodyCollider;
    const nLocal = new THREE.Vector3(0, 1, 0);
    const localPoint = new THREE.Vector3(col.cyl.hx * 0.45, col.cyl.r, 0);
    const contact = localPoint.clone().applyMatrix4(col.mesh.matrixWorld);
    p.pos.copy(contact).addScaledVector(nLocal, TUNE.radius);
    p.attach(col, contact, nLocal, localPoint);
  }

  finish(title, line) {
    this.state = 'result';
    this.audio.servo(0);
    this.input.releaseLock();
    const p = this.player;
    const gained = this.failed ? 0 : p.banked * 100 + Math.round(p.o2 * 2) + Math.round(p.hull);
    this.score += gained;
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('kessler.best', String(this.best));
    }
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-line').textContent = line;
    document.getElementById('res-banked').textContent = `${p.banked} / ${this.cfg.quota}`;
    document.getElementById('res-o2').textContent = `${Math.max(0, Math.ceil(p.o2))} s`;
    document.getElementById('res-hull').textContent = `${Math.max(0, Math.ceil(p.hull))}%`;
    document.getElementById('res-score').textContent = this.score;
    document.getElementById('btn-next').textContent =
      this.failed ? 'BACK TO AIRLOCK ⏎' : (this.shift > SHIFTS.length ? 'FINISH ⏎' : 'NEXT SHIFT ⏎');
    this.overlay('result');
  }

  fail(reason) {
    this.failed = true;
    this.audio.alarm();
    this.finish('RUN ENDED', reason);
  }

  // ---------- loop ----------

  loop(now) {
    requestAnimationFrame(this.loop.bind(this));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.__fps = this.__fps ? this.__fps * 0.94 + (1 / Math.max(dt, 1e-3)) * 0.06 : 1 / Math.max(dt, 1e-3);

    if (this.state === 'play') this.tick(dt);
    else if (this.world) this.world.update(0, this.camera);

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  tick(dt) {
    const p = this.player;
    const inp = this.input;

    const look = inp.takeLook();
    if (look.dx || look.dy) p.updateLook(look.dx, look.dy);

    // verbs
    const space = inp.down('Space');
    if (space && !this.prevSpace) p.beginCharge();
    if (!space && this.prevSpace) p.releaseCharge();
    this.prevSpace = space;

    if (inp.hit('KeyE')) {
      if (p.anchored) p.releaseAnchor();
      else this.tryGrab();
    }
    if (inp.hit('KeyQ')) this.throwCrate();
    if (inp.clicked.left) p.fireTether(this.world, this.camera.position);
    p.reeling = inp.mouse.right && !!p.tether;

    this.world.update(dt, this.camera);
    this.debris.update(dt);

    const puff = p.step(dt, this.world, inp, true);
    if (puff.hiss > 0 && Math.random() < 0.4) this.audio.hiss(puff.hiss);
    this.audio.servo(p.reeling && p.tether ? 1 : 0);

    const closure = this.debris.collide(p.pos, p.vel, TUNE.radius, p.mass);
    if (closure > 0.6) {
      p.releaseAnchor();
      p.damage(closure * 3.2, 'debris');
      this.audio.clang();
      this.hud.flash();
      this.shake = Math.min(1, closure / 8);
      this.hud.toast('DEBRIS STRIKE');
    }

    this.crates.update(dt, p, () => this.audio.chirp(true));
    this.collectCrates(dt);
    this.checkDock(dt);

    // life support
    const dist = p.pos.length();
    const inVoid = dist > TUNE.voidRadius;
    p.o2 -= TUNE.o2Burn * dt * (inVoid ? 3 : 1);
    if (p.o2 <= 0) { p.o2 = 0; this.fail('OXYGEN EXHAUSTED — the tank ran out before you did.'); return; }
    if (p.hull <= 0) { this.fail('SUIT BREACH — too many hard catches.'); return; }

    this.drainEvents();
    this.updateCamera(dt);
    this.audio.updateBreath(dt, p.o2 / p.o2Max, clamp(p.vel.length() / 12, 0, 1));

    this.hud.update(this.readState(inVoid), this.camera);
  }

  tryGrab() {
    // A deliberate grab is just a very short-range reach; the physics step does
    // the real anchoring when you touch something slowly enough.
    const p = this.player;
    let best = null;
    let bestD = 2.4;
    for (const c of this.world.colliders) {
      this.tmp.setFromMatrixPosition(c.mesh.matrixWorld);
      if (this.tmp.distanceTo(p.pos) > c.radius + 3) continue;
      const local = p.pos.clone().applyMatrix4(c.inv);
      const cl = new THREE.Vector3();
      const n = new THREE.Vector3();
      const res = closestLocal(c, local, cl, n);
      const d = res.inside ? 0 : res.dist;
      if (d < bestD) { bestD = d; best = { c, cl, n }; }
    }
    if (!best) { this.hud.toast('NOTHING IN REACH'); return; }
    const nLocal = best.n.clone().normalize();
    const contact = best.cl.clone().applyMatrix4(best.c.mesh.matrixWorld);
    const rel = p.vel.clone().sub(this.world.surfaceVelocity(best.c, contact, new THREE.Vector3()));
    if (rel.length() > TUNE.hardCatch) { this.hud.toast('TOO FAST TO HOLD ON'); return; }
    p.attach(best.c, contact, nLocal, best.cl);
    this.audio.thump(0.3);
  }

  throwCrate() {
    const p = this.player;
    if (p.cargo <= 0) { this.hud.toast('RACK EMPTY'); return; }
    p.throwCrate();
  }

  collectCrates(dt) {
    const p = this.player;
    for (const c of this.world.crates) {
      if (c.taken) continue;
      const wp = c.group.getWorldPosition(this.tmp).clone();
      if (!c.last) { c.last = wp.clone(); continue; }
      const cvel = wp.clone().sub(c.last).divideScalar(Math.max(dt, 1e-4));
      c.last.copy(wp);
      if (wp.distanceTo(p.pos) > 2.3) continue;
      if (p.cargo >= TUNE.rack) { this.hud.toast('RACK FULL — BANK AT THE AIRLOCK'); continue; }

      // Scooping a crate off the spinning ring costs you momentum, as it should.
      const total = p.mass + TUNE.crateMass;
      p.vel.multiplyScalar(p.mass / total).addScaledVector(cvel, TUNE.crateMass / total);
      p.cargo += 1;
      c.taken = true;
      c.group.visible = false;
      this.audio.chirp(true);
      this.hud.toast(`CRATE SECURED — RACK ${p.cargo}/${TUNE.rack}`);
    }
  }

  checkDock(dt) {
    const p = this.player;
    this.dockCooldown = Math.max(0, this.dockCooldown - dt);
    if (this.dockCooldown > 0) return;

    // Getting home counts whether you hit the port dead-on or just grabbed the
    // airlock module and pulled yourself in.
    const onAirlock = p.anchor
      && (p.anchor.collider === this.world.airlockCollider
        || p.anchor.collider === this.world.airlockBodyCollider);
    const d = this.world.dockPosition(this.tmp).distanceTo(p.pos);
    const inRange = d <= TUNE.dockRadius && p.vel.length() <= TUNE.dockSpeed;
    if (!onAirlock && !inRange) return;

    // Standing on the airlock with a full suit and nothing to bank is not a dock.
    const topped = p.o2 >= p.o2Max - 0.01 && p.gas >= 100 && p.hull >= 100;
    if (p.cargo === 0 && topped) return;

    const banked = p.cargo;
    p.banked += banked;
    p.cargo = 0;
    p.o2 = p.o2Max;
    p.gas = 100;
    p.hull = Math.min(100, p.hull + 35);
    this.dockCooldown = 2;
    this.audio.chord([196, 294, 392]);

    if (p.banked >= this.cfg.quota) {
      this.shift += 1;
      if (this.shift > SHIFTS.length) {
        this.finish('CONTRACT COMPLETE', 'Five shifts, every quota met. Kessler Station is stripped.');
      } else {
        this.finish('SHIFT COMPLETE', `${p.banked} crates banked. Suit topped up for shift ${this.shift}.`);
      }
      return;
    }
    this.hud.toast(banked
      ? `BANKED ${banked} — ${p.banked}/${this.cfg.quota} · O2 AND GAS TOPPED UP`
      : 'O2 AND GAS TOPPED UP');
  }

  drainEvents() {
    const p = this.player;
    for (const ev of p.events) {
      if (ev.kind === 'kick') this.audio.kick(ev.power);
      else if (ev.kind === 'catch') {
        this.audio.thump(clamp(ev.speed / 6, 0.15, 1));
        if (ev.hard) { this.hud.flash(); this.shake = Math.min(0.6, ev.speed / 12); this.hud.toast('HARD CATCH'); }
      } else if (ev.kind === 'bounce') {
        this.audio.clang();
        this.hud.flash();
        this.shake = Math.min(1, ev.speed / 10);
        this.hud.toast('THROWN OFF — TOO FAST');
      } else if (ev.kind === 'throw') {
        this.crates.spawn(ev.from, p.vel.clone().addScaledVector(ev.dir, ev.speed));
        this.audio.hiss(0.5);
        this.hud.toast('CRATE JETTISONED');
      } else if (ev.kind === 'tether-hit') this.audio.chirp(true);
      else if (ev.kind === 'tether-miss') { this.audio.chirp(false); this.hud.toast('TETHER — NO CONTACT'); }
    }
    p.events.length = 0;
  }

  updateCamera(dt) {
    const p = this.player;
    // Over-the-shoulder: the suit reads the drift vector for you, but it must not
    // sit under the reticle.
    const desired = p.pos.clone()
      .addScaledVector(p.forward, -6.4)
      .addScaledVector(p.up, 1.5)
      .addScaledVector(p.right, 1.15);

    // Pull the camera in if the hull is behind us.
    const back = desired.clone().sub(p.pos);
    const len = back.length();
    this.raycaster.set(p.pos, back.divideScalar(len));
    this.raycaster.far = len;
    const hit = this.raycaster.intersectObjects(this.world.rayTargets, false)[0];
    if (hit) desired.copy(p.pos).addScaledVector(this.raycaster.ray.direction, Math.max(2.3, hit.distance - 0.5));

    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 14));
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.z += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake *= Math.exp(-dt * 6);
    }
    // Never render the suit from inside it.
    p.mesh.visible = this.camera.position.distanceTo(p.pos) > 2.6;

    this.camTarget.copy(this.camera.position).add(p.forward);
    this.camera.up.copy(p.up);
    this.camera.lookAt(this.camTarget);

    // Lamp rides on the helmet, not the camera, so it never lights the backpack
    // at point-blank range.
    this.lamp.position.copy(p.pos).addScaledVector(p.forward, 1.1).addScaledVector(p.up, 0.7);
    this.lampTarget.position.copy(this.lamp.position).addScaledVector(p.forward, 50);
  }

  readState(inVoid) {
    const p = this.player;
    this.raycaster.set(this.camera.position, p.forward);
    this.raycaster.far = 200;
    const hit = this.raycaster.intersectObjects(this.world.rayTargets, false)[0];
    let closure = null;
    let closureDist = null;
    if (hit) {
      closureDist = hit.distance;
      const col = this.world.colliderByMesh.get(hit.object.uuid);
      const surf = col ? this.world.surfaceVelocity(col, hit.point, new THREE.Vector3()) : new THREE.Vector3();
      closure = p.vel.clone().sub(surf).dot(p.forward);
    }
    const speed = p.vel.length();
    return {
      shift: this.shift,
      objective: `RETURN ${this.cfg.quota} CRATES`,
      o2: p.o2,
      o2Max: p.o2Max,
      hull: p.hull,
      gas: p.gas,
      banked: p.banked,
      quota: this.cfg.quota,
      cargo: p.cargo,
      mass: p.mass,
      speed,
      anchored: p.anchored,
      charging: p.charging,
      charge: p.charge,
      kickBlocked: p.anchored && p.forward.dot(p.anchorNormal(this.tmp)) < -0.02,
      tether: !!p.tether,
      taut: p.tetherTaut,
      reeling: p.reeling,
      tetherLen: p.tether ? p.tether.length : 0,
      closure,
      closureDist,
      inVoid,
      velDir: speed > 0.01 ? p.vel.clone().normalize() : null,
    };
  }
}

const game = new Game();
window.__kessler = game;
