// Nine Minds — game loop, rules and camera.
//
// The octopus owns its own body; this file owns everything the body bumps into:
// what an arm found when it arrived, what a probe pulled out of a hole, and
// what happens when something with teeth finally commits.

import * as THREE from '../vendor/three.module.js';
import { Stage } from './scene.js';
import { Reef } from './world.js';
import { Octopus, S, REACH, ATTENTION } from './octopus.js';
import { Prey, Predator, Decoy, Torch, makeMorayHead } from './creatures.js';
import { Audio } from './audio.js';
import { Hud } from './hud.js';
import { NIGHTS } from './levels.js';
import { clamp, mulberry32, range } from './rng.js';

const $ = (id) => document.getElementById(id);
const BEST_KEY = 'nine-minds-best';

class Game {
  constructor() {
    this.stage = new Stage($('game'));
    this.audio = new Audio();
    this.hud = new Hud();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 40;
    this.centre = new THREE.Vector2(0, 0);

    this.state = 'title';
    this.nightIndex = 0;
    this.armsLost = 0;
    this.score = 0;
    this.totalFood = 0;
    this.reflexCatches = 0;
    this.nightsCleared = 0;
    this.inkVeil = 0;
    this.decoys = [];
    this.predators = [];
    this.prey = [];
    this.pendingBite = null;
    this.invuln = 0;
    this.trapEat = 0;

    this.camYaw = 0;
    this.camPitch = 0.42;
    this.camPos = new THREE.Vector3();

    this.input = { moveX: 0, moveZ: 0, squeeze: false, focus: false, jet: false };
    this.keys = new Set();
    this.locked = false;
    this.paused = false;

    this._bindUI();
    this._bindInput();

    this.clock = new THREE.Clock();
    this.t = 0;
    requestAnimationFrame(() => this.loop());
    $('loading').classList.add('hidden');
  }

  // ── UI wiring ────────────────────────────────────────────────────────────
  _bindUI() {
    $('btn-start').onclick = () => {
      this.audio.start();
      $('title').classList.add('hidden');
      this.newRun();
    };
    $('btn-go').onclick = () => {
      $('briefing').classList.add('hidden');
      this.beginNight();
    };
    $('btn-next').onclick = () => {
      $('nightend').classList.add('hidden');
      this.nightIndex++;
      if (this.nightIndex >= NIGHTS.length) this.finish(true);
      else this.showBriefing();
    };
    $('btn-again').onclick = () => {
      $('results').classList.add('hidden');
      this.newRun();
    };
  }

  _bindInput() {
    const canvas = $('game');
    canvas.addEventListener('click', () => {
      if (this.state !== 'play' || this.paused) return;
      // Pointer lock is a comfort, not a requirement — some embeds refuse it,
      // and the game has to keep working when they do.
      if (!this.locked) { try { canvas.requestPointerLock(); } catch (e) { /* fine */ } }
      this.taskArm();
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.state === 'play' && !this.paused) { this.octo.releaseAll(); this.audio.grip(); }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'play' || this.paused) return;
      this.camYaw -= e.movementX * 0.0024;
      this.camPitch = clamp(this.camPitch + e.movementY * 0.0018, 0.02, 1.05);
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
      if (this.state !== 'play') return;
      if (e.code === 'KeyP') { this.paused = !this.paused; this.hud.prompt(this.paused ? 'PAUSED · P' : null); }
      if (this.paused) return;
      if (e.code === 'KeyQ') this.releaseInk();
      if (e.code === 'KeyF') this.eatHeld();
      if (e.code === 'Space' && this.pendingBite) this.escapeBite();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  _readInput() {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    this.input.moveX = -sy * f + cy * r;
    this.input.moveZ = -cy * f - sy * r;
    this.input.squeeze = k.has('ShiftLeft') || k.has('ShiftRight');
    this.input.focus = k.has('KeyC');
    this.input.jet = k.has('Space');
  }

  // ── run / night lifecycle ────────────────────────────────────────────────
  newRun() {
    this.nightIndex = 0;
    this.armsLost = 0;
    this.score = 0;
    this.totalFood = 0;
    this.reflexCatches = 0;
    this.nightsCleared = 0;
    this.runSeed = (Math.random() * 1e9) | 0;
    this.showBriefing();
  }

  showBriefing() {
    const n = NIGHTS[this.nightIndex];
    $('br-num').textContent = this.nightIndex + 1;
    $('br-name').textContent = n.name;
    $('br-line').textContent = n.line;
    $('br-quota').textContent = n.quota;
    $('br-arms').textContent = 8 - this.armsLost;
    $('br-new').textContent = n.newThing;
    $('briefing').classList.remove('hidden');
    this.hud.show(false);
    this.state = 'brief';
  }

  beginNight() {
    $('briefing').classList.add('hidden');
    $('nightend').classList.add('hidden');
    $('results').classList.add('hidden');
    const night = NIGHTS[this.nightIndex];
    this.night = night;
    this.timeLeft = night.duration;
    this.food = 0;
    this.ink = 3;
    this.decoys.length = 0;
    this.predators.length = 0;
    this.prey.length = 0;
    this.pendingBite = null;
    this.invuln = 0;
    this.inkVeil = 0;
    this.trapEat = 0;
    this._quotaHit = false;

    if (this.reef) { this.stage.scene.remove(this.reef.group); this.reef.dispose(); }
    while (this.stage.scene.children.some((c) => c.userData.transient)) {
      const c = this.stage.scene.children.find((x) => x.userData.transient);
      this.stage.scene.remove(c);
    }

    const seed = this.runSeed + this.nightIndex * 7919;
    const rnd = mulberry32(seed + 3);
    this.reef = new Reef({
      seed, traps: night.traps || 0, morayChance: night.reef.morayChance, ...night.reef,
    });
    this.stage.scene.add(this.reef.group);

    this.octo = new Octopus(this.reef, { armsLost: this.armsLost });
    this.octo.group.userData.transient = true;
    this.stage.scene.add(this.octo.group);

    // prey
    const spawn = (kind, count) => {
      for (let i = 0; i < count; i++) {
        let x = 0, z = 0;
        for (let k = 0; k < 40; k++) {
          x = range(rnd, -this.reef.size * 0.72, this.reef.size * 0.72);
          z = range(rnd, -this.reef.size * 0.72, this.reef.size * 0.72);
          const sub = this.reef.substrateAt(x, z);
          const ok = kind === 'clam' ? !sub.hard : true;
          if (ok && Math.hypot(x - this.reef.den.x, z - this.reef.den.z) > 4) break;
        }
        const p = new Prey(kind, x, z, this.reef);
        p.group.traverse((o) => { o.userData.prey = p; });
        p.group.userData.transient = true;
        this.stage.scene.add(p.group);
        this.prey.push(p);
      }
    };
    spawn('crab', night.crabs);
    spawn('clam', night.clams);

    // lobsters live inside the pots
    for (const trap of this.reef.traps) {
      const p = new Prey('lobster', trap.x, trap.z, this.reef);
      p.inTrap = trap;
      p.pos.y = trap.y + 0.28;
      p.group.position.copy(p.pos);
      p.group.traverse((o) => { o.userData.prey = p; });
      p.group.userData.transient = true;
      this.stage.scene.add(p.group);
      this.prey.push(p);
      trap.lobster = p;
    }

    for (const kind of night.predators) {
      const p = new Predator(kind, this.reef, rnd);
      p.mesh.userData.transient = true;
      this.stage.scene.add(p.mesh);
      this.predators.push(p);
    }

    if (night.torch) {
      this.torch = new Torch(this.reef);
      this.torch.group.userData.transient = true;
      this.stage.scene.add(this.torch.group);
    } else this.torch = null;

    this.pickables = [this.reef.terrain, ...this.reef.crevices.map((c) => c.mesh)];
    this.reef.group.traverse((o) => { if (o.isInstancedMesh) this.pickables.push(o); });
    for (const c of this.reef.crevices) c.mesh.userData.crevice = c;

    this.hud.setNight(this.nightIndex, night);
    this.hud.show(true);
    this.hud.toast(`NIGHT ${this.nightIndex + 1} — ${night.name}`, '');
    this.state = 'play';
    this.stage.setDawn(0);
    this._camera(1);
    try { $('game').requestPointerLock(); } catch (e) { /* the click prompt covers it */ }
  }

  endNight(reason) {
    this.state = 'nightend';
    this.hud.show(false);
    this.hud.prompt(null);
    document.exitPointerLock();
    this.armsLost = this.octo.armsLost;
    this.totalFood += this.food;

    const cleared = reason === 'den';
    if (cleared) {
      this.nightsCleared++;
      this.score += 250 + 100 * this.food + Math.round(this.timeLeft) * 2;
      this.audio.dawn();
      $('ne-eyebrow').textContent = 'BACK IN THE DEN';
      $('ne-title').textContent = 'NIGHT SURVIVED';
      $('ne-line').textContent = this.octo.armsLost > 0
        ? `You came home with ${8 - this.octo.armsLost} arms. They grow back — one a night, and never as long as they were.`
        : 'Eight arms, all of them still yours. The reef never worked out where you were.';
      // One arm regrows overnight.
      if (this.armsLost > 0) this.armsLost--;
      $('ne-food').textContent = this.food;
      $('ne-arms').textContent = 8 - this.armsLost;
      $('ne-score').textContent = this.score;
      $('nightend').classList.remove('hidden');
    } else {
      this.finish(false, reason);
    }
  }

  finish(won, reason) {
    this.state = 'results';
    this.hud.show(false);
    this.hud.prompt(null);
    document.exitPointerLock();
    this.score += 60 * (8 - this.armsLost);

    const best = Math.max(this.score, Number(localStorage.getItem(BEST_KEY) || 0));
    localStorage.setItem(BEST_KEY, String(best));

    $('rs-eyebrow').textContent = won ? 'FIVE NIGHTS' : 'THE RUN';
    $('rs-title').textContent = won ? 'YOU LASTED' : reason === 'dawn' ? 'CAUGHT IN THE LIGHT' : 'TAKEN';
    $('rs-line').textContent = won
      ? 'Five nights on this reef, and the reef never got a proper look at you.'
      : reason === 'dawn'
        ? 'First light found you out in the open. Everything on the reef saw the same thing at the same moment.'
        : reason === 'starve'
          ? 'Dawn came and you had not eaten enough to sit out the day. You will not wake up.'
          : 'It committed, you were not on rock, and there was nothing to tear off and leave behind.';
    $('rs-nights').textContent = this.nightsCleared;
    $('rs-food').textContent = this.totalFood;
    $('rs-arms').textContent = 8 - this.armsLost;
    $('rs-reflex').textContent = this.reflexCatches;
    $('rs-score').textContent = this.score;
    $('rs-best').textContent = best;
    $('results').classList.remove('hidden');
    if (!won) this.audio.fail();
  }

  // ── aiming and tasking ───────────────────────────────────────────────────
  aim() {
    this.raycaster.setFromCamera(this.centre, this.stage.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    const near = this.prey.filter((p) => !p.dead && !p.held && p.group.position.distanceTo(this.octo.pos) < 6);
    const preyHits = this.raycaster.intersectObjects(near.map((p) => p.group), true);
    let hit = hits[0];
    if (preyHits[0] && (!hit || preyHits[0].distance < hit.distance + 0.4)) hit = preyHits[0];
    if (!hit) return null;

    const obj = hit.object;
    let kind = 'ground', ref = null;
    if (obj.userData.prey) { ref = obj.userData.prey; kind = ref.kind === 'clam' ? 'clam' : 'prey'; }
    else if (obj.userData.crevice) { ref = obj.userData.crevice; kind = 'crevice'; }
    return { point: hit.point, kind, ref, dist: hit.distance };
  }

  taskArm() {
    const a = this.aim();
    if (!a) return;
    const o = this.octo;
    const reach = o.pos.distanceTo(a.point);
    if (reach > REACH * 1.15) { this.refuse('out of reach'); return; }
    if (a.kind === 'prey' && a.ref.inTrap) { this.refuse('it will not come through the funnel — get in there yourself'); return; }
    if (a.kind === 'crevice' && a.ref.probed) { this.refuse('that hole is already empty'); return; }
    if (o.freeAttention() <= 0) { this.refuse('all three minds are busy'); return; }

    const arm = o.bestArmFor(a.point);
    if (!arm) { this.refuse('no arm free that can get there'); return; }
    o.task(arm, a.point, { type: a.kind === 'ground' ? 'grip' : a.kind, ref: a.ref });
  }

  refuse(msg) {
    if (this._refuseCooldown > 0) return;
    this._refuseCooldown = 0.7;
    this.hud.toast(msg, 'warn');
    this.hud.setReticle('blocked');
  }

  // ── callbacks from the octopus ───────────────────────────────────────────
  armArrived(arm) {
    const intent = arm.intent || { type: 'grip' };
    const reflex = intent.reflex === true;

    if (intent.type === 'prey') {
      const p = intent.ref;
      if (!p || p.dead || p.held) { arm.state = S.FREE; arm.attended = false; return; }
      p.held = true;
      arm.item = p;
      arm.state = S.HOLD;
      arm.attended = false;
      arm.timer = 0;
      this.audio.snatch();
      if (reflex) {
        this.reflexCatches++;
        this.hud.toast(`arm ${arm.i + 1} took a ${p.kind} you never saw`, 'good');
      }
      return;
    }

    if (intent.type === 'clam') {
      const c = intent.ref;
      if (!c || c.dead) { arm.state = S.FREE; arm.attended = false; return; }
      arm.state = S.PRY;
      arm.attended = true;
      const helpers = this.octo.arms.filter((x) => x.state === S.PRY && x.intent && x.intent.ref === c).length;
      if (helpers === 1) this.hud.toast('one arm will not open it — send another', 'warn');
      return;
    }

    if (intent.type === 'crevice') {
      arm.state = S.PROBE;
      arm.timer = 2.4;
      return;
    }

    // plain grip on the substrate — the thing that saves your life later
    arm.state = S.GRIP;
    arm.plant.copy(arm.target);
    arm.attended = false;
    arm.hardGrip = this.reef.substrateAt(arm.target.x, arm.target.z).hard;
    this.audio.grip();
  }

  // Reflex ladder for any arm the player is not attending.
  armReflex(arm) {
    const o = this.octo;
    if (o.jetting || arm.state !== S.FREE) return;

    for (const p of this.prey) {
      if (p.dead || p.held || p.inTrap) continue;
      if (p.kind === 'clam') continue;
      if (arm.tip.distanceTo(p.group.position) < 1.45 && o.pos.distanceTo(p.group.position) < REACH) {
        o.task(arm, p.group.position, { type: 'prey', ref: p, reflex: true });
        return;
      }
    }
    for (const c of this.reef.crevices) {
      if (c.probed) continue;
      const d = Math.hypot(arm.tip.x - c.x, arm.tip.z - c.z);
      if (d < 1.9 && Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < REACH && Math.random() < 0.4) {
        o.task(arm, new THREE.Vector3(c.x, c.y + 0.3, c.z), { type: 'crevice', ref: c, reflex: true });
        return;
      }
    }
  }

  resolveProbe(arm) {
    const c = arm.intent && arm.intent.ref;
    const attended = arm.attended;
    arm.attended = false;
    if (!c) { arm.state = S.FREE; return; }
    c.probed = true;

    if (c.occupant === 'shrimp') {
      arm.state = S.FREE;
      this.food++;
      this.audio.eat();
      this.audio.chime(4);
      this.hud.toast(attended ? 'shrimp — straight to the beak' : `arm ${arm.i + 1} found a shrimp in there`, 'good');
      return;
    }
    if (c.occupant === 'empty') {
      arm.state = S.FREE;
      this.hud.toast('nothing in that one', '');
      return;
    }

    // moray
    const head = makeMorayHead();
    head.position.set(c.x, c.y + 0.35, c.z);
    head.rotation.y = Math.random() * 6.28;
    head.userData.transient = true;
    this.stage.scene.add(head);
    c.moray = head;
    this.audio.bite();
    this.hud.hurtFlash();

    if (attended) {
      this.pendingBite = { arm, t: 1.3 };
      this.hud.prompt('MORAY — PULL BACK · SPACE');
      arm.state = S.PROBE;
      arm.timer = 999;
    } else {
      if (Math.random() < 0.2) {
        const at = this.octo.autotomize();
        if (at) this.spawnArmDecoy(at);
        this.hud.toast(`arm ${arm.i + 1} went into a hole with a moray in it, and stayed there`, 'bad');
        this.audio.sever();
      } else {
        this.octo.hurt(arm, 12);
        this.hud.toast(`arm ${arm.i + 1} found the moray — it is no use to you for a while`, 'bad');
      }
    }
  }

  escapeBite() {
    const { arm } = this.pendingBite;
    this.pendingBite = null;
    this.hud.prompt(null);
    this.octo.hurt(arm, 6);
    this.hud.toast('you got it back — bruised, and slow for a while', 'warn');
  }

  failBite() {
    const { arm } = this.pendingBite;
    this.pendingBite = null;
    this.hud.prompt(null);
    arm.state = S.FREE;
    const at = this.octo.autotomize(arm);
    if (at) this.spawnArmDecoy(at);
    this.audio.sever();
    this.hud.hurtFlash();
    this.hud.toast('too slow — the moray kept the arm', 'bad');
  }

  consume(arm, auto = false) {
    const p = arm.item;
    if (!p) { arm.state = S.FREE; return; }
    this.food += p.value;
    p.dead = true;
    this.stage.scene.remove(p.group);
    arm.item = null;
    arm.state = S.FREE;
    arm.attended = false;
    this.audio.eat();
    this.audio.chime(this.food % 8);
    this.hud.toast(auto ? `arm ${arm.i + 1} fed you a ${p.kind} in its own time` : `${p.kind} — ${p.value} eaten`, 'good');
    this.checkQuota();
  }

  openClam(clam) {
    clam.dead = true;
    this.stage.scene.remove(clam.group);
    for (const a of this.octo.arms) {
      if (a.intent && a.intent.ref === clam) { a.state = S.FREE; a.attended = false; a.intent = null; }
    }
    this.food += clam.value;
    this.audio.crack();
    this.audio.chime(7);
    this.hud.toast('the clam gives — two arms was the answer', 'good');
    this.checkQuota();
  }

  checkQuota() {
    if (this.food >= this.night.quota && !this._quotaHit) {
      this._quotaHit = true;
      this.hud.toast('THAT IS ENOUGH — GET BACK TO THE DEN', 'good');
      this.audio.chime(12);
    }
  }

  eatHeld() {
    const o = this.octo;
    let best = null, bd = 1e9;
    for (const a of o.arms) {
      if (!a.carrying) continue;
      const d = a.tip.distanceTo(o.pos);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) this.consume(best);
    else this.refuse('nothing in hand');
  }

  releaseInk() {
    if (this.ink <= 0) { this.refuse('no ink left'); return; }
    this.ink--;
    const o = this.octo;
    const col = o.skinMat.color.clone();
    const d = new Decoy('ink', o.pos, col, this.reef);
    // A decoy is only as convincing as the skin it copies.
    d.pull = 5 + 11 * o.match;
    d.holds = 1.5 + 4.5 * o.match;
    d.group.userData.transient = true;
    this.stage.scene.add(d.group);
    this.decoys.push(d);
    this.inkVeil = 0.9;
    this.audio.ink();
    this.hud.toast(o.match > 0.6 ? 'a second octopus, and it is the convincing one' : 'the decoy looks as wrong as you do', o.match > 0.6 ? 'good' : 'warn');
  }

  spawnArmDecoy(at) {
    const d = new Decoy('arm', at, this.octo.skinMat.color.clone(), this.reef);
    d.group.userData.transient = true;
    this.stage.scene.add(d.group);
    this.decoys.push(d);
  }

  caught(pred) {
    if (this.invuln > 0 || this.state !== 'play') return;
    const o = this.octo;
    if (o.grippingHard() && o.livingArms() > 1) {
      const at = o.autotomize();
      this.spawnArmDecoy(at);
      this.invuln = 2.4;
      o.vel.x += (o.pos.x - pred.pos.x) * 2.2;
      o.vel.z += (o.pos.z - pred.pos.z) * 2.2;
      o.debt = clamp(o.debt + 0.25, 0, 1);
      this.audio.sever();
      this.hud.hurtFlash();
      this.hud.toast('ARM SHED — IT IS EATING THAT INSTEAD. GO.', 'bad');
    } else {
      this.audio.bite();
      this.hud.hurtFlash();
      this.endNight('taken');
    }
  }

  toast(m, k) { this.hud.toast(m, k); }

  // ── frame ────────────────────────────────────────────────────────────────
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.t += dt;

    if (this.state === 'play' && !this.paused) this.step(dt);

    this.stage.animateSurface(this.t);
    if (this.reef) this.reef.update(dt, this.t);
    this.stage.render();
  }

  step(dt) {
    const o = this.octo;
    this._readInput();
    if (this.pendingBite) { this.input.moveX = 0; this.input.moveZ = 0; this.input.jet = false; }
    if (this._refuseCooldown > 0) this._refuseCooldown -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    o.step(dt, this.input, this);

    for (const p of this.prey) p.update(dt, this);
    for (const p of this.predators) p.update(dt, this);
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.update(dt);
      if (d.dead) { this.stage.scene.remove(d.group); this.decoys.splice(i, 1); }
    }
    if (this.torch) this.torch.update(dt);

    // moray bite window
    if (this.pendingBite) {
      this.pendingBite.t -= dt;
      if (this.pendingBite.t <= 0) this.failBite();
    }

    // the den: safe, and the way a night ends
    const den = this.reef.den;
    const dd = Math.hypot(o.pos.x - den.x, o.pos.z - den.z);
    const inDen = dd < 2.1;
    if (inDen) {
      for (const p of this.predators) p.suspicion = Math.min(p.suspicion, 0.15);
      if (this.food >= this.night.quota) { this.endNight('den'); return; }
    }

    // fish traps — you have to squeeze in after the lobster yourself
    let trapPrompt = null;
    for (const trap of this.reef.traps) {
      if (!trap.lobster || trap.lobster.dead) continue;
      const td = Math.hypot(o.pos.x - trap.x, o.pos.z - trap.z);
      if (td < 1.25) {
        if (o.squeeze > 0.8) {
          this.trapEat += dt;
          trapPrompt = `THROUGH THE FUNNEL — ${Math.max(0, 2.0 - this.trapEat).toFixed(1)}s`;
          if (this.trapEat > 2.0) {
            this.trapEat = 0;
            const lob = trap.lobster;
            lob.dead = true;
            this.stage.scene.remove(lob.group);
            this.food += lob.value;
            this.audio.crack();
            this.audio.chime(9);
            this.hud.toast('lobster — worth the pot', 'good');
            this.checkQuota();
          }
        } else {
          trapPrompt = 'SQUEEZE (SHIFT) TO GET INTO THE POT';
          this.trapEat = 0;
        }
      }
    }
    if (!this.pendingBite) this.hud.prompt(trapPrompt);

    // dawn
    this.timeLeft -= dt;
    const frac = 1 - this.timeLeft / this.night.duration;
    this.stage.setDawn(clamp((frac - 0.72) / 0.28, 0, 1));
    if (this.timeLeft <= 0) {
      this.endNight(inDen ? (this.food >= this.night.quota ? 'den' : 'starve') : 'dawn');
      return;
    }

    this._camera(dt);

    // reticle feedback
    const a = this.aim();
    const live = a && o.pos.distanceTo(a.point) <= REACH * 1.15 && o.freeAttention() > 0;
    if (this._refuseCooldown <= 0) this.hud.setReticle(live ? 'live' : '');

    // audio bed
    let danger = 0;
    for (const p of this.predators) danger = Math.max(danger, p.suspicion);
    this.audio.update(dt, { debt: o.debt, danger, depthTint: 0.3 });

    this.inkVeil = Math.max(0, this.inkVeil - dt * 0.55);
    this.hud.update(this);
  }

  _camera(dt) {
    const o = this.octo;
    const cam = this.stage.camera;
    const focus = this._camFocus || (this._camFocus = new THREE.Vector3());
    focus.set(o.pos.x, o.pos.y + 0.3, o.pos.z);

    const dist = 6.4 - o.squeeze * 0.8;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dirX = Math.sin(this.camYaw) * cp;
    const dirZ = Math.cos(this.camYaw) * cp;

    // March out from the animal along the boom. When something is in the way,
    // climb over it first — pulling the camera in is the last resort, because
    // an octopus you cannot see all eight arms of is not much use to you.
    const blockedAt = (d, rise) => {
      for (let s = 3; s <= 10; s++) {
        const k = (s / 10) * d;
        const px = focus.x + dirX * k, pz = focus.z + dirZ * k;
        const py = focus.y + 0.7 + sp * k * 1.15 + rise * (s / 10);
        if (py < this.reef.heightAt(px, pz) + 0.55) return k;
        for (const ob of this.reef.obstacles) {
          if (py < ob.top + 0.25 && Math.hypot(px - ob.x, pz - ob.z) < ob.r + 0.35) return k;
        }
      }
      return 0;
    };

    let rise = 0, d = dist, hit = blockedAt(dist, 0);
    while (hit && rise < 2.6) { rise += 1.3; hit = blockedAt(dist, rise); }
    if (hit) d = Math.max(3.2, hit - dist / 10);

    const want = this._camWant || (this._camWant = new THREE.Vector3());
    want.set(focus.x + dirX * d, focus.y + 0.7 + sp * d * 1.15 + rise, focus.z + dirZ * d);
    const floor = this.reef.heightAt(want.x, want.z) + 0.55;
    if (want.y < floor) want.y = floor;

    this.camPos.lerp(want, 1 - Math.exp(-12 * dt));
    cam.position.copy(this.camPos);
    cam.lookAt(focus);
    cam.fov = 62 + o.speedNorm * 9;
    cam.updateProjectionMatrix();
  }
}

window.game = new Game();
