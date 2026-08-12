import { ARENA, createBall, stepBall, isSunk, distanceToHole, simulateTrajectory } from "./physics.js";
import { LEVELS } from "./levels.js";
import { DragInput } from "./input.js";
import * as R from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const STORAGE_KEY = "gravitee_best_v1";
const MAX_DRAG = 130;
const MIN_DRAG = 8;
const POWER_SCALE = 4.6;
const FLIGHT_DT = 1 / 60; // matches physics.simulateTrajectory's preview dt
const TOTAL_PAR = LEVELS.reduce((s, l) => s + l.par, 0);
let flightAccumulator = 0;

const els = {
  levelNum: document.getElementById("levelNum"),
  levelTotal: document.getElementById("levelTotal"),
  strokes: document.getElementById("strokes"),
  par: document.getElementById("par"),
  restartBtn: document.getElementById("restartBtn"),
  title: document.getElementById("title"),
  startBtn: document.getElementById("startBtn"),
  bestLine: document.getElementById("bestLine"),
  levelComplete: document.getElementById("levelComplete"),
  ratingText: document.getElementById("ratingText"),
  levelStrokesLine: document.getElementById("levelStrokesLine"),
  nextBtn: document.getElementById("nextBtn"),
  runComplete: document.getElementById("runComplete"),
  runSummaryLine: document.getElementById("runSummaryLine"),
  runBestLine: document.getElementById("runBestLine"),
  replayBtn: document.getElementById("replayBtn"),
  nudgeBtn: document.getElementById("nudgeBtn"),
};

els.levelTotal.textContent = LEVELS.length;

function loadBest() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { levelBest: Array(LEVELS.length).fill(null), bestTotal: null };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.levelBest) || parsed.levelBest.length !== LEVELS.length) {
      return { levelBest: Array(LEVELS.length).fill(null), bestTotal: null };
    }
    return parsed;
  } catch {
    return { levelBest: Array(LEVELS.length).fill(null), bestTotal: null };
  }
}

function saveBest(best) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(best));
}

let best = loadBest();

const state = {
  mode: "title", // title | aiming | flying | blackhole | sunk | levelComplete | runComplete
  levelIndex: 0,
  level: null,
  ball: null,
  strokes: 0,
  totalStrokes: 0,
  trail: [],
  particles: [],
  stars: R.generateStars(140),
  t: 0,
  shake: 0,
  aim: { active: false, drag: { x: 0, y: 0 }, power: 0, preview: [] },
  flyTimer: 0,
  resetTimer: 0,
  sinkTimer: 0,
};

function cloneLevel(def) {
  return {
    wells: def.wells.map((w) => ({ ...w })),
    blackHole: def.blackHole ? { ...def.blackHole } : null,
    walls: def.walls.map((w) => ({ ...w })),
    hole: { ...def.hole },
    par: def.par,
    startBall: { ...def.ball },
  };
}

function loadLevel(index) {
  const def = LEVELS[index];
  state.levelIndex = index;
  state.level = cloneLevel(def);
  state.ball = createBall(def.ball.x, def.ball.y);
  state.strokes = 0;
  state.trail = [];
  state.particles = [];
  state.mode = "aiming";
  state.aim.active = false;
  state.aim.preview = [];
  state.flyTimer = 0;
  flightAccumulator = 0;
  els.levelNum.textContent = index + 1;
  els.par.textContent = def.par;
  els.strokes.textContent = "0";
  els.nudgeBtn.classList.add("hidden");
}

function spawnBurst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const s = speed * (0.5 + Math.random() * 0.6);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.6 + Math.random() * 0.3,
      maxLife: 0.9,
      color,
      size: 2 + Math.random() * 2.5,
    });
  }
}

function updateParticles(dt) {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}

function ratingFor(strokes, par) {
  const diff = strokes - par;
  if (diff <= -2) return "EAGLE";
  if (diff === -1) return "BIRDIE";
  if (diff === 0) return "PAR";
  if (diff === 1) return "BOGEY";
  return "DOUBLE BOGEY+";
}

function onLevelSunk() {
  state.mode = "sunk";
  state.sinkTimer = 0;
  spawnBurst(state.level.hole.x, state.level.hole.y, "rgba(63, 240, 192, ALPHA)", 24, 140);
}

function finishLevelComplete() {
  const par = state.level.par;
  const strokes = state.strokes;
  state.totalStrokes += strokes;
  if (best.levelBest[state.levelIndex] === null || strokes < best.levelBest[state.levelIndex]) {
    best.levelBest[state.levelIndex] = strokes;
    saveBest(best);
  }
  els.ratingText.textContent = ratingFor(strokes, par);
  els.levelStrokesLine.textContent = `${strokes} stroke${strokes === 1 ? "" : "s"} — par ${par}`;
  state.mode = "levelComplete";
  els.levelComplete.classList.remove("hidden");
}

function onBlackHoleHit() {
  state.mode = "blackhole";
  state.shake = 1;
  spawnBurst(state.ball.x, state.ball.y, "rgba(255, 93, 122, ALPHA)", 20, 170);
  state.resetTimer = 0;
}

function canAim() {
  return state.mode === "aiming" && state.ball.resting;
}

function dragVector(pt) {
  let dx = pt.x - state.ball.x;
  let dy = pt.y - state.ball.y;
  const len = Math.hypot(dx, dy);
  if (len > MAX_DRAG) {
    dx = (dx / len) * MAX_DRAG;
    dy = (dy / len) * MAX_DRAG;
  }
  return { x: dx, y: dy, len: Math.min(len, MAX_DRAG) };
}

const input = new DragInput(canvas, {
  canAim,
  onAimStart(pt) {
    state.aim.active = true;
    const d = dragVector(pt);
    state.aim.drag = d;
    state.aim.power = d.len / MAX_DRAG;
  },
  onAimMove(pt) {
    if (!state.aim.active) return;
    const d = dragVector(pt);
    state.aim.drag = d;
    state.aim.power = d.len / MAX_DRAG;
    const vx = -d.x * POWER_SCALE;
    const vy = -d.y * POWER_SCALE;
    state.aim.preview = simulateTrajectory(state.ball, state.level, vx, vy);
  },
  onAimEnd() {
    if (!state.aim.active) return;
    state.aim.active = false;
    const d = state.aim.drag;
    if (d.len < MIN_DRAG) {
      state.aim.preview = [];
      return;
    }
    const vx = -d.x * POWER_SCALE;
    const vy = -d.y * POWER_SCALE;
    state.ball.vx = vx;
    state.ball.vy = vy;
    state.ball.resting = false;
    state.strokes += 1;
    els.strokes.textContent = state.strokes;
    state.mode = "flying";
    state.flyTimer = 0;
    flightAccumulator = 0;
    state.trail = [];
    state.aim.preview = [];
  },
});

function restartLevel() {
  loadLevel(state.levelIndex);
}

els.restartBtn.addEventListener("click", restartLevel);
window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    if (state.mode !== "title" && state.mode !== "runComplete") restartLevel();
  }
  if (e.key === "Enter" && state.mode === "levelComplete") goNextLevel();
});

function goNextLevel() {
  els.levelComplete.classList.add("hidden");
  if (state.levelIndex + 1 < LEVELS.length) {
    loadLevel(state.levelIndex + 1);
  } else {
    showRunComplete();
  }
}

function showRunComplete() {
  state.mode = "runComplete";
  const total = state.totalStrokes;
  els.runSummaryLine.textContent = `${total} strokes across ${LEVELS.length} holes — par ${TOTAL_PAR}`;
  if (best.bestTotal === null || total < best.bestTotal) {
    best.bestTotal = total;
    saveBest(best);
    els.runBestLine.textContent = "New best round!";
  } else {
    els.runBestLine.textContent = `Best round: ${best.bestTotal} strokes`;
  }
  els.runComplete.classList.remove("hidden");
}

els.nextBtn.addEventListener("click", goNextLevel);
els.replayBtn.addEventListener("click", () => {
  els.runComplete.classList.add("hidden");
  state.totalStrokes = 0;
  loadLevel(0);
});
els.startBtn.addEventListener("click", () => {
  els.title.classList.add("hidden");
  state.totalStrokes = 0;
  loadLevel(0);
});
els.nudgeBtn.addEventListener("click", () => {
  const a = Math.random() * Math.PI * 2;
  state.ball.vx += Math.cos(a) * 90;
  state.ball.vy += Math.sin(a) * 90;
  state.flyTimer = 0;
  els.nudgeBtn.classList.add("hidden");
});

if (best.bestTotal !== null) {
  els.bestLine.textContent = `Best round: ${best.bestTotal} strokes (par ${TOTAL_PAR})`;
}

let lastTime = null;

function frame(now) {
  if (lastTime === null) lastTime = now;
  let dt = (now - lastTime) / 1000;
  dt = Math.min(dt, 1 / 30);
  lastTime = now;
  state.t += dt;

  update(dt);
  draw();

  requestAnimationFrame(frame);
}

function update(dt) {
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.4);
  updateParticles(dt);

  if (!state.level) return;

  if (state.mode === "flying") {
    // Step in the same fixed increments as the aim-time trajectory preview
    // (physics.simulateTrajectory) so real flight never diverges from what
    // was previewed — gravity slingshots are chaotically timestep-sensitive.
    flightAccumulator += dt;
    let settled = false;
    while (flightAccumulator >= FLIGHT_DT && state.mode === "flying") {
      flightAccumulator -= FLIGHT_DT;
      const result = stepBall(state.ball, state.level, FLIGHT_DT);
      state.trail.push({ x: state.ball.x, y: state.ball.y });
      if (state.trail.length > 40) state.trail.shift();
      state.flyTimer += FLIGHT_DT;

      if (result.hitBlackHole) {
        onBlackHoleHit();
      } else if (isSunk(state.ball, state.level.hole)) {
        onLevelSunk();
      } else if (state.ball.resting) {
        settled = true;
        break;
      }
    }
    if (settled) {
      state.mode = "aiming";
      state.flyTimer = 0;
      flightAccumulator = 0;
      els.nudgeBtn.classList.add("hidden");
    } else if (state.mode === "flying" && state.flyTimer > 6) {
      els.nudgeBtn.classList.remove("hidden");
    }
  } else if (state.mode === "blackhole") {
    state.resetTimer += dt;
    if (state.resetTimer > 0.55) {
      state.ball = createBall(state.level.startBall.x, state.level.startBall.y);
      state.strokes += 1;
      els.strokes.textContent = state.strokes;
      state.trail = [];
      state.mode = "aiming";
      flightAccumulator = 0;
    }
  } else if (state.mode === "sunk") {
    state.sinkTimer += dt;
    const hole = state.level.hole;
    const t = Math.min(1, state.sinkTimer / 0.5);
    state.ball.x = state.ball.x + (hole.x - state.ball.x) * t * 0.35;
    state.ball.y = state.ball.y + (hole.y - state.ball.y) * t * 0.35;
    state.ball.radius = Math.max(1, 8 * (1 - t));
    if (state.sinkTimer > 0.55) {
      finishLevelComplete();
    }
  }
}

function draw() {
  ctx.save();
  if (state.shake > 0) {
    const m = state.shake * 8;
    ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
  }

  R.drawBackground(ctx, state.stars, state.t);

  if (state.level) {
    R.drawWalls(ctx, state.level.walls);
    R.drawWells(ctx, state.level.wells, state.t);
    R.drawBlackHole(ctx, state.level.blackHole, state.t);
    const prox = 1 - Math.min(1, distanceToHole(state.ball, state.level.hole) / 260);
    R.drawHole(ctx, state.level.hole, state.t, Math.max(0, prox));
    R.drawTrail(ctx, state.trail);

    if (state.aim.active && state.aim.preview.length) {
      R.drawTrajectoryPreview(ctx, state.aim.preview, state.t);
    }

    R.drawBall(ctx, state.ball);

    if (state.aim.active) {
      R.drawAimGuide(ctx, state.ball, state.aim.drag, state.aim.power);
    }

    R.drawParticles(ctx, state.particles);
  }

  ctx.restore();
}

requestAnimationFrame(frame);
