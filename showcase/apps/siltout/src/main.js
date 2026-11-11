import { createSim, step, DT, forwardOf } from './sim.js';
import { SITES } from './sites.js';
import { createScene } from './scene.js';
import { createHud, drawMap } from './hud.js';
import { createAudio } from './audio.js';
import { makeBot, botStep } from './bot.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const V = createScene(canvas);
const HUD = createHud();
const A = createAudio();

let S = null, bot = null, paused = true, frozen = false, last = performance.now(), acc = 0, inhaled = false;
const keys = new Set();
const touchHold = { kick: false, up: false, down: false, line: false };
let flutterToggle = false;

const bestKey = (i) => `siltout.best.${SITES[i].id}`;
const getBest = (i) => { try { return JSON.parse(localStorage.getItem(bestKey(i)) || 'null'); } catch { return null; } };
const setBest = (i, r) => { try { localStorage.setItem(bestKey(i), JSON.stringify(r)); } catch { /* storage unavailable */ } };
const MEDAL_RANK = { fail: 0, bronze: 1, silver: 2, gold: 3 };

function renderSites() {
  const el = $('sites');
  el.innerHTML = '';
  SITES.forEach((s, i) => {
    const depths = s.nodes.map((n) => -n.p[1]);
    const b = getBest(i);
    const card = document.createElement('button');
    card.className = 'site';
    card.innerHTML = `<div class="num">SITE ${i + 1}</div><h3>${s.name}</h3><p>${s.blurb}</p>
      <div class="stats"><span>${Math.min(...depths).toFixed(0)}–${Math.max(...depths).toFixed(0)} m</span><span>${s.gas} bar</span><span>${s.reel} m reel</span>
      <span>${s.flowLabel}</span><span>${s.silt >= 0.8 ? 'clay silt' : 'sand'}</span>${s.perm ? '<span>gold line</span>' : ''}${s.lightFail ? '<span>light failure</span>' : ''}</div>
      <div class="best">${b ? `Best: ${b.medal.toUpperCase()} · ${b.score}` : '&nbsp;'}</div>`;
    card.addEventListener('click', () => start(i));
    el.appendChild(card);
  });
}

function show(id) {
  for (const s of ['title', 'pause', 'result', 'loading']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', !(id === null || id === 'pause'));
}

function start(i) {
  A.start();
  show('loading');
  setTimeout(() => {
    S = createSim(i);
    V.build(S);
    HUD.begin(S);
    bot = null;
    paused = false;
    show(null);
    if (i === 0) setTimeout(() => S && S.t < 20 && HUD.toast('Tie your primary on the orange-flagged knob below you (E)', 'info'), 600);
    canvas.requestPointerLock?.();
  }, 30);
}

function finishScreen() {
  const r = S.result;
  paused = true;
  document.exitPointerLock?.();
  $('medal').className = r.medal;
  $('medal').textContent = r.medal === 'fail' ? 'LOST' : r.medal.toUpperCase();
  $('res-title').textContent = r.exited ? (r.objective ? `${S.site.goal} and back` : 'Surfaced without the objective') : r.reason || 'Dive failed';
  $('res-sub').textContent = `${S.site.name} · ${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')} · max ${S.stats.maxDepth.toFixed(1)} m · ${Math.round(r.gas)} bar left`;
  const tb = $('res-rows');
  tb.innerHTML = r.rows.map(([l, v]) => `<tr class="${v < 0 ? 'neg' : ''}"><td>${l}</td><td>${v > 0 ? '+' : ''}${v}</td></tr>`).join('') + `<tr class="total"><td>Score</td><td>${r.score}</td></tr>`;
  const b = getBest(S.siteIndex);
  if (!b || MEDAL_RANK[r.medal] > MEDAL_RANK[b.medal] || (r.medal === b.medal && r.score > b.score)) setBest(S.siteIndex, { medal: r.medal, score: r.score });
  $('r-next').classList.toggle('hidden', S.siteIndex >= SITES.length - 1);
  show('result');
  requestAnimationFrame(() => drawMap($('map'), S));
  if (r.medal !== 'fail') A.good();
}

function handleEvents() {
  for (const e of S.events) {
    if (e.type === 'toast') HUD.toast(e.text, e.kind);
    else if (e.type === 'bubble') { V.bubble(e.p); A.exhale(); inhaled = false; }
    else if (e.type === 'contact') A.contact(e.floor);
    else if (e.type === 'tie') A.tie();
    else if (e.type === 'untie') A.reel();
    else if (e.type === 'arrow') { HUD.arrow(e.ahead); A.arrow(); }
    else if (e.type === 'break') A.snap();
    else if (e.type === 'lightfail') { V.flicker = 1.2; A.click(); }
    else if (e.type === 'objective') A.good();
    else if (e.type === 'done' && !frozen) setTimeout(finishScreen, 900);
  }
  S.events.length = 0;
}

function readInput() {
  const I = S.input;
  const k = (c) => keys.has(c);
  I.fwd = k('KeyW') || touchHold.kick ? 1 : 0;
  I.back = k('KeyS') ? 1 : 0;
  I.flutter = k('ShiftLeft') || k('ShiftRight') || flutterToggle;
  I.yaw = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  I.pitch = (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0);
  I.inflate = k('KeyR') || touchHold.up;
  I.dump = k('KeyF') || touchHold.down;
  I.touch = k('KeyG') || touchHold.line;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S && !paused && !frozen) {
    acc += dt;
    while (acc >= DT) {
      if (bot) botStep(S, bot); else readInput();
      step(S, DT);
      acc -= DT;
      if (S.done) break;
    }
    if (!inhaled && S.diver.breath > 0.55) { inhaled = true; A.inhale(S.diver.vis < 2.5 ? 1.3 : 1); }
    A.tick(dt, S.diver.vis < 2 || (S.reel.broken && S.stats.left) ? 2 : 1);
    handleEvents();
  }
  if (S) { V.render(S, dt); HUD.update(S); }
  requestAnimationFrame(frame);
}

addEventListener('keydown', (e) => {
  if (e.repeat && !['KeyW', 'KeyS'].includes(e.code)) { keys.add(e.code); return; }
  keys.add(e.code);
  if (!S || S.done) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
  if (paused) return;
  if (e.code === 'KeyE') S.actions.push('tie');
  if (e.code === 'KeyQ') S.actions.push('untie');
  if (e.code === 'KeyB') S.actions.push('light');
  if (e.code === 'KeyV') V.mode = V.mode === 0 ? 1 : 0;
  if (e.code === 'KeyM') $('p-sound').textContent = `Sound: ${A.mute() ? 'on' : 'off'}`;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function togglePause() {
  if (!S || S.done) return;
  paused = !paused;
  show(paused ? 'pause' : null);
  if (paused) document.exitPointerLock?.(); else canvas.requestPointerLock?.();
}
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && S && !S.done && !paused && !frozen && !bot) { paused = true; show('pause'); }
});
canvas.addEventListener('click', () => { if (S && !paused) canvas.requestPointerLock?.(); });
addEventListener('mousemove', (e) => {
  if (!S || paused || document.pointerLockElement !== canvas) return;
  S.diver.yaw += e.movementX * 0.0024;
  S.diver.pitch = Math.max(-1.35, Math.min(1.35, S.diver.pitch - e.movementY * 0.0024));
});

// Touch: drag anywhere outside the buttons to look.
let tid = null, tx = 0, ty = 0;
canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; tid = t.identifier; tx = t.clientX; ty = t.clientY; A.start(); }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) if (t.identifier === tid && S) {
    S.diver.yaw += (t.clientX - tx) * 0.006;
    S.diver.pitch = Math.max(-1.35, Math.min(1.35, S.diver.pitch - (t.clientY - ty) * 0.006));
    tx = t.clientX; ty = t.clientY;
  }
}, { passive: true });
const hold = (id, key) => {
  const b = $(id);
  const on = (v) => (e) => { e.preventDefault(); touchHold[key] = v; b.classList.toggle('on', v); };
  b.addEventListener('pointerdown', on(true));
  b.addEventListener('pointerup', on(false));
  b.addEventListener('pointerleave', on(false));
  b.addEventListener('pointercancel', on(false));
};
hold('t-kick', 'kick'); hold('t-up', 'up'); hold('t-down', 'down'); hold('t-line', 'line');
$('t-flutter').addEventListener('click', () => { flutterToggle = !flutterToggle; $('t-flutter').classList.toggle('on', flutterToggle); });
$('t-tie').addEventListener('click', () => S?.actions.push('tie'));
$('t-untie').addEventListener('click', () => S?.actions.push('untie'));
$('t-light').addEventListener('click', () => S?.actions.push('light'));
$('t-cam').addEventListener('click', () => { V.mode = V.mode === 0 ? 1 : 0; });

$('p-resume').addEventListener('click', togglePause);
$('p-restart').addEventListener('click', () => start(S.siteIndex));
$('p-menu').addEventListener('click', () => { S = null; renderSites(); show('title'); });
$('p-sound').addEventListener('click', () => { $('p-sound').textContent = `Sound: ${A.mute() ? 'on' : 'off'}`; });
$('r-retry').addEventListener('click', () => start(S.siteIndex));
$('r-next').addEventListener('click', () => start(Math.min(SITES.length - 1, S.siteIndex + 1)));
$('r-menu').addEventListener('click', () => { S = null; renderSites(); show('title'); });

renderSites();
show('title');

// A slow drift through Pell Spring sits behind the title screen.
{
  const T = createSim(0);
  V.build(T);
  T.diver.pos = [30, -9.2, -1.5]; T.diver.yaw = 0.05; T.diver.pitch = -0.05;
  V.mode = 0;
  S = T;
  paused = true;
  const drift = () => { if (S === T && paused) { T.diver.yaw += 0.0007; } if (S === T) requestAnimationFrame(drift); };
  drift();
}
requestAnimationFrame(frame);

// Hooks for scripted screenshots and debugging.
window.__siltout = {
  get S() { return S; }, scene: V, SITES,
  play(i) { S = createSim(i); V.build(S); HUD.begin(S); bot = null; paused = false; show(null); return S; },
  freeze(b) { frozen = b; },
  botOn(kind = 'expert') { if (!S.bot || S.bot.kind !== kind) S.bot = makeBot(kind); bot = S.bot; },
  botOff() { bot = null; for (const k in S.input) S.input[k] = typeof S.input[k] === 'boolean' ? false : 0; },
  until(fn, max = 60 * 900) {
    for (let i = 0; i < max && !S.done && !fn(S); i++) {
      if (bot) botStep(S, bot);
      step(S, DT);
      for (const e of S.events) if (e.type === 'bubble') V.bubble(e.p);
      S.events.length = 0;
    }
  },
  frame(n = 1) { for (let i = 0; i < n; i++) { V.render(S, 1 / 60); HUD.update(S); } },
  view(mode, free) { V.mode = mode; V.cam.free = free || null; },
  finish() { finishScreen(); },
  forwardOf,
};
