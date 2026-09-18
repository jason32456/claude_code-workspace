import * as THREE from './vendor/three.module.js';
import { CFG } from './js/config.js';
import { World } from './js/world.js';
import { Octopus } from './js/octopus.js';
import { Mechanisms } from './js/interact.js';
import { Watchman, Scrubber, Ink, Intake } from './js/threats.js';
import { Audio } from './js/audio.js';
import { Hud } from './js/hud.js';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const FOCUS = new THREE.Vector3();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------------------------------------------------------------------------
const OBJECTIVES = [
  {
    text: 'Get the lid off the jar.',
    hint: 'Aim at the lid and click twice to put two arms on it, then E to haul.',
    done: (g) => g.mech.byId.jarlid.done,
  },
  {
    text: 'Get out of the tank.',
    hint: 'Arms grip whatever brushes them — climb the glass and it will hold you, badly.',
    done: (g) => g.octo.pos.x > 2.75 || g.octo.pos.z > -16.3 || g.octo.pos.x < -6.8,
  },
  {
    text: 'Find a way into the wet room.',
    hint: 'The door is shut. There is 0.44 m under it and your beak is 0.40 m across.',
    done: (g) => g.octo.pos.z > -11.6,
  },
  {
    text: 'Get past the watchman, and past the wall.',
    hint: 'The channel is the quiet way. The panel over it needs three arms.',
    done: (g) => g.octo.pos.z > 2.4,
  },
  {
    text: 'Open the outfall shutter.',
    hint: 'Two latches, a metre and a half apart, two arms each. You have three points of attention.',
    done: (g) => g.mech.byId.latchA.done,
  },
  {
    text: 'Go.',
    hint: 'Down the pipe.',
    done: (g) => g.octo.pos.z > 30,
  },
];

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.FogExp2(0x05070a, CFG.world.airFog);

    this.camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.05, 160);
    this.camYaw = 0; this.camPitch = 0.22; this.camDist = 3.5;
    this.camPos = new THREE.Vector3();

    this.scene.add(new THREE.AmbientLight(0x46586a, 0.95));
    const moon = new THREE.DirectionalLight(0x8fb3cc, 0.32);
    moon.position.set(-6, 12, -8);
    this.scene.add(moon);

    this.world = new World();
    this.scene.add(this.world.group);
    this.octo = new Octopus(this.world);
    this.scene.add(this.octo.group);
    this.mech = new Mechanisms(this.world, this.octo);
    this.scene.add(this.mech.group);
    this.watch = new Watchman(this.world);
    this.scene.add(this.watch.group);
    this.scrub = new Scrubber();
    this.scene.add(this.scrub.group);
    this.ink = new Ink();
    this.scene.add(this.ink.group);
    this.intake = new Intake();
    this.scene.add(this.intake.group);

    this.audio = new Audio();
    this.hud = new Hud(document.getElementById('hud'));

    this.input = {
      move: new THREE.Vector2(), rise: 0, squeeze: false, jet: false, freeze: false,
    };
    this.keys = {};
    this.state = 'title';
    this.time = 0;
    this.seen = 0;
    this.wasSeen = false;
    this.oxFloor = 1;
    this.objective = 0;
    this.pointerLocked = false;
    this.discoveries = 0;
    this.lastSubmerged = true;
    this.clock = new THREE.Clock();

    window.GAME = this;
    this.bindInput();
    this.overlay = document.getElementById('overlay');
    this.showTitle();
    addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ---- input --------------------------------------------------------------
  bindInput() {
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys[e.code] = true;
      if (this.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) this.begin();
      else if (this.state !== 'play' && e.code === 'KeyR') this.restart();
      if (this.state !== 'play') return;
      if (e.code === 'KeyE') this.doHaul();
      if (e.code === 'KeyQ') this.octo.tightenNearest();
      if (e.code === 'Tab') { e.preventDefault(); this.octo.releaseAll(); this.octo.say('All arms released.'); }
      if (e.code === 'KeyX') this.doInk();
      if (e.code === 'Space') this.input.jet = true;
      if (e.code === 'KeyM') { this.audio.muted = !this.audio.muted; this.octo.say(this.audio.muted ? 'Muted.' : 'Sound on.'); }
      if (e.code === 'Escape') document.exitPointerLock();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    document.getElementById('overlay').addEventListener('click', () => {
      if (this.state === 'title') this.begin();
    });

    const cv = this.renderer.domElement;
    cv.addEventListener('click', () => {
      if (this.state === 'title') { this.begin(); return; }
      if (!this.pointerLocked) { cv.requestPointerLock(); return; }
      this.doCommand();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === cv;
    });
    addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.camYaw -= e.movementX * 0.0026;
      this.camPitch = clamp(this.camPitch - e.movementY * 0.0022, -1.15, 1.25);
    });
    addEventListener('mousedown', (e) => { if (e.button === 2) this.rmb = true; });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.rmb = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      this.camDist = clamp(this.camDist + e.deltaY * 0.0022, 1.6, 6.5);
    }, { passive: true });
  }

  readInput() {
    const k = this.keys;
    this.input.move.set(
      (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0),
      (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0),
    );
    this.input.rise = (k.KeyR ? 1 : 0) - (k.KeyF ? 1 : 0);
    this.input.squeeze = !!this.rmb || !!k.KeyC;
    this.input.freeze = !!k.ShiftLeft || !!k.ShiftRight;
  }

  // ---- actions ------------------------------------------------------------
  aim() {
    this.camera.getWorldDirection(V);
    // start a little ahead of the lens so a camera pressed into a wall does not
    // simply report the wall it is inside
    V2.copy(this.camera.position).addScaledVector(V, 0.3);
    const hit = this.world.raycast(V2, V, 12);
    if (!hit) return null;
    // only things an arm could actually get to
    if (hit.point.distanceTo(this.octo.pos) > CFG.arms.length * 1.55) {
      return { ...hit, outOfReach: true };
    }
    return hit;
  }

  doCommand() {
    const hit = this.aim();
    if (!hit) return;
    if (hit.outOfReach) { this.octo.say('Too far. Get closer.', 'warn'); return; }
    const m = this.mech.lookup(hit.box);
    const arm = this.octo.command(hit.point, hit.box, m);
    if (arm) this.audio.pop();
  }

  doHaul() {
    const pull = this.octo.haul();
    if (!pull) return;
    this.audio.strain();
    const res = this.mech.onHaul();
    if (res === 'jar1' || res === 'jar2') {
      this.octo.stamina = 1;
      this.octo.oxygen = Math.min(1, this.octo.oxygen + 0.22);
      this.audio.chime(760);
      if (res === 'jar1' && this.octo.slots < CFG.focus.slotsLate) {
        this.octo.slots = CFG.focus.slotsLate;
        this.octo.say('Fed, and calmer. You can hold three things in mind now.', 'good');
      }
    } else if (res) this.audio.chime(res === 'shutter' ? 420 : 560);
  }

  doInk() {
    if (this.octo.inkCharge < 1) { this.octo.say('No ink yet.', 'warn'); return; }
    if (!this.octo.inWater) { this.octo.say('Ink needs water.', 'warn'); return; }
    this.octo.inkCharge = 0;
    this.ink.release(this.octo.pos, this.octo.forward);
    this.octo.say('Ink. A body-shaped blob of it, and it is not you.', 'good');
    this.audio.jet();
  }

  // ---- flow ---------------------------------------------------------------
  showTitle() {
    this.overlay.className = 'show';
    this.overlay.innerHTML = `
      <div class="card">
        <h1>NINE MINDS</h1>
        <p class="tag">Two thirds of an octopus's neurons are not in its head.</p>
        <p>You are <i>Octopus vulgaris</i>, tank 4, 2:40am. Between you and the sea are
        three hundred metres of concrete, a night watchman, and a shut door with
        0.44&nbsp;m of air underneath it.</p>
        <p>You have eight arms. <b>You do not control them.</b> You have two points of
        attention, and every arm you are not spending one on will grip, probe, cling and
        flinch entirely on its own.</p>
        <div class="keys">
          <div><b>W A S D</b> move · <b>mouse</b> look · <b>click</b> command an arm</div>
          <div><b>E</b> haul all committed arms · <b>Q</b> re-tighten the weakest grip · <b>Tab</b> let go</div>
          <div><b>right mouse</b> squeeze · <b>space</b> jet · <b>shift</b> freeze &amp; blend · <b>X</b> ink</div>
          <div><b>R / F</b> rise &amp; sink while swimming · <b>M</b> mute</div>
        </div>
        <p class="go">Click to begin</p>
      </div>`;
  }

  begin() {
    this.audio.start();
    this.overlay.className = '';
    this.state = 'play';
    this.renderer.domElement.requestPointerLock();
    this.octo.say('Tank 4. The lid on that jar is loose.', 'good');
  }

  restart() { location.reload(); }

  end(won, reason) {
    if (this.state !== 'play') return;
    this.state = won ? 'won' : 'lost';
    document.exitPointerLock();
    if (won) this.audio.chime(320); else this.audio.alarm();

    const t = this.time;
    const timeScore = clamp(1 - (t - 180) / 420, 0, 1);
    const seenScore = clamp(1 - this.seen * 0.22, 0, 1);
    const oxScore = clamp(this.oxFloor * 1.6, 0, 1);
    const total = won ? Math.round((timeScore * 0.34 + seenScore * 0.41 + oxScore * 0.25) * 100) : 0;
    const rank = total > 88 ? 'GHOST' : total > 70 ? 'CEPHALOPOD' : total > 48 ? 'ESCAPEE'
      : total > 25 ? 'SURVIVOR' : 'LUCKY';
    const m = Math.floor(t / 60), s = Math.floor(t % 60);

    this.overlay.className = 'show';
    this.overlay.innerHTML = won ? `
      <div class="card">
        <h1>OPEN WATER</h1>
        <p class="tag">You are out. Nobody will believe the tank was sealed.</p>
        <table class="score">
          <tr><td>Time</td><td>${m}:${String(s).padStart(2, '0')}</td><td>${Math.round(timeScore * 100)}</td></tr>
          <tr><td>Times noticed</td><td>${this.seen}</td><td>${Math.round(seenScore * 100)}</td></tr>
          <tr><td>Lowest oxygen</td><td>${Math.round(this.oxFloor * 100)}%</td><td>${Math.round(oxScore * 100)}</td></tr>
          <tr class="tot"><td>Rank</td><td>${rank}</td><td>${total}</td></tr>
        </table>
        <p class="go">R to run it again</p>
      </div>` : `
      <div class="card lost">
        <h1>CAUGHT</h1>
        <p class="tag">${reason}</p>
        <p>You lasted ${m}:${String(s).padStart(2, '0')} and were noticed ${this.seen} time${this.seen === 1 ? '' : 's'}.</p>
        <p class="go">R to try again</p>
      </div>`;
  }

  // ---- camera -------------------------------------------------------------
  updateCamera(dt) {
    const o = this.octo;
    const cy = Math.cos(this.camPitch);
    // offset from the octopus to the camera: behind it, and above by the pitch
    V.set(-Math.sin(this.camYaw) * cy, Math.sin(this.camPitch), -Math.cos(this.camYaw) * cy);
    const focus = FOCUS.copy(o.pos);
    focus.y += 0.3;

    // pull the camera in when the building is in the way — which, since the
    // whole point of the game is squeezing into places, is often
    let dist = this.camDist;
    const hit = this.world.raycast(focus, V, dist + 0.4, true);
    if (hit) dist = Math.max(2.1, hit.t - 0.3);
    const want = V2.copy(focus).addScaledVector(V, dist);
    this.camPos.lerp(want, Math.min(1, dt * 12));
    this.world.pushOut(this.camPos, 0.16);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(focus);

    const sub = this.world.waterAt(this.camera.position);
    const inWater = !!sub && this.camera.position.y < sub.surface;
    this.scene.fog.density += ((inWater ? CFG.world.waterFog : CFG.world.airFog)
      - this.scene.fog.density) * Math.min(1, dt * 4);
    const target = inWater ? 0x0a3a48 : 0x05070a;
    this.scene.background.setHex(target);
    this.scene.fog.color.setHex(target);
  }

  camBasis() {
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    if (!this.octo.submerged) { fwd.y = 0; fwd.normalize(); }
    return { fwd, right };
  }

  // ---- frame --------------------------------------------------------------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'play') this.step(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    this.time += dt;
    this.readInput();
    const o = this.octo;
    const wasWater = o.submerged;

    o.update(dt, this.input, this.camBasis(), this.mech.list);
    this.mech.update(dt, this.time);
    this.ink.update(dt);

    const caughtBy = this.watch.update(dt, o, this.ink, this.time);
    const run = this.scrub.update(dt, o, this.time);
    const suck = this.intake.update(dt, o);

    // splash when you break the surface either way
    if (wasWater !== o.submerged) { this.audio.splash(); o.noise = Math.max(o.noise, 2.2); }

    // score bookkeeping
    if (this.watch.suspicion > 0.5 && !this.wasSeen) { this.seen++; this.wasSeen = true; }
    if (this.watch.suspicion < 0.2) this.wasSeen = false;
    this.oxFloor = Math.min(this.oxFloor, o.oxygen);

    for (const e of o.events) {
      this.hud.say(e.msg, e.kind);
      if (e.kind === 'warn') this.audio.slip();
    }
    o.events.length = 0;

    // objectives
    const cur = OBJECTIVES[this.objective];
    if (cur && cur.done(this)) {
      this.objective++;
      const nxt = OBJECTIVES[this.objective];
      if (nxt) { this.hud.say(`— ${nxt.text}`, 'good'); this.audio.chime(); }
    }

    // failure and success
    if (!o.alive) this.end(false, 'You dried out on a concrete floor, four metres from water.');
    else if (caughtBy) this.end(false, 'A torch found you, and then a pair of hands did.');
    else if (run) this.end(false, 'The floor scrubber does not look where it is going.');
    else if (suck) this.end(false, 'The intake took you. Pumps do not care what you are.');
    else if (o.pos.z > 30) this.end(true);

    // hud
    const tension = Math.max(this.watch.suspicion, 1 - o.oxygen * 2.2);
    this.audio.frame(o.submerged, clamp(tension, 0, 1), dt);

    const hit = this.pointerLocked ? this.aim() : null;
    let label = '';
    if (hit && !hit.outOfReach) {
      const m = this.mech.lookup(hit.box);
      if (m && !m.done) label = `${m.label} — ${m.need} arm${m.need > 1 ? 's' : ''}, ${m.prog}/${m.steps}`;
      else label = hit.box.mat.name;
    } else if (hit) label = `${hit.box.mat.name} · out of reach`;

    this.hud.update({
      octo: o,
      time: this.time,
      suspicion: this.watch.suspicion,
      substrate: o.substrateMat ? o.substrateMat.name : '—',
      objective: cur ? cur.text : 'Go.',
      hint: cur ? cur.hint : '',
      targetLabel: label,
      danger: clamp(this.watch.suspicion * 0.5 + Math.max(0, 0.34 - o.oxygen) * 1.6, 0, 0.65),
    }, dt);
  }
}

new Game();
