// Headless checks for the scheduler. Run from the app folder: node scripts/bench.mjs
import { plan, whatIf, flatten, rampMinutes, mulberry, cues } from '../src/schedule.js';
import { PRESETS } from '../src/presets.js';
import { encode, decode, pack, unpack } from '../src/codec.js';

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails++;
};
const menuOf = (pr) => ({ name: pr.name, serve: pr.serve, kitchen: pr.kitchen, dishes: pr.dishes });

// Independent audit of a plan: rebuilds every resource timeline from the items
// alone and returns the first broken hard constraint, or null.
function audit(menu, kitchen, p) {
  const flat = flatten(menu);
  const it = new Map(p.items.map((i) => [i.id, i]));
  for (const s of flat.steps) {
    const i = it.get(s.id);
    if (!i) return `missing ${s.id}`;
    if (i.end - i.start !== s.dur) return `${s.id} duration`;
    for (const a of s.after) if (i.start < it.get(a).end) return `${s.id} starts before ${a} ends`;
    if (!s.succ.length && i.end > s.offset) return `${s.id} finishes after its course is served`;
    for (const x of s.succ) if (it.get(x).start < i.end) return `${x} before ${s.id}`;
    const E = (s.succ.length ? Math.max(...s.succ.map((x) => it.get(x).start)) : s.offset) - s.hold;
    if (i.late !== Math.max(0, E - i.end)) return `${s.id} lateness misreported (${i.late} vs ${Math.max(0, E - i.end)})`;
  }
  const real = p.items.filter((i) => !i.impossible);
  const lo = Math.min(...real.map((i) => i.start), 0), hi = Math.max(...real.map((i) => i.end), 0);
  for (let t = lo; t < hi; t++) {
    const handsNow = real.filter((i) => i.hands > 0 && i.start <= t && t < i.start + i.hands);
    if (handsNow.length > kitchen.cooks) return `t=${t}: ${handsNow.length} hands-on steps, ${kitchen.cooks} cooks`;
    const perCook = new Set(handsNow.map((i) => i.cook));
    if (perCook.size !== handsNow.length) return `t=${t}: a cook doing two things`;
    const b = real.filter((i) => i.equip === 'burner' && i.start <= t && t < i.end).length;
    if (b > kitchen.burners) return `t=${t}: ${b} burners in use`;
    for (let k = 0; k < kitchen.ovens.length; k++) {
      const inside = real.filter((i) => i.oven === k && i.start <= t && t < i.end);
      if (inside.reduce((n, i) => n + i.slots, 0) > kitchen.ovens[k].slots) return `t=${t}: oven ${k} over capacity`;
      if (new Set(inside.map((i) => i.temp)).size > 1) return `t=${t}: oven ${k} at two temperatures`;
    }
  }
  for (let k = 0; k < kitchen.ovens.length; k++) {
    const ov = real.filter((i) => i.oven === k).sort((a, b) => a.start - b.start);
    for (let a = 0; a < ov.length; a++) for (let b = 0; b < ov.length; b++) {
      const x = ov[a], y = ov[b];
      if (x.end <= y.start && x.temp !== y.temp) {
        const between = ov.some((z) => z.start >= x.end && z.end <= y.start);
        if (!between && y.start - x.end < rampMinutes(x.temp, y.temp)) return `oven ${k}: ${x.temp}→${y.temp} in ${y.start - x.end} min`;
      }
    }
  }
  return null;
}

// Presets
for (const pr of PRESETS) {
  const m = menuOf(pr);
  const t0 = performance.now();
  const p = plan(m, m.kitchen);
  const ms = performance.now() - t0;
  check(`${pr.name}: every hard constraint holds`, !audit(m, m.kitchen, p), audit(m, m.kitchen, p) || `${p.items.length} steps, ${ms.toFixed(0)} ms`);
  const again = plan(m, m.kitchen);
  check(`${pr.name}: deterministic`, JSON.stringify(again.items) === JSON.stringify(p.items));
  const w = whatIf(m, m.kitchen, p);
  check(`${pr.name}: every suggestion improves the plan`, w.every((x) => x.delta > 0 && audit(m, x.kitchen, plan(m, x.kitchen, { runs: 120 })) === null), w.map((x) => x.label).join(', ') || 'none needed');
  const c = cues(p);
  check(`${pr.name}: cues are in clock order and end with service`, c.every((x, i) => !i || c[i - 1].t <= x.t) && c.some((x) => x.kind === 'serve'));
}
const roast = plan(menuOf(PRESETS[0]), PRESETS[0].kitchen);
check('Sunday Roast: no hold violations on one oven', roast.score.viol === 0, `span ${roast.stats.span} min`);
const oven = roast.ovens[0].blocks.map((b) => b.temp);
check('Sunday Roast: oven goes 180 °C, then 220 °C', oven.join() === '180,220', oven.join(' → '));
const yb = roast.items.find((i) => i.id === 'b4'), y3 = roast.items.find((i) => i.id === 'y3');
check('Sunday Roast: Yorkshires bake while the beef rests', y3.start >= yb.start - 5 && y3.end <= 0);
const tg = PRESETS[1];
const tp = plan(menuOf(tg), tg.kitchen);
const tw = whatIf(menuOf(tg), tg.kitchen, tp);
check('Thanksgiving: reports a bottleneck and names a fix', tp.score.viol > 0 && tw.length > 0 && tw[0].fixed > 0, `${tp.score.viol} late min → ${tw[0]?.label} fixes ${tw[0]?.fixed}`);
for (const pr of PRESETS.slice(2)) {
  const p = plan(menuOf(pr), pr.kitchen);
  check(`${pr.name}: no hold violations`, p.score.viol === 0);
}

// Random menus
const rnd = mulberry(0xbeef);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
let bad = null, worstMs = 0;
for (let n = 0; n < 60 && !bad; n++) {
  const kitchen = { cooks: ri(1, 3), burners: ri(1, 5), ovens: Array.from({ length: ri(0, 2) }, (_, k) => ({ name: 'O' + k, slots: ri(1, 3) })) };
  const dishes = [];
  let sid = 0;
  const nd = n === 59 ? 8 : ri(2, 6);
  for (let d = 0; d < nd; d++) {
    const steps = [];
    const ns = n === 59 ? 5 : ri(1, 5);
    for (let s = 0; s < ns; s++) {
      const dur = ri(2, 60);
      const equip = ['none', 'burner', 'oven'][ri(0, 2)];
      const st = { id: 'r' + sid++, label: 'step', dur, hands: ri(0, Math.min(dur, 15)), equip, temp: [160, 180, 200, 220][ri(0, 3)], slots: ri(1, 2), hold: ri(0, 30) };
      if (s > 0 && d > 0 && rnd() < 0.15) st.after = [steps[s - 1].id, dishes[0].steps[0].id];
      steps.push(st);
    }
    dishes.push({ id: 'd' + d, name: 'D' + d, color: d, offset: rnd() < 0.15 ? ri(-30, 60) : 0, steps });
  }
  const m = { name: 'rand', serve: '19:00', kitchen, dishes };
  const t0 = performance.now();
  const p = plan(m, kitchen);
  worstMs = Math.max(worstMs, performance.now() - t0);
  const err = audit(m, kitchen, p);
  if (err) bad = `menu ${n}: ${err}`;
}
check('60 random menus: every hard constraint holds', !bad, bad || '');
check('40-step menu plans in under 300 ms', worstMs < 300, `worst ${worstMs.toFixed(0)} ms`);

// Cycles never hang the planner
const cyc = { name: 'c', serve: '19:00', kitchen: { cooks: 1, burners: 1, ovens: [] }, dishes: [{ id: 'd', name: 'Loop', color: 0, steps: [
  { id: 'a', label: 'A', dur: 5, hands: 5, equip: 'none', hold: 5, after: ['b'] },
  { id: 'b', label: 'B', dur: 5, hands: 5, equip: 'none', hold: 5, after: ['a'] }] }] };
const cp = plan(cyc, cyc.kitchen);
check('A dependency cycle is broken, not looped on', cp.items.length === 2);
const imp = { name: 'i', serve: '19:00', kitchen: { cooks: 1, burners: 0, ovens: [] }, dishes: [{ id: 'd', name: 'Toast', color: 0, steps: [{ id: 'a', label: 'Bake', dur: 5, hands: 1, equip: 'oven', temp: 200, slots: 1, hold: 2 }] }] };
const ip = plan(imp, imp.kitchen);
check('A step the kitchen cannot do is flagged, not dropped', ip.issues.some((x) => x.kind === 'impossible' && x.reason === 'nooven'));

// Codec
for (const pr of PRESETS) {
  const m = menuOf(pr);
  const back = await decode(await encode(m));
  const same = JSON.stringify(pack(back)) === JSON.stringify(pack(m));
  const p1 = plan(m, m.kitchen), p2 = plan(back, back.kitchen);
  check(`${pr.name}: share link round-trips`, same && p1.score.total === p2.score.total);
}
check('Codec rejects junk', (() => { try { unpack({ v: 9 }); return false; } catch { return true; } })());

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
