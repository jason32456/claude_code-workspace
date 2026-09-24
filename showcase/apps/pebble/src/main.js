import * as THREE from '../vendor/three.module.js';
import { FAR_TEE, FAR_HOG, NEAR_HOG, RELEASE_Y, HALF_W, STONES_PER_TEAM } from './constants.js';
import * as P from './physics.js';
import { adjudicate, scoreEnd } from './rules.js';
import { chooseShot, aiSweep, LEVELS } from './ai.js';
import { createScene, buildStoneMesh, buildSweeper, buildSkipBroom, V, setAimLine, TEAM_COLOR } from './scene.js';
import * as A from './audio.js';
import * as H from './hud.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const S = createScene(canvas);
const { renderer, scene, camera } = S;

const TIME_SCALE = 1.5;
const FAST = 5;
const CHARGE_TIME = 3.2;
const STAMINA_TIME = 12;
const STAMINA_REGEN = 30;

const stones = [];
const meshes = [];
['red', 'yellow'].forEach((team, t) => {
  for (let i = 0; i < STONES_PER_TEAM; i++) {
    const s = P.makeStone(t * STONES_PER_TEAM + i, team);
    stones.push(s);
    const m = buildStoneMesh(team, S.granite);
    m.visible = false;
    scene.add(m);
    meshes.push(m);
  }
});
const sweepers = {
  red: [buildSweeper('red'), buildSweeper('red')],
  yellow: [buildSweeper('yellow'), buildSweeper('yellow')],
};
for (const pair of Object.values(sweepers)) for (const s of pair) { s.visible = false; scene.add(s); }
const skipBroom = buildSkipBroom();
scene.add(skipBroom);

const opts = { mode: 'provincial', ends: 4 };
let game = null;
let phase = 'menu';
const aim = { broomX: -1.1, spin: 1, meter: 0 };
const input = { action: false, fast: false, left: false, right: false, fine: false, skip: false };
let overhead = false;
let throwState = null;
let phaseTimer = 0;

const other = (t) => (t === 'red' ? 'yellow' : 'red');
const isHuman = (team) => opts.mode === 'hot' || team === 'red';
const label = (team) => (opts.mode === 'hot' ? H.TEAM_NAME[team] : team === 'red' ? 'You' : `${LEVELS[opts.mode].label} AI`);
const turnLabel = (spin) => (spin > 0 ? '↻ in-turn' : '↺ out-turn');

function currentTeam() {
  const first = other(game.hammer);
  return game.thrown % 2 === 0 ? first : game.hammer;
}
function shooterFor(team) {
  const k = Math.floor(game.thrown / 2);
  return stones.find((s) => s.team === team && s.id % STONES_PER_TEAM === k);
}
function stonesLeft() {
  const left = { red: 0, yellow: 0 };
  const first = other(game.hammer);
  for (let i = game.thrown; i < STONES_PER_TEAM * 2; i++) left[i % 2 === 0 ? first : game.hammer]++;
  return left;
}

function refreshBoard() {
  game.left = stonesLeft();
  H.renderBoard(game, label);
}

function newGame() {
  game = {
    ends: opts.ends,
    end: 1,
    score: { red: [], yellow: [] },
    hammer: Math.random() < 0.5 ? 'red' : 'yellow',
    thrown: 0,
  };
  H.show('menu', false);
  H.show('hud', true);
  H.toast(`${label(game.hammer)} ${opts.mode === 'hot' || game.hammer !== 'red' ? 'has' : 'have'} the hammer<small>last stone of the first end</small>`, 2600);
  startEnd();
}

function startEnd() {
  for (const s of stones) {
    Object.assign(s, { inPlay: false, moving: false, out: null, vx: 0, vy: 0, omega: 0, x: 0, y: 0 });
  }
  for (const m of meshes) {
    m.visible = false;
    m.userData.glow.material.opacity = 0;
  }
  game.thrown = 0;
  overhead = false;
  nextThrow();
}

function nextThrow() {
  refreshBoard();
  if (game.thrown >= STONES_PER_TEAM * 2) return countEnd();
  const team = currentTeam();
  const shooter = shooterFor(team);
  Object.assign(shooter, { x: 0, y: RELEASE_Y, vx: 0, vy: 0, angle: Math.PI / 2, inPlay: false, out: null });
  meshes[shooter.id].visible = true;
  throwState = { team, shooter, human: isHuman(team), plan: null, before: null, ctx: null, acc: 0, simT: 0, sweep: 0, sweepHeld: false, stamina: 1, tNear: null, tFar: null, aiClock: 0, aiSweep: false, seenImpacts: 0, seenRemoved: 0 };
  H.setText('thrower', label(team));
  $('thrower').style.color = `var(--${team})`;
  H.setText('stone-num', `${Math.floor(game.thrown / 2) + 1} of ${STONES_PER_TEAM}`);
  H.setText('speed', '—');
  H.setText('split', '—');
  if (throwState.human) {
    aim.broomX = Math.max(-1.6, Math.min(1.6, -aim.spin * 1.1));
    aim.meter = 0;
    phase = 'aim';
    setCallout(`${label(team)}: set the broom, pick the turn, hold <b>Space</b> to throw`);
  } else {
    phase = 'think';
    setCallout(`${label(team)} skip is reading the house…`);
    const thrown = game.thrown;
    chooseShot({ stones, shooter, team, hammer: game.hammer, thrownCount: game.thrown, level: opts.mode === 'hot' ? 'provincial' : opts.mode }).then((plan) => {
      if (!game || game.thrown !== thrown || phase !== 'think') return;
      throwState.plan = plan;
      aim.broomX = plan.exec.broom;
      aim.spin = plan.spin;
      setCallout(`${label(team)}: <b>${plan.label}</b>, ${turnLabel(plan.spin)}`);
      phase = 'aiShow';
      phaseTimer = 1.6;
    });
  }
}

function setCallout(html) {
  $('callout').innerHTML = html;
}

function release(v0) {
  const st = throwState;
  st.before = P.cloneStones(stones);
  P.deliver(st.shooter, aim.broomX, v0, aim.spin);
  st.ctx = P.newCtx(st.shooter.id);
  st.v0 = v0;
  phase = 'travel';
  H.show('meter-wrap', false);
  if (st.human) setCallout(`Released at <b>${v0.toFixed(2)} m/s</b>, ${turnLabel(aim.spin)} — hold <b>Space</b> to sweep`);
}

function stepTravel(dt) {
  const st = throwState;
  const scale = TIME_SCALE * (input.fast ? FAST : 1);
  st.acc += Math.min(dt, 0.05) * scale;
  if (input.skip) st.acc += 120;
  const sh = st.shooter;
  while (st.acc >= P.DT) {
    st.acc -= P.DT;
    let want = 0;
    if (st.human) want = input.action && sh.moving ? 1 : 0;
    else if (sh.moving) {
      if (st.simT - st.aiClock > 0.25) {
        st.aiClock = st.simT;
        st.aiSweep = aiSweep(stones, sh, st.plan);
      }
      want = st.aiSweep ? 1 : 0;
    }
    st.sweepHeld = want > 0;
    st.sweep += (want - st.sweep) * Math.min(1, P.DT * 12);
    if (st.sweepHeld) st.stamina = Math.max(0, st.stamina - P.DT / STAMINA_TIME);
    else st.stamina = Math.min(1, st.stamina + P.DT / STAMINA_REGEN);
    const eff = st.sweep * (st.stamina > 0 ? 1 : 0.35);
    P.step(stones, P.DT, eff, sh.id, st.ctx);
    st.simT += P.DT;
    if (st.tNear === null && sh.y >= NEAR_HOG) st.tNear = st.simT;
    if (st.tFar === null && sh.y >= FAR_HOG && st.tNear !== null) st.tFar = st.simT;
    if (!P.anyMoving(stones) || st.simT > 90) break;
  }
  const ctx = st.ctx;
  for (; st.seenImpacts < ctx.impacts.length; st.seenImpacts++) A.clack(ctx.impacts[st.seenImpacts].impulse);
  for (; st.seenRemoved < ctx.removed.length; st.seenRemoved++) {
    const r = ctx.removed[st.seenRemoved];
    fadeOut(r.id);
  }
  const v = Math.hypot(sh.vx, sh.vy);
  H.setText('speed', sh.inPlay && sh.moving ? `${v.toFixed(2)} m/s` : '—');
  if (st.tNear !== null) H.setText('split', `${((st.tFar ?? st.simT) - st.tNear).toFixed(1)} s${st.tFar ? '' : '…'}`);
  $('stamina').style.width = `${st.stamina * 100}%`;
  H.show('sweep-flag', st.sweep > 0.3 && sh.moving);

  if (!P.anyMoving(stones) || st.simT > 90) settle();
}

function fadeOut(id) {
  const m = meshes[id];
  m.userData.fade = 1;
}

function settle() {
  const st = throwState;
  if (!input.skipAll) input.skip = false;
  for (const s of stones) { s.moving = false; s.vx = s.vy = 0; }
  const events = adjudicate(stones, st.before, st.shooter, st.ctx, game.thrown);
  H.show('sweep-flag', false);
  const hog = events.find((e) => e.type === 'hog');
  const fgz = events.find((e) => e.type === 'fgz');
  if (fgz) {
    for (const s of stones) {
      const m = meshes[s.id];
      m.userData.fade = 0;
      m.visible = s.inPlay;
      m.scale.setScalar(1);
    }
    H.toast('Free guard zone<small>an opponent’s guard can’t be removed before stone 6 — stones replaced</small>', 3200);
  } else if (hog) {
    fadeOut(st.shooter.id);
    H.toast('Hog line<small>the stone never cleared the far hog line — removed</small>', 2600);
  } else {
    const sc = scoreEnd(stones);
    if (sc.team) {
      const n = sc.points;
      H.toast(`${label(sc.team)} ${sc.team === 'red' && opts.mode !== 'hot' ? 'are' : 'is'} shot${n > 1 ? `, lying ${n}` : ''}`, 1800);
    }
  }
  const sc = scoreEnd(stones);
  if (sc.team) A.cheer(0.3 + 0.15 * sc.points);
  game.thrown++;
  phase = 'settle';
  phaseTimer = 2.2;
  refreshBoard();
}

function countEnd() {
  phase = 'count';
  overhead = true;
  const sc = scoreEnd(stones);
  const counting = sc.team ? sc.ranked.slice(0, sc.points) : [];
  for (const s of counting) {
    const glow = meshes[s.id].userData.glow;
    glow.material.color.setHex(TEAM_COLOR[s.team]);
    glow.material.opacity = 0.95;
  }
  H.drawHouse(stones, counting.map((s) => s.id));
  for (const t of ['red', 'yellow']) game.score[t][game.end - 1] = sc.team === t ? sc.points : 0;
  if (sc.team) game.hammer = other(sc.team);
  A.cheer(sc.team ? 1 : 0.2);
  setCallout('');
  const totals = { red: game.score.red.reduce((a, b) => a + b, 0), yellow: game.score.yellow.reduce((a, b) => a + b, 0) };
  const last = game.end >= game.ends;
  const over = last && totals.red !== totals.yellow;
  const title = sc.team ? `${label(sc.team)} ${sc.team === 'red' && opts.mode !== 'hot' ? 'score' : 'scores'} ${sc.points}` : 'Blank end';
  let body = `End ${game.end}${game.end > game.ends ? ' (extra)' : ''} · ${label('red')} ${totals.red} — ${totals.yellow} ${label('yellow')}.`;
  if (over) {
    const w = totals.red > totals.yellow ? 'red' : 'yellow';
    body += opts.mode === 'hot' ? ` ${label(w)} wins.` : w === 'red' ? ' You win the match.' : ` ${label('yellow')} wins the match.`;
  } else {
    if (last) body += ' Tied — extra end.';
    body += ` ${label(game.hammer)} ${game.hammer === 'red' && opts.mode !== 'hot' ? 'have' : 'has'} the hammer.`;
  }
  refreshBoard();
  setTimeout(() => {
    $('end-title').textContent = title;
    $('end-body').textContent = body;
    $('end-next').textContent = over ? 'Play again' : 'Next end';
    $('end-next').dataset.over = over ? '1' : '';
    H.show('endcard', true);
  }, 1800);
}

$('end-next').addEventListener('click', () => {
  H.show('endcard', false);
  if ($('end-next').dataset.over) {
    phase = 'menu';
    H.show('hud', false);
    H.show('menu', true);
    return;
  }
  game.end++;
  startEnd();
});

// ---------- input ----------
function actionDown() {
  A.initAudio();
  if (phase === 'aim') {
    phase = 'charge';
    aim.meter = 0;
    H.show('meter-wrap', true);
    setCallout('Pushing out… release to let go');
  }
  input.action = true;
}
function actionUp() {
  input.action = false;
  if (phase === 'charge') release(H.meterToV(aim.meter));
}
function setSpin(s) {
  if (phase !== 'aim' && phase !== 'charge') return;
  aim.spin = s;
}

addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); overhead = !overhead; return; }
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); if (phase !== 'menu') actionDown(); }
  if (e.code === 'KeyF') input.fast = true;
  if (e.code === 'KeyQ') setSpin(-1);
  if (e.code === 'KeyE') setSpin(1);
  if (e.code === 'KeyM') A.toggleMute();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
  if (e.shiftKey) input.fine = true;
  if (e.code === 'Enter') {
    if (!$('endcard').classList.contains('hidden')) $('end-next').click();
    else if (phase === 'travel' && !throwState.human) input.skip = true;
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space') actionUp();
  if (e.code === 'KeyF') input.fast = false;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
  if (!e.shiftKey) input.fine = false;
});
addEventListener('blur', () => { input.fast = input.left = input.right = false; if (input.action) actionUp(); });

const ray = new THREE.Raycaster();
const icePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
function aimFromPointer(e) {
  if (phase !== 'aim' && phase !== 'charge') return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
  if (ray.ray.intersectPlane(icePlane, hit)) aim.broomX = Math.max(-HALF_W + 0.2, Math.min(HALF_W - 0.2, hit.x));
}
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || e.buttons) aimFromPointer(e);
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button === 0) { actionDown(); }
  else aimFromPointer(e);
});
addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && e.button === 0 && input.action) actionUp(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const tAct = $('t-act');
tAct.addEventListener('pointerdown', (e) => { e.preventDefault(); actionDown(); });
tAct.addEventListener('pointerup', (e) => { e.preventDefault(); actionUp(); });
tAct.addEventListener('pointercancel', () => actionUp());
$('t-turn').addEventListener('click', () => setSpin(-aim.spin));
$('turn-btn').addEventListener('click', () => setSpin(-aim.spin));
$('t-cam').addEventListener('click', () => { overhead = !overhead; });

for (const seg of document.querySelectorAll('.seg')) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of seg.children) x.classList.toggle('on', x === b);
    opts[seg.dataset.key] = seg.dataset.key === 'ends' ? Number(b.dataset.v) : b.dataset.v;
  });
}
$('start').addEventListener('click', () => { A.initAudio(); newGame(); });
H.buildMeter();

// ---------- camera & animation ----------
const camPos = new THREE.Vector3(0, 1.5, -5);
const camLook = new THREE.Vector3(0, 0, -FAR_TEE);
let camFov = 14;
const tmpP = new THREE.Vector3();
const tmpL = new THREE.Vector3();

function cameraTarget() {
  const sh = throwState?.shooter;
  if (phase === 'menu') {
    const t = performance.now() / 1000;
    tmpP.copy(V(Math.sin(t * 0.07) * 3.5, FAR_TEE - 8 + Math.cos(t * 0.05) * 1.5, 2.2));
    tmpL.copy(V(0, FAR_TEE, 0));
    return 34;
  }
  if (overhead || phase === 'count') {
    tmpP.copy(V(0, FAR_TEE - 4.2, 10.5));
    tmpL.copy(V(0, FAR_TEE - 0.9, 0));
    return 32;
  }
  if (phase === 'aim' || phase === 'charge' || phase === 'think' || phase === 'aiShow') {
    tmpP.copy(V(0, RELEASE_Y - 3, 4.6));
    tmpL.copy(V(aim.broomX * 0.25, FAR_TEE - 0.6, 0));
    return 9;
  }
  if (sh && sh.inPlay && sh.y < FAR_HOG - 4 && phase === 'travel') {
    tmpP.copy(V(sh.x * 0.5, sh.y - 6, 2.5));
    tmpL.copy(V(sh.x * 0.6, sh.y + 9, 0));
    return 40;
  }
  tmpP.copy(V(0, FAR_TEE - 8.5, 4.2));
  tmpL.copy(V(0, FAR_TEE + 0.1, 0));
  return 30;
}

const sweepT = { t: 0 };
function poseSweepers(dt) {
  const st = throwState;
  const active = st && (phase === 'travel') && st.shooter.inPlay;
  for (const team of ['red', 'yellow']) {
    const pair = sweepers[team];
    const on = active && st.team === team;
    pair.forEach((m) => (m.visible = on));
    if (!on) continue;
    const sh = st.shooter;
    let v = Math.hypot(sh.vx, sh.vy);
    const dx = v > 0.01 ? sh.vx / v : 0;
    const dy = v > 0.01 ? sh.vy / v : 1;
    sweepT.t += dt * (st.sweep > 0.3 ? 14 : 3);
    pair.forEach((m, i) => {
      const side = i === 0 ? -1 : 1;
      const px = -dy * side;
      const py = dx * side;
      const ahead = 1.0 + i * 0.45;
      m.position.copy(V(sh.x + px * 0.8 + dx * ahead, sh.y + py * 0.8 + dy * ahead, 0));
      m.rotation.y = Math.atan2(px, -py);
      const b = m.userData.broom;
      if (st.sweep > 0.3) {
        b.position.x = Math.sin(sweepT.t + i * 1.7) * 0.13;
        b.position.y = 0;
        b.rotation.x = 0.6;
      } else {
        b.position.x = 0;
        b.position.y = 0.15;
        b.rotation.x = 0.35;
      }
      m.position.y = Math.abs(Math.sin(sweepT.t * 0.5 + i)) * 0.03;
    });
  }
}

function syncMeshes(dt) {
  for (const s of stones) {
    const m = meshes[s.id];
    if (m.userData.fade > 0) {
      m.userData.fade -= dt * 1.6;
      m.scale.setScalar(Math.max(0.01, m.userData.fade));
      if (m.userData.fade <= 0) { m.visible = false; m.scale.setScalar(1); }
    }
    if (!m.visible) continue;
    if (s.inPlay || (throwState && s === throwState.shooter && !s.out)) {
      m.position.copy(V(s.x, s.y, 0));
      m.rotation.y = -s.angle;
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (phase === 'aim' || phase === 'charge') {
    const rate = input.fine ? 0.25 : 1.1;
    if (input.left) aim.broomX -= rate * dt;
    if (input.right) aim.broomX += rate * dt;
    aim.broomX = Math.max(-HALF_W + 0.2, Math.min(HALF_W - 0.2, aim.broomX));
  }
  if (phase === 'charge') {
    aim.meter = Math.min(1, aim.meter + dt / CHARGE_TIME);
    H.setMeter(aim.meter);
  }
  if (phase === 'aiShow') {
    phaseTimer -= dt;
    if (phaseTimer <= 0) release(throwState.plan.exec.v0);
  }
  if (phase === 'travel' && !input.hold) stepTravel(dt);
  if (phase === 'settle' && !input.hold) {
    phaseTimer -= dt * (input.fast ? 3 : 1);
    if (phaseTimer <= 0) nextThrow();
  }

  const showBroom = ['aim', 'charge', 'aiShow'].includes(phase);
  skipBroom.visible = showBroom;
  S.aimLine.visible = showBroom;
  if (showBroom) {
    skipBroom.position.copy(V(aim.broomX, FAR_TEE, 0));
    setAimLine(S.aimLine, aim.broomX);
  }
  if (game && phase !== 'menu') {
    H.setText('turn-btn', turnLabel(aim.spin));
    H.setText('broom-read', `${aim.broomX >= 0 ? 'R' : 'L'} ${Math.abs(aim.broomX).toFixed(2)} m`);
    H.setText('hint', phase === 'aim' ? '← → / mouse: broom · Q/E: turn · hold Space: throw · Tab: house view'
      : phase === 'charge' ? 'release Space at the weight you want'
      : phase === 'travel' ? (throwState.human ? 'hold Space: sweep · hold F: 5× · Tab: house view' : 'hold F: 5× · Enter: skip · Tab: house view') : '');
    $('t-act').textContent = phase === 'travel' ? 'SWEEP' : 'THROW';
    if (phase !== 'count') H.drawHouse(stones, null, showBroom ? aim.broomX : null);
  }

  syncMeshes(dt);
  poseSweepers(dt);

  const fov = cameraTarget();
  const k = 1 - Math.exp(-dt * (phase === 'travel' ? 4 : 2.5));
  camPos.lerp(tmpP, k);
  camLook.lerp(tmpL, k);
  camFov += (fov - camFov) * k;
  // keep the horizontal view on portrait screens so the house is not cropped
  const vfov = (2 * Math.atan(Math.tan((camFov * Math.PI) / 360) * Math.max(1, 1.45 / camera.aspect)) * 180) / Math.PI;
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (Math.abs(camera.fov - vfov) > 0.01) { camera.fov = vfov; camera.updateProjectionMatrix(); }

  S.key.target.position.copy(camLook);
  S.key.position.copy(camLook).add(new THREE.Vector3(2.5, 12, 4));

  const sh = throwState?.shooter;
  const speed = phase === 'travel' ? stones.reduce((a, s) => a + (s.moving ? Math.hypot(s.vx, s.vy) : 0), 0) : 0;
  A.updateAudio(dt, speed, phase === 'travel' && throwState?.sweep > 0.3 && sh?.moving);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

// Hooks for scripted screenshots and debugging.
window.__pebble = {
  get phase() { return phase; },
  get game() { return game; },
  stones,
  aim,
  opts,
  start: newGame,
  place(list) {
    for (const [id, x, y] of list) {
      Object.assign(stones[id], { x, y, inPlay: true, moving: false, out: null, vx: 0, vy: 0 });
      meshes[id].visible = true;
    }
  },
  setThrown(n) { game.thrown = n; },
  release,
  setOverhead(v) { overhead = v; },
  setFast(v) { input.fast = v; },
  setSweep(v) { input.action = v; },
  setSkipAll(v) { input.skipAll = v; input.skip = v; },
  countEnd,
  // step the running throw synchronously, then jump the camera to its target
  advance(seconds, sweep = 0) {
    const st = throwState;
    for (let t = 0; t < seconds && P.anyMoving(stones); t += P.DT) {
      st.sweep = sweep;
      P.step(stones, P.DT, sweep, st.shooter.id, st.ctx);
      st.simT += P.DT;
      if (st.tNear === null && st.shooter.y >= NEAR_HOG) st.tNear = st.simT;
    }
  },
  snap() {
    camFov = cameraTarget();
    camPos.copy(tmpP);
    camLook.copy(tmpL);
  },
  hold(v) { input.hold = v; },
};
