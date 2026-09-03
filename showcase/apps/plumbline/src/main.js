import * as THREE from '../vendor/three.module.js';
import { Input, clamp } from './input.js';
import { World } from './scene.js';
import { Crane } from './crane.js';
import { Load } from './pendulum.js';
import { Building, PLUMB_TOL, MAX_FLOORS, FLOOR_H, CX } from './building.js';
import { Yard } from './yard.js';
import { pieceDrop } from './pieces.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';

const SHIFT = 600;          // ten minutes of daylight, and that is the whole clock
const BEST_KEY = 'plumbline.best';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 1800);
camera.layers.enable(1);
const hookCam = new THREE.PerspectiveCamera(62, 1, 0.4, 400);

const world = new World(scene);
world.sun.layers.enable(1);

const crane = new Crane(scene);
for (const m of [crane.mast, crane.top, crane.cableMesh, crane.hook, crane.root]) m.traverse((o) => o.layers.set(1));
crane.root.layers.set(1);

const load = new Load();
const input = new Input(canvas);
const hud = new Hud();
const audio = new Audio();
let yard = new Yard(scene);
let building = null;

const pivot = new THREE.Vector3();
const prevPivot = new THREE.Vector3();
const windVec = new THREE.Vector3();
const focus = new THREE.Vector3(18, 12, 0);
const camPos = new THREE.Vector3();
const clock = new THREE.Clock();

const G = {
  state: 'title',
  elapsed: 0,
  score: 0,
  combo: 0,
  carried: null,
  deliverIn: 0,
  strikeCd: 0,
  creakCd: 0,
  cabView: false,
  best: Number(localStorage.getItem(BEST_KEY) || 0),
  floorsDone: 0,
};

// --- wind ------------------------------------------------------------------

function gust(t) {
  return 0.5 + 0.25 * Math.sin(t * 0.31) + 0.15 * Math.sin(t * 0.17 + 1.3) + 0.10 * Math.sin(t * 0.73 + 2.1);
}
function windSpeed(t, floor, h) {
  const base = 1.8 + floor * 0.38;
  const g = clamp(gust(t), 0, 1);
  return (base + g * base * 1.25) * Math.pow(Math.max(h, 10) / 10, 0.16);
}
function windDir(t) { return 0.7 + 0.42 * Math.sin(t * 0.037); }

// --- run control -----------------------------------------------------------

function startShift() {
  if (building) { scene.remove(building.group); scene.remove(building.guides); }
  yard.resetRun();
  building = new Building(scene, (Math.random() * 1e9) | 0);
  crane.setMastHeight(34);
  crane.slew = 2.9; crane.slewVel = 0;
  crane.radius = 14; crane.radiusVel = 0;
  crane.cable = 13; crane.cableVel = 0;
  crane.pivot(pivot); prevPivot.copy(pivot);
  load.reset(pivot, crane.cable);
  if (G.carried) { scene.remove(G.carried); G.carried = null; }

  G.state = 'play';
  G.elapsed = 0; G.score = 0; G.combo = 0; G.floorsDone = 0;
  G.deliverIn = 0.6; G.strikeCd = 0;
  input.orbit.az = -0.72; input.orbit.el = 0.36; input.orbit.dist = 78;
  focus.set(CX * 0.5, 14, 0);

  hud.resetScoreRoll();
  hud.show();
  hud.el.title.classList.add('hidden');
  hud.el.over.classList.add('hidden');
  audio.start();
  audio.unhush();
}

function endShift(title, reason, note) {
  if (G.state === 'over') return;
  G.state = 'over';
  audio.hush();
  if (G.score > G.best) { G.best = Math.round(G.score); localStorage.setItem(BEST_KEY, String(G.best)); }
  hud.over(title, reason, note, {
    score: Math.round(G.score), floors: G.floorsDone,
    setTrue: building.setTrue, lean: building.lean.length(),
  });
}

function comboMul() { return Math.min(2.5, 1 + G.combo * 0.1); }

function deliverNext() {
  const slot = building.activeSlot;
  if (!slot) return;
  yard.deliver(slot.spec);
  audio.deliver();
  hud.toast(`${slot.spec.name} DELIVERED`, 'ok', `slot at r ${Math.hypot(slot.x, slot.z).toFixed(0)} m`);
}

// --- the one interaction ---------------------------------------------------

function act() {
  if (!load.spec) {
    const target = yard.latchTarget(load.pos);
    if (!target) return;
    const spec = yard.spec;
    const lug = target.position.clone();
    yard.take();
    scene.remove(target);
    load.pos.copy(lug);
    load.vel.set(0, 0, 0);
    load.setPiece(spec, target.rotation.y);
    crane.pivot(pivot);
    crane.cable = clamp(pivot.distanceTo(load.pos), 2.2, crane.jibY - 0.6);
    load.cable = crane.cable;
    G.carried = target;
    scene.add(G.carried);
    audio.latch();
    return;
  }

  const spec = load.spec;
  const c = building.canSet(load, spec);
  if (c.ok) {
    const r = building.place(load, spec);
    const gained = Math.round(r.value * comboMul());
    G.score += gained;
    if (r.true_) { G.combo++; hud.toast('SET TRUE', 'good', `${Math.round(r.err * 100)} cm · ${gained} pts · ×${comboMul().toFixed(1)}`); audio.setGood(); }
    else if (r.damaged) { G.combo = 0; hud.toast('HARD LANDING', 'bad', `${r.impact.toFixed(1)} m/s · ${gained} pts`); audio.setHard(); hud.flash(); }
    else if (r.grade === 'GOOD SET') { hud.toast('GOOD SET', 'ok', `${Math.round(r.err * 100)} cm · ${gained} pts`); audio.setOk(); }
    else { G.combo = 0; hud.toast('ROUGH SET', 'bad', `${Math.round(r.err * 100)} cm off · ${gained} pts`); audio.setOk(); }

    scene.remove(G.carried); G.carried = null;
    load.clearPiece();

    if (r.floorDone) {
      const lean = building.completeFloor();
      G.floorsDone++;
      G.score += 600 + G.floorsDone * 120;
      // Pay out the same length the jib gained, or the constraint would yank
      // the hook 3.75 m into the air the instant the crane climbs.
      const wasJib = crane.jibY;
      crane.setMastHeight(crane.mastH + FLOOR_H);
      crane.cable = clamp(crane.cable + (crane.jibY - wasJib), 2.2, crane.jibY - 0.6);
      load.cable = crane.cable;
      audio.jack();
      hud.toast(`FLOOR ${G.floorsDone} TOPPED OUT`, 'good', `crane climbs · lean ${Math.round(lean * 1000)} mm`);
      if (lean > PLUMB_TOL) {
        endShift('OUT OF PLUMB', `The tower is ${Math.round(lean * 1000)} mm off vertical over ${Math.round(G.floorsDone * FLOOR_H)} metres. The engineer condemned it at ${Math.round(PLUMB_TOL * 1000)}.`,
          'Every set is welded in where you actually put it. Slow down and the lean stops growing.');
        return;
      }
      if (building.floor > MAX_FLOORS) {
        endShift('TOPPED OUT', `All ${MAX_FLOORS} floors, ${Math.round(building.lean.length() * 1000)} mm of lean, with ${Math.floor(SHIFT - G.elapsed)} seconds of light to spare.`,
          'Nobody tops out a tower before dark. Well done.');
        return;
      }
    }
    G.deliverIn = 1.1;
    return;
  }

  const drop = pieceDrop(spec);
  if (yard.inYard(load.pos.x, load.pos.z) && load.pos.y - drop < 1.2) {
    yard.setDown(load.pos, load.yaw);
    scene.remove(G.carried); G.carried = null;
    load.clearPiece();
    hud.toast('SET DOWN', 'ok', 'take it again when you are ready');
    audio.setOk();
    return;
  }
  hud.toast(c.why, 'bad');
}

// --- frame -----------------------------------------------------------------

function play(dt) {
  G.elapsed += dt;
  const day = G.elapsed / SHIFT;
  // The shift starts after sunrise and ends in the dark — the first minute
  // should not be unplayably black.
  world.setTime(Math.min(1, 0.13 + 0.87 * day));
  if (day >= 1) {
    endShift('THE LIGHT IS GONE', `${G.floorsDone} floors up when the shift ended, ${Math.round(building.lean.length() * 1000)} mm out of plumb.`,
      'The building is what you left it.');
    return;
  }

  const hookH = Math.max(0, load.pos.y);
  const speed = windSpeed(G.elapsed, building.floor, hookH);
  const dir = windDir(G.elapsed);
  windVec.set(Math.cos(dir) * speed, 0, Math.sin(dir) * speed);
  world.setWind(dir, speed);

  prevPivot.copy(pivot);
  crane.update(dt, input, load.spec ? load : null);
  crane.pivot(pivot);
  if (crane.overload) audio.alarm();

  load.steerYaw(dt, input.axis('yawL', 'yawR'), input.down('precise'));
  load.step(dt, pivot, prevPivot, windVec, crane.cable);

  const drop = load.spec ? pieceDrop(load.spec) : 0.9;
  if (load.pos.y - drop < 0) {
    load.pos.y = drop;
    if (load.vel.y < 0) load.vel.y = 0;
    load.vel.x *= 0.72; load.vel.z *= 0.72;
    crane.cable = Math.min(crane.cable, pivot.distanceTo(load.pos));
    load.cable = crane.cable;
  }

  G.strikeCd = Math.max(0, G.strikeCd - dt);
  if (load.spec && building.collide(load, load.spec) && G.strikeCd <= 0) {
    G.strikeCd = 1.4;
    G.combo = 0;
    G.score = Math.max(0, G.score - 120);
    building.dropPenalty();
    audio.strike();
    hud.flash();
    hud.toast('STRUCK THE STRUCTURE', 'bad', '−120 · combo lost');
  }

  const sway = load.sway(pivot);
  G.creakCd -= dt;
  if (sway > 1.6 && G.creakCd <= 0) { audio.creak(); G.creakCd = 1.1 + Math.random(); }

  if (G.carried) { G.carried.position.copy(load.pos); G.carried.rotation.y = load.yaw; }
  yard.stepDebris(dt);

  if (G.deliverIn > 0) {
    G.deliverIn -= dt;
    if (G.deliverIn <= 0) deliverNext();
  }

  if (input.hit('act')) act();

  building.updateGuides(load, load.spec, true);
  crane.drawCable(load.pos);

  // --- hud state
  const slot = building.activeSlot;
  let yawErr = 0;
  if (load.spec && slot) {
    let e = Math.abs(wrapPi(load.yaw - slot.yaw));
    if (e > Math.PI / 2) e = Math.PI - e;
    yawErr = e * 180 / Math.PI;
  }
  hud.update({
    floor: Math.min(building.floor, MAX_FLOORS),
    setIndex: building.index, setTotal: building.slots.length,
    hookY: load.pos.y, jibY: crane.jibY,
    day: Math.min(1, day), dayText: world.dayText(), timeLeft: SHIFT - G.elapsed,
    score: G.score, combo: comboMul(), best: G.best,
    lmi: crane.lmi, overload: crane.overload, spec: load.spec,
    radius: crane.radius, rMax: crane.maxRadiusFor(load.spec ? load.spec.mass : 0),
    lean: building.lean.length(), leanX: building.lean.x, leanTol: PLUMB_TOL,
    sway, ...swayAxes(),
    wind: speed, windAhead: windSpeed(G.elapsed + 3, building.floor, hookH),
    yawErr, prompt: promptFor(),
  });

  audio.frame({
    wind: speed, slewVel: crane.slewVel, cableVel: crane.cableVel,
    radiusVel: crane.radiusVel, loaded: !!load.spec,
  });
}

// Sway is shown in the jib's own frame, not the world's: out along the jib is up
// on the dial and tangential is across, so the dial agrees with W/S and A/D — and
// with the hook cam, which is oriented the same way.
function swayAxes() {
  const dx = load.pos.x - pivot.x;
  const dz = load.pos.z - pivot.z;
  const c = Math.cos(crane.slew), s = Math.sin(crane.slew);
  return { swayX: dx * -s + dz * -c, swayZ: -(dx * c + dz * -s) };
}

function promptFor() {
  if (!load.spec) {
    if (!yard.piece) return null;
    if (yard.latchTarget(load.pos)) return 'SPACE — LATCH ON';
    const d = Math.hypot(load.pos.x - yard.piece.position.x, load.pos.z - yard.piece.position.z);
    return d < 4 ? 'LOWER THE HOOK ONTO IT — F' : 'TAKE THE HOOK TO THE LOAD';
  }
  const c = building.canSet(load, load.spec);
  if (c.ok) return load.vel.length() > 1.2 ? 'SWINGING — SPACE SETS IT ANYWAY' : 'SPACE — SET IT';
  if (c.err !== undefined && c.err <= 1.6) return c.why;
  return 'TAKE IT TO THE SLOT';
}

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// --- cameras & render ------------------------------------------------------

function updateCamera(dt) {
  if (G.state === 'title') {
    input.orbit.az += dt * 0.06;
    focus.set(19, 30, 0);
    const o = input.orbit;
    camPos.set(
      focus.x + Math.cos(o.az) * Math.cos(o.el) * 104,
      focus.y + Math.sin(o.el) * 104,
      focus.z + Math.sin(o.az) * Math.cos(o.el) * 104
    );
    camera.position.copy(camPos);
    camera.lookAt(focus);
    return;
  }

  const target = G.state === 'over' ? new THREE.Vector3(CX, building.deckY * 0.6 + 10, 0) : load.pos;
  focus.lerp(target, Math.min(1, dt * 3.4));

  if (G.cabView) {
    // Over the tower head looking out along the jib — you can see the whole rig
    // and the cable dropping away to the load, which the cab itself cannot.
    const eye = new THREE.Vector3(-15, 13, 12);
    crane.top.localToWorld(eye);
    camera.position.lerp(eye, Math.min(1, dt * 8));
    camera.lookAt(load.pos.x, load.pos.y + 7, load.pos.z);
  } else {
    const o = input.orbit;
    camPos.set(
      focus.x + Math.cos(o.az) * Math.cos(o.el) * o.dist,
      Math.max(3, focus.y + Math.sin(o.el) * o.dist),
      focus.z + Math.sin(o.az) * Math.cos(o.el) * o.dist
    );
    camera.position.lerp(camPos, Math.min(1, dt * 6));
    camera.lookAt(focus);
  }

  // Straight down the cable, with "up" pointing out along the jib so the view
  // agrees with the trolley keys.
  const h = clamp(crane.cable * 0.55 + 4, 6, 17);
  hookCam.position.set(load.pos.x, load.pos.y + h, load.pos.z);
  hookCam.up.set(Math.cos(crane.slew), 0, -Math.sin(crane.slew));
  hookCam.lookAt(load.pos.x, load.pos.y - 4, load.pos.z);
}

let insetRect = null;
function render() {
  const w = renderer.domElement.width, h = renderer.domElement.height;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  if (G.state !== 'title' && insetRect) {
    const { x, y, s } = insetRect;
    renderer.setViewport(x, y, s, s);
    renderer.setScissor(x, y, s, s);
    renderer.setScissorTest(true);
    renderer.clear(true, true, false);
    renderer.render(scene, hookCam);
    renderer.setScissorTest(false);
  }
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hookCam.updateProjectionMatrix();
  const r = hud.el['hookcam-frame'].getBoundingClientRect();
  const dpr = renderer.getPixelRatio();
  insetRect = { x: Math.round(r.left * dpr), y: Math.round((h - r.bottom) * dpr), s: Math.round(r.width * dpr) };
}
addEventListener('resize', resize);

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, clock.getDelta());

  if (input.hit('view')) G.cabView = !G.cabView;
  if (input.hit('pause') && (G.state === 'play' || G.state === 'paused')) {
    G.state = G.state === 'play' ? 'paused' : 'play';
    hud.el.paused.classList.toggle('hidden', G.state !== 'paused');
    G.state === 'paused' ? audio.hush() : audio.unhush();
  }

  if (G.state === 'play') play(dt);
  updateCamera(dt);
  render();
  input.endFrame();
}

document.getElementById('start').addEventListener('click', () => { startShift(); resize(); });
document.getElementById('again').addEventListener('click', () => { startShift(); resize(); });

world.setTime(0.30);
resize();
loop();

