import * as THREE from '../vendor/three.module.js';
import { N, CELL_AREA, idx, gx2wx } from './grid.js';
import { LEVELS, meltRate, burstWindow } from './levels.js';
import { buildWorld, refreshSurface, volumeOver } from './world.js';
import { Water } from './water.js';
import { Tools, updateStructures } from './tools.js';
import { CameraRig, Input, pickTerrain, pointerRay } from './input.js';
import {
  createScene,
  createTerrainMesh,
  createWaterMesh,
  createWallMesh,
  createProps,
  createSkirtMesh,
  updateSkirt,
  paintTerrain,
  updateWaterMesh,
  updateWallMesh,
} from './render.js';
import { Hud } from './hud.js';
import { initAudio, resumeAudio, setMuted, isMuted, setRiver, sfx } from './audio.js';

const SIM_DT = 0.008;
const STORE = 'meltwater.progress.v1';

const canvas = document.getElementById('game');
const { renderer, scene, camera } = createScene(canvas);
const rig = new CameraRig(camera);

let world = null;
let water = null;
let tools = null;
let terrainMesh = null;
let waterMesh = null;
let wallMesh = null;
let skirtMesh = null;
let props = null;

const game = {
  phase: 'title',
  level: LEVELS[0],
  levelIndex: 0,
  meltTime: 0,
  settleTime: 0,
  rate: 0,
  timeScale: 1,
  paused: false,
  world: null,
  tools: null,
  hover: null,
  burstWarned: false,
  floodToastAt: -99,
};

const progress = loadProgress();

function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE));
    if (raw && typeof raw.unlocked === 'number') return raw;
  } catch (e) {
    /* first run */
  }
  return { unlocked: 0, best: LEVELS.map(() => 0) };
}

function saveProgress() {
  try {
    localStorage.setItem(STORE, JSON.stringify(progress));
  } catch (e) {
    /* private mode: progress just does not persist */
  }
}

// --------------------------------------------------------------------- setup

const hud = new Hud({
  onTool: (t) => setTool(t),
  onBrush: (d) => {
    tools?.setRadius(d * 2);
    if (tools) hud.setBrush(tools.radius, tools.minR, tools.maxR);
  },
  onRelease: () => startMelt(),
  onStart: () => beginLevel(progress.unlocked),
  onPickSeason: (i) => beginLevel(i),
  onBriefDone: () => {
    hud.showScreen(null);
    game.phase = 'survey';
  },
  onHelpClose: () => hud.showScreen(game.phase === 'title' ? 'title' : game.paused ? 'pause' : null),
  onNext: () => beginLevel(Math.min(LEVELS.length - 1, game.levelIndex + 1)),
  onRetry: () => beginLevel(game.levelIndex),
  onMenu: () => toMenu(),
  onResume: () => {
    game.paused = false;
    hud.showScreen(null);
  },
  onGate: (n) => toggleGate(n),
  onMute: () => {
    setMuted(!isMuted());
    hud.setMuted(isMuted());
  },
});

const input = new Input(canvas, rig, {
  onPaintStart: () => {
    resumeAudio();
    tools?.startStroke();
  },
  onPaintEnd: () => tools?.endStroke(),
  onKey: (code, e) => onKey(code, e),
});

function onKey(code, e) {
  if (game.phase === 'title') {
    if (code === 'Enter') beginLevel(progress.unlocked);
    return;
  }
  const map = { KeyQ: 'dig', KeyE: 'raise', KeyR: 'dam', KeyT: 'gate', KeyX: 'erase' };
  if (map[code]) return setTool(map[code]);
  if (code === 'BracketLeft') {
    tools.setRadius(-2);
    hud.setBrush(tools.radius, tools.minR, tools.maxR);
  }
  if (code === 'BracketRight') {
    tools.setRadius(2);
    hud.setBrush(tools.radius, tools.minR, tools.maxR);
  }
  if (code === 'Space' && game.phase === 'survey') {
    e.preventDefault();
    startMelt();
  }
  if (code.startsWith('Digit')) {
    const n = Number(code.slice(5)) - 1;
    if (n >= 0 && n < 4) toggleGate(n);
  }
  if (code === 'KeyM') {
    setMuted(!isMuted());
    hud.setMuted(isMuted());
  }
  if (code === 'Escape' && (game.phase === 'survey' || game.phase === 'melt' || game.phase === 'settle')) {
    game.paused = !game.paused;
    hud.showScreen(game.paused ? 'pause' : null);
  }
}

function setTool(t) {
  if (!tools) return;
  if (tools.available()[t] === false) {
    sfx.deny();
    return;
  }
  tools.tool = t;
  hud.setTool(t, tools.available());
  sfx.click();
}

function toggleGate(n) {
  if (!tools || !world.gates[n]) return;
  const open = tools.toggleGate(n);
  refreshSurface(world);
  hud.setGates(world.gates);
  sfx.gate(open);
}

// --------------------------------------------------------------------- level

function beginLevel(index) {
  initAudio();
  resumeAudio();
  game.levelIndex = index;
  game.level = LEVELS[index];
  world = buildWorld(index);
  water = new Water();
  tools = new Tools(world);
  game.world = world;
  game.tools = tools;
  game.meltTime = 0;
  game.settleTime = 0;
  game.rate = 0;
  game.timeScale = 1;
  game.paused = false;
  game.burstWarned = false;
  game.phase = 'brief';
  refreshSurface(world);

  if (terrainMesh) {
    scene.remove(terrainMesh, waterMesh, wallMesh, skirtMesh, props);
    terrainMesh.geometry.dispose();
    waterMesh.geometry.dispose();
    skirtMesh.geometry.dispose();
  }
  terrainMesh = createTerrainMesh();
  waterMesh = createWaterMesh();
  wallMesh = createWallMesh();
  skirtMesh = createSkirtMesh();
  props = createProps(world);
  scene.add(terrainMesh, waterMesh, wallMesh, skirtMesh, props);
  paintTerrain(terrainMesh, world, water);
  updateSkirt(skirtMesh, world);

  // Frame the valley floor between the glacier and the outlet.
  rig.target.set(0, 8, 8);
  rig.theta = 0.16;
  rig.phi = 0.9;
  rig.radius = 176;
  rig.apply();

  hud.buildObjectives(world);
  hud.setGates(world.gates);
  hud.setTool(tools.tool, tools.available());
  hud.setBrush(tools.radius, tools.minR, tools.maxR);
  hud.showBrief(game.level, index);
  hud.update(game);
}

function toMenu() {
  game.phase = 'title';
  game.paused = false;
  hud.buildSeasonGrid(progress.unlocked, progress.best);
  hud.showScreen('title');
}

function startMelt() {
  if (game.phase !== 'survey') return;
  game.phase = 'melt';
  game.meltTime = 0;
  sfx.release();
  hud.toast('The glacier is running.', 'good');
}

// ----------------------------------------------------------------- simulation

let simAcc = 0;

function simulate(dt) {
  const level = game.level;
  simAcc = Math.min(simAcc + dt, 0.12);

  while (simAcc >= SIM_DT) {
    simAcc -= SIM_DT;

    if (game.phase === 'melt') {
      game.meltTime += SIM_DT;
      game.rate = meltRate(level, game.meltTime);
      const shares = world.sources.map((s) => s.share ?? 1 / world.sources.length);
      const total = shares.reduce((a, b) => a + b, 0);
      world.sources.forEach((s, i) => {
        water.pour(s.cells, (game.rate * SIM_DT * shares[i]) / total);
      });
      if (game.meltTime >= level.melt.duration) {
        game.phase = 'settle';
        game.rate = 0;
        game.timeScale = 2.5;
        hud.toast('The melt is over — let the valley drain.', '');
      }
    }

    water.step(SIM_DT, world.surface, {});
    if (level.erosion) {
      water.erode(SIM_DT, world);
      tools.dirty = true;
    }
    updateStructures(world, water, SIM_DT, (count) => {
      sfx.breach();
      hud.toast(count > 3 ? 'The dam has gone!' : 'A dam is breaching!', 'bad');
      tools.dirty = true;
    });

    if (tools.dirty) {
      refreshSurface(world);
      tools.dirty = false;
    }
  }
}

let flowSmooth = 0;

function updateObjectives(dt) {
  const depth = water.depth;

  for (const f of world.fields) {
    let wet = 0;
    for (let k = 0; k < f.cells.length; k++) if (depth[f.cells[k]] > 0.05) wet++;
    f.wetFrac = wet / f.cells.length;
    if (!f.done) {
      f.soaked += dt * f.wetFrac;
      if (f.soaked >= f.need) {
        f.done = true;
        sfx.fieldDone();
        hud.toast(`${f.name} is irrigated.`, 'good');
      }
    }
  }

  for (const v of world.villages) {
    let flooded = 0;
    for (let k = 0; k < v.cells.length; k++) if (depth[v.cells[k]] > 0.35) flooded++;
    v.flooded = flooded / v.cells.length;
    if (v.flooded > 0.02) {
      v.damage += dt * v.flooded * 12;
      const now = performance.now() / 1000;
      if (now - game.floodToastAt > 6) {
        game.floodToastAt = now;
        sfx.flood();
        hud.toast(`Water is in ${v.name}.`, 'bad');
      }
    }
  }

  for (const r of world.reservoirs) r.held = volumeOver(depth, r.cells);

  const bw = burstWindow(game.level);
  if (bw && !game.burstWarned && game.meltTime > bw.start - 6 && game.phase === 'melt') {
    game.burstWarned = true;
    hud.toast('The ice dam on the shoulder is going to let go.', 'bad');
    sfx.strain();
  }

  // River sound follows the actual moving volume in the valley.
  let flow = 0;
  const speed = water.speed;
  for (let i = 0; i < depth.length; i += 3) flow += depth[i] * speed[i];
  flow *= 3 * CELL_AREA;
  flowSmooth += (flow - flowSmooth) * Math.min(1, dt * 3);
  setRiver(flowSmooth, Math.min(1, game.rate / 20));
}

function settleCheck() {
  if (game.phase !== 'settle') return;
  game.settleTime += 1 / 60;
  const vol = water.volume();
  if (vol < 6 || game.settleTime > 26) finishSeason();
}

function finishSeason() {
  game.phase = 'result';
  const level = game.level;
  const fields = world.fields;
  const irrig = fields.reduce((s, f) => s + Math.min(1, f.soaked / f.need), 0) / Math.max(1, fields.length);
  const allFields = fields.every((f) => f.done);
  const damage = world.villages.reduce((s, v) => s + v.damage, 0);
  const tolerance = world.villages.reduce((s, v) => s + v.tolerance, 0);
  const held = world.reservoirs.reduce((s, r) => s + r.held, 0);
  const bankOk = !level.bankTarget || held >= level.bankTarget;
  const passed = allFields && damage <= tolerance && bankOk;

  const score = Math.max(
    0,
    Math.round(
      irrig * 1000 +
        (level.bankTarget ? Math.min(held, level.bankTarget * 1.6) * 1.1 : 0) +
        Math.max(0, level.work - tools.work) * 0.22 +
        (passed ? 250 : 0) -
        damage * 7
    )
  );

  const rows = fields.map((f) => ({
    label: f.name,
    value: f.done ? 'irrigated' : `${Math.round((f.soaked / f.need) * 100)}% — short`,
    ok: f.done,
  }));
  if (level.bankTarget) {
    rows.push({
      label: 'Water banked',
      value: `${Math.round(held)} / ${level.bankTarget} m³`,
      ok: bankOk,
    });
  }
  rows.push({
    label: world.villages[0].name,
    value: damage < 0.5 ? 'dry' : `${Math.round(damage)} damage (tolerance ${Math.round(tolerance)})`,
    ok: damage <= tolerance,
  });
  rows.push({
    label: 'Meltwater delivered',
    value: `${Math.round(water.poured - water.drained)} of ${Math.round(water.poured)} m³ kept in the valley`,
    ok: null,
  });
  rows.push({ label: 'Earth moved', value: `${Math.round(tools.work)} / ${level.work} m³`, ok: null });

  if (passed) {
    sfx.win();
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length - 1, game.levelIndex + 1));
  } else {
    sfx.lose();
  }
  progress.best[game.levelIndex] = Math.max(progress.best[game.levelIndex] || 0, passed ? score : 0);
  saveProgress();
  setRiver(0, 0);

  hud.showResult({
    passed,
    name: level.name,
    rows,
    score,
    hasNext: game.levelIndex < LEVELS.length - 1,
  });
}

// ---------------------------------------------------------------------- loop

let last = performance.now();
let paintClock = 0;
let frameCount = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!world) {
    renderer.render(scene, camera);
    return;
  }

  const live = !game.paused && (game.phase === 'survey' || game.phase === 'melt' || game.phase === 'settle');
  input.cameraKeys(dt);

  // Hover + brush cursor.
  let hover = null;
  if (input.hasPointer && live) {
    const dir = pointerRay(camera, input.pointer);
    hover = pickTerrain(camera.position, dir, world.surface);
  }
  game.hover = hover;
  const u = terrainMesh.material.uniforms;
  if (hover) {
    u.uBrush.value.set(hover.world.x, hover.world.z);
    u.uBrushR.value = tools.tool === 'dig' || tools.tool === 'raise' ? tools.radius : 2.4;
    u.uBrushOn.value = 1;
    u.uBrushColor.value.setHex(
      tools.tool === 'dig' ? 0xffe9a8 : tools.tool === 'raise' ? 0xc8f0a0 : tools.tool === 'erase' ? 0xff9c8a : 0x9fd8ff
    );
  } else {
    u.uBrushOn.value = 0;
  }

  if (live && input.painting && hover) {
    const melting = game.phase !== 'survey';
    const moved = tools.apply(hover.gx, hover.gz, dt, melting);
    if (moved > 0 && frameCount % 6 === 0) {
      if (tools.tool === 'dig') sfx.dig();
      else if (tools.tool === 'raise') sfx.fill();
      else sfx.place();
    }
    if (tools.blocked && frameCount % 30 === 0) {
      sfx.deny();
      const msg = {
        work: 'No earth-moving budget left this season.',
        spoil: 'The spoil pile is empty — dig somewhere to fill it.',
        timber: 'Out of timber.',
        gates: 'Four gates is all the ironmongery you have.',
      }[tools.blocked];
      if (msg) hud.toast(msg, 'bad');
    }
    if (tools.tool === 'gate' || tools.tool === 'erase') hud.setGates(world.gates);
  }

  if (live) {
    simulate(dt * game.timeScale);
    updateObjectives(dt * game.timeScale);
    settleCheck();
  }

  paintClock += dt;
  if (paintClock > 0.07 || tools.dirty) {
    paintClock = 0;
    paintTerrain(terrainMesh, world, water);
    updateSkirt(skirtMesh, world);
  }
  updateWaterMesh(waterMesh, world, water);
  updateWallMesh(wallMesh, world);
  waterMesh.material.uniforms.uTime.value = now / 1000;

  hud.update(game);
  renderer.render(scene, camera);
  frameCount++;
}

hud.buildSeasonGrid(progress.unlocked, progress.best);
hud.showScreen('title');
hud.setMuted(false);
requestAnimationFrame(frame);

// Exposed so the screenshot tooling (and anyone curious in a console) can drive
// a season without a mouse: run the sim faster than real time, and paint a
// stroke along a path of grid points.
function fastForward(seconds) {
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) {
    if (game.phase !== 'melt' && game.phase !== 'settle') break;
    simulate(step * game.timeScale);
    updateObjectives(step * game.timeScale);
    settleCheck();
  }
  refreshSurface(world);
  paintTerrain(terrainMesh, world, water);
  updateSkirt(skirtMesh, world);
}

function stroke(tool, points, passes = 1) {
  tools.tool = tool;
  tools.startStroke();
  for (let p = 0; p < passes; p++) {
    for (const [gx, gz, dt] of points) tools.apply(gx, gz, dt ?? 0.05, game.phase !== 'survey');
  }
  tools.endStroke();
  refreshSurface(world);
  paintTerrain(terrainMesh, world, water);
}

window.MELTWATER = {
  game,
  beginLevel,
  startMelt,
  fastForward,
  stroke,
  rig,
  camera,
  THREE,
  get world() {
    return world;
  },
  get water() {
    return water;
  },
  get tools() {
    return tools;
  },
};
