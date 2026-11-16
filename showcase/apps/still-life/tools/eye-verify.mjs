// Statistical audit of the compositor. Run: node tools/eye-verify.mjs
// Every bound is 4 sigma for a deliberately conservative effective sample size:
// cells per frame times the number of independent worlds, never cells times
// frames, because a still item repeats the same coins in every frame.

import { createCore } from '../js/eye-core.js';
import { diskMask, ringMask, rectMask } from '../js/shape.js';

const COLS = 320;
const ROWS = 180;
const CELLS = COLS * ROWS;
const WORLDS = 8;
const FRAMES = 300;
const SIGMAS = 4;

const disk = diskMask(22);
const ring = ringMask(20, 13);
const label = rectMask(70, 16);
const panel = rectMask(40, 30);
const flowDisk = diskMask(24);
const slab = rectMask(50, 50);
const bigDisk = diskMask(45);
const edgeDisk = diskMask(20);

// Items of every kind the contract allows, animated by closed-form integer
// motion. Odd worlds drift the ground, so still items show as islands.
function sceneAt(w, t) {
  const p = `w${w}:`;
  const drift = w % 2 === 1;
  return {
    ground: { u: drift ? t + w * 100003 : w * 100003, v: drift ? (t >> 1) - w * 7919 : -w * 7919 },
    items: [
      { id: p + 'big', mask: bigDisk, x: 200, y: 30 },
      { id: p + 'disk', mask: disk, x: Math.round(138 + 120 * Math.cos(t * 0.05)), y: Math.round(68 + 50 * Math.sin(t * 0.07)) },
      { id: p + 'label', mask: label, x: ((t * 2) % 420) - 80, y: 20 },
      { id: p + 'ring', mask: ring, x: 20 + (t % 220), y: 60 + ((t * 3) % 100) },
      { id: p + 'sim', mask: panel, x: 250, y: 120, simmer: 0.4 },
      { id: p + 'flow', mask: flowDisk, x: 30, y: 110, u: t, v: -(t >> 2) },
      { id: p + 'ov1', mask: slab, x: 100 + (t % 40), y: 100 },
      { id: p + 'ov2', mask: disk, x: 120, y: 105 - (t % 20) },
      { id: p + 'edge', mask: edgeDisk, x: -12, y: 70 },
      { id: p + 'edge2', mask: edgeDisk, x: COLS - 15 - (t % 9), y: ROWS - 12 },
      { id: p + 'ghost', mask: null, x: 0, y: 0 },
    ],
  };
}

const rows = [];
let failed = false;

function report(name, measured, bound, ok, detail = '') {
  if (!ok) failed = true;
  rows.push({ name, measured, bound, ok, detail });
}

function checkNearZero(name, measured, sample) {
  const bound = SIGMAS / Math.sqrt(sample);
  const dev = Math.abs(measured);
  report(name, measured, bound, dev <= bound, `n=${Math.round(sample).toLocaleString('en-US')}`);
}

function pooledStatistics() {
  const core = createCore({ cols: COLS, rows: ROWS });
  const acc = {
    frames: 0, lightAll: 0, cellsIn: 0, lightIn: 0, cellsOut: 0, lightOut: 0,
    sumBitInside: 0, hProd: 0, hPairs: 0, vProd: 0, vPairs: 0, bProd: 0, bPairs: 0,
  };
  for (let w = 0; w < WORLDS; w++) {
    for (let t = 0; t < FRAMES; t++) {
      const { bits, owner } = core.compose(sceneAt(w, t));
      acc.frames++;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const idx = y * COLS + x;
          const bit = bits[idx];
          const inside = owner[idx] !== 0;
          acc.lightAll += bit;
          if (inside) { acc.cellsIn++; acc.lightIn += bit; acc.sumBitInside += bit; }
          else { acc.cellsOut++; acc.lightOut += bit; }
          const s = bit * 2 - 1;
          if (x + 1 < COLS) {
            const prod = s * (bits[idx + 1] * 2 - 1);
            acc.hProd += prod; acc.hPairs++;
            if (owner[idx] !== owner[idx + 1]) { acc.bProd += prod; acc.bPairs++; }
          }
          if (y + 1 < ROWS) {
            const prod = s * (bits[idx + COLS] * 2 - 1);
            acc.vProd += prod; acc.vPairs++;
            if (owner[idx] !== owner[idx + COLS]) { acc.bProd += prod; acc.bPairs++; }
          }
        }
      }
    }
  }
  return acc;
}

function auditStatistics() {
  const a = pooledStatistics();
  const totalCells = a.frames * CELLS;
  const perWorld = (n) => (n / a.frames) * WORLDS;

  const frac = (light, n) => light / n;
  const sigmaFrac = (n) => 0.5 / Math.sqrt(n);
  const fractionRow = (name, light, n) => {
    const measured = frac(light, n);
    const bound = SIGMAS * sigmaFrac(perWorld(n));
    report(name, measured, bound, Math.abs(measured - 0.5) <= bound, `n=${Math.round(perWorld(n)).toLocaleString('en-US')}`);
  };
  fractionRow('light fraction, all cells', a.lightAll, totalCells);
  fractionRow('light fraction, inside items', a.lightIn, a.cellsIn);
  fractionRow('light fraction, outside items', a.lightOut, a.cellsOut);

  const pIn = a.cellsIn / totalCells;
  const pBit = a.lightAll / totalCells;
  const cov = a.sumBitInside / totalCells - pBit * pIn;
  const phi = cov / Math.sqrt(pBit * (1 - pBit) * pIn * (1 - pIn));
  checkNearZero('corr(bit, inside an item)', phi, perWorld(totalCells));

  checkNearZero('lag-1 autocorrelation, horizontal', a.hProd / a.hPairs, perWorld(a.hPairs));
  checkNearZero('lag-1 autocorrelation, vertical', a.vProd / a.vPairs, perWorld(a.vPairs));
  checkNearZero('lag-1 across item boundaries', a.bProd / a.bPairs, perWorld(a.bPairs));
}

function auditStillness() {
  const core = createCore({ cols: COLS, rows: ROWS });
  // Dirty the buffers with motion first, so a stale-buffer bug cannot hide.
  for (let t = 0; t < 5; t++) core.compose(sceneAt(0, t));

  const still = () => {
    const s = sceneAt(0, 0);
    for (const item of s.items) if (item.simmer) item.simmer = 0;
    s.ground = { u: 17, v: -3 };
    return s;
  };
  const first = Uint8Array.from(core.compose(still()).bits);
  let differing = 0;
  for (let t = 0; t < 30; t++) {
    const { bits } = core.compose(still());
    for (let i = 0; i < CELLS; i++) if (bits[i] !== first[i]) differing++;
  }
  report('still scene: cells that change', differing, 0, differing === 0, '30 frames');
}

function auditMotion() {
  const core = createCore({ cols: COLS, rows: ROWS });
  const mover = diskMask(15);
  const resting = [
    { id: 'rest-a', mask: disk, x: 60, y: 60 },
    { id: 'rest-b', mask: rectMask(30, 20), x: 200, y: 120 },
    { id: 'rest-c', mask: ring, x: 250, y: 20 },
  ];

  let escapes = 0;
  let changed = 0;
  let unionSize = 0;
  const trials = 6;
  const footprint = new Uint8Array(CELLS);

  for (let trial = 0; trial < trials; trial++) {
    const dx = [3, -2, 1, 0, 2, -3][trial];
    const dy = [-1, 2, 0, 3, 2, -2][trial];
    const at = (t) => ({ x: (dx >= 0 ? -20 : 320) + dx * t, y: 80 - dy * 10 + dy * t });
    const sceneFor = (t) => {
      const pos = at(t);
      return { items: [...resting, { id: `mover-${trial}`, mask: mover, x: pos.x, y: pos.y }] };
    };
    let prev = Uint8Array.from(core.compose(sceneFor(0)).bits);
    for (let t = 1; t < 110; t++) {
      const { bits } = core.compose(sceneFor(t));
      footprint.fill(0);
      for (const tt of [t - 1, t]) {
        const pos = at(tt);
        for (let my = 0; my < mover.h; my++) {
          for (let mx = 0; mx < mover.w; mx++) {
            const cx = pos.x + mx;
            const cy = pos.y + my;
            if (mover.data[my * mover.w + mx] && cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) footprint[cy * COLS + cx] = 1;
          }
        }
      }
      for (let i = 0; i < CELLS; i++) {
        const flipped = bits[i] !== prev[i];
        if (footprint[i]) { unionSize++; if (flipped) changed++; }
        else if (flipped) escapes++;
      }
      prev = Uint8Array.from(bits);
    }
  }
  report('moving item: changes outside its footprints', escapes, 0, escapes === 0, `${trials} trajectories`);
  const fraction = changed / unionSize;
  // The item's local texture is a fixed patch, so independent samples are the
  // patch area per trajectory, not the number of cells visited.
  const bound = SIGMAS * 0.5 / Math.sqrt(mover.data.reduce((s, v) => s + v, 0) * trials);
  report('moving item: changed share of footprints', fraction, bound, Math.abs(fraction - 0.5) <= bound, `n=${(mover.data.reduce((s, v) => s + v, 0) * trials).toLocaleString('en-US')}`);
}

function auditReference() {
  const core = createCore({ cols: COLS, rows: ROWS });
  let mismatches = 0;
  for (let t = 0; t < 40; t += 7) {
    const scene = sceneAt(1, t);
    for (const item of scene.items) delete item.simmer;
    const { bits } = core.compose(scene);
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        let expected = core.N('ground', cx - scene.ground.u, cy - scene.ground.v);
        for (let k = scene.items.length - 1; k >= 0; k--) {
          const it = scene.items[k];
          if (!it.mask) continue;
          const mx = cx - it.x;
          const my = cy - it.y;
          if (mx >= 0 && my >= 0 && mx < it.mask.w && my < it.mask.h && it.mask.data[my * it.mask.w + mx]) {
            expected = core.N(it.id, mx - (it.u || 0), my - (it.v || 0));
            break;
          }
        }
        if (bits[cy * COLS + cx] !== expected) mismatches++;
      }
    }
  }
  report('rendering rule vs brute-force reference', mismatches, 0, mismatches === 0, '6 scenes');
}

function auditHash() {
  const core = createCore({ cols: COLS, rows: ROWS });
  let unstable = 0;
  for (let n = 0; n < 5000; n++) {
    const i = ((n * 7919) % 2001) - 1000;
    const j = ((n * 104729) % 2001) - 1000;
    if (core.N('x', i, j) !== core.N('x', i, j)) unstable++;
  }
  report('N is a pure function of its arguments', unstable, 0, unstable === 0, '5,000 calls');

  const span = 256;
  const phiBetween = (idA, idB) => {
    let sa = 0, sb = 0, sab = 0;
    for (let j = -span / 2; j < span / 2; j++) {
      for (let i = -span / 2; i < span / 2; i++) {
        const a = core.N(idA, i, j);
        const b = core.N(idB, i, j);
        sa += a; sb += b; sab += a * b;
      }
    }
    const n = span * span;
    const pa = sa / n, pb = sb / n;
    return (sab / n - pa * pb) / Math.sqrt(pa * (1 - pa) * pb * (1 - pb));
  };
  checkNearZero('corr of textures, ids "a" and "b"', phiBetween('a', 'b'), span * span);
  checkNearZero('corr of textures, ids "player" and "ground"', phiBetween('player', 'ground'), span * span);

  let light = 0;
  for (let j = -200; j < 0; j++) for (let i = -200; i < 0; i++) light += core.N('neg', i, j);
  const measured = light / 40000;
  const bound = SIGMAS * 0.5 / Math.sqrt(40000);
  report('light fraction at negative coordinates', measured, bound, Math.abs(measured - 0.5) <= bound, 'n=40,000');
}

auditStatistics();
auditStillness();
auditMotion();
auditReference();
auditHash();

const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(5));
const width = Math.max(...rows.map((r) => r.name.length));
console.log(`${'check'.padEnd(width)}  ${'measured'.padStart(9)}  ${'bound'.padStart(9)}  result  sample`);
for (const r of rows) {
  console.log(`${r.name.padEnd(width)}  ${fmt(r.measured).padStart(9)}  ${(r.bound === 0 ? '0' : fmt(r.bound)).padStart(9)}  ${(r.ok ? 'pass' : 'FAIL').padEnd(6)}  ${r.detail}`);
}
console.log(failed ? '\nFAILED' : '\nall checks passed');
process.exit(failed ? 1 : 0);
