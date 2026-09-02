import * as THREE from '../vendor/three.module.js';
import { createScene } from './scene.js';
import { WebModel, STRAND_TYPES, NODE_COST } from './webmodel.js';
import { WebView } from './webview.js';
import { Spider } from './spider.js';
import { PreySystem, SPECIES } from './prey.js';
import { Builder } from './build.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';

const NIGHTS = 8;
const SILK_MAX = 160;
const BEST_KEY = 'silkfall.best';

// Each night names its own pressure. Composition matters more than raw counts:
// a beetle night punishes long unsupported frames, a wasp night punishes
// building yourself into a corner with no dragline escape.
const NIGHT_PLAN = [
  { quota: 14, dur: 68, spawn: 2.4, weights: { midge: 8, moth: 2 }, wasps: 0, gusts: 0, note: 'Still air. Nothing hunts you yet.' },
  { quota: 22, dur: 74, spawn: 2.1, weights: { midge: 6, moth: 5 }, wasps: 0, gusts: 1, note: 'Wind is getting up. Long spans will suffer.' },
  { quota: 32, dur: 78, spawn: 1.9, weights: { midge: 5, moth: 6, beetle: 1 }, wasps: 1, gusts: 1, note: 'A wasp is working this stretch of wood.' },
  { quota: 44, dur: 82, spawn: 1.7, weights: { midge: 4, moth: 6, beetle: 3 }, wasps: 1, gusts: 2, note: 'Beetles. They do not stop struggling.' },
  { quota: 58, dur: 86, spawn: 1.5, weights: { midge: 3, moth: 7, beetle: 4 }, wasps: 2, gusts: 2, note: 'Two wasps. Keep a line to drop on.' },
  { quota: 74, dur: 90, spawn: 1.35, weights: { midge: 3, moth: 7, beetle: 6 }, wasps: 2, gusts: 3, note: 'The gap is busy. So is everything that eats spiders.' },
  { quota: 92, dur: 94, spawn: 1.2, weights: { midge: 2, moth: 7, beetle: 8 }, wasps: 3, gusts: 3, note: 'Hard wind, heavy prey. Triangulate or lose the web.' },
  { quota: 112, dur: 100, spawn: 1.05, weights: { midge: 2, moth: 6, beetle: 10 }, wasps: 3, gusts: 4, note: 'Last night before the cold. Take everything.' },
];

const canvas = document.getElementById('game');
const { renderer, scene, camera, resize, updateAmbient } = createScene(canvas);
const model = new WebModel();
const view = new WebView(scene, model);
const spider = new Spider(scene, model);
const audio = new Audio();
const prey = new PreySystem(scene, model, spider, audio, view);
const builder = new Builder(model, view, audio);
const input = new Input(canvas);
const hud = new Hud();

const state = {
  phase: 'title', // title | dusk | night | dawn | over | paused
  night: 1,
  silk: 80,
  food: 0,
  score: 0,
  caught: { midge: 0, moth: 0, beetle: 0, wasp: 0 },
  escaped: 0,
  snapped: 0,
  timeLeft: 0,
  spawnTimer: 0,
  waspsLeft: 0,
  waspTimer: 0,
  gustsLeft: 0,
  gustTimer: 0,
  gustWarn: 0,
  gustActive: 0,
  gustDir: 1,
  wind: { x: 0, z: 0 },
  wrapping: null,
  won: false,
  prevPhase: null,
};

let best = Number(localStorage.getItem(BEST_KEY) || 0);
document.getElementById('best-score').textContent = best;

/* ------------------------------------------------------------------ */
/* Anchors and the starting frame                                      */
/* ------------------------------------------------------------------ */

function buildAnchors() {
  const anchors = [];
  const add = (x, y) => anchors.push(model.addNode(x, y, 0, true));
  // Left and right branches
  for (let i = 0; i < 5; i++) add(-18.2 + i * 0.22, -7 + i * 5.0);
  for (let i = 0; i < 5; i++) add(18.0 - i * 0.2, -8 + i * 5.2);
  // Upper branch
  for (let i = 0; i < 5; i++) add(-14 + i * 7, 14.4 - Math.abs(i - 2) * 0.5);
  // Lower branch
  for (let i = 0; i < 4; i++) add(-12 + i * 6.4, -12.2 + Math.abs(i - 1.5) * 0.4);
  return anchors;
}

// The player starts with a bare frame: walkable, structurally sound, and
// catching absolutely nothing. Learning that capture silk is the point takes
// about ten seconds this way and needs no tutorial text.
function startingWeb() {
  model.nodes.length = 0;
  model.strands.length = 0;
  model.pulses.length = 0;
  const anchors = buildAnchors();
  const pick = (x, y) => {
    let best = anchors[0];
    let bd = Infinity;
    for (const a of anchors) {
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  };

  const tl = pick(-18, 12);
  const tr = pick(18, 12);
  const bl = pick(-18, -7);
  const br = pick(18, -8);
  const top = pick(0, 14.4);
  const bottom = pick(-6, -12.2);

  const hub = model.addNode(0, 1.5, 0, false);
  model.addStrand(tl, tr, 'frame');
  model.addStrand(tl, bl, 'frame');
  model.addStrand(tr, br, 'frame');
  model.addStrand(bl, br, 'frame');
  for (const a of [tl, tr, bl, br, top, bottom]) model.addStrand(a, hub, 'frame');
  spider.placeOn(model.strands[model.strands.length - 1], 0.85);
  return hub;
}

// Title-screen dressing only: a finished orb so the first thing anyone sees is
// the thing the game is about. A real run starts from the bare frame above.
function decorateWeb() {
  const hub = model.nodes.find((n) => !n.anchor);
  if (!hub) return;
  const dirs = hub.strands
    .map((s) => {
      const o = s.a === hub ? s.b : s.a;
      return { ang: Math.atan2(o.y - hub.y, o.x - hub.x), x: o.x - hub.x, y: o.y - hub.y };
    })
    .sort((a, b) => a.ang - b.ang);
  for (const r of [0.26, 0.42, 0.58, 0.74]) {
    let first = null;
    let prev = null;
    for (const d of dirs) {
      const hit = model.closestStrand(hub.x + d.x * r, hub.y + d.y * r, 1.3, (s) => !s.sticky);
      if (!hit) continue;
      const node = model.splitStrand(hit.strand, hit.u);
      if (!node) continue;
      if (prev) model.addStrand(prev, node, 'capture');
      else first = node;
      prev = node;
    }
    if (first && prev && first !== prev) model.addStrand(prev, first, 'capture');
  }
  const walk = model.strands.find((s) => !s.sticky) || model.strands[0];
  if (walk) spider.placeOn(walk, 0.6);
}

/* ------------------------------------------------------------------ */
/* Model event hooks                                                   */
/* ------------------------------------------------------------------ */

model.onSnap = (s, mid) => {
  state.snapped++;
  audio.snap(s.len0);
  view.burst(mid.x, mid.y, mid.z, 14);
};

model.onCollapse = (lost) => {
  hud.toast('WEB COLLAPSED', 'bad');
  audio.snap(12);
  for (const s of lost) {
    const mid = model.sample(s, 0.5);
    view.burst(mid.x, mid.y, mid.z, 6);
  }
};

prey.onCaught = (bug) => {
  const f = bug.def.food;
  state.food += f;
  state.score += f * 10;
  state.silk = Math.min(SILK_MAX, state.silk + f * 1.7);
  state.caught[bug.kind] = (state.caught[bug.kind] || 0) + 1;
  hud.toast(`+${f} FOOD  ·  +${Math.round(f * 1.7)} SILK`, 'good');
};

prey.onEscaped = (bug) => {
  if (bug.kind === 'wasp') return;
  state.escaped++;
  hud.toast(`${bug.def.name.toUpperCase()} TORE FREE`, 'bad');
};

prey.onSting = () => {
  spider.hurt(10);
  audio.sting();
  hud.flash();
  hud.toast('STUNG', 'bad');
  if (spider.health <= 0) endRun(false, 'A wasp got you off the silk.');
};

/* ------------------------------------------------------------------ */
/* Phases                                                              */
/* ------------------------------------------------------------------ */

function newRun() {
  state.night = 1;
  state.silk = 80;
  state.score = 0;
  state.escaped = 0;
  state.snapped = 0;
  state.won = false;
  state.caught = { midge: 0, moth: 0, beetle: 0, wasp: 0 };
  spider.health = 100;
  prey.clear();
  startingWeb();
  enterDusk();
}

function plan() {
  return NIGHT_PLAN[Math.min(NIGHT_PLAN.length - 1, state.night - 1)];
}

function enterDusk() {
  state.phase = 'dusk';
  state.food = 0;
  builder.active = true;
  builder.from = null;
  // A dawn trickle so a bad night can never leave you with no silk and no
  // capture strands — starving is a decision, not a dead end.
  if (state.night > 1) state.silk = Math.min(SILK_MAX, state.silk + 16);
  const p = plan();
  document.getElementById('dusk-title').textContent = `DUSK · NIGHT ${state.night}`;
  document.getElementById('dusk-body').textContent = p.note;
  const rows = [
    { label: 'Food needed by dawn', value: `${p.quota}` },
    { label: 'Silk in the spinnerets', value: `◇ ${Math.floor(state.silk)}` },
    { label: 'Capture silk hung', value: `${model.captureLength().toFixed(0)} u` },
    { label: 'Silk condition', value: `${Math.round(model.integrityRatio() * 100)}%` },
  ];
  if (p.wasps) rows.push({ label: 'Wasps abroad', value: `${p.wasps}`, kind: 'bad' });
  if (p.gusts) rows.push({ label: 'Gusts forecast', value: `${p.gusts}`, kind: 'bad' });
  hud.list(document.getElementById('dusk-brief'), rows);
  hud.showPanel('dusk');
  hud.setHudVisible(true);
}

function startNight() {
  const p = plan();
  state.phase = 'night';
  state.timeLeft = p.dur;
  state.spawnTimer = 1.2;
  state.waspsLeft = p.wasps;
  state.waspTimer = 14;
  state.gustsLeft = p.gusts;
  state.gustTimer = 16 + Math.random() * 8;
  state.gustWarn = 0;
  state.gustActive = 0;
  hud.showPanel(null);
  audio.chime('night');
}

function endNight() {
  const p = plan();
  const met = state.food >= p.quota;
  state.phase = 'dawn';
  prey.clear();
  builder.active = false;
  builder.from = null;
  state.gustWarn = 0;
  state.gustActive = 0;
  state.wind.x = 0;
  state.wind.z = 0;
  state.wrapping = null;
  view.hideGhost();
  view.setCursor(0, 0, false);

  const rows = [
    { label: 'Food taken', value: `${Math.floor(state.food)} / ${p.quota}`, kind: met ? 'good' : 'bad' },
    { label: 'Wrapped and eaten', value: `${Object.values(state.caught).reduce((a, b) => a + b, 0)}` },
    { label: 'Tore free', value: `${state.escaped}` },
    { label: 'Strands lost', value: `${state.snapped}` },
    { label: 'Silk condition', value: `${Math.round(model.integrityRatio() * 100)}%` },
  ];

  if (met) {
    const bonus = Math.round(model.integrityRatio() * 120);
    state.score += 200 + bonus;
    spider.health = Math.min(100, spider.health + 14);
    rows.push({ label: 'Night survived', value: `+${200 + bonus}`, kind: 'good' });
  } else {
    const loss = 26;
    spider.health = Math.max(0, spider.health - loss);
    rows.push({ label: 'Went hungry', value: `−${loss} life`, kind: 'bad' });
  }
  state.escaped = 0;
  state.snapped = 0;

  if (spider.health <= 0) {
    endRun(false, 'You starved in the gap between the branches.');
    return;
  }
  if (state.night >= NIGHTS) {
    endRun(true, '');
    return;
  }

  document.getElementById('dawn-title').textContent = `DAWN · NIGHT ${state.night} SURVIVED`;
  hud.list(document.getElementById('dawn-tally'), rows);
  hud.showPanel('dawn');
  audio.chime('dawn');
}

function endRun(won, reason) {
  state.phase = 'over';
  state.won = won;
  prey.clear();
  builder.active = false;
  state.gustWarn = 0;
  state.gustActive = 0;
  state.wind.x = 0;
  state.wind.z = 0;
  state.wrapping = null;
  view.hideGhost();
  view.setCursor(0, 0, false);
  if (state.score > best) {
    best = state.score;
    localStorage.setItem(BEST_KEY, String(best));
    document.getElementById('best-score').textContent = best;
  }
  document.getElementById('over-title').textContent = won ? 'THE COLD COMES' : 'THE WEB IS EMPTY';
  document.getElementById('over-body').textContent = won
    ? `Eight nights held. You ate well and the web is still hanging — ${Math.round(model.integrityRatio() * 100)}% of it, anyway.`
    : reason;
  document.getElementById('over-score').textContent = state.score;
  hud.showPanel('over');
  audio.chime(won ? 'dawn' : 'lose');
}

/* ------------------------------------------------------------------ */
/* Night simulation                                                    */
/* ------------------------------------------------------------------ */

function pickSpecies(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return 'midge';
}

function updateNight(dt) {
  const p = plan();
  state.timeLeft -= dt;

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && prey.insects.length < 15) {
    state.spawnTimer = p.spawn * (0.65 + Math.random() * 0.8);
    prey.spawn(pickSpecies(p.weights));
  }

  if (state.waspsLeft > 0) {
    state.waspTimer -= dt;
    if (state.waspTimer <= 0) {
      state.waspTimer = 18 + Math.random() * 10;
      state.waspsLeft--;
      const w = prey.spawn('wasp');
      w.mode = 'hover';
      hud.toast('WASP', 'bad');
      audio.waspDive();
    }
  }

  // Gusts: three seconds of warning, then the web takes the hit. Long spans
  // eat far more damage than short triangulated ones.
  if (state.gustActive > 0) {
    state.gustActive -= dt;
    state.wind.x = state.gustDir * state.gustStrength * 26;
    state.wind.z = Math.sin(performance.now() * 0.002) * 6;
    for (const s of model.strands) {
      const exposure = (s.len0 / 10) * (s.sticky ? 1.15 : 0.75);
      model.damage(s, exposure * state.gustStrength * 4.4 * dt);
    }
    if (state.gustActive <= 0) {
      state.wind.x = 0;
      state.wind.z = 0;
    }
  } else if (state.gustWarn > 0) {
    state.gustWarn -= dt;
    if (state.gustWarn <= 0) {
      state.gustActive = 2.6;
      state.gustStrength = 0.7 + state.night * 0.09;
      audio.gust(state.gustStrength);
    }
  } else if (state.gustsLeft > 0) {
    state.gustTimer -= dt;
    if (state.gustTimer <= 0) {
      state.gustsLeft--;
      state.gustTimer = 20 + Math.random() * 12;
      state.gustWarn = 3;
      state.gustDir = Math.random() < 0.5 ? -1 : 1;
    }
  }
  hud.gustWarning(state.gustWarn > 0, state.gustDir);

  if (!model.strands.length) {
    endRun(false, 'Every strand went. There is nothing left to hunt from.');
    return;
  }
  if (state.timeLeft <= 0) endNight();
}

/* ------------------------------------------------------------------ */
/* Interaction                                                         */
/* ------------------------------------------------------------------ */

function handleAction(dt, held) {
  const bug = prey.reachable(1.5);
  if (!bug || spider.mode === 'drop') {
    if (state.wrapping) state.wrapping.wrapProgress = 0;
    state.wrapping = null;
    hud.action(false, 0, '');
    return;
  }
  if (state.wrapping && state.wrapping !== bug) state.wrapping.wrapProgress = 0;
  state.wrapping = bug;
  const label = bug.state === 'stuck' ? 'HOLD E — WRAP' : 'HOLD E — FEED';
  if (held) {
    if (bug.state === 'stuck') prey.wrap(bug, dt);
    else prey.feed(bug, dt);
  } else {
    bug.wrapProgress = Math.max(0, bug.wrapProgress - dt * 1.6);
  }
  hud.action(true, bug.wrapProgress, label);
}

function updateCue() {
  const bug = prey.nearestStruggle();
  if (!bug || bug.pos.distanceTo(spider.pos) < 5) {
    hud.cue(false);
    return;
  }
  const dx = bug.pos.x - spider.pos.x;
  const dy = bug.pos.y - spider.pos.y;
  hud.cue(true, Math.atan2(dy, dx) - Math.PI / 2, `${bug.def.name.toLowerCase()} · ${bug.state === 'stuck' ? 'struggling' : 'wrapped'}`);
}

function overlayClosed() {
  return hud.el.overlay.classList.contains('hidden');
}

function updateBuildUi() {
  if (!builder.active || !overlayClosed()) {
    hud.buildPanel(false);
    view.hideGhost();
    view.setCursor(0, 0, false);
    return;
  }
  const res = builder.update(input.pointer, camera, state.silk);
  const hint = builder.cutMode
    ? 'CUT — click a strand to sever it'
    : builder.from
      ? 'Click to finish · Esc cancels · runs chain'
      : 'Click a node or strand to start a run';
  hud.buildPanel(true, {
    type: builder.type,
    hint,
    cost: res && res.cost ? res.cost : 0,
    error: builder.errorT > 0 ? builder.lastError : '',
  });
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

const camRig = { dist: 36, yaw: 0, pitch: 0, tx: 0, ty: 1.5 };

function updateCamera(dt) {
  const o = input.takeOrbit();
  camRig.yaw = Math.max(-0.5, Math.min(0.5, camRig.yaw + o.dx * 0.0022));
  camRig.pitch = Math.max(-0.32, Math.min(0.32, camRig.pitch + o.dy * 0.0018));
  camRig.dist = Math.max(20, Math.min(48, camRig.dist + o.zoom * 1.8));

  const followX = spider.pos.x * 0.18;
  const followY = 1.5 + spider.pos.y * 0.16;
  camRig.tx += (followX - camRig.tx) * (1 - Math.exp(-2.2 * dt));
  camRig.ty += (followY - camRig.ty) * (1 - Math.exp(-2.2 * dt));

  const shake = spider.hitFlash > 0 ? spider.hitFlash * 0.5 : 0;
  camera.position.set(
    camRig.tx + Math.sin(camRig.yaw) * camRig.dist + (Math.random() - 0.5) * shake,
    camRig.ty + Math.sin(camRig.pitch) * camRig.dist + (Math.random() - 0.5) * shake,
    Math.cos(camRig.yaw) * Math.cos(camRig.pitch) * camRig.dist,
  );
  camera.lookAt(camRig.tx, camRig.ty, 0);
}

/* ------------------------------------------------------------------ */
/* Keys and buttons                                                    */
/* ------------------------------------------------------------------ */

input.onKey = (k) => {
  audio.resume();
  if (k === 'm') {
    audio.setEnabled(!audio.enabled);
    hud.toast(audio.enabled ? 'SOUND ON' : 'MUTED');
    return;
  }
  if (state.phase === 'title') {
    if (k === 'enter' || k === ' ') startGame();
    return;
  }
  if (k === 'p' || k === 'escape') {
    if (k === 'escape' && builder.cancel()) return;
    if (state.phase === 'night') {
      state.prevPhase = state.phase;
      state.phase = 'paused';
      hud.showPanel('pause');
    } else if (state.phase === 'paused') {
      state.phase = state.prevPhase || 'night';
      hud.showPanel(null);
    }
    return;
  }
  if (state.phase === 'dusk' && k === 'enter') {
    // First Enter dismisses the briefing onto the web; the second commits.
    if (!overlayClosed()) hud.showPanel(null);
    else startNight();
    return;
  }
  if (state.phase === 'dawn' && k === 'enter') {
    state.night++;
    enterDusk();
    return;
  }
  if (state.phase === 'over' && k === 'enter') {
    newRun();
    return;
  }
  if (state.phase !== 'night' && state.phase !== 'dusk') return;
  if (k === 'b') {
    const on = builder.toggle();
    hud.toast(on ? 'BUILD MODE' : 'HUNT MODE');
  }
  if (k === 'q' && builder.active) builder.swapType();
  if (k === 'x' && builder.active) builder.cutMode = true;
};

window.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'x') builder.cutMode = false;
});

function startGame() {
  audio.resume();
  newRun();
}

document.getElementById('btn-start').onclick = startGame;
// The dusk briefing closes onto the build phase; the night starts separately,
// when the player says so.
document.getElementById('btn-dusk').onclick = () => {
  audio.resume();
  hud.showPanel(null);
};
document.getElementById('btn-start-night').onclick = () => {
  audio.resume();
  if (state.phase === 'dusk') startNight();
};
document.getElementById('btn-next').onclick = () => {
  state.night++;
  enterDusk();
};
document.getElementById('btn-retry').onclick = () => newRun();
document.getElementById('btn-resume').onclick = () => {
  state.phase = state.prevPhase || 'night';
  hud.showPanel(null);
};
document.getElementById('silk-toggle').onclick = (e) => {
  e.preventDefault();
  builder.swapType();
};

const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) {
  hud.el.touch.classList.remove('hidden');
  input.bindTouchUI(document);
  document.getElementById('btn-build').addEventListener('touchstart', (e) => {
    e.preventDefault();
    builder.toggle();
  }, { passive: false });
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

function formatTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);

  const live = state.phase === 'night' || state.phase === 'dusk';

  if (live) {
    input.poll();
    builder.tick(dt);

    for (const c of input.takeClicks()) {
      input.pointer.x = c.x;
      input.pointer.y = c.y;
      const r = builder.click(input.pointer, camera, state.silk);
      if (r && r.built) state.silk -= r.cost;
    }

    // A dragline is silk too — it is an escape, not a free movement option.
    if (input.drop && spider.mode === 'web' && state.silk >= 2) {
      if (spider.startDrop()) state.silk -= 2;
    }
    spider.update(dt, { x: input.x, y: input.y, drop: input.drop }, model);
    if (!spider.strand && spider.mode !== 'drop' && !spider.reseat()) {
      endRun(false, 'Every strand went. There is nothing left to hunt from.');
    }
    spider.renderDrag();

    model.step(dt, state.wind);
    prey.update(dt, state.phase);
    handleAction(dt, input.act);
    updateCue();
    updateBuildUi();

    if (state.phase === 'night') updateNight(dt);
  } else {
    input.takeClicks();
    // Nothing in the world HUD should survive into a panel.
    hud.action(false, 0, '');
    hud.cue(false);
    hud.gustWarning(false, 1);
    hud.buildPanel(false);
    model.step(dt, state.wind);
    spider.update(dt, { x: 0, y: 0, drop: false }, model);
    spider.renderDrag();
    prey.update(dt, state.phase);
  }

  view.update(dt);
  updateAmbient(dt, state.wind);
  updateCamera(dt);

  if (state.phase !== 'title') {
    const p = plan();
    hud.stats({
      night: state.night,
      phaseLabel:
        state.phase === 'dusk'
          ? builder.active ? 'DUSK · BUILDING' : 'DUSK'
          : state.phase === 'night'
            ? builder.active ? 'NIGHT · REPAIRING' : 'NIGHT · HUNTING'
            : state.phase.toUpperCase(),
      food: state.food,
      quota: p.quota,
      timer: state.phase === 'night' ? formatTime(state.timeLeft) : 'dusk',
      canStartNight: state.phase === 'dusk' && overlayClosed(),
      silk: state.silk,
      silkMax: SILK_MAX,
      health: spider.health,
      score: state.score,
    });
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', resize);
resize();
hud.showPanel('title');
hud.setHudVisible(false);
startingWeb();
decorateWeb();
requestAnimationFrame(frame);

// A quiet idle web behind the title screen, so the first thing anyone sees is
// the thing the game is about.
(function idlePrey() {
  if (state.phase === 'title') {
    prey.spawn(Math.random() < 0.7 ? 'midge' : 'moth');
    setTimeout(idlePrey, 2200);
  }
})();

window.SILKFALL = { state, model, spider, prey, view, builder, camera, STRAND_TYPES, NODE_COST, SPECIES, THREE };
