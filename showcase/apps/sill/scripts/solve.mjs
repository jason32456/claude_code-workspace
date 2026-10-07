// Plays every level headlessly by moving panes along scripted paths, the way a
// player would drag windows, and reports whether every pot filled.
import { World } from '../js/world.js';
import { LEVELS } from '../js/levels.js';

const S = { x: 0, y: 0, w: 1440, h: 848 };
const lerp = (a, b, t) => a + (b - a) * t;
// A plan is a list of panes; each pane is a list of keyframes [t, x, y, w, h, flags].
// flags: { hide: true } hides the pane, { drain: x } opens its sill at screen x.
function at(keys, t) {
  let k = 0;
  while (k < keys.length - 1 && keys[k + 1][0] <= t) k++;
  const a = keys[k], b = keys[Math.min(k + 1, keys.length - 1)];
  if (t <= a[0] || a === b) return { x: a[1], y: a[2], w: a[3], h: a[4], f: a[5] || {} };
  const u = Math.min(1, (t - a[0]) / (b[0] - a[0]));
  return { x: lerp(a[1], b[1], u), y: lerp(a[2], b[2], u), w: lerp(a[3], b[3], u), h: lerp(a[4], b[4], u), f: a[5] || {} };
}
export function play(index, plan, seconds, verbose = false) {
  const w = new World(); w.setScreen(S); w.loadLevel(index);
  let done = -1;
  for (let fr = 0; fr < seconds * 60; fr++) {
    const t = fr / 60, now = t * 1000;
    plan.forEach((keys, i) => {
      const r = at(keys, t);
      w.setPane('p' + i, { x: r.x, y: r.y, w: r.w, h: r.h, visible: !r.f.hide, drain: r.f.drain != null ? { open: true, x: r.f.drain } : null }, now);
    });
    w.step(now);
    if (done < 0 && w.stats.done >= 0) done = t;
    if (verbose && fr % 60 === 0) console.log(t, w.level.pots.map((p) => p.fill).join('/'), 'n', w.fluid.n, 'spill', w.stats.spilled);
  }
  const lv = w.level;
  return { level: lv.name, fills: lv.pots.map((p) => `${p.fill}/${p.need}`).join(' '), done: done >= 0 ? done.toFixed(1) + 's' : 'NO', spilled: w.stats.spilled, steam: w.stats.steam };
}

const plans = {
  sill: [[[0, 150, 168, 620, 372]]],
  downstream: [[[0, 20, 60, 1320, 650]]],
  uphill: [[[0, 150, 520, 500, 260], [8, 150, 520, 500, 260], [10, 450, 520, 500, 260], [14, 450, 10, 500, 255], [17, 880, 10, 500, 255]]],
  roof: [[[0, 420, 120, 560, 380], [9, 420, 120, 560, 380], [10, 420, 120, 300, 380], [13, 1045, 120, 270, 380], [14, 1045, 120, 270, 380, { drain: 1181 }]]],
  'two-gardens': [
    [[0, 420, 380, 340, 390], [7, 420, 380, 340, 390], [9, 100, 380, 340, 390], [12, 100, 20, 340, 225]],
    [[0, 0, 0, 10, 10, { hide: true }], [12, 640, 380, 660, 380]],
  ],
  wall: [[[0, 250, 450, 420, 250], [8, 250, 450, 420, 250], [9, 290, 450, 380, 250], [12, 290, 40, 380, 250], [15, 940, 40, 380, 250], [19, 940, 500, 380, 260]]],
  heat: [[[0, 140, 100, 420, 150], [8, 140, 100, 420, 150], [9, 200, 20, 380, 150], [12, 1000, 20, 380, 150], [16, 1000, 600, 380, 152]]],
};

if (process.argv[1].endsWith('solve.mjs')) {
  const only = process.argv[2];
  let ok = true;
  console.log('Scripted solutions (windows dragged along keyframed paths):');
  LEVELS.forEach((lv, i) => {
    if (!plans[lv.id] || (only && only !== lv.id)) return;
    const r = play(i, plans[lv.id], 40, !!only);
    ok = ok && r.done !== 'NO';
    console.log(`  ${r.done !== 'NO' ? 'PASS' : 'FAIL'}  ${r.level.padEnd(18)} pots ${r.fills.padEnd(16)} done ${r.done.padEnd(6)} spilled ${r.spilled}`);
  });
  // One maximised window covering the whole screen. Gravity alone has to do
  // it, so every pot above its spring must stay dry.
  console.log('One maximised window, 40 s, no dragging:');
  const max = [[[0, S.x, S.y, S.w, S.h]]];
  for (const [id, expect] of [['sill', 'dry'], ['uphill', 'dry'], ['wall', 'dry'], ['two-gardens', 'partial'], ['heat', 'dry']]) {
    if (only && only !== id) continue;
    const i = LEVELS.findIndex((l) => l.id === id);
    const r = play(i, max, 40);
    const fills = r.fills.split(' ').map((f) => f.split('/').map(Number));
    const full = fills.filter(([a, b]) => a >= b).length;
    const pass = expect === 'dry' ? full === 0 : full < fills.length;
    ok = ok && pass;
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${r.level.padEnd(18)} pots ${r.fills.padEnd(16)} (${expect === 'dry' ? 'no pot fills' : 'not every pot fills'})`);
  }
  process.exit(ok ? 0 : 1);
}
