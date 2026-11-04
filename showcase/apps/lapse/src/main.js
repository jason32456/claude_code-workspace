import { createSim, step, DT, makeBalloon, addRival, predictMarker, resultFor, total } from './sim.js';
import { FLIGHTS, fmtClock, D2R, clamp } from './world.js';
import { createBot, botStep } from './bot.js';
import { createScene, PALETTES } from './scene.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const $ = (id) => document.getElementById(id);
const scene = createScene($('game'));
const audio = createAudio();
const hud = createHud();

const SAVE = 'lapse.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || { best: {} }; } catch { return { best: {} }; } };
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(progress)); } catch {} };
let progress = load();

const RIVALS = [
  { id: 'r1', name: 'Isolde Marsh', skill: 'good', color: 1, dx: -70, dz: 40 },
  { id: 'r2', name: 'Tomas Pell', skill: 'fair', color: 2, dx: 60, dz: 70 },
  { id: 'r3', name: 'Ada Kestrel', skill: 'fair', color: 3, dx: -40, dz: -80 },
  { id: 'r4', name: 'Wim Doorn', skill: 'rough', color: 4, dx: 90, dz: -40 },
];

let sim = null, idx = 0, mode = 'menu', acc = 0, frozen = false, paused = false, ff = false, allOpen = false;
let bots = new Map(), playerBot = null, predict = null, predT = 0;
const keys = new Set();

function startSim(i, demo) {
  idx = i;
  const F = FLIGHTS[i];
  sim = createSim(F, { seed: 1 });
  sim.player.color = 0;
  bots = new Map();
  for (const r of RIVALS) {
    const b = addRival(sim, makeBalloon(sim, F.launch[0] + r.dx, F.launch[1] + r.dz, { id: r.id, name: r.name, color: r.color }));
    bots.set(r.id, createBot(r.skill, r.color + i * 7));
  }
  playerBot = demo ? createBot('expert', 3) : null;
  if (playerBot) playerBot.takeoff = 1;
  scene.load(sim);
  hud.setFlight(sim);
  acc = 0; predict = null;
}

function controls() {
  const m = new Map();
  for (const [id, bot] of bots) {
    const b = sim.balloons.find((q) => q.id === id);
    m.set(id, botStep(sim, b, bot));
  }
  return m;
}

function simStep() {
  if (playerBot) Object.assign(sim.input, botStep(sim, sim.player, playerBot));
  step(sim, controls());
  handleEvents();
}

function handleEvents() {
  for (const e of sim.events) {
    if (mode !== 'play') continue;
    const mine = e.who === sim.player.id;
    if (e.type === 'drop' && mine) { audio.drop(); hud.toast(`Marker away for <b>${sim.F.tasks[e.task].name}</b>`); }
    else if (e.type === 'score') {
      if (mine) { audio.score(e.pts); hud.toast(`<b>${Math.round(e.d)} m</b> from the cross · <b>${e.pts}</b> points`, e.pts > 500 ? 'good big' : 'big', 5); }
      else { const r = sim.balloons.find((q) => q.id === e.who); hud.toast(`${r.name}: ${Math.round(e.d)} m`, 'small', 3); }
    } else if (mine && e.type === 'hard') { audio.thud(); hud.toast(`Hard landing, ${e.v.toFixed(1)} m/s · −150`, 'bad'); }
    else if (mine && e.type === 'touch') { audio.thud(); if (!e.legal) hud.toast(`Touched down in <b>${e.field}</b> · −100`, 'bad'); }
    else if (mine && e.type === 'wire') audio.warn();
    else if (mine && e.type === 'overtemp') { audio.warn(); hud.toast('Envelope over 120 °C. The fabric is cooking: −50 a second', 'bad'); }
    else if (mine && e.type === 'fuel') hud.toast('Out of propane. You are coming down.', 'bad', 6);
    else if (mine && e.type === 'strike') hud.toast('<b>Power line strike.</b> Flight over, zero points.', 'bad big', 8);
    else if (mine && e.type === 'land') hud.toast(e.legal ? `Down in <b>${e.field}</b> · +200` : `Down in <b>${e.field}</b>. The farmer is not pleased.`, e.legal ? 'good big' : 'bad big', 6);
    else if (e.type === 'thermals') hud.toast('The sun is heating the ground. <b>Thermals</b> are starting: time to land.', 'bad big', 7);
    else if (e.type === 'seabreeze') hud.toast('Fresh air off the sea. The <b>sea breeze</b> is coming in low.', 'big', 7);
  }
  sim.events.length = 0;
}

function play(i) {
  audio.init();
  mode = 'play';
  startSim(i, false);
  scene.setMode(0); scene.cam.yaw = 200 * D2R; scene.cam.dist = 70; scene.cam.pitch = 0.12; scene.snapCam();
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !matchMedia('(pointer: coarse)').matches);
  paused = false; ff = false;
  const F = FLIGHTS[i];
  hud.toast(`<b>${F.name}</b> · launch ${fmtClock(F.clock)} · thermals by ${fmtClock(F.clock + F.thermals / 3600)}<br>${F.intro}`, 'big', 8);
}

const unlocked = (i) => allOpen || i === 0 || (progress.best[FLIGHTS[i - 1].id]?.medal ?? 0) > 0;
const MEDAL = ['·', '🥉', '🥈', '🥇'];

function menu() {
  mode = 'menu';
  $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  $('pause').classList.add('hidden');
  audio.stop();
  const box = $('flights'); box.innerHTML = '';
  FLIGHTS.forEach((F, i) => {
    const b = document.createElement('button');
    const best = progress.best[F.id];
    b.className = 'flight' + (unlocked(i) ? '' : ' locked');
    b.innerHTML = `<span class="t">Flight ${i + 1} · ${F.name}</span><span class="md">${best ? MEDAL[best.medal] : ''}</span>
      <span class="s">${F.sub} · ${F.tasks.length} goals · launch ${fmtClock(F.clock)}${best ? ` · best ${best.total}` : ''}</span>`;
    b.onclick = () => unlocked(i) && play(i);
    box.appendChild(b);
  });
  startSim(Math.floor(Math.random() * FLIGHTS.length), true);
  for (let k = 0; k < 30 * (240 + Math.random() * 300); k++) simStep();
  scene.setMode(0); scene.cam.dist = 240; scene.cam.pitch = 0.18; scene.snapCam();
}

function finishRivals() {
  for (let k = 0; k < 30 * 3600 && sim.balloons.some((b) => !b.done); k++) { step(sim, controls()); sim.events.length = 0; }
}

function endScreen(r) {
  mode = 'end';
  audio.stop();
  $('toasts').innerHTML = '';
  finishRivals();
  const F = FLIGHTS[idx];
  const prev = progress.best[F.id];
  if (!prev || r.total > prev.total) progress.best[F.id] = { total: r.total, medal: Math.max(r.medal, prev?.medal ?? 0) };
  else prev.medal = Math.max(prev.medal, r.medal);
  save();
  $('e-flight').textContent = `FLIGHT ${idx + 1} · ${F.name.toUpperCase()}`;
  $('e-title').textContent = r.reason === 'strike' ? 'Power line strike' : r.reason === 'deadline' ? 'Still up when the thermals came' : 'Down and packed away';
  $('e-medal').innerHTML = `<span class="big">${MEDAL[r.medal]}</span> <b>${r.total}</b> points <span class="dim">· bronze ${F.medals[0]} · silver ${F.medals[1]} · gold ${F.medals[2]}</span>`;
  const rows = F.tasks.map((t, i) => {
    const s = r.tasks[i];
    return `<tr><td>${t.name}</td><td>${s ? (s.skipped || s.d == null ? 'no marker' : `${Math.round(s.d)} m`) : 'no marker'}</td><td>${s ? s.pts : 0}</td></tr>`;
  });
  if (r.landing) rows.push(`<tr><td>Landing</td><td>${r.landing.field}</td><td>${r.landing.pts > 0 ? '+' : ''}${r.landing.pts}</td></tr>`);
  for (const p of r.pens) if (p.pts) rows.push(`<tr class="pen"><td colspan="2">${p.why}</td><td>${p.pts}</td></tr>`);
  if (r.overT > 0) rows.push(`<tr class="pen"><td colspan="2">Envelope over 120 °C for ${r.overT.toFixed(0)} s</td><td>−${Math.round(50 * r.overT)}</td></tr>`);
  $('e-stats').innerHTML = `<table>${rows.join('')}</table><div class="dim small">Propane used ${r.fuelUsed.toFixed(1)} kg · flight time ${Math.round(sim.t / 60)} min</div>`;
  const board = sim.balloons.map((b, i) => ({ name: b.name, total: total(sim, b), col: PALETTES[(b.color ?? i) % PALETTES.length][0], me: b === sim.player }))
    .sort((a, b) => b.total - a.total);
  $('e-board').innerHTML = '<div class="k">LEADERBOARD</div>' + board.map((q, k) => `<div class="brow${q.me ? ' me' : ''}"><span>${k + 1}</span><i style="background:#${q.col.toString(16).padStart(6, '0')}"></i><span class="nm">${q.name}</span><b>${q.total}</b></div>`).join('');
  $('e-next').style.display = idx < FLIGHTS.length - 1 && (r.medal > 0 || allOpen) ? '' : 'none';
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('end').classList.remove('hidden');
}

$('e-retry').onclick = () => play(idx);
$('e-next').onclick = () => play(idx + 1);
$('e-menu').onclick = () => menu();
$('p-resume').onclick = () => togglePause(false);
$('p-quit').onclick = () => { togglePause(false); menu(); };

function togglePause(v = !paused) {
  if (mode !== 'play') return;
  paused = v;
  $('pause').classList.toggle('hidden', !paused);
}

// ---------- input ----------
const P = () => sim.player;
addEventListener('keydown', (e) => {
  if (mode !== 'play') return;
  const k = e.key.toLowerCase();
  if (['tab', ' '].includes(k) || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (k === 'm') sim.input.drop = true;
  else if (k === 'h') { P().hold = P().hold == null ? P().y : null; }
  else if (k === 'q' && P().hold != null) P().hold -= 25;
  else if (k === 'e' && P().hold != null) P().hold += 25;
  else if (k === 'c') scene.setMode((scene.cam.mode + 1) % 3);
  else if (k === 'f') ff = !ff;
  else if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'k') sim.input.skip = true;
  else if (k === 'l') sim.input.land = true;
  else if (k === 'g') { hud.state.aid = !hud.state.aid; hud.toast(`Marker aid ${hud.state.aid ? 'on' : 'off'}`); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const touch = { burn: false, vent: false, ff: false };
document.querySelectorAll('#touch button').forEach((btn) => {
  const t = btn.dataset.t;
  const on = (e) => {
    e.preventDefault(); audio.init();
    if (t === 'burn' || t === 'vent') touch[t] = true;
    else if (t === 'drop') sim.input.drop = true;
    else if (t === 'cam') scene.setMode((scene.cam.mode + 1) % 3);
    else if (t === 'ff') { ff = !ff; btn.classList.toggle('on', ff); }
    else if (t === 'hold') { P().hold = P().hold == null ? P().y : null; btn.classList.toggle('on', P().hold != null); }
    else if (t === 'up' && P().hold != null) P().hold += 25;
    else if (t === 'down' && P().hold != null) P().hold -= 25;
  };
  const off = (e) => { e.preventDefault(); if (t === 'burn' || t === 'vent') touch[t] = false; };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
});

let drag = null;
$('game').addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; audio.init(); });
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag = { x: e.clientX, y: e.clientY };
  scene.cam.yaw += dx * 0.006;
  scene.cam.pitch = clamp(scene.cam.pitch + dy * 0.004, -0.6, 1.4);
});
$('game').addEventListener('wheel', (e) => {
  e.preventDefault();
  if (scene.cam.mode === 2) scene.cam.mapH = clamp(scene.cam.mapH * (1 + e.deltaY * 0.001), 300, 6000);
  else scene.cam.dist = clamp(scene.cam.dist * (1 + e.deltaY * 0.001), 30, 600);
}, { passive: false });

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sim && !frozen && !paused) {
    if (mode === 'play') {
      sim.input.burn = keys.has('Space') || touch.burn;
      sim.input.vent = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyX') || touch.vent ? 1 : 0;
    }
    const speed = mode === 'menu' ? 3 : keys.has('Tab') || ff ? 8 : 2;
    acc += dt * speed;
    let n = 0;
    while (acc >= DT && n < 40) { simStep(); acc -= DT; n++; }
    if (acc > DT * 4) acc = 0;
    if (mode === 'play') {
      predT -= dt;
      if (predT <= 0) {
        predT = 0.25;
        const b = sim.player, t = sim.F.tasks[b.taskIdx];
        if (t && b.flying && !b.done) {
          const m = predictMarker(sim, b, 0.5);
          let d = Infinity;
          for (const [gx, gz] of t.goals) d = Math.min(d, Math.hypot(m.x - gx, m.z - gz));
          predict = d < 2000 ? { ...m, d } : null;
        } else predict = null;
      }
      hud.update(sim, sim.player, { groundCanvas: scene.groundCanvas, predict, speed });
      audio.frame(sim.player, Math.abs(sim.player.vy));
      labels();
      if (sim.result) endScreen(sim.result);
    } else if (mode === 'menu') {
      scene.cam.yaw += dt * 0.05;
      if (sim.player.done) menu();
    }
  }
  if (sim) scene.render(dt, { predict: mode === 'play' && hud.state.aid ? predict : null });
  requestAnimationFrame(frame);
}

function labels() {
  const box = $('labels');
  let html = '';
  for (const b of sim.balloons) {
    if (b === sim.player || b.done) continue;
    const p = scene.project(b.x, b.y + 28, b.z);
    if (p) html += `<div class="lbl" style="left:${p.x}px;top:${p.y}px">${b.name.split(' ')[0]} · ${Math.round(b.y - sim.world.L0)} m</div>`;
  }
  const t = sim.F.tasks[sim.player.taskIdx];
  if (t) for (const [gx, gz] of t.goals) {
    const p = scene.project(gx, sim.world.ground(gx, gz) + 40, gz);
    if (p) html += `<div class="lbl goal" style="left:${p.x}px;top:${p.y}px">✕ ${Math.round(Math.hypot(gx - sim.player.x, gz - sim.player.z))} m</div>`;
  }
  box.innerHTML = html;
}

// Test and screenshot hooks.
window.__lapse = {
  get sim() { return sim; }, scene, hud, FLIGHTS,
  play, menu, endScreen,
  unlockAll() { allOpen = true; },
  freeze(v) { frozen = v; },
  botOn(skill = 'expert') { playerBot = createBot(skill, 3); playerBot.takeoff = 0; },
  botOff() { playerBot = null; },
  until(fn, maxSec = 4000) { for (let k = 0; k < maxSec * 30 && !fn(sim); k++) { simStep(); if (sim.result) break; } },
  frame(n = 1) { for (let k = 0; k < n; k++) scene.render(1 / 60, { predict }); hud.update(sim, sim.player, { groundCanvas: scene.groundCanvas, predict, speed: 1 }); labels(); },
};

menu();
requestAnimationFrame(frame);
