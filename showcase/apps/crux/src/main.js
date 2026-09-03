import * as THREE from '../vendor/three.module.js';
import { Wall, TOP_Y } from './wall.js';
import { Climber, GRAB_RANGE, DYNO_RANGE } from './climber.js';
import { HoldView } from './holdview.js';
import { World } from './scene.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';

const STORM_SECONDS = 360;
const CAMS = 3;

const canvas = document.getElementById('game');
const world = new World(canvas);
const input = new Input(canvas);
const hud = new Hud();
const audio = new Audio();

const projected = new THREE.Vector3();

const ui = {
  title: document.getElementById('title'),
  result: document.getElementById('result'),
  resultTitle: document.getElementById('result-title'),
  resultStats: document.getElementById('result-stats'),
  paused: document.getElementById('paused'),
  seedInput: document.getElementById('seed-input'),
  start: document.getElementById('btn-start'),
  again: document.getElementById('btn-again'),
  titleBest: document.getElementById('title-best'),
};

let run = null;
let mode = 'title';
let last = performance.now();

function bestKey(seed) {
  return `crux.best.${seed}`;
}

function readBest(seed) {
  try {
    const raw = localStorage.getItem(bestKey(seed));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeBest(seed, entry) {
  try {
    localStorage.setItem(bestKey(seed), JSON.stringify(entry));
  } catch (e) {
    /* private mode */
  }
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function showTitleBest() {
  const seed = normaliseSeed(ui.seedInput.value);
  const best = readBest(seed);
  ui.titleBest.textContent = best
    ? `Best on seed ${seed}: ${formatTime(best.time)} · ${best.score} pts`
    : `No ascent recorded on seed ${seed}.`;
}

function normaliseSeed(v) {
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n % 1000000 : 1;
}

function startRun(seed) {
  if (run) {
    world.scene.remove(run.wall.mesh, run.wall.backing, run.holdView.group, run.climber.group);
    run.wall.mesh.geometry.dispose();
  }
  const wall = new Wall(seed);
  const holdView = new HoldView(wall);
  const climber = new Climber(wall);
  world.scene.add(wall.mesh, wall.backing, holdView.group, climber.group);

  run = {
    seed,
    wall,
    holdView,
    climber,
    time: 0,
    storm: 0,
    cams: CAMS,
    anchors: [],
    falls: 0,
    dynos: 0,
    penalty: 0,
    target: null,
    targetDyno: false,
    nearCamSpot: null,
    catchAnchor: null,
    fallTime: 0,
    gust: 0,
    gustPhase: Math.random() * 10,
    ringList: [],
    rings: [],
    windForce: new THREE.Vector3(),
  };

  world.setStorm(0);
  world.updateCamera(1, climber, false, { x: 0, y: 0 });
  hud.show();
  hud.toast('CLIMB', 'good');
  mode = 'play';
}

function endRun(won) {
  mode = 'over';
  hud.hide();
  const r = run;
  const elapsed = r.time;
  const timeScore = Math.max(0, Math.round(900 - elapsed * 1.1));
  const style = r.cams * 120 + (r.falls === 0 ? 300 : 0) + r.dynos * 40;
  const score = won ? Math.max(0, timeScore + style - r.falls * 150) : 0;

  const rows = [
    ['HIGH POINT', `${r.climber.maxHeight.toFixed(1)} m / ${TOP_Y} m`],
    ['TIME', formatTime(elapsed)],
    ['FALLS', String(r.falls)],
    ['CAMS LEFT', String(r.cams)],
    ['DYNOS STUCK', String(r.dynos)],
    ['SCORE', won ? String(score) : '—'],
  ];
  ui.resultTitle.textContent = won ? 'SUMMIT' : 'YOU CAME OFF';
  ui.resultTitle.style.color = won ? '#62d493' : '#e2513c';
  ui.resultStats.innerHTML = rows
    .map(([k, v], i) => `<div class="k">${k}</div><div class="v${i === rows.length - 1 && won ? ' hl' : ''}">${v}</div>`)
    .join('');
  ui.result.classList.remove('hidden');

  if (won) {
    const prev = readBest(r.seed);
    if (!prev || score > prev.score) writeBest(r.seed, { time: elapsed, score });
    audio.summit();
  }
}

// The target is whatever hold the cursor is nearest to among those the
// climber could actually move to — reach first, dyno range second.
function pickTarget() {
  const r = run;
  const c = r.climber;
  const shoulderL = c.shoulder(-1);
  const shoulderR = c.shoulder(1);
  const list = r.ringList;
  list.length = 0;

  const candidates = r.wall.holdsNear(c.hips, DYNO_RANGE + 0.9);
  for (const h of candidates) {
    if (h === c.hands.left.hold || h === c.hands.right.hold) continue;
    const d = Math.min(shoulderL.distanceTo(h.position), shoulderR.distanceTo(h.position));
    if (d <= GRAB_RANGE) list.push({ hold: h, dyno: false, d });
    else if (d <= DYNO_RANGE) list.push({ hold: h, dyno: true, d });
  }

  // Ring only what is worth considering as the next move, or the wall turns
  // into a wall of circles. Everything else still reads by its own colour.
  r.rings.length = 0;
  for (const entry of list) {
    if (entry.dyno) continue;
    if (entry.hold.position.y < c.hips.y - 0.15) continue;
    r.rings.push(entry);
  }
  r.rings.sort((a, b) => a.d - b.d);
  if (r.rings.length > 14) r.rings.length = 14;

  let best = null;
  let bestScore = Infinity;
  if (input.pointer.has) {
    // Screen-space, not ray distance: two holds 25 cm apart on the rock can sit
    // almost on the same ray, and the player is aiming at what they can see.
    const aspect = world.camera.aspect || 1;
    for (const entry of list) {
      projected.copy(entry.hold.position).project(world.camera);
      if (projected.z > 1) continue;
      const dx = (projected.x - input.pointer.x) * aspect;
      const dy = projected.y - input.pointer.y;
      const dist = Math.hypot(dx, dy);
      const score = dist + (entry.dyno ? 0.12 : 0);
      if (score < bestScore && dist < 0.45) {
        bestScore = score;
        best = entry;
      }
    }
  }
  if (!best) {
    let highestHand = -Infinity;
    for (const hand of c.grippedHands()) highestHand = Math.max(highestHand, hand.pos.y);
    for (const entry of list) {
      if (entry.hold.position.y < highestHand + 0.06) continue;
      const score = -entry.hold.position.y + (entry.dyno ? 3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = entry;
      }
    }
  }
  r.target = best ? best.hold : null;
  r.targetDyno = best ? best.dyno : false;
}

function handAction(side, wantDyno) {
  const r = run;
  const c = r.climber;
  if (!r.target) return;
  if (!wantDyno) {
    // Never turn a reach into a jump on the player's behalf — committing both
    // hands to the air is always an explicit decision.
    if (r.targetDyno) {
      hud.toast('OUT OF REACH — SHIFT TO JUMP', 'bad');
      return;
    }
    const other = side === 'left' ? 'right' : 'left';
    if (!c.hands[other].hold && c.footShare < 0.45) {
      hud.toast('OTHER HAND IS OFF', 'bad');
      return;
    }
    if (!c.grab(side, r.target)) hud.toast('CANNOT REACH', 'bad');
  } else if (!r.targetDyno) {
    // Shift on something already in reach is just a reach.
    if (!c.grab(side, r.target)) hud.toast('CANNOT REACH', 'bad');
  } else if (c.startDyno(side, r.target)) {
    hud.toast('DYNO', '');
  } else {
    hud.toast(c.pump > 92 ? 'TOO PUMPED TO JUMP' : 'TOO FAR', 'bad');
  }
}

function placeCam() {
  const r = run;
  if (r.cams <= 0) {
    hud.toast('NO CAMS LEFT', 'bad');
    return;
  }
  if (!r.nearCamSpot) return;
  r.nearCamSpot.used = true;
  r.cams--;
  r.anchors.push({ position: r.nearCamSpot.position.clone() });
  r.holdView.addCam(r.nearCamSpot.position);
  audio.cam();
  hud.toast('CAM PLACED', 'good');
  r.nearCamSpot = null;
}

function updateWeather(dt) {
  const r = run;
  r.storm = THREE.MathUtils.clamp(r.time / STORM_SECONDS, 0, 1);
  world.setStorm(r.storm);

  const wetAmount = THREE.MathUtils.clamp((r.storm - 0.3) / 0.42, 0, 1);
  const wetLine = THREE.MathUtils.lerp(TOP_Y + 14, -6, THREE.MathUtils.clamp((r.storm - 0.28) / 0.66, 0, 1));
  r.climber.wetAmount = wetAmount;
  r.climber.wetLine = wetLine;

  const near = r.wall.holdsNear(r.climber.hips, 9);
  for (const h of near) {
    const w = THREE.MathUtils.clamp((h.position.y - wetLine) / 7 + 0.5, 0, 1) * wetAmount;
    h.wet = h.chalk > 0 ? w * 0.35 : w;
  }

  r.gustPhase += dt * (0.35 + r.storm * 0.5);
  const base = Math.sin(r.gustPhase) * Math.sin(r.gustPhase * 0.37 + 1.3);
  const exposure = THREE.MathUtils.clamp(r.climber.hips.y / TOP_Y, 0, 1);
  r.gust = Math.max(0, base) * (0.25 + r.storm * 0.9) * (0.4 + exposure * 0.9);
  r.windForce.set(Math.sin(r.gustPhase * 2.1) * r.gust * 3.4, 0, r.gust * 1.1);
  if (r.gust > 0.75) world.shake = Math.max(world.shake, 0.35);
}

function handleEvents() {
  const r = run;
  for (const ev of r.climber.events) {
    switch (ev.type) {
      case 'grab':
        audio.grab(ev.type ? ev.type : 'edge');
        break;
      case 'slip':
        audio.slip();
        hud.toast('SLIPPED', 'bad');
        world.shake = 0.5;
        break;
      case 'break':
        audio.breakHold();
        hud.toast('HOLD BROKE', 'bad');
        world.shake = 0.9;
        for (const h of r.wall.holds) if (h.broken) r.holdView.hide(h);
        break;
      case 'pumped':
        hud.toast('PUMPED OUT', 'bad');
        break;
      case 'dyno':
        audio.dyno();
        break;
      case 'missed':
        hud.toast('MISSED IT', 'bad');
        break;
      case 'catch':
        r.dynos++;
        hud.toast('CAUGHT IT', 'good');
        audio.grab('jug');
        world.shake = 0.4;
        break;
      case 'chalk':
        audio.chalk();
        break;
      case 'fall':
        audio.fall();
        beginFall();
        break;
      default:
        break;
    }
  }
}

function beginFall() {
  const r = run;
  let anchor = null;
  for (const a of r.anchors) {
    if (a.position.y < r.climber.hips.y - 0.4 && (!anchor || a.position.y > anchor.position.y)) anchor = a;
  }
  r.catchAnchor = anchor;
  r.fallTime = 0;
  hud.toast(anchor ? 'FALLING — ROPE' : 'FALLING', 'bad');
}

function updateFalling(dt) {
  const r = run;
  r.fallTime += dt;
  world.shake = Math.max(world.shake, 0.6);
  const a = r.catchAnchor;
  if (a && r.climber.hips.y <= a.position.y - 1.4) {
    r.climber.catchOn(a.position);
    r.anchors.splice(r.anchors.indexOf(a), 1);
    r.catchAnchor = null;
    r.falls++;
    r.time += 20;
    audio.caught();
    hud.toast('CAUGHT ON THE CAM  −20s', 'bad');
  } else if (!a && (r.climber.hips.y < 1.2 || r.fallTime > 6)) {
    r.falls++;
    endRun(false);
  }
}

function update(dt) {
  const r = run;
  const c = r.climber;
  r.time += dt;

  updateWeather(dt);
  pickTarget();

  let nearSpot = null;
  let nearD = 1.3;
  for (const s of r.wall.camSpots) {
    if (s.used) continue;
    const d = s.position.distanceTo(c.hips);
    if (d < nearD) {
      nearD = d;
      nearSpot = s;
    }
  }
  r.nearCamSpot = nearSpot;

  for (const a of input.take()) {
    if (a.type === 'pause') {
      mode = 'paused';
      ui.paused.classList.remove('hidden');
      return;
    }
    if (a.type === 'mute') {
      audio.enabled = !audio.enabled;
      audio.master.gain.value = audio.enabled ? 0.75 : 0;
      continue;
    }
    if (c.state !== 'climb') continue;
    if (a.type === 'hand') handAction(a.side, false);
    else if (a.type === 'dyno') handAction(a.side, true);
    else if (a.type === 'chalk') {
      if (!c.chalkUp()) hud.toast('NO CHALK LEFT', 'bad');
    } else if (a.type === 'cam') placeCam();
  }

  c.update(dt, {
    hipX: input.hipX,
    hipZ: input.hipZ,
    press: input.press,
    shake: input.shake,
    wind: r.windForce,
  });
  handleEvents();

  if (c.state === 'fall') updateFalling(dt);

  let topHand = -Infinity;
  for (const hand of c.grippedHands()) topHand = Math.max(topHand, hand.pos.y);
  if ((c.hips.y >= TOP_Y - 2.2 || topHand >= TOP_Y - 1.4) && c.state === 'climb') {
    endRun(true);
    return;
  }

  const aim = { x: THREE.MathUtils.clamp(input.pointer.x * 1.6, -2, 2), y: THREE.MathUtils.clamp(input.pointer.y * 2.4, -2.5, 2.5) };
  world.updateCamera(dt, c, input.scan, aim);
  world.updateAmbient(dt, c.hips, r.gust);
  r.holdView.updateRings(r.rings, r.target, world.camera, r.time);

  audio.update(dt, c.pump, r.gust * 0.6 + r.storm * 0.4, THREE.MathUtils.clamp(c.hips.y / TOP_Y, 0, 1));

  hud.update(dt, {
    height: c.hips.y,
    band: r.wall.bandAt(c.hips.y),
    storm: r.storm,
    stormText: r.storm < 0.3 ? 'clear' : r.storm < 0.6 ? 'wind rising' : r.storm < 0.85 ? 'rain — holds wet' : 'storm on the wall',
    clock: formatTime(r.time),
    cams: r.cams,
    camsTotal: CAMS,
    chalk: c.chalk,
    seed: r.seed,
    pump: c.pump,
    legs: c.legReserve,
    footShare: c.footShare,
    hands: c.hands,
    target: r.target,
    targetDyno: r.targetDyno,
    camPrompt: !!r.nearCamSpot && r.cams > 0,
  });
}

function frame(now) {
  window.__crux = { get run() { return run; }, get mode() { return mode; }, world, input };
requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 24);
  last = now;

  if (mode === 'play') {
    update(dt);
  } else if (mode === 'paused') {
    for (const a of input.take()) {
      if (a.type === 'pause' || a.type === 'confirm') {
        ui.paused.classList.add('hidden');
        mode = 'play';
      }
    }
  } else {
    for (const a of input.take()) {
      if (a.type === 'confirm') {
        if (mode === 'title') begin();
        else restart();
      }
    }
    if (run) {
      world.updateCamera(dt, run.climber, mode === 'title', { x: 0, y: mode === 'title' ? 1.2 : 0 });
      world.updateAmbient(dt, run.climber.hips, 0.2);
    }
  }
  world.render();
}

function begin() {
  audio.resume();
  const seed = normaliseSeed(ui.seedInput.value);
  ui.seedInput.value = seed;
  ui.title.classList.add('hidden');
  ui.result.classList.add('hidden');
  startRun(seed);
}

function restart() {
  ui.result.classList.add('hidden');
  startRun(run ? run.seed : 1);
}

ui.start.addEventListener('click', begin);
ui.again.addEventListener('click', restart);
ui.seedInput.addEventListener('input', showTitleBest);
ui.seedInput.addEventListener('keydown', (e) => e.stopPropagation());

addEventListener('resize', () => world.resize());
world.resize();
showTitleBest();

// A preview wall behind the title screen, so the game is showing before it starts.
startRun(normaliseSeed(ui.seedInput.value));
mode = 'title';
hud.hide();
ui.title.classList.remove('hidden');

requestAnimationFrame(frame);
