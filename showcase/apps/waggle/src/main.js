import { createSim, step, DT, toggleHive, setDanceFor } from './sim.js';
import { DAYS, wrap180, D2R } from './world.js';
import { createBot, botStep } from './bot.js';
import { createScene } from './scene.js';
import { createAudio } from './audio.js';
import { createHud, fmtClock } from './hud.js';

const $ = (id) => document.getElementById(id);
const scene = createScene($('game'));
const audio = createAudio();
const hud = createHud();

const SAVE = 'waggle.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || { best: {} }; } catch { return { best: {} }; } };
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(progress)); } catch {} };
let progress = load();

let sim = null, bot = null, idx = 0, mode = 'menu', acc = 0, frozen = false, allOpen = false;
const keys = new Set();
let mouseAim = null, mouseDown = false, mouseDX = 0, touch = { turn: 0, fwd: 0, up: false, down: false, waggle: false };

function startSim(i, demo) {
  idx = i;
  sim = createSim(DAYS[i], { seed: demo ? 1 + Math.floor(Math.random() * 999) : 1 });
  bot = demo ? createBot({ mode: 'expert' }) : null;
  scene.load(sim);
  scene.setGhost(() => {
    const D = sim.dance, P = sim.player;
    if (!hud.state.assist || !D?.forPatch) return null;
    const m = P.mem[D.forPatch];
    return { a: wrap180(m.bearing - P.sunSeen.az), d: m.dist / 250 };
  });
  hud.setDay(sim);
  acc = 0;
}

function play(i) {
  audio.init();
  mode = 'play';
  startSim(i, false);
  scene.setView(0); scene.snapCam();
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !matchMedia('(pointer: coarse)').matches);
  hud.toast(`<b>${DAYS[i].name}</b> · ${fmtClock(DAYS[i].start)}–${fmtClock(DAYS[i].end)}<br>${DAYS[i].intro}`, 'big', 6);
}

const unlocked = (i) => allOpen || i === 0 || (progress.best[DAYS[i - 1].id]?.medal ?? 0) > 0;
const MEDAL = ['·', '🥉', '🥈', '🥇'];

function menu() {
  mode = 'menu';
  $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  document.body.classList.remove('inhive');
  $('labels').innerHTML = '';
  const box = $('days'); box.innerHTML = '';
  DAYS.forEach((d, i) => {
    const b = document.createElement('button');
    const best = progress.best[d.id];
    b.className = 'day' + (unlocked(i) ? '' : ' locked');
    b.innerHTML = `<span class="t">Day ${i + 1} · ${d.name}</span><span class="md">${best ? MEDAL[best.medal] : ''}</span>
      <span class="s">${d.sub} · ${fmtClock(d.start)}–${fmtClock(d.end)} · ${d.colony} sisters${best ? ` · best ${Math.round(best.nectar).toLocaleString()} mg` : ''}</span>`;
    b.onclick = () => unlocked(i) && play(i);
    box.appendChild(b);
  });
  startSim(Math.floor(Math.random() * DAYS.length), true);
  scene.setView(1);
  for (let k = 0; k < 60 * 50; k++) { botStep(sim, bot); step(sim); }
  sim.events.length = 0;
  scene.snapCam();
}

function endScreen(r) {
  mode = 'end';
  audio.end();
  $('toasts').innerHTML = '';
  const d = DAYS[idx];
  const prev = progress.best[d.id];
  if (!prev || r.nectar > prev.nectar) progress.best[d.id] = { nectar: r.nectar, medal: Math.max(r.medal, prev?.medal ?? 0) };
  else prev.medal = Math.max(prev.medal, r.medal);
  save();
  $('e-day').textContent = `DAY ${idx + 1} · ${d.name}`;
  $('e-title').textContent = ['The colony goes hungry', 'Bronze: the colony gets by', 'Silver: a good day', 'Gold: a honey flow'][r.medal];
  $('e-medal').textContent = r.medal ? MEDAL[r.medal] : '🌧';
  $('e-stats').innerHTML = [
    [Math.round(r.nectar).toLocaleString() + ' mg', `nectar · gold ${d.targets[2].toLocaleString()}`],
    [r.trips, 'loads home'], [r.recruits, 'sisters you recruited'], [r.lost, 'bees lost'],
  ].map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('');
  const max = Math.max(1, ...r.perPatch.map((p) => p.mg));
  $('e-patches').innerHTML = '<div class="k" style="margin-bottom:6px">WHERE IT CAME FROM</div>' + r.perPatch.map((p) =>
    `<div class="pbar"><span>${p.name}</span><div class="b" style="width:${Math.max(2, (p.mg / max) * 100)}%;background:${p.color};opacity:${p.mg ? 1 : 0.25}"></div><span class="v">${Math.round(p.mg)} mg${p.deaths ? ` · ☠${p.deaths}` : ''}</span></div>`).join('');
  $('e-next').classList.toggle('hidden', idx >= DAYS.length - 1 || r.medal === 0);
  $('end').classList.remove('hidden');
}
$('e-retry').onclick = () => play(idx);
$('e-next').onclick = () => play(idx + 1);
$('e-menu').onclick = () => menu();

// ---------------------------------------------------------------- input
const GAME_KEYS = new Set(['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
addEventListener('keydown', (e) => {
  if (mode !== 'play') return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  const P = sim.player;
  if (e.code === 'KeyE') { if (toggleHive(sim)) { if (!P.inHive) scene.snapCam(); } else hud.toast('Get closer to the hive entrance'); }
  if (e.code === 'KeyV') scene.cycleView();
  if (e.code === 'KeyM') hud.state.mapSunUp = !hud.state.mapSunUp;
  if (e.code === 'KeyG') { hud.state.assist = !hud.state.assist; hud.toast(hud.state.assist ? 'Dance guide on' : 'Dance guide off'); }
  if (e.code === 'Escape') menu();
  if (/^Digit[1-9]$/.test(e.code) && P.inHive) { const id = P.memOrder[+e.code.slice(5) - 1]; if (id) setDanceFor(sim, id); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const canvas = $('game');
canvas.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) mouseDX += e.movementX;
  mouseAim = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'play') return;
  audio.init();
  if (sim.player.inHive) { mouseDown = true; return; }
  if (!matchMedia('(pointer: coarse)').matches && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
addEventListener('mouseup', () => (mouseDown = false));
canvas.addEventListener('wheel', (e) => scene.zoom(e.deltaY > 0 ? 1.1 : 0.9), { passive: true });

// touch
const pad = $('pad'), nub = $('nub');
pad.addEventListener('pointermove', (e) => {
  if (!e.buttons && e.pointerType !== 'touch') return;
  const r = pad.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
  touch.turn = Math.max(-1, Math.min(1, x * 1.4)); touch.fwd = y < -0.4 ? 1 : y > 0.4 ? -1 : 0;
  nub.style.left = `${45 + x * 45}px`; nub.style.top = `${45 + y * 45}px`;
});
const padEnd = () => { touch.turn = 0; touch.fwd = 0; nub.style.left = nub.style.top = '45px'; };
pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd); pad.addEventListener('pointerleave', padEnd);
document.querySelectorAll('#tbtns button').forEach((b) => {
  const t = b.dataset.t;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.init(); if (t === 'hive') { toggleHive(sim); scene.snapCam(); } else touch[t] = true; });
  const off = () => { if (t !== 'hive') touch[t] = false; };
  b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
canvas.addEventListener('touchstart', (e) => { if (sim?.player.inHive) { const t = e.touches[0]; mouseAim = { x: t.clientX, y: t.clientY }; } }, { passive: true });
canvas.addEventListener('touchmove', (e) => { if (sim?.player.inHive) { const t = e.touches[0]; mouseAim = { x: t.clientX, y: t.clientY }; } }, { passive: true });

function readInput(dt) {
  const I = sim.input, P = sim.player, k = (c) => keys.has(c);
  if (P.inHive) {
    const D = sim.dance;
    if (k('KeyA') || k('ArrowLeft')) { I.aim -= 90 * dt; mouseAim = null; }
    if (k('KeyD') || k('ArrowRight')) { I.aim += 90 * dt; mouseAim = null; }
    if (mouseAim && D) {
      const c = scene.projectComb(D.x, D.y);
      const dx = mouseAim.x - c.x, dy = mouseAim.y - c.y;
      if (Math.hypot(dx, dy) > 12) I.aim = Math.atan2(dx, -dy) / D2R;
    }
    I.waggle = k('Space') || mouseDown || touch.waggle;
    I.turn = 0; I.climb = 0;
    if (document.pointerLockElement) document.exitPointerLock?.();
    return;
  }
  let turn = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + touch.turn;
  if (document.pointerLockElement === canvas) { turn += Math.max(-1, Math.min(1, mouseDX * 0.06)); mouseDX *= 0.5; }
  I.turn = Math.max(-1, Math.min(1, turn));
  I.fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + touch.fwd;
  I.boost = k('ShiftLeft') || k('ShiftRight');
  I.climb = (k('Space') || touch.up ? 1 : 0) - (k('KeyC') || k('ControlLeft') || touch.down ? 1 : 0);
  I.waggle = false;
}

// ---------------------------------------------------------------- events
function drain() {
  for (const e of sim.events) {
    if (mode !== 'play') continue;
    const P = sim.player;
    switch (e.type) {
      case 'taste': {
        const p = sim.patches.find((p) => p.id === e.id);
        if (e.toxic) { hud.toast(`<b>${p.name}</b>: sweet, but bitter underneath. <b>Sprayed.</b> Do not dance this.`, 'bad', 5); audio.bad(); }
        else if (!e.open) { hud.toast(`<b>${p.name}</b> ${hud.stars(p.q)}: not yielding now. It blooms ${fmtClock(p.open[0])}–${fmtClock(Math.min(p.open[1], 24))}`, '', 4); audio.miss(); }
        else { hud.toast(`<b>${p.name}</b> ${hud.stars(p.q)}${e.first ? ': remembered. Fly home and dance it' : ''}${p.hornet ? '. <b>Hornets are hunting here</b>' : ''}`, p.hornet ? 'bad' : 'good', 4); audio.taste(p.q); }
        break;
      }
      case 'enter': audio.enter(); if (!sim.danceStats.runs) hud.toast('On the comb. <b>Up is the sun.</b> Aim and hold to waggle', '', 4); break;
      case 'recruit': audio.recruit(); break;
      case 'found': {
        audio.found(); scene.marker(e.ex, e.ez, true);
        const p = sim.patches.find((p) => p.id === e.id);
        hud.toast(`A recruit found <b>${p.name}</b>${p.toxic ? ' <b>(sprayed!)</b>' : ''} · ${Math.round(e.err)} m from where you said`, p.toxic ? 'bad' : 'good', 3);
        break;
      }
      case 'miss': audio.miss(); scene.marker(e.ex, e.ez, false); hud.toast('A recruit searched where you said and found nothing', 'bad', 3); break;
      case 'death': if (sim.bees.filter((b) => b.s === 'dead').length % 5 === 1) { hud.toast(e.cause === 'poison' ? 'Foragers are dying on the sprayed field' : 'A hornet took a forager at the bramble', 'bad', 3); audio.bad(); } break;
      case 'exhausted': hud.toast('Your crop is empty. Find open flowers to sip', 'bad', 4); break;
      case 'dusk': hud.toast('The light is going. Foragers are coming home', '', 4); break;
      case 'end': setTimeout(() => endScreen(e), 600); break;
    }
  }
  sim.events.length = 0;
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (sim && !frozen) {
    const fast = mode === 'play' && keys.has('Tab') ? 4 : mode === 'menu' ? 3 : 1;
    if (mode === 'play') readInput(dt);
    acc += dt * fast;
    let n = 0;
    while (acc >= DT && n < 40 && !sim.result) {
      if (bot) botStep(sim, bot);
      step(sim); acc -= DT; n++;
    }
    if (sim.result && mode === 'menu') { startSim(Math.floor(Math.random() * DAYS.length), true); scene.setView(1); }
    drain();
  }
  if (sim) {
    scene.frame(dt);
    if (mode !== 'menu') hud.update(sim, scene);
    audio.update(sim, mode !== 'play');
  }
  requestAnimationFrame(loop);
}
menu();
requestAnimationFrame(loop);

// screenshot / test hooks
window.__waggle = {
  get sim() { return sim; },
  play, menu, unlockAll() { allOpen = true; },
  freeze(f) { frozen = f; },
  botOn(m = 'expert') { bot = createBot({ mode: m }); },
  botOff() { bot = null; },
  advance(sec) { for (let k = 0; k < sec / DT && !sim.result; k++) { if (bot) botStep(sim, bot); step(sim); } sim.events.length = 0; },
  until(fn, max = 3600) { for (let k = 0; k < max * 60 && !fn(sim) && !sim.result; k++) { if (bot) botStep(sim, bot); step(sim); } sim.events.length = 0; },
  frame(n = 1) { for (let i = 0; i < n; i++) scene.frame(1 / 60); hud.update(sim, scene); },
  snap() { scene.snapCam(); },
  view(i) { scene.setView(i); },
  hud, scene, endScreen,
};
