import * as T from './track.js';
import { SHIFTS } from './shifts.js';
import { createSim, step, route, predict, DT, GOOD, FIRM, HEAVY } from './sim.js';
import { makeBot, botStep } from './bot.js';
import { createScene } from './scene.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const scene = createScene(canvas);
const audio = createAudio();
let S = null, bot = null, paused = false, fastToggle = false, fastHold = false, frozen = false;
let lastEv = 0, predT = 0;
const ui = { assist: true, prediction: null, focus: null, focusZone: '', occ: { master: false, track: false } };
const keys = { master: false, track: false, tMaster: false, tTrack: false };

const hud = createHud({ route: (L) => doRoute(L) });

function best(i) { try { return localStorage.getItem('bowl.best.' + i); } catch { return null; } }
function setBest(i, r) {
  try {
    const prev = JSON.parse(localStorage.getItem('bowl.best.' + i) || 'null');
    if (!prev || r.total > prev.total) localStorage.setItem('bowl.best.' + i, JSON.stringify({ total: r.total, medal: r.medal }));
  } catch { /* storage unavailable */ }
}

function renderTitle() {
  $('shifts').innerHTML = SHIFTS.map((sh, i) => {
    let b = null;
    try { b = JSON.parse(best(i) || 'null'); } catch { b = null; }
    const cars = sh.trains.reduce((a, n) => a + n, 0);
    return `<button class="shift" data-i="${i}"><h3>${i + 1}. ${sh.name}</h3><p>${sh.blurb}</p><div class="small dim">${sh.temp > 0 ? '+' : ''}${sh.temp} °C · ${sh.trains.length} train${sh.trains.length > 1 ? 's' : ''} · ${cars} cars</div>` +
      `<div class="best">${b ? `<span class="${b.medal || 'dim'}">${b.medal ? b.medal.toUpperCase() : 'best'}</span> ${b.total}` : '<span class="dim">not yet worked</span>'}</div></button>`;
  }).join('');
  for (const el of document.querySelectorAll('.shift')) el.addEventListener('click', () => { audio.init(); play(+el.dataset.i); });
}

function play(i) {
  S = createSim(i);
  lastEv = 0;
  ui.assist = SHIFTS[i].assist;
  ui.prediction = null;
  scene.reset();
  scene.setMode(0);
  paused = false;
  for (const id of ['title', 'result', 'pause']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('toasts').innerHTML = '';
}

function doRoute(L) {
  if (!S || S.done) return;
  const it = route(S, L);
  if (it) audio.tick();
}

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (!S) return;
  audio.init();
  const k = e.key;
  if (k === ' ') { keys.master = true; e.preventDefault(); }
  else if (k === 'b' || k === 'B') keys.track = true;
  else if (k >= '1' && k <= '8') doRoute(+k - 1);
  else if (k === 'w' || k === 'W' || k === 'ArrowUp') { S.hump = Math.min(2.2, Math.round((S.hump + 0.1) * 10) / 10); e.preventDefault(); }
  else if (k === 's' || k === 'S' || k === 'ArrowDown') { S.hump = Math.max(0, Math.round((S.hump - 0.1) * 10) / 10); e.preventDefault(); }
  else if (k === 'c' || k === 'C') scene.setMode((scene.cam.mode + 1) % scene.MODES.length);
  else if (k === 'g' || k === 'G') ui.assist = !ui.assist;
  else if (k === 'f' || k === 'F') fastToggle = !fastToggle;
  else if (k === 'Tab') { fastHold = true; e.preventDefault(); }
  else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
});
window.addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === ' ') keys.master = false;
  else if (k === 'b' || k === 'B') keys.track = false;
  else if (k === 'Tab') fastHold = false;
});
window.addEventListener('blur', () => { keys.master = keys.track = fastHold = false; });

function holdBtn(id, prop) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); audio.init(); keys[prop] = true; };
  const off = () => { keys[prop] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
holdBtn('t-master', 'tMaster');
holdBtn('t-track', 'tTrack');
$('t-up').onclick = () => S && (S.hump = Math.min(2.2, Math.round((S.hump + 0.1) * 10) / 10));
$('t-down').onclick = () => S && (S.hump = Math.max(0, Math.round((S.hump - 0.1) * 10) / 10));
$('t-cam').onclick = () => scene.setMode((scene.cam.mode + 1) % scene.MODES.length);
$('t-fast').onclick = () => { fastToggle = !fastToggle; $('t-fast').textContent = fastToggle ? '×2' : '×6'; };
$('t-pause').onclick = () => togglePause();

let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  scene.cam.yaw += (e.clientX - drag.x) * 0.005;
  scene.cam.pitch = Math.max(-0.6, Math.min(0.9, scene.cam.pitch + (e.clientY - drag.y) * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('wheel', (e) => { scene.cam.zoom = Math.max(0.3, Math.min(3, scene.cam.zoom * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });

function togglePause() {
  if (!S || S.done) return;
  paused = !paused;
  $('pause').classList.toggle('hidden', !paused);
}
$('p-resume').onclick = togglePause;
$('p-menu').onclick = () => { paused = false; $('pause').classList.add('hidden'); menu(); };
$('r-retry').onclick = () => play(S.shiftIndex);
$('r-next').onclick = () => play((S.shiftIndex + 1) % SHIFTS.length);
$('r-menu').onclick = menu;
function menu() {
  $('result').classList.add('hidden');
  $('hud').classList.add('hidden');
  renderTitle();
  $('title').classList.remove('hidden');
}

// ---------- focus and prediction ----------
function zoneOf(b) {
  let off = 0, m = false, t = false;
  for (const c of b.cars) {
    const sc = b.s - off - c.len / 2;
    off += c.len;
    if (sc > T.MASTER[0] - 2 && sc < T.MASTER[1]) m = true;
    if (sc > T.TRACK_RET[0] - 2 && sc < T.TRACK_RET[1]) t = true;
  }
  return { m, t };
}

function updateFocus() {
  let tr = null, ms = null, newest = null;
  ui.occ.master = ui.occ.track = false;
  for (const b of S.bodies) {
    if (b.pre || b.v <= 0.02) continue;
    const z = zoneOf(b);
    if (z.t) { ui.occ.track = true; if (!tr || b.s < tr.s) tr = b; }
    if (z.m) { ui.occ.master = true; ms = b; }
    if (b.s < T.CLEAR + 40 && (!newest || b.s < newest.s)) newest = b;
  }
  const f = tr || ms || newest || S.bodies.filter((b) => !b.pre && b.v > 0.02).sort((a, b) => a.s - b.s)[0] || null;
  ui.focus = f;
  ui.focusZone = f ? (tr === f ? 'TRACK RETARDER' : ms === f ? 'MASTER RETARDER' : f.s < T.CLEAR ? 'IN THE LADDER' : 'ROLLING OUT') : '';
  if (f) {
    const p = predict(S, f, {});
    p.body = f;
    p.cls = p.kind === 'stall' ? 'stall' : p.v <= GOOD ? 'good' : p.v <= FIRM ? 'firm' : p.v <= HEAVY ? 'hard' : 'smash';
    ui.prediction = p;
  } else ui.prediction = null;
}

// ---------- labels over moving cuts ----------
const labels = $('labels');
function updateLabels() {
  const want = S.bodies.filter((b) => !b.pre && b.v > 0.05);
  while (labels.children.length < want.length) labels.appendChild(document.createElement('div')).className = 'lab';
  [...labels.children].forEach((el, i) => {
    const b = want[i];
    if (!b) { el.style.display = 'none'; return; }
    const bits = b.bits.map((x, k) => x ?? (b.plan != null ? T.leafBits(b.plan)[k] : 0));
    const [x, y, z] = T.point(b.s - b.cars[0].len / 2, bits);
    const p = scene.project(x, y + 6.5, z);
    if (!p.vis) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    const v = b.v * 3.6;
    el.textContent = `${v.toFixed(1)} km/h → ${b.plan != null ? b.plan + 1 : '?'}`;
    el.style.color = b.misrouted ? '#ff5440' : '#fff';
  });
}

// ---------- loop ----------
let last = performance.now(), simAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S && !paused && !frozen && !S.done) advance(dt * (fastHold || fastToggle ? 6 : 2));
  render(dt);
  requestAnimationFrame(frame);
}

function advance(simDt) {
  simAcc += simDt;
  while (simAcc >= DT && !S.done) {
    if (bot) botStep(S, bot);
    else { S.input.master = keys.master || keys.tMaster; S.input.track = keys.track || keys.tTrack; }
    step(S, DT);
    simAcc -= DT;
  }
}

function render(dt) {
  if (!S) {
    idleAcc += dt * 3;
    while (idleAcc >= DT) { botStep(idle, idleBot); step(idle, DT); idleAcc -= DT; }
    scene.update(idle, ui, dt);
    return;
  }
  if (S.done && !S.result.shown) {
    S.result.shown = true;
    setBest(S.shiftIndex, S.result);
    const which = S;
    setTimeout(() => S === which && hud.showResult(S), 900);
  }
  predT -= dt;
  if (predT <= 0) { updateFocus(); predT = 0.1; }
  while (lastEv < S.events.length) {
    const e = S.events[lastEv++];
    if (e.type === 'couple' || e.type === 'bumper') audio.clank(e.v || 1);
  }
  let squeal = 0;
  for (const b of S.bodies) {
    if (b.v <= 0.05 || b.pre) continue;
    const z = zoneOf(b);
    if ((z.m && S.input.master) || (z.t && S.input.track)) squeal = Math.max(squeal, Math.min(1, b.v / 3));
  }
  audio.update({ squeal, diesel: S.train ? 0.3 + S.train.v / 2 : 0, wind: Math.abs(S.wind) });
  scene.update(S, ui, dt);
  hud.update(S, ui, dt);
  updateLabels();
}

// The title screen shows the yard behind it.
const idle = createSim(0), idleBot = makeBot();
let idleAcc = 0;
for (let i = 0; i < 40 * 200; i++) { botStep(idle, idleBot); step(idle, DT); }

function resize() { scene.resize(); }
window.addEventListener('resize', resize);
resize();
renderTitle();
requestAnimationFrame(frame);

// Hooks for the screenshot script.
window.__bowl = {
  get S() { return S; }, scene, ui,
  play, freeze(v) { frozen = v; },
  botOn(kind = 'expert') { bot = makeBot(kind); },
  botOff() { bot = null; },
  until(fn, max = 40 * 3600) { for (let i = 0; i < max && !fn(S) && !S.done; i++) { if (bot) botStep(S, bot); step(S, DT); } },
  frame(n = 1) { for (let i = 0; i < n; i++) render(1 / 30); },
};
