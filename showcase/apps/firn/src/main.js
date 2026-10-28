import { createSim, step, DT, medalFor, PROPS } from './sim.js';
import { LEVELS } from './levels.js';
import { botInput } from './bot.js';
import { createScene } from './scene.js';
import { createAudio } from './audio.js';
import { createHud, fmtEnergy, fmtMass, PROP_ONE } from './hud.js';

const $ = (id) => document.getElementById(id);
const scene = createScene($('game'));
const audio = createAudio();
const hud = createHud();

const SAVE = 'firn.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || { best: {} }; } catch { return { best: {} }; } };
const save = (s) => { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch {} };
let progress = load();

let sim = null, levelIdx = 0, mode = 'menu', acc = 0, endTimer = 0, botOn = false, frozen = false;
const keys = new Set();
const touches = new Map();

function startSim(i, demo) {
  levelIdx = i;
  sim = createSim(LEVELS[i]);
  scene.load(sim);
  hud.setLevel(LEVELS[i]);
  botOn = demo;
  acc = 0;
  endTimer = 0;
}

function play(i) {
  audio.init();
  mode = 'play';
  startSim(i, false);
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  hud.show(true);
  hud.toast(LEVELS[i].name, LEVELS[i].blurb, 2.6);
}

function menu() {
  mode = 'menu';
  $('end').classList.add('hidden');
  $('menu').classList.remove('hidden');
  hud.show(false);
  renderLevels();
  startSim(0, true);
}

let allOpen = false;
const unlocked = (i) => allOpen || i === 0 || (progress.best[LEVELS[i - 1].id] ?? 0) >= 1;

function renderLevels() {
  const box = $('levels');
  box.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const best = progress.best[L.id];
    const medal = medalFor(best) || 'none';
    const b = document.createElement('button');
    b.className = 'lv';
    b.disabled = !unlocked(i);
    b.innerHTML = `<span class="n">RUN ${i + 1}</span><span class="t">${L.name}</span><span class="b">${L.blurb}</span>
      <span class="m"><span>${L.length} m · ice ${fmtEnergy(L.eReq)}</span><span><i class="medal ${medal}"></i>${best ? '×' + best.toFixed(1) : b.disabled ? 'locked' : '—'}</span></span>`;
    b.onclick = () => play(i);
    box.appendChild(b);
  });
}

function showEnd() {
  const R = sim.result, L = LEVELS[levelIdx];
  mode = 'end';
  if (R.ok) {
    const prev = progress.best[L.id] ?? 0;
    if (R.ratio > prev) { progress.best[L.id] = R.ratio; save(progress); }
    audio.medal();
  }
  const m = $('end-medal');
  m.className = R.ok ? R.medal : 'fail';
  m.textContent = R.ok ? R.medal.toUpperCase() : '—';
  const why = {
    broke: `You hit the ice with ${fmtEnergy(R.energy)}, ×${R.ratio.toFixed(2)} its rating.`,
    splat: `You hit the ice with ${fmtEnergy(R.energy)}, ×${R.ratio.toFixed(2)} of the ${fmtEnergy(L.eReq)} it takes. You need more mass or more speed.`,
    stalled: 'You stopped moving. Deep powder grows you, but it also brakes you.',
    melted: 'You wore away to nothing. Rock and warm air both take snow off you.',
    bypassed: 'You went round the ice.',
  }[R.why];
  $('end-title').textContent = R.ok ? 'Through the ice' : R.why === 'splat' ? 'Splat' : R.why === 'stalled' ? 'Stalled' : 'Gone';
  $('end-sub').textContent = why;
  const s = sim.stats;
  $('end-stats').innerHTML = [
    ['Max diameter', `${(s.maxR * 2).toFixed(2)} m`], ['Mass', fmtMass(sim.mass())], ['Top speed', `${(s.maxV * 3.6).toFixed(0)} km/h`],
    ['Picked up', s.absorbed], ['Smashed', s.smashed], ['Bounced', s.bounced],
  ].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('btn-next').classList.toggle('hidden', !(R.ok && levelIdx < LEVELS.length - 1));
  $('end').classList.remove('hidden');
}

function readInput() {
  let l = keys.has('ArrowLeft') || keys.has('KeyA'), r = keys.has('ArrowRight') || keys.has('KeyD');
  let brake = keys.has('ArrowDown') || keys.has('KeyS');
  let tl = false, tr = false;
  for (const x of touches.values()) { if (x < window.innerWidth / 2) tl = true; else tr = true; }
  if (tl && tr) brake = true;
  else { l ||= tl; r ||= tr; }
  return { steer: (r ? 1 : 0) - (l ? 1 : 0), tuck: keys.has('ArrowUp') || keys.has('KeyW'), brake };
}

function toastFor(events) {
  for (const e of events) {
    if (e.type === 'smash' && PROPS[e.prop.kind].absorbR >= 2) hud.toast(`Flattened a ${PROP_ONE[e.prop.kind]}`, fmtEnergy(e.energy));
    else if (e.type === 'shed' && e.why === 'landing') hud.toast('Heavy landing', `lost ${fmtMass(e.amount)}`);
    else if (e.type === 'bounce' && e.speed > 6) hud.toast(`Bounced off a ${PROP_ONE[e.prop.kind]}`, 'too small to move it');
    else if (e.type === 'curtain') { hud.toast('THROUGH THE ICE', `×${e.ratio.toFixed(2)}`, 2.4); hud.flash(); }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sim && !frozen) {
    acc += dt;
    let k = 0;
    while (acc >= DT && k < 24) {
      if (botOn) { if (k % 6 === 0) sim.input = botInput(sim); }
      else sim.input = readInput();
      step(sim);
      acc -= DT; k++;
    }
    const events = sim.events.splice(0);
    scene.sync(sim, dt, events);
    if (mode !== 'menu') { audio.events(events); toastFor(events); hud.update(sim, dt); audio.update(sim); }
    if (sim.phase === 'over') {
      endTimer += dt;
      if (mode === 'menu' && endTimer > 2) startSim(0, true);
      else if (mode === 'play' && endTimer > 1.3) showEnd();
    }
  }
  scene.render();
  requestAnimationFrame(frame);
}

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyR' && mode !== 'menu') play(levelIdx);
  if (e.code === 'Escape') menu();
  if (e.code === 'Enter' && mode === 'end' && sim.result?.ok && levelIdx < LEVELS.length - 1) play(levelIdx + 1);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const canvas = $('game');
canvas.addEventListener('pointerdown', (e) => { if (mode === 'play') touches.set(e.pointerId, e.clientX); });
canvas.addEventListener('pointermove', (e) => { if (touches.has(e.pointerId)) touches.set(e.pointerId, e.clientX); });
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(t, (e) => touches.delete(e.pointerId));

$('btn-retry').onclick = () => play(levelIdx);
$('btn-next').onclick = () => play(levelIdx + 1);
$('btn-menu').onclick = menu;
$('mute').onclick = () => { audio.setMuted(!audio.muted); $('mute').textContent = `Sound: ${audio.muted ? 'off' : 'on'}`; };

// Hooks for the screenshot script.
window.__firn = {
  get sim() { return sim; },
  get mode() { return mode; },
  play, menu,
  unlockAll() { allOpen = true; renderLevels(); },
  advance(seconds, withBot = true) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n && sim.phase !== 'over'; i++) {
      if (withBot && i % 6 === 0) sim.input = botInput(sim);
      step(sim);
    }
  },
  freeze(f) { frozen = f; },
  hideToast() { document.getElementById('toast').classList.remove('on'); },
  setBot(b) { botOn = b; },
  frame(snap, draw = true) { if (snap) scene.resetCamera(); const ev = sim.events.splice(0); scene.sync(sim, 1 / 60, ev); toastFor(ev); hud.update(sim, 1 / 60); if (draw) scene.render(); },
};

menu();
requestAnimationFrame(frame);
