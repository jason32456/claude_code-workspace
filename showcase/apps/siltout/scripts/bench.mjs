// Headless checks for Siltout. Run from the app folder: node scripts/bench.mjs
import { createSim, step, hash, DT, ata, lineChafes, G, neutralVolume, SAC } from '../src/sim.js';
import { makeBot, botStep } from '../src/bot.js';
import { SITES } from '../src/sites.js';
import { meshCave } from '../src/mesh.js';

let fails = 0;
const row = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`); if (!ok) fails++; };

function run(i, kind = 'expert', limit = 900) {
  const S = createSim(i), bot = makeBot(kind);
  let minVis = 99;
  while (!S.done && S.t < limit) { botStep(S, bot); step(S, DT); minVis = Math.min(minVis, S.diver.vis); S.events.length = 0; }
  S.minVis = minVis;
  return S;
}

// 1. Every passage is open along its centreline.
for (const [i, s] of SITES.entries()) {
  const S = createSim(i);
  let worst = -9;
  for (const P of S.cave.prims) {
    if (P.t !== 'c') continue;
    for (let t = 0; t <= 1; t += 0.02) worst = Math.max(worst, S.cave.D(P.a[0] + P.ba[0] * t, P.a[1] + P.ba[1] * t, P.a[2] + P.ba[2] * t));
  }
  row(`${s.name}: every passage open on its axis`, worst < -0.45, `worst clearance ${(-worst).toFixed(2)} m`);
}

// 2. Boyle: the wing's displaced volume scales as 1/ATA.
{
  const S = createSim(0);
  const D = S.diver;
  D.wingS = 12;
  const v10 = D.wingS / ata(-10), v30 = D.wingS / ata(-30);
  row('wing volume obeys Boyle (10 m vs 30 m)', Math.abs(v10 / v30 - 4 / 2) < 1e-9, `${v10.toFixed(2)} L vs ${v30.toFixed(2)} L`);
}

// 3. Neutral at the start, and a 3 m rise leaves you positive.
{
  const S = createSim(1);
  const D = S.diver;
  const net = (y) => G * (D.wingS / ata(y) - neutralVolume(D.gas, S.site.gas));
  row('neutral at the start depth, positive 3 m higher', Math.abs(net(D.pos[1])) < 1e-6 && net(D.pos[1] + 3) > 0, `${net(D.pos[1]).toFixed(3)} N → ${net(D.pos[1] + 3).toFixed(2)} N`);
}

// 4. Gas use scales with ambient pressure.
{
  const burn = (y) => {
    const S = createSim(2);
    S.diver.pos = [S.cave.nodes[0].p[0], y, S.cave.nodes[0].p[2]];
    S.diver.wingS = neutralVolume(S.diver.gas, S.site.gas) * ata(y);
    const g0 = S.diver.gas;
    for (let k = 0; k < 600; k++) { S.diver.pos[1] = y; S.diver.vel = [0, 0, 0]; step(S, DT); }
    return g0 - S.diver.gas;
  };
  const a = burn(-3), b = burn(-15);
  const want = ata(-15) / ata(-3);
  row('gas consumption ∝ ATA at rest', Math.abs(b / a / want - 1) < 0.02, `ratio ${(b / a).toFixed(3)} vs ${want.toFixed(3)} · ${(a / 10).toFixed(3)} bar/s at 3 m (SAC ${SAC.rest})`);
}

// 5. Silt is conserved by diffusion + advection when nothing settles.
{
  const S = createSim(2);
  const n = S.cave.nodes[3].p;
  S.silt.add(n[0], n[1], n[2], 20);
  const m0 = S.silt.mass();
  for (let k = 0; k < 400; k++) S.silt.step(0.1, { settle: 0 });
  const m1 = S.silt.mass();
  let spread = 0;
  for (let k = 0; k < S.silt.W; k++) if (S.silt.c[k] > 0.01) spread++;
  row('silt mass conserved (diffusion + flow, 40 s)', Math.abs(m1 / m0 - 1) < 1e-4, `${m0.toFixed(3)} → ${m1.toFixed(3)} over ${spread} cells`);
}

// 6. Flow carries silt toward the exit.
{
  const S = createSim(2);
  const n = S.cave.nodes[3].p;
  S.silt.add(n[0], n[1], n[2], 20);
  const cx = () => { let s = 0, w = 0; for (let k = 0; k < S.silt.W; k++) { s += S.silt.c[k] * S.silt.pos[k * 3]; w += S.silt.c[k]; } return s / w; };
  const x0 = cx();
  for (let k = 0; k < 300; k++) S.silt.step(0.1, { settle: 0 });
  row('spring flow carries a plume toward the basin', cx() < x0 - 3, `centroid x ${x0.toFixed(1)} → ${cx().toFixed(1)} m`);
}

// 7. Chafe detection.
{
  const S = createSim(0);
  const N = S.cave.nodes;
  const along = lineChafes(S, N[2].p, N[3].p);
  const across = lineChafes(S, N[3].p, N[6].p);
  row('chafe: axis line clear, corner-cutting line wraps', !along && across, `axis ${along} · 3→6 ${across}`);
}

// 8. The reel is a hard tether.
{
  const S = createSim(0);
  S.reel.ties.push({ kind: 'anchor', id: 0, p: S.cave.anchors[0].p });
  S.reel.cap = 12;
  const bot = makeBot('expert');
  bot.phase = 'in'; bot.path = S.site.route.map((id) => S.cave.nodes[id].p);
  let far = 0;
  for (let k = 0; k < 60 * 60; k++) { botStep(S, bot); S.actions.length = 0; step(S, DT); far = Math.max(far, Math.hypot(...S.diver.pos.map((v, i) => v - S.cave.anchors[0].p[i]))); }
  row('reel capacity holds the diver back', far <= 12.01 && far > 11.5, `furthest ${far.toFixed(2)} m from the tie-off on a 12 m reel`);
}

// 9. Determinism.
{
  const a = run(1), b = run(1);
  row('identical runs give identical state', hash(a) === hash(b), hash(a).slice(0, 48));
}

// 10. Mesh is watertight-ish: every vertex sits on the zero set.
{
  const S = createSim(0);
  const m = meshCave(S.cave);
  let worst = 0;
  for (let k = 0; k < m.positions.length; k += 30) worst = Math.max(worst, Math.abs(S.cave.D(m.positions[k], m.positions[k + 1], m.positions[k + 2])));
  row('mesh vertices lie on the rock surface', worst < 0.35, `${m.index.length / 3} tris · worst |D| ${worst.toFixed(3)} m`);
}

// 11. Bots.
for (const [i, s] of SITES.entries()) {
  const E = run(i, 'expert');
  const r = E.result;
  row(`${s.name}: expert takes gold`, r && r.medal === 'gold', `${r?.medal} ${r?.score} · ${Math.round(r?.time)} s · ${Math.round(r?.gas)} bar left · ${E.stats.contacts} contacts`);
  const N = run(i, 'notie');
  row(`${s.name}: no-tie-off diver parts the line`, N.stats.breaks > 0 && N.result?.medal !== 'gold', `${N.stats.breaks} break(s) · ${N.result?.medal} · ${Math.round(N.stats.offline)} s off line`);
  const F = run(i, 'flutter');
  const clay = s.silt >= 0.8;
  row(`${s.name}: flutter kicker ${clay ? 'silts out' : 'stirs the sand'}`, clay ? F.minVis < 2 : F.silt.raised > 10 * Math.max(0.1, E.silt.raised), `min vis ${F.minVis.toFixed(1)} m · raised ${F.silt.raised.toFixed(0)} vs expert ${E.silt.raised.toFixed(1)} · ${F.result?.medal}`);
  if (s.lightFail) row(`${s.name}: primary fails on the way out`, E.light.failed && E.light.backup, `failed ${E.light.failed} · backup ${E.light.backup}`);
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
