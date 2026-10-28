import { createSim, step, whistle, DT, PHASE_NAME, CMDS } from './sim.js';
import { COURSES } from './courses.js';
import { createBot, botWhistle } from './bot.js';
import { createScene } from './scene.js';
import { createAudio } from './audio.js';
import { createHud, fmtClock } from './hud.js';

const $ = (id) => document.getElementById(id);
const scene = createScene($('game'));
const audio = createAudio();
const hud = createHud();

const SAVE = 'hirsel.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || { best: {} }; } catch { return { best: {} }; } };
const save = (s) => { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch {} };
let progress = load();

let sim = null, bot = null, idx = 0, mode = 'menu', acc = 0, endTimer = 0, frozen = false, assist = true, fast = false;
const KEYMAP = { KeyD: 'comebye', KeyA: 'away', KeyW: 'walk', KeyS: 'lie', KeyQ: 'steady', KeyE: 'getout', Space: 'inhere', KeyF: 'thatlldo' };

function startSim(i, demo) {
  idx = i;
  sim = createSim(COURSES[i], { seed: demo ? 1 + Math.floor(Math.random() * 1000) : 1 });
  bot = demo ? createBot() : null;
  scene.load(sim);
  scene.setLabels(!demo);
  hud.setCourse(sim);
  acc = 0; endTimer = 0;
}

function play(i) {
  audio.init();
  mode = 'play';
  startSim(i, false);
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  hud.show(true);
  hud.toast(COURSES[i].name, `${COURSES[i].grade} · ${COURSES[i].sheep} ewes · ${fmtClock(COURSES[i].timeLimit)} on the clock`, 2.6);
}

function menu() {
  mode = 'menu';
  $('end').classList.add('hidden');
  $('menu').classList.remove('hidden');
  hud.show(false);
  renderCourses();
  startSim(Math.floor(Math.random() * COURSES.length), true);
  scene.setCam('dog');
}

let allOpen = false;
const unlocked = (i) => allOpen || i === 0 || !!progress.best[COURSES[i - 1].id]?.placing;
const rosClass = (p) => (p === '1st' ? 'r1' : p === '2nd' ? 'r2' : p === '3rd' ? 'r3' : '');

function renderCourses() {
  const box = $('courses');
  box.innerHTML = '';
  COURSES.forEach((c, i) => {
    const best = progress.best[c.id];
    const b = document.createElement('button');
    b.className = 'cv';
    b.disabled = !unlocked(i);
    const max = Object.values(c.phases).reduce((a, v) => a + v, 0);
    b.innerHTML = `<span class="n">${c.grade}</span><span class="t">${c.name}</span><span class="b">${c.blurb}</span>
      <span class="m"><span>${c.sheep} ewes · ${fmtClock(c.timeLimit)}</span><span><i class="ros ${rosClass(best?.placing)}"></i>${best ? `${best.score}/${max}` : b.disabled ? 'place on the last course' : '—'}</span></span>`;
    b.onclick = () => play(i);
    box.appendChild(b);
  });
}

function showEnd() {
  const R = sim.result, c = COURSES[idx];
  mode = 'end';
  hud.hideToast();
  const prev = progress.best[c.id];
  if (R.why === 'penned' && (!prev || R.score > prev.score)) { progress.best[c.id] = { score: R.score, placing: R.placing }; save(progress); }
  const ro = $('end-rosette');
  ro.className = R.placing ? rosClass(R.placing) : 'none';
  ro.textContent = R.placing || (R.why === 'penned' ? 'Unplaced' : R.why === 'time' ? 'Time' : 'Retired');
  $('end-title').textContent = R.why === 'penned' ? 'Penned' : R.why === 'time' ? 'Time' : 'Retired';
  const pct = Math.round(R.pct * 100);
  $('end-sub').textContent = R.why === 'penned'
    ? `${R.score} of ${R.max} in ${fmtClock(R.time)}. ${R.placing ? `That places ${R.placing}.` : 'You need 55% to be placed.'}`
    : R.why === 'time' ? `The judge called time. Phases not finished score nothing: ${R.score} of ${R.max} (${pct}%).` : `You retired with ${R.score} of ${R.max}.`;
  $('end-card').innerHTML = R.card.map((r) => `<div class="row"><span>${PHASE_NAME[r.phase]}${r.done ? '' : ' (not finished)'}</span><span><b>${r.got}</b>/${r.max}</span></div>`).join('')
    + `<div class="row total"><span>Total</span><span><b>${R.score}</b>/${R.max}</span></div>`;
  const nextOk = R.placing && idx < COURSES.length - 1;
  $('btn-next').classList.toggle('hidden', !nextOk);
  $('end').classList.remove('hidden');
}

function toastFor(events) {
  for (const e of events) {
    if (e.type === 'phase') {
      if (e.phase !== 'outrun') hud.toast(PHASE_NAME[e.phase], '', 1.4);
    } else if (e.type === 'gate') hud.toast(e.ok ? 'Through the gate' : 'Missed the gate', '', 1.6);
    else if (e.type === 'shed') hud.toast('Shed', 'the judge has seen it', 1.8);
    else if (e.type === 'penned') hud.toast('Penned', '', 2.2);
    else if (e.type === 'whistle' && e.lost) hud.flashLost();
    else if (e.type === 'over' && e.why === 'time') hud.toast('Time', '', 2.2);
  }
}

function send(cmd) {
  if (mode !== 'play' || !sim || sim.result) return;
  audio.init();
  whistle(sim, cmd);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sim && !frozen) {
    acc += dt * (fast && mode === 'play' ? 3 : 1);
    let k = 0;
    while (acc >= DT && k < 30) {
      if (bot) { const c = botWhistle(sim, bot); if (c) whistle(sim, c); }
      step(sim);
      acc -= DT; k++;
    }
    const events = sim.events.splice(0);
    scene.sync(sim, dt, events);
    if (mode !== 'menu') { audio.events(events); toastFor(events); hud.update(sim, dt, assist); audio.update(sim, dt); }
    if (sim.result) {
      endTimer += dt;
      if (mode === 'menu' && endTimer > 4) { startSim(Math.floor(Math.random() * COURSES.length), true); }
      else if (mode === 'play' && endTimer > 2.2) showEnd();
    }
  }
  scene.render();
  requestAnimationFrame(frame);
}

addEventListener('keydown', (e) => {
  if (e.repeat && KEYMAP[e.code]) { e.preventDefault(); return; }
  if (KEYMAP[e.code]) { send(KEYMAP[e.code]); e.preventDefault(); return; }
  if (e.code === 'Tab') { fast = true; $('ff').classList.toggle('hidden', mode !== 'play'); e.preventDefault(); }
  if (e.code === 'KeyR' && mode !== 'menu') play(idx);
  if (e.code === 'Escape') menu();
  if (e.code === 'KeyC' && mode === 'play') { const order = ['post', 'judge', 'dog']; scene.setCam(order[(order.indexOf(scene.camMode) + 1) % 3]); hud.toast({ post: 'From the post', judge: "Judge's view", dog: 'With the dog' }[scene.camMode], '', 1); }
  if (e.code === 'KeyH' && mode === 'play') { assist = !assist; scene.setAssist(assist); hud.toast(assist ? "Handler's eye on" : "Handler's eye off", assist ? 'balance point, judge\'s line, flock trail' : '', 1.2); }
  if (e.code === 'Enter' && mode === 'end' && sim.result?.placing && idx < COURSES.length - 1) play(idx + 1);
});
addEventListener('keyup', (e) => { if (e.code === 'Tab') { fast = false; $('ff').classList.add('hidden'); } });
addEventListener('blur', () => { fast = false; $('ff').classList.add('hidden'); });
addEventListener('wheel', (e) => { if (mode === 'play') scene.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: true });

document.querySelectorAll('#whistles button').forEach((b) => {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); send(b.dataset.cmd); });
});
$('btn-retry').onclick = () => play(idx);
$('btn-next').onclick = () => play(idx + 1);
$('btn-menu').onclick = menu;
$('mute').onclick = () => { audio.setMuted(!audio.muted); $('mute').textContent = `Sound: ${audio.muted ? 'off' : 'on'}`; };

// Hooks for the screenshot script.
window.__hirsel = {
  get sim() { return sim; },
  get mode() { return mode; },
  play, menu, CMDS,
  unlockAll() { allOpen = true; renderCourses(); },
  advance(seconds, withBot = true) {
    if (withBot && !bot) bot = createBot();
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n && !sim.result; i++) {
      if (withBot) { const c = botWhistle(sim, bot); if (c) whistle(sim, c); }
      step(sim);
    }
  },
  until(fn, maxSeconds = 900) {
    if (!bot) bot = createBot();
    for (let i = 0; i < maxSeconds / DT && !sim.result && !fn(sim); i++) { const c = botWhistle(sim, bot); if (c) whistle(sim, c); step(sim); }
  },
  freeze(f) { frozen = f; },
  setBot(b) { bot = b ? createBot() : null; },
  setCam(m) { scene.setCam(m); },
  hideToast() { hud.hideToast(); },
  frame(snap, draw = true) {
    if (snap) scene.resetCamera();
    const ev = sim.events.splice(0);
    scene.sync(sim, 1 / 60, ev);
    toastFor(ev);
    hud.update(sim, 1 / 60, assist);
    if (draw) scene.render();
  },
  showEnd,
};

menu();
requestAnimationFrame(frame);
