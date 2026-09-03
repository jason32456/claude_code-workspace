import * as THREE from './vendor/three.module.js';
import { NIGHTS, FLOCK, LIGHT } from './js/config.js';
import { Flock, MEMBER, WILD } from './js/flock.js';
import { World } from './js/world.js';
import { BirdRenderer, Puffs } from './js/birds.js';
import { Falcon } from './js/falcon.js';
import { Swarms, Thermals } from './js/entities.js';
import { HUD } from './js/hud.js';
import { Audio } from './js/audio.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const VALLEY_EDGE = 430;
const normalise = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= l; v.y /= l; v.z /= l;
};

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x6a5a70, 0.0016);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.6, 12000);
camera.position.set(-60, 90, 0);

const hemi = new THREE.HemisphereLight(0xa9b6d8, 0x4a4034, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc08a, 1.5);
sun.position.set(-1, 0.35, 0.2);
scene.add(sun);

const audio = new Audio();
const hud = new HUD();
const flock = new Flock();
const birds = new BirdRenderer(scene);
const puffs = new Puffs(scene);

const overlay = document.getElementById('overlay');
const sheet = document.getElementById('sheet');
const sheetBody = document.getElementById('sheet-body');
const sheetActions = document.getElementById('sheet-actions');
const sheetTitle = sheet.querySelector('.title');
const sheetSub = sheet.querySelector('.sub');

let world = null;
let swarms = null;
let thermals = null;
let falcons = [];
let groups = [];
let night = NIGHTS[0];

const input = { turn: 0, pitch: 0, tight: false, flash: false };
const keys = new Set();

const game = {
  mode: 'demo', // demo | play | roost | over
  running: false,
  time: 0,
  elapsed: 0,
  light: 1,
  density: 0,
  yaw: 0,
  pitch: 0,
  flashCd: 0,
  roosted: 0,
  toFalcons: 0,
  toWires: 0,
  toDark: 0,
  recruited: 0,
  started: 0,
  roostT: 0,
  hintT: 0,
  strayT: 0,
  nightIndex: 0,
  stepMs: 0,
  frameMs: 0,
  fps: 60,
  timeScale: 1,
  subSteps: 1,
};

const camState = { dirX: 1, dirY: 0, dirZ: 0, shake: 0 };

// ---------------------------------------------------------------- progress
const SAVE = 'vesper.progress.v1';
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE)) || { best: {}, unlocked: 1 }; }
  catch { return { best: {}, unlocked: 1 }; }
}
function store(data) {
  try { localStorage.setItem(SAVE, JSON.stringify(data)); } catch { /* private mode */ }
}
let save = loadSave();

// ---------------------------------------------------------------- level
function teardown() {
  if (world) world.dispose();
  for (const f of falcons) f.dispose();
  if (swarms) swarms.dispose();
  if (thermals) thermals.dispose();
  falcons = [];
  groups = [];
  world = null;
}

function setupNight(index, mode) {
  teardown();
  night = NIGHTS[index];
  game.nightIndex = index;
  game.mode = mode;
  game.elapsed = 0;
  game.light = 1;
  game.density = 0;
  game.yaw = 0;
  game.pitch = 0;
  game.flashCd = 0;
  game.roosted = 0;
  game.toFalcons = 0;
  game.toWires = 0;
  game.toDark = 0;
  game.recruited = 0;
  game.roostT = 0;
  game.hintT = 3;

  world = new World(scene, night);
  const t = world.terrain;

  flock.reset();
  const n = mode === 'demo' ? 520 : night.startBirds;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 26;
    flock.spawn(
      120 + Math.cos(a) * r * 1.6,
      74 + (Math.random() - 0.5) * 18,
      Math.sin(a) * r,
      22, 0, 0, MEMBER, -1,
    );
  }
  flock.cx = 120; flock.cy = 74; flock.cz = 0;

  groups = night.wildFlocks.map((g) => ({ ...g, scattered: false }));
  groups.forEach((g, gi) => {
    for (let i = 0; i < g.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 22;
      flock.spawn(
        g.x + Math.cos(a) * r,
        g.y + (Math.random() - 0.5) * 14,
        g.z + Math.sin(a) * r,
        -Math.sin(a) * 14, 0, Math.cos(a) * 14, WILD, gi,
      );
    }
  });

  falcons = night.falcons.map((spec, i) => new Falcon(scene, spec, i));
  swarms = new Swarms(scene, night.swarms);
  thermals = new Thermals(scene, night.thermals, t);

  camState.dirX = 1; camState.dirY = 0; camState.dirZ = 0;
  camera.position.set(flock.cx - 70, flock.cy + 22, flock.cz);
  camera.lookAt(flock.cx, flock.cy, flock.cz);
}

// ---------------------------------------------------------------- UI sheets
function showSheet(opts) {
  sheetTitle.textContent = opts.title;
  sheetSub.textContent = opts.sub;
  sheetBody.innerHTML = opts.body || '';
  sheetActions.innerHTML = '';
  for (const a of opts.actions || []) {
    const b = document.createElement('button');
    b.textContent = a.label;
    if (a.ghost) b.className = 'ghost';
    b.onclick = () => { audio.start(); audio.resume(); audio.ui(); a.fn(); };
    sheetActions.appendChild(b);
  }
  overlay.classList.remove('hidden');
  hud.show(false);
}

function hideSheet() {
  overlay.classList.add('hidden');
  hud.show(true);
}

const CONTROLS = `
  <div class="controls">
    <kbd>W / S</kbd><span>climb and dive</span>
    <kbd>A / D</kbd><span>bank the flock</span>
    <kbd>SHIFT</kbd><span>tighten — the black sun. Confuses a falcon, costs you speed and stamina.</span>
    <kbd>SPACE</kbd><span>flash expansion. The counter to a stoop, and only in the last half second of one.</span>
    <kbd>P</kbd><span>pause</span>
    <kbd>drag</kbd><span>steer with the mouse or a finger · second finger tightens · double-tap scatters</span>
  </div>`;

function titleScreen() {
  save = loadSave();
  const actions = NIGHTS.filter((n, i) => i < save.unlocked).map((n, i) => ({
    label: `${n.id}. ${n.name}`,
    fn: () => briefing(i),
    ghost: i < save.unlocked - 1,
  }));
  showSheet({
    title: 'VESPER',
    sub: 'You are not a bird in the flock. You are the flock.',
    body: `
      <p>Six hundred starlings, an hour of usable light, and a roost of flooded reeds somewhere down the valley. There is no avatar here — the cloud <em>is</em> you, and the number of birds left in it is the only health bar you get.</p>
      <p><strong>Density is your armour.</strong> A peregrine's strike collapses against a crowd, so holding the flock tight makes you nearly unkillable — and slow, and thirsty, and lethal in a wire span. <strong>Flash expansion is your parry.</strong> Blow the murmuration apart in the last half second of a stoop and the falcon closes on air.</p>
      <p>Sweep up every wild flock you pass, feed over the midge columns, ride the thermals off the ridge, and arrive enormous before the light goes.</p>
      <h3>Controls</h3>
      ${CONTROLS}
      ${bestLine()}`,
    actions,
  });
}

function bestLine() {
  const rows = NIGHTS.filter((n, i) => i < save.unlocked)
    .map((n) => `<div class="threat-row"><b>${n.name}</b><span>${save.best[n.id] ? `${save.best[n.id]} roosted` : 'not flown'}</span></div>`)
    .join('');
  return `<h3>Your nights</h3>${rows}`;
}

function briefing(index) {
  const n = NIGHTS[index];
  showSheet({
    title: n.name,
    sub: n.subtitle,
    body: `
      <p>${n.brief}</p>
      <h3>Tonight</h3>
      <div class="controls">
        <kbd>${n.startBirds}</kbd><span>birds at first light off</span>
        <kbd>${(n.length / 1000).toFixed(1)} km</kbd><span>of valley to the roost</span>
        <kbd>${n.falcons.length}</kbd><span>peregrine${n.falcons.length > 1 ? 's' : ''} working the flock</span>
        <kbd>${n.pylons.length * 3}</kbd><span>live conductors strung across your line</span>
      </div>
      <h3>Controls</h3>
      ${CONTROLS}`,
    actions: [
      { label: 'Fly', fn: () => startNight(index) },
      { label: 'Back', ghost: true, fn: titleScreen },
    ],
  });
}

function startNight(index) {
  setupNight(index, 'play');
  hideSheet();
  game.running = true;
  audio.start();
  audio.resume();
  hud.toast('hold shift to tighten · space to scatter');
}

function pause() {
  if (game.mode !== 'play' || !game.running) return;
  game.running = false;
  showSheet({
    title: 'HELD',
    sub: `${flock.count} birds still with you`,
    body: `<h3>Controls</h3>${CONTROLS}`,
    actions: [
      { label: 'Resume', fn: () => { hideSheet(); game.running = true; } },
      { label: 'Restart night', ghost: true, fn: () => startNight(game.nightIndex) },
      { label: 'Give up', ghost: true, fn: () => { game.mode = 'demo'; setupNight(0, 'demo'); game.running = true; titleScreen(); } },
    ],
  });
}

function stars(count) {
  const th = night.stars;
  let s = 0;
  for (const t of th) if (count >= t) s++;
  return s;
}

function results(failed) {
  game.running = false;
  game.mode = 'over';
  const roosted = game.roosted;
  const st = failed ? 0 : stars(roosted);
  if (!failed) {
    if (!save.best[night.id] || roosted > save.best[night.id]) save.best[night.id] = roosted;
    if (st > 0 && save.unlocked < NIGHTS.length && game.nightIndex + 1 >= save.unlocked) {
      save.unlocked = Math.min(NIGHTS.length, game.nightIndex + 2);
    }
    store(save);
  }
  const next = game.nightIndex + 1;
  const actions = [];
  if (!failed && next < NIGHTS.length && next < save.unlocked) {
    actions.push({ label: `Next night — ${NIGHTS[next].name}`, fn: () => briefing(next) });
  }
  actions.push({ label: 'Fly it again', ghost: !!actions.length, fn: () => startNight(game.nightIndex) });
  actions.push({ label: 'Valley map', ghost: true, fn: () => { setupNight(0, 'demo'); game.running = true; titleScreen(); } });

  showSheet({
    title: failed ? 'THE FLOCK IS GONE' : 'ROOSTED',
    sub: failed
      ? 'Nothing reached the reeds.'
      : `${roosted} birds into the reedbed — ${night.name}`,
    body: `
      <div class="stars">${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : '☆☆☆'}</div>
      <div class="stats">
        <div class="stat"><div class="v">${roosted}</div><div class="k">roosted</div></div>
        <div class="stat"><div class="v">+${game.recruited}</div><div class="k">recruited</div></div>
        <div class="stat"><div class="v">${game.toFalcons + game.toWires + game.toDark}</div><div class="k">lost</div></div>
      </div>
      <h3>Where they went</h3>
      <div class="threat-row"><b>taken by falcons</b><span>${game.toFalcons}</span></div>
      <div class="threat-row"><b>struck wires and blades</b><span>${game.toWires}</span></div>
      <div class="threat-row"><b>lost in the dark</b><span>${game.toDark}</span></div>
      <div class="threat-row"><b>best on this night</b><span>${save.best[night.id] || 0}</span></div>
      ${failed ? '' : `<h3>Star line</h3><div class="threat-row"><b>★ ★ ★ needs</b><span>${night.stars[2]} birds</span></div>`}`,
    actions,
  });
  if (failed) audio.fail(); else audio.roost();
}

// ---------------------------------------------------------------- input
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyP' || e.code === 'Escape') pause();
  if (e.code === 'Space' && game.mode === 'play' && game.running) tryFlash();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function readInput() {
  const l = keys.has('KeyA') || keys.has('ArrowLeft');
  const r = keys.has('KeyD') || keys.has('ArrowRight');
  const u = keys.has('KeyW') || keys.has('ArrowUp');
  const d = keys.has('KeyS') || keys.has('ArrowDown');
  input.turn = clamp((r ? 1 : 0) - (l ? 1 : 0) + drag.turn, -1, 1);
  input.pitch = clamp((u ? 1 : 0) - (d ? 1 : 0) + drag.pitch, -1, 1);
  input.tight = keys.has('ShiftLeft') || keys.has('ShiftRight') || drag.tight;
}

// Pointer steering: drag anywhere on the canvas. Works the same for a mouse and
// a finger, which is the whole of the touch support.
const drag = { turn: 0, pitch: 0, tight: false, id: null, x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => {
  if (drag.id !== null) { drag.tight = true; return; }
  drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== drag.id) return;
  const span = Math.min(window.innerWidth, window.innerHeight) * 0.22;
  drag.turn = clamp((e.clientX - drag.x) / span, -1, 1);
  drag.pitch = clamp((drag.y - e.clientY) / span, -1, 1);
});
const endDrag = (e) => {
  if (e.pointerId !== drag.id) { drag.tight = false; return; }
  drag.id = null; drag.turn = 0; drag.pitch = 0; drag.tight = false;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('dblclick', () => {
  if (game.mode === 'play' && game.running) tryFlash();
});

function tryFlash() {
  if (game.flashCd > 0 || flock.count === 0) return;
  flock.flash();
  flock.drainAll(FLOCK.flashCost);
  game.flashCd = FLOCK.flashCooldown;
  audio.whoosh();
  hud.banner('scatter', 'good');
}

// ---------------------------------------------------------------- loop
const lead = { x: 0, y: 0, z: 0 };
const leadDir = { x: 1, y: 0, z: 0 };
const wind = { x: 0, y: 0, z: 0 };
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (!world) return;
  game.time += dt;

  const t0 = performance.now();
  if (game.running) {
    const sub = clamp(Math.round(game.timeScale), 1, 8);
    for (let i = 0; i < sub && world; i++) step(dt);
    game.subSteps = sub;
  }
  const t1 = performance.now();
  render(dt);
  game.stepMs = game.stepMs * 0.92 + (t1 - t0) * 0.08;
  game.frameMs = game.frameMs * 0.92 + (performance.now() - t1) * 0.08;
  game.fps = game.fps * 0.92 + (1 / Math.max(dt, 1e-3)) * 0.08;
}

function step(dt) {
  const demo = game.mode === 'demo';
  if (!demo) readInput();

  if (demo) {
    game.yaw = Math.sin(game.time * 0.09) * 0.5;
    game.pitch = Math.sin(game.time * 0.13) * 0.12;
    game.density = 0.35 + Math.sin(game.time * 0.2) * 0.3;
    if (flock.cx > night.length - 400) {
      flock.cx = 120;
      setupNight(0, 'demo');
      return;
    }
  } else {
    game.yaw += input.turn * FLOCK.bankRate * dt;
    const pitchTarget = game.pitch + input.pitch * FLOCK.pitchRate * dt;
    game.pitch = clamp(input.pitch === 0 ? pitchTarget * (1 - dt * 1.2) : pitchTarget,
      -FLOCK.maxPitch, FLOCK.maxPitch);
    game.density += ((input.tight ? 1 : 0) - game.density) * Math.min(1, dt * 3.2);
    if (game.flashCd > 0) game.flashCd = Math.max(0, game.flashCd - dt);
  }

  // dusk
  if (game.mode === 'play') {
    game.elapsed += dt;
    game.light = Math.pow(clamp(1 - game.elapsed / night.duskSeconds, 0, 1), 0.85);
  } else if (demo) {
    game.light = 0.78;
  }

  const roosting = game.mode === 'roost';
  const cp = Math.cos(game.pitch);
  if (roosting) {
    lead.x = world.terrain.roostX;
    lead.y = 4;
    lead.z = world.terrain.roostZ;
    const dx = lead.x - flock.cx, dy = lead.y - flock.cy, dz = lead.z - flock.cz;
    const dl = Math.hypot(dx, dy, dz) || 1;
    leadDir.x = dx / dl; leadDir.y = dy / dl; leadDir.z = dz / dl;
  } else {
    leadDir.x = Math.cos(game.yaw) * cp;
    leadDir.y = Math.sin(game.pitch);
    leadDir.z = Math.sin(game.yaw) * cp;
    lead.x = flock.cx + Math.cos(game.yaw) * cp * FLOCK.leadDistance;
    lead.y = flock.cy + Math.sin(game.pitch) * FLOCK.leadDistance * 1.15;
    lead.z = flock.cz + Math.sin(game.yaw) * cp * FLOCK.leadDistance;
    lead.y = Math.max(world.terrain.heightAt(lead.x, lead.z) + 16, lead.y);
    // the valley is the level: past the ridges the flock turns itself around
    lead.z = clamp(lead.z, -VALLEY_EDGE, VALLEY_EDGE);
    lead.x = Math.min(lead.x, world.terrain.roostX + 220);
    const overZ = clamp((Math.abs(flock.cz) - VALLEY_EDGE) / 90, 0, 1);
    if (overZ > 0) {
      leadDir.z = lerp(leadDir.z, flock.cz > 0 ? -1 : 1, overZ);
      normalise(leadDir);
    }
    const overX = clamp((flock.cx - world.terrain.roostX - 200) / 120, 0, 1);
    if (overX > 0) {
      leadDir.x = lerp(leadDir.x, -1, overX);
      normalise(leadDir);
    }
    if (Math.abs(flock.cz) > VALLEY_EDGE - 40 && game.strayT <= 0) {
      game.strayT = 6;
      hud.toast('you are over the ridge — the roost is down the valley');
    }
    game.strayT -= dt;
  }

  const gust = night.wind.gust * Math.sin(game.time * 0.31) * Math.sin(game.time * 0.13 + 1.7);
  wind.x = 0;
  wind.y = 0;
  wind.z = night.wind.z + gust;

  const before = flock.count;
  flock.update(dt, {
    lead,
    leadDir,
    density: roosting ? 0.5 : game.density,
    falcons,
    terrain: world.terrain,
    wind,
    groups,
  });
  game.recruited += flock.recruitedThisFrame;
  if (flock.recruitedThisFrame > 0 && Math.random() < 0.06) audio.recruit();

  // wires get one honest warning: the pylons are visible long before the
  // conductors are, so the information the player needs is the band, not the line
  if (game.mode === 'play') {
    for (const row of world.spanRows) {
      const ahead = row.x - flock.cx;
      if (row.warned || ahead < 0 || ahead > 560) continue;
      row.warned = true;
      const band = world.wireBandAt(row.x, flock.cz);
      if (band) {
        hud.toast(`conductors ahead · wires ${Math.round(band.lo)}–${Math.round(band.hi)} m on your track`);
        audio.blip(320, 0.3, 'triangle', 0.05, 240);
      }
    }
  }

  // hazards
  const hit = world.checkHazards(flock);
  if (hit > 0) {
    game.toWires += hit;
    audio.alarm();
    hud.banner('wires', 'alarm');
  }

  // falcons
  for (const f of falcons) {
    f.update(dt, flock, world.terrain, game.time);
    while (f.events.length) {
      const ev = f.events.shift();
      if (demo) continue;
      if (ev === 'climb') { audio.cry(); hud.toast('a falcon is gaining height'); }
      else if (ev === 'lock') { audio.lockCry(); hud.banner('locked on', 'alarm'); }
      else if (ev === 'stoop') { audio.burst(0.7, 1400, 0.16); }
      else if (ev === 'kill') { game.toFalcons++; audio.alarm(); camState.shake = 0.7; }
      else if (ev === 'miss') { hud.banner('missed', 'good'); audio.blip(900, 0.2, 'sine', 0.05, 1400); }
    }
  }

  // feeding / lift
  const fed = swarms.update(dt, flock);
  if (fed > 0 && Math.random() < 0.03) audio.feed();
  thermals.update(dt, flock);

  // dark attrition
  if (game.mode === 'play' && game.light < LIGHT.darkPanic) {
    const k = 1 - game.light / LIGHT.darkPanic;
    const lost = flock.loseToDark(LIGHT.darkLossRate * k * k, dt);
    if (lost > 0) {
      game.toDark += lost;
      if (Math.random() < 0.15) hud.banner('losing them in the dark', 'alarm');
    }
  }

  // deaths -> puffs
  while (flock.deaths.length) {
    const z = flock.deaths.pop(), y = flock.deaths.pop(), x = flock.deaths.pop();
    puffs.burst(x, y, z, 4);
  }

  world.update(dt, game.light);
  puffs.update(dt);

  // arrival
  if (game.mode === 'play') {
    const d = Math.hypot(flock.cx - world.terrain.roostX, flock.cz - world.terrain.roostZ);
    if (d < 170) {
      game.mode = 'roost';
      game.roostT = 0;
      hud.banner('the reedbed', 'good');
      audio.roost();
    }
    if (flock.count === 0) results(true);
  } else if (roosting) {
    game.roostT += dt;
    const t = world.terrain;
    for (let i = 0; i < flock.high; i++) {
      if (flock.state[i] !== MEMBER) continue;
      const dx = flock.px[i] - t.roostX, dz = flock.pz[i] - t.roostZ;
      if (flock.py[i] < 7 && dx * dx + dz * dz < 210 * 210) {
        flock.kill(i, false);
        game.roosted++;
      }
    }
    if (flock.count === 0 || game.roostT > 16) {
      game.roosted += flock.count;
      results(false);
    }
  }

  audio.ambience(flock.speed, flock.count, game.light);

  hud.update(dt, {
    count: flock.count,
    progress: clamp(flock.cx / night.length, 0, 1),
    light: game.light,
    stamina: flock.avgStamina,
    density: game.density,
    flashReady: 1 - game.flashCd / FLOCK.flashCooldown,
    threats: falcons.map((f) => f.threat(flock)),
    heading: Math.atan2(camState.dirZ, camState.dirX),
    roost: {
      bearing: Math.atan2(world.terrain.roostZ - flock.cz, world.terrain.roostX - flock.cx),
      dist: Math.hypot(world.terrain.roostX - flock.cx, world.terrain.roostZ - flock.cz),
    },
  });

  // one-off hints
  if (game.mode === 'play') {
    game.hintT -= dt;
    if (game.hintT < 0 && game.hintT > -100) {
      game.hintT = -1000;
      hud.toast('wild flocks join if you arrive slowly — under 26 m/s');
    }
  }
}

function render(dtRaw) {
  const dt = dtRaw * (game.running ? game.subSteps : 1);
  // camera follows the flock's actual motion, not the player's intent, so a
  // hard turn visibly sweeps rather than snapping
  const sp = Math.hypot(flock.vcx, flock.vcy, flock.vcz) || 1;
  const k = 1 - Math.exp(-dt * 1.8);
  camState.dirX = lerp(camState.dirX, flock.vcx / sp, k);
  camState.dirY = lerp(camState.dirY, flock.vcy / sp, k);
  camState.dirZ = lerp(camState.dirZ, flock.vcz / sp, k);
  const dl = Math.hypot(camState.dirX, camState.dirY, camState.dirZ) || 1;
  const dx = camState.dirX / dl, dy = camState.dirY / dl, dz = camState.dirZ / dl;

  const dist = 26 + flock.speed * 0.55 + flock.radius * 1.2;
  const height = 10 + flock.radius * 0.45;
  let tx = flock.cx - dx * dist;
  let ty = flock.cy - dy * dist * 0.5 + height;
  let tz = flock.cz - dz * dist;
  if (world) ty = Math.max(world.terrain.heightAt(tx, tz) + 7, ty);

  const ck = 1 - Math.exp(-dt * 3.4);
  camera.position.x = lerp(camera.position.x, tx, ck);
  camera.position.y = lerp(camera.position.y, ty, ck);
  camera.position.z = lerp(camera.position.z, tz, ck);
  if (camState.shake > 0) {
    camState.shake = Math.max(0, camState.shake - dt * 1.6);
    const s = camState.shake * 0.8;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
  camera.lookAt(flock.cx + dx * 12, flock.cy + dy * 6 + 2, flock.cz + dz * 12);
  camera.fov = 60 + clamp(flock.speed - 20, 0, 18) * 0.5;
  camera.updateProjectionMatrix();

  const l = game.light;
  hemi.intensity = 0.40 + l * 0.72;
  sun.intensity = 0.18 + l * 1.4;
  sun.color.setRGB(1, 0.6 + l * 0.22, 0.38 + l * 0.3, THREE.SRGBColorSpace);
  sun.position.set(camera.position.x - 300, camera.position.y + 90 * l, camera.position.z + 60);
  scene.fog.color.setRGB(0.32 + l * 0.34, 0.24 + l * 0.16, 0.30 + l * 0.06, THREE.SRGBColorSpace);
  scene.fog.density = 0.00040 + (1 - l) * 0.00075;

  birds.update(flock, game.time, l);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'play' && game.running) pause();
});

// Exposed so the screenshot harness (and anyone poking at it in a console) can
// see the simulation without instrumenting the loop.
window.vesper = {
  game, flock, keys, startNight, setupNight, camera,
  falcons: () => falcons, world: () => world, groups: () => groups,
};

// ---------------------------------------------------------------- boot
setupNight(0, 'demo');
game.running = true;
titleScreen();
document.getElementById('loading').classList.add('hidden');
requestAnimationFrame(frame);
