import * as THREE from '../vendor/three.module.js';
import { Stage, WALL } from './scene.js';
import { Caster } from './caster.js';
import { Player } from './player.js';
import { LEVELS } from './levels.js';
import { pointInPoly } from './geom.js';
import { initAudio, resumeAudio, sfx, setTurnDrone, setMuted, isMuted } from './audio.js';

const el = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const KEY = 'gnomon.v1';

const canvas = el('game');
const stage = new Stage(canvas);
const player = new Player(WALL);
const raycaster = new THREE.Raycaster();
const H = 1 / 120;

const input = { left: false, right: false, jump: false, jumpHeld: false };

const state = {
  mode: 'title',
  index: 0,
  level: null,
  casters: [],
  polys: [],
  time: 0,
  motes: 0,
  deaths: 0,
  grace: 0,
  lastDeath: -10,
  seal: null,
  sealOpen: false,
  coverage: 0,
  spill: 0,
  lampTarget: new THREE.Vector3(),
  lampFlags: new Set(),
  lampBounds: null,
  selected: null,
  hint: 0,
};

let progress = loadProgress();

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && typeof p === 'object') return { unlocked: p.unlocked || 1, levels: p.levels || {} };
  } catch { /* first run */ }
  return { unlocked: 1, levels: {} };
}

function saveProgress() {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* private mode */ }
}

/* ---------------------------------------------------------------- level ---- */

function disposeCasters() {
  for (const c of state.casters) {
    c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    c.material.dispose();
    c.lineMat.dispose();
  }
  stage.casterRoot.clear();
  state.casters = [];
}

function loadLevel(index) {
  const def = LEVELS[index];
  state.index = index;
  state.level = def;

  disposeCasters();
  state.casters = def.solids.map((s, i) => new Caster(s, i));
  for (const c of state.casters) stage.casterRoot.add(c.group);

  stage.lamp.position.set(...def.lamp.pos);
  stage.lampBody.position.copy(stage.lamp.position);
  state.lampTarget.copy(stage.lamp.position);
  state.lampFlags = new Set((def.lamp.flags || '').split(/\s+/).filter(Boolean));
  state.lampBounds = def.lamp.bounds || null;
  stage.lampCage.material.color.setHex(state.lampFlags.size ? 0x8ef0ff : 0xffd9a6);

  for (const m of def.motes) m.taken = false;
  stage.setMotes(def.motes);
  stage.doorGroup.position.set(def.door[0], def.door[1], 0.05);

  state.seal = buildSeal(def);
  stage.setSeal(state.seal ? state.seal.targets : null);

  player.spawn(def.spawn[0], def.spawn[1]);
  state.time = 0;
  state.motes = 0;
  state.deaths = 0;
  state.grace = 0.5;
  state.sealOpen = false;
  state.coverage = 0;
  state.spill = 0;
  state.selected = null;
  state.hint = 0;

  el('chamber-num').textContent = index + 1;
  el('chamber-name').textContent = def.name;
  el('par-num').textContent = def.par;
  el('hint').textContent = def.hint;
  el('hint').classList.remove('fade');
  el('seal-wrap').classList.toggle('hidden', !state.seal);

  // Prime the projection so the first frame collides against real shadows.
  for (const c of state.casters) { c.syncTransform(); c.project(stage.lamp.position, 0); }
  collectPolys();
}

// The seal target is the shadow the keyed solid casts at a transform declared in
// the level — so a chamber can never ship a silhouette that cannot be matched.
function buildSeal(def) {
  if (!def.seal) return null;
  const tmp = new Caster(def.solids[def.seal.from], -1);
  tmp.pos.set(...def.seal.solutionPos);
  tmp.yaw = def.seal.solution.yaw;
  tmp.pitch = def.seal.solution.pitch;
  tmp.syncTransform();
  tmp.project(new THREE.Vector3(...def.lamp.pos), 0);
  const targets = tmp.polys.map((p) => p.map((q) => ({ x: q.x, y: q.y })));
  tmp.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  tmp.material.dispose();
  tmp.lineMat.dispose();

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of targets) {
    for (const p of poly) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  const pad = 1.5;
  const inside = [], band = [];
  const cols = 42, rows = 42;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX - pad + ((i + 0.5) / cols) * (maxX - minX + pad * 2);
      const y = minY - pad + ((j + 0.5) / rows) * (maxY - minY + pad * 2);
      const p = { x, y };
      (targets.some((t) => pointInPoly(t, x, y)) ? inside : band).push(p);
    }
  }
  return { caster: def.seal.from, targets, inside, band };
}

function evalSeal() {
  const s = state.seal;
  if (!s) return;
  const polys = state.casters[s.caster].polys;
  const hit = (p) => polys.some((poly) => pointInPoly(poly, p.x, p.y));
  let cov = 0, sp = 0;
  for (const p of s.inside) if (hit(p)) cov++;
  for (const p of s.band) if (hit(p)) sp++;
  state.coverage = cov / Math.max(1, s.inside.length);
  state.spill = sp / Math.max(1, s.band.length);
  const open = state.coverage >= 0.9 && state.spill <= 0.12;
  if (open !== state.sealOpen) {
    state.sealOpen = open;
    open ? sfx.sealOpen() : sfx.sealClose();
  }
}

function collectPolys() {
  state.polys.length = 0;
  for (const c of state.casters) for (const p of c.polys) state.polys.push(p);
}

/* ------------------------------------------------------------ simulation ---- */

function simulate(dt, frac, live) {
  for (const c of state.casters) {
    c.applyTargets(frac);
    c.step(dt);
  }
  stage.lamp.position.lerp(state.lampTarget, frac);
  stage.lampBody.position.copy(stage.lamp.position);

  for (const c of state.casters) c.project(stage.lamp.position, dt);
  collectPolys();

  if (!live) return;

  const ev = player.step(dt, input, state.polys);
  if (ev.jumped) sfx.jump();
  if (player.stepped) sfx.step();
  if (player.landed) sfx.land(player.landed);

  state.grace = Math.max(0, state.grace - dt);

  if (player.fell) die('fall');
  else if (player.crushed && state.grace <= 0) die('crush');
  else player.crushed = false;

  const lvl = state.level;
  for (let i = 0; i < lvl.motes.length; i++) {
    const m = lvl.motes[i];
    if (m.taken) continue;
    if (Math.hypot(m.x - player.x, m.y - player.y) < 0.85) {
      m.taken = true;
      state.motes++;
      sfx.mote();
      stage.moteMeshes[i].visible = false;
    }
  }

  const locked = state.seal && !state.sealOpen;
  if (!locked && Math.hypot(lvl.door[0] - player.x, lvl.door[1] - player.y) < 1.35) complete();
}

function die(reason) {
  const now = performance.now() / 1000;
  const repeat = now - state.lastDeath < 1.6;
  state.lastDeath = now;
  state.deaths++;
  reason === 'crush' ? sfx.crush() : sfx.fall();
  const f = el('flash');
  f.classList.add('on');
  requestAnimationFrame(() => f.classList.remove('on'));
  if (repeat) player.spawn(state.level.spawn[0], state.level.spawn[1]);
  else player.spawn(player.safeX, player.safeY);
  state.grace = 0.7;
}

function complete() {
  state.mode = 'complete';
  sfx.door();
  const lvl = state.level;
  const rec = progress.levels[lvl.id] || { best: null, motes: 0 };
  const time = state.time;
  const best = rec.best == null ? time : Math.min(rec.best, time);
  progress.levels[lvl.id] = { best, motes: Math.max(rec.motes, state.motes) };
  progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, state.index + 2));
  saveProgress();

  el('complete-title').textContent = time <= lvl.par ? 'CHAMBER CLEARED — UNDER PAR' : 'CHAMBER CLEARED';
  el('c-time').textContent = `${time.toFixed(1)}s`;
  el('c-par').textContent = `${lvl.par}s`;
  el('c-motes').textContent = `${state.motes}/${lvl.motes.length}`;
  el('c-best').textContent = `${best.toFixed(1)}s`;
  el('next-btn').textContent = state.index + 1 < LEVELS.length ? 'NEXT CHAMBER' : 'SEE THE RESULTS';
  el('complete').classList.remove('hidden');
  el('hud').classList.add('hidden');
}

/* --------------------------------------------------------------- visuals ---- */

const camTarget = new THREE.Vector3();
const lookAt = new THREE.Vector3(0, 7.4, 0);
const lookTarget = new THREE.Vector3(0, 7.4, 0);
let clock = 0;

function updateVisuals(dt) {
  clock += dt;
  const live = state.mode === 'play';

  const px = live ? player.x : 0;
  const py = live ? player.y : 7.5;
  camTarget.set(stage.camAnchor.x + px * 0.11, stage.camAnchor.y + (py - 7.5) * 0.07, stage.camAnchor.z);
  lookTarget.set(px * 0.07, 7.4 + (py - 7.5) * 0.08, 0);
  const k = 1 - Math.exp(-3.6 * dt);
  stage.camera.position.lerp(camTarget, k);
  lookAt.lerp(lookTarget, k);
  stage.camera.lookAt(lookAt);

  stage.playerGroup.visible = live;
  if (live) {
    stage.playerGroup.position.set(player.x, player.y, 0.09);
    stage.eyes.position.x = player.face * 0.07;
    stage.eyes.position.y = clamp(player.vy * 0.006, -0.05, 0.05);
    const squash = clamp(1 - Math.abs(player.vy) * 0.006, 0.86, 1);
    stage.playerGroup.scale.set(1 / squash, squash, 1);
    stage.playerRim.material.opacity = 0.75 + 0.25 * Math.sin(clock * 4);
  }

  for (let i = 0; i < (stage.moteMeshes || []).length; i++) {
    const m = stage.moteMeshes[i];
    if (!m.visible) continue;
    m.rotation.z = clock * 1.2;
    m.position.y = state.level.motes[i].y + Math.sin(clock * 2 + i) * 0.11;
  }

  stage.lampCage.rotation.y = clock * 0.5;
  stage.lampCage.rotation.x = clock * 0.31;
  stage.lampHalo.scale.setScalar(5.2 + Math.sin(clock * 1.7) * 0.3);

  const locked = state.seal && !state.sealOpen;
  const doorC = locked ? 0xffb35c : 0x5fe3ff;
  stage.doorFrame.material.color.setHex(doorC);
  stage.doorGlow.material.color.setHex(doorC);
  stage.doorGlow.material.opacity = 0.35 + 0.2 * Math.sin(clock * 2.4);
  stage.doorFrame.rotation.z = locked ? Math.sin(clock * 1.5) * 0.06 : clock * 0.35;

  if (state.seal) stage.setSealState(state.sealOpen, 0.5 + 0.5 * Math.sin(clock * 3));

  let turning = 0;
  for (const c of state.casters) {
    c.setHighlight(c.held ? 'held' : c.hover ? 'hover' : 'none');
    if (c.held) turning = Math.max(turning, c.angSpeed * 60);
    if (c.motor) turning = Math.max(turning, Math.abs(c.motor) * 0.35);
  }
  setTurnDrone(turning);
}

function updateHud() {
  el('time-num').textContent = state.time.toFixed(1);
  el('mote-num').textContent = state.motes;
  if (state.seal) {
    el('seal-fill').style.right = `${(1 - state.coverage) * 100}%`;
    el('seal-read').textContent = `${Math.round(state.coverage * 100)}% filled · ${Math.round(state.spill * 100)}% spill`;
    el('seal-wrap').classList.toggle('open', state.sealOpen);
  }
}

/* ----------------------------------------------------------------- input ---- */

const keyMap = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  resumeAudio();
  const k = keyMap[e.code];
  if (k) { input[k] = true; fadeHint(); }
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
    input.jump = true; input.jumpHeld = true; fadeHint();
    e.preventDefault();
  }
  if (e.code === 'KeyR' && (state.mode === 'play' || state.mode === 'pause')) restart();
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') { setMuted(!isMuted()); el('mute-btn').textContent = `SOUND: ${isMuted() ? 'OFF' : 'ON'}`; }
  if ((e.code === 'KeyQ' || e.code === 'KeyE') && state.selected && state.selected.flags.has('rotate')) {
    state.selected.tYaw += (e.code === 'KeyQ' ? -1 : 1) * 0.14;
  }
});

addEventListener('keyup', (e) => {
  const k = keyMap[e.code];
  if (k) input[k] = false;
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') input.jumpHeld = false;
});

for (const b of document.querySelectorAll('.tbtn')) {
  const key = b.dataset.key;
  const set = (v) => (key === 'jump' ? (input.jump = v, input.jumpHeld = v) : (input[key] = v));
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); resumeAudio(); set(true); fadeHint(); });
  b.addEventListener('pointerup', () => set(false));
  b.addEventListener('pointercancel', () => set(false));
  b.addEventListener('pointerleave', () => set(false));
}

function fadeHint() {
  if (state.hint) return;
  state.hint = 1;
  setTimeout(() => el('hint').classList.add('fade'), 2600);
}

/* ------------------------------------------------------------ manipulation -- */

const ndc = new THREE.Vector2();
let drag = null;

function pickAt(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  const targets = [];
  if (state.lampFlags.size) targets.push(stage.lampPick);
  for (const c of state.casters) if (c.movable) targets.push(...c.meshes);
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits.length) return null;
  const obj = hits[0].object;
  if (obj === stage.lampPick) return { type: 'lamp' };
  return { type: 'caster', caster: obj.userData.caster };
}

// Where the pointer ray crosses the plane the grabbed thing lives in, so a slid
// solid tracks the cursor exactly instead of drifting with perspective.
function planePoint(cx, cy, z) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  if (Math.abs(d.z) < 1e-6) return null;
  const t = (z - o.z) / d.z;
  return new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, z);
}

canvas.addEventListener('pointerdown', (e) => {
  resumeAudio();
  if (state.mode !== 'play') return;
  const pick = pickAt(e.clientX, e.clientY);
  if (!pick) return;
  e.preventDefault();
  fadeHint();

  if (pick.type === 'lamp') {
    if (!state.lampFlags.has('move')) return;
    const p = planePoint(e.clientX, e.clientY, stage.lamp.position.z);
    drag = { pick, mode: 'slide', offset: state.lampTarget.clone().sub(p) };
  } else {
    const c = pick.caster;
    const wantSlide = (e.shiftKey || e.button === 2) && c.flags.has('slide');
    const mode = c.flags.has('rotate') && !wantSlide ? 'rotate' : c.flags.has('slide') ? 'slide' : null;
    if (!mode) return;
    state.selected = c;
    c.held = true;
    drag = { pick, mode, offset: null };
    if (mode === 'slide') {
      const p = planePoint(e.clientX, e.clientY, c.pos.z);
      drag.offset = c.tPos.clone().sub(p);
    }
  }
  drag.x = e.clientX;
  drag.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  sfx.grab();
});

canvas.addEventListener('pointermove', (e) => {
  if (state.mode !== 'play') return;

  if (!drag) {
    const pick = pickAt(e.clientX, e.clientY);
    for (const c of state.casters) c.hover = pick && pick.type === 'caster' && pick.caster === c;
    updateGrip(pick, e.clientX, e.clientY);
    return;
  }

  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;

  if (drag.pick.type === 'lamp') {
    const p = planePoint(e.clientX, e.clientY, stage.lamp.position.z);
    if (!p) return;
    p.add(drag.offset);
    const b = state.lampBounds;
    state.lampTarget.x = b ? clamp(p.x, b.x[0], b.x[1]) : p.x;
    state.lampTarget.y = b ? clamp(p.y, b.y[0], b.y[1]) : p.y;
    return;
  }

  const c = drag.pick.caster;
  if (drag.mode === 'rotate') {
    c.tYaw += dx * 0.0085;
    c.tPitch = clamp(c.tPitch + dy * 0.0085, -1.45, 1.45);
  } else {
    const p = planePoint(e.clientX, e.clientY, c.pos.z);
    if (!p) return;
    p.add(drag.offset);
    const b = c.slideBounds;
    c.tPos.x = clamp(p.x, b.x[0], b.x[1]);
    c.tPos.y = clamp(p.y, b.y[0], b.y[1]);
  }
});

function endDrag() {
  if (!drag) return;
  if (drag.pick.type === 'caster') drag.pick.caster.held = false;
  drag = null;
  sfx.release();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('wheel', (e) => {
  if (state.mode !== 'play') return;
  const pick = drag ? drag.pick : pickAt(e.clientX, e.clientY);
  if (!pick) return;
  const step = -Math.sign(e.deltaY) * 0.34;

  if (pick.type === 'lamp') {
    if (!state.lampFlags.has('depth')) return;
    const b = state.lampBounds;
    state.lampTarget.z = clamp(state.lampTarget.z + step, b ? b.z[0] : 9, b ? b.z[1] : 16);
    e.preventDefault();
    return;
  }
  const c = pick.caster;
  if (!c.flags.has('depth')) return;
  const r = c.depthRange || [1.2, stage.lamp.position.z - 3];
  c.tPos.z = clamp(c.tPos.z + step, r[0], r[1]);
  e.preventDefault();
}, { passive: false });

const grip = el('grip');
function updateGrip(pick, cx, cy) {
  if (!pick) { grip.classList.add('hidden'); return; }
  let label = 'DRAG THE LAMP';
  if (pick.type === 'caster') {
    const f = pick.caster.flags;
    const parts = [];
    if (f.has('rotate')) parts.push('DRAG TURNS');
    if (f.has('slide')) parts.push('SHIFT-DRAG SLIDES');
    if (f.has('depth')) parts.push('WHEEL PUSHES');
    label = parts.join(' · ');
  } else if (state.lampFlags.has('depth')) {
    label = 'DRAG THE LAMP · WHEEL PUSHES';
  }
  grip.textContent = label;
  grip.style.left = `${cx}px`;
  grip.style.top = `${cy}px`;
  grip.classList.remove('hidden');
}

/* -------------------------------------------------------------------- UI ---- */

function buildChamberList() {
  const wrap = el('chamber-list');
  wrap.innerHTML = '';
  LEVELS.forEach((lvl, i) => {
    const rec = progress.levels[lvl.id];
    const locked = i + 1 > progress.unlocked;
    const chip = document.createElement('div');
    chip.className = `chip${locked ? ' locked' : ''}`;
    chip.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span>${lvl.name}` +
      `<span class="m">${rec ? `${rec.best.toFixed(1)}s · ${rec.motes}/${lvl.motes.length}` : locked ? 'LOCKED' : ''}</span>`;
    if (!locked) chip.addEventListener('click', () => start(i));
    wrap.appendChild(chip);
  });
  el('play-btn').textContent = progress.unlocked > 1
    ? `CONTINUE — CHAMBER ${Math.min(progress.unlocked, LEVELS.length)}`
    : 'ENTER THE FIRST CHAMBER';
}

function start(i) {
  initAudio();
  resumeAudio();
  loadLevel(i);
  state.mode = 'play';
  el('title').classList.add('hidden');
  el('complete').classList.add('hidden');
  el('finale').classList.add('hidden');
  el('pause').classList.add('hidden');
  el('hud').classList.remove('hidden');
}

function restart() {
  const i = state.index;
  start(i);
}

function togglePause() {
  if (state.mode === 'play') {
    state.mode = 'pause';
    el('pause-name').textContent = `CHAMBER ${state.index + 1} — ${state.level.name}`;
    el('pause').classList.remove('hidden');
  } else if (state.mode === 'pause') {
    state.mode = 'play';
    el('pause').classList.add('hidden');
  }
}

function toTitle() {
  state.mode = 'title';
  loadLevel(Math.min(state.index, LEVELS.length - 1));
  buildChamberList();
  el('hud').classList.add('hidden');
  el('pause').classList.add('hidden');
  el('complete').classList.add('hidden');
  el('finale').classList.add('hidden');
  el('title').classList.remove('hidden');
}

el('play-btn').addEventListener('click', () => start(Math.min(progress.unlocked, LEVELS.length) - 1));
el('resume-btn').addEventListener('click', togglePause);
el('restart-btn').addEventListener('click', restart);
el('quit-btn').addEventListener('click', toTitle);
el('mute-btn').addEventListener('click', () => {
  setMuted(!isMuted());
  el('mute-btn').textContent = `SOUND: ${isMuted() ? 'OFF' : 'ON'}`;
});
el('retry-btn').addEventListener('click', restart);
el('next-btn').addEventListener('click', () => {
  if (state.index + 1 < LEVELS.length) start(state.index + 1);
  else {
    const done = LEVELS.filter((l) => progress.levels[l.id]).length;
    const motes = LEVELS.reduce((n, l) => n + (progress.levels[l.id]?.motes || 0), 0);
    const total = LEVELS.reduce((n, l) => n + l.motes.length, 0);
    el('finale-body').textContent =
      `${done} of ${LEVELS.length} chambers cleared, ${motes} of ${total} motes carried out. ` +
      'The lamp goes out. Every ledge you stood on was a hole in the light.';
    el('complete').classList.add('hidden');
    el('finale').classList.remove('hidden');
  }
});
el('finale-btn').addEventListener('click', toTitle);

if (matchMedia('(pointer: coarse)').matches) el('touch').classList.remove('hidden');

/* ------------------------------------------------------------------ loop ---- */

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const live = state.mode === 'play';
  acc += dt;
  const steps = Math.max(1, Math.floor(acc / H));
  let i = 0;
  while (acc >= H && i < 8) {
    simulate(H, 1 / (steps - i), live);
    acc -= H;
    i++;
    if (state.mode !== 'play' && live) break;
  }
  if (acc > 0.25) acc = 0;

  if (live) {
    state.time += dt;
    evalSeal();
    updateHud();
  }

  updateVisuals(dt);
  stage.writeShadows(state.polys);
  stage.render();
}

loadLevel(0);
buildChamberList();
requestAnimationFrame(frame);

// Handles for the headless harness that checks chamber geometry (scripts/probe.mjs).
window.__gnomon = { state, stage, player, input, start, LEVELS };
