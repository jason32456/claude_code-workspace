// UI. All the real work is in js/; this draws it and gets out of the way.

import { curveIds, curveInfo, buildCurve } from './js/curves.js';
import { closedTangle, openCable, contourLength } from './js/sampler.js';
import { analyse, identifyFast } from './js/identify.js';
import { radialClosure, directionalClosure, directionalSpectrum } from './js/closure.js';
import { kmtReduce, minClearance, beautify } from './js/simplify.js';
import { bestDiagram } from './js/diagram.js';
import { jones, jonesAtMinusOne } from './js/jones.js';
import { alexander, alexanderAtMinusOne } from './js/alexander.js';
import { colourEnumerate } from './js/colour.js';
import { drawCable, drawDiagram, fit } from './js/draw.js';
import { totalTurning, v3 } from './js/geom.js';
import { runAll } from './js/selftest.js';
import * as L from './js/laurent.js';

const $ = (s) => document.querySelector(s);
const absBig = (x) => (x < 0n ? -x : x);

const INK = '#23201b', PAPER = '#fbf8f1', RED = '#9e3b32', TEAL = '#2f6b6b',
  GOLD = '#8a6a1f', GREEN = '#4a6b33', FAINT = '#7d7364', RULE = '#cdc2ac';

const state = { mode: 'drawer-closed', seed: 1, spec: null };

// --- specimen construction ----------------------------------------------------

function buildSpecimen() {
  const m = state.mode;
  if (m === 'drawer-closed') {
    const tg = closedTangle({ n: 160, seed: state.seed * 7919, moves: 12000, thickness: 0.15, confine: 0.20 });
    return { points: tg.points, closed: true, label: 'Drawer tangle, closed loop', meta: tg };
  }
  if (m === 'drawer-open') {
    const oc = openCable({ n: 80, seed: state.seed * 104729, moves: 6000, thickness: 0.18, confine: 0.22 });
    return { points: oc.points, closed: false, label: 'Drawer tangle, open cable', meta: oc };
  }
  const info = curveInfo(m);
  return { points: buildCurve(m), closed: true, label: `${info.name} (${info.label})`, meta: null };
}

// An open cable has no knot type, so it is closed before anything is measured.
// Which closure is used is a decision the UI has to make visible.
function closedForm(spec) {
  if (spec.closed) return { points: spec.points, via: null };
  return { points: radialClosure(spec.points), via: 'radial' };
}

// --- panel 1: the certificate -------------------------------------------------

function renderCertificate() {
  const spec = state.spec;
  const cf = closedForm(spec);
  const r = analyse(cf.points);
  state.analysis = r;
  state.closedPoints = cf.points;

  $('#specimen-line').textContent =
    `${spec.label} — ${spec.points.length} vertices`
    + (spec.closed ? '' : `, closed radially before measuring`)
    + `, reduced to ${r.points.length}`;

  // the cable, as it came out
  drawCable($('#cable').getContext('2d'), spec.points, v3(0.3, 0.17, 1), {
    closed: spec.closed, paper: PAPER,
  });
  $('#cable-cap').textContent = spec.closed
    ? `the cable as it came out of the drawer — ${spec.points.length} segments`
    : `an OPEN cable — the two red ends are why it has no knot type`;

  // The diagram is drawn from a ROUNDED copy of the reduced curve. Subdividing
  // and relaxing under the strand-passage veto cannot change the knot, so this
  // is the same topology drawn legibly; the numbers all come from the minimal
  // polygon above.
  let shown = r.diagram;
  if (r.crossings > 0 && r.crossings <= 24) {
    try {
      const pretty = beautify(r.points);
      const pd = bestDiagram(pretty, 28);
      if (pd.crossings.length === r.crossings) shown = pd;
    } catch (e) { /* keep the minimal diagram */ }
  }
  drawDiagram($('#diagram').getContext('2d'), shown, { showSigns: shown.crossings.length <= 20, ink: INK, width: 4.2, gap: 15 });
  $('#diagram-cap').textContent =
    `${r.crossings} crossing${r.crossings === 1 ? '' : 's'} after reduction, writhe ${r.writhe >= 0 ? '+' : ''}${r.writhe}`;

  // verdict
  const el = $('#verdict');
  if (r.tooBig) {
    el.className = 'verdict unsure';
    $('#verdict-label').textContent = 'NOT CERTIFIED — diagram too complex';
    $('#verdict-note').textContent =
      `The reduced diagram still has ${r.crossings} crossings. The bracket is a sum over 2^n states, so this office declines rather than guesses. Try another tangle.`;
  } else if (r.isUnknot) {
    el.className = 'verdict';
    $('#verdict-label').textContent = r.certificate
      ? 'UNKNOT — certified by construction'
      : 'UNKNOT — certified';
    $('#verdict-note').textContent = r.certificate
      ? `Reduced to a triangle by ${r.reduction.removed} isotopy moves. This is a geometric proof: no polynomial was consulted. V(t) = 1 agrees.`
      : `V(t) = 1 and Δ(t) = 1. The cable can be pulled straight.`;
  } else {
    el.className = 'verdict knotted';
    $('#verdict-label').textContent = r.name
      ? `KNOTTED — ${r.name}`
      : `KNOTTED — unidentified, det ${r.det}`;
    $('#verdict-note').textContent = r.name
      ? `Identified as ${r.fullName ?? r.name} by its Jones polynomial. No sequence of moves will pull this straight.`
      : `Genuinely knotted: V(t) ≠ 1. It matches no knot in this office's generated reference set, which is what a composite knot looks like.`;
  }

  $('#v-jones').textContent = r.jones ? L.format(r.jones, 't') : '—';
  $('#v-alex').textContent = r.alexander ? L.format(r.alexander, 't') : '—';

  const turn = totalTurning(cf.points);
  const rows = [
    ['Crossings, as it came out', state.rawCrossings ?? '—'],
    ['Crossings, after reduction', r.crossings],
    ['Vertices removed by isotopy', r.reduction ? r.reduction.removed : 0],
    ['Writhe', `${r.writhe >= 0 ? '+' : ''}${r.writhe}`],
    ['Determinant det(K)', r.det !== null ? r.det.toString() : '—'],
    ['Bracket states summed', r.states ? r.states.toLocaleString() : '—'],
    ['Total turning', `${(turn / Math.PI).toFixed(1)}π`],
    ['Closest self-approach', r.clearance.toFixed(4)],
  ];
  $('#facts').innerHTML =
    '<tr><th>Measurement</th><th class="n">Value</th></tr>' +
    rows.map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('');

  // the bridge
  const b = $('#bridge');
  if (r.jonesDet !== null && r.alexanderDet !== null) {
    b.className = 'bridge' + (r.bridgeOK ? '' : ' bad');
    b.innerHTML = r.bridgeOK
      ? `|V(&minus;1)| = <b>${r.jonesDet}</b> &nbsp;=&nbsp; |&Delta;(&minus;1)| = <b>${r.alexanderDet}</b> &nbsp;&mdash; two polynomials with no shared code agree.`
      : `|V(&minus;1)| = <b>${r.jonesDet}</b> but |&Delta;(&minus;1)| = <b>${r.alexanderDet}</b>. These must be equal. Something in this office is wrong.`;
  } else {
    b.className = 'bridge';
    b.textContent = 'Bridge theorem not evaluated for this specimen.';
  }

  $('#f-certificate').innerHTML =
    `<b>Two algorithms racing for opposite verdicts on identical input.</b> The reducer tries to prove the thing ` +
    `<em>unknotted by construction</em>, deleting any vertex whose triangle the rest of the cable stays clear of — each deletion an ` +
    `ambient isotopy, so the knot cannot change. The bracket tries to prove it <em>knotted by algebra</em>, summing ` +
    `<code>${r.states ? r.states.toLocaleString() : '2ⁿ'}</code> smoothing states in exact ℤ Laurent arithmetic. ` +
    (r.isUnknot
      ? `Here the reducer won: ${r.reduction ? r.reduction.removed : 0} vertices came off and the polynomial never budged from 1.`
      : `Here the algebra won: the reducer stalled at ${r.points.length} vertices and the polynomial is not 1, so no amount of pulling will help.`);

  renderCollapse(spec, cf.points);
  renderOracles(r);
  if (!spec.closed) renderSpectrum(spec); else clearSpectrum();
}

// --- panel 2: the collapse ----------------------------------------------------

function renderCollapse(spec, closedPts) {
  const cv = $('#collapse'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);

  // Reduce in stages with a REMOVAL BUDGET per stage, so the picture actually
  // shows a collapse. A single KMT pass strips almost every removable vertex at
  // once, which produced exactly two snapshots -- the tangle and the triangle --
  // and none of the interesting middle.
  const total = closedPts.length;
  const stages = [{ points: closedPts.slice() }];
  let pts = closedPts.slice();
  const budgets = [0.25, 0.5, 0.72, 0.88, 1.0];
  for (const frac of budgets) {
    const floorVerts = Math.max(3, Math.round(total * (1 - frac)));
    let guard = 0;
    while (pts.length > floorVerts && guard++ < 400) {
      const before = pts.length;
      pts = kmtReduce(pts, { maxPasses: 1, minVerts: floorVerts }).points;
      if (pts.length === before) break;
    }
    if (pts.length !== stages[stages.length - 1].points.length) {
      stages.push({ points: pts.slice() });
    }
  }
  const picked = stages.slice(0, 6);

  const pad = 14;
  const cellW = (cv.width - pad * (picked.length + 1)) / picked.length;
  const cellH = cv.height - 54;

  picked.forEach((st, k) => {
    const x0 = pad + k * (cellW + pad);
    // Draw each stage into its own sub-rect by temporarily clipping.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 10, cellW, cellH);
    ctx.clip();
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, 10.5, cellW - 1, cellH - 1);

    const flat = st.points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    const T = fitInto(flat, x0, 10, cellW, cellH, 16);
    const n = st.points.length;
    const segs = [];
    for (let i = 0; i < n; i++) {
      const a = flat[i], b = flat[(i + 1) % n];
      segs.push({ a, b, z: (a.z + b.z) / 2 });
    }
    segs.sort((p, q) => p.z - q.z);
    for (const s of segs) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = PAPER; ctx.lineWidth = 6.5;
      ctx.beginPath(); ctx.moveTo(T.x(s.a), T.y(s.a)); ctx.lineTo(T.x(s.b), T.y(s.b)); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(T.x(s.a), T.y(s.a)); ctx.lineTo(T.x(s.b), T.y(s.b)); ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = FAINT;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${st.points.length} vertices`, x0 + cellW / 2, cv.height - 30);
    let tag = '';
    try {
      const d = bestDiagram(st.points, 12);
      if (d.crossings.length <= 16) {
        const j = jones(d);
        tag = j.jones ? `V = ${L.format(j.jones, 't')}` : '';
      } else tag = `${d.crossings.length} crossings`;
    } catch (e) { tag = ''; }
    ctx.fillStyle = INK;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(tag.length > 34 ? tag.slice(0, 33) + '…' : tag, x0 + cellW / 2, cv.height - 13);
  });

  $('#collapse-legend').innerHTML =
    `<span>${total} vertices at the start, ${picked[picked.length - 1].points.length} at the end — every step an ambient isotopy, so every V below is the same knot.</span>`;
}

function fitInto(flat, ox, oy, w, h, pad) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of flat) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const s = Math.min((w - 2 * pad) / Math.max(maxX - minX, 1e-9), (h - 2 * pad) / Math.max(maxY - minY, 1e-9));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return { x: (p) => ox + w / 2 + (p.x - cx) * s, y: (p) => oy + h / 2 - (p.y - cy) * s };
}

// --- panel 3: the closure spectrum -------------------------------------------

function clearSpectrum() {
  const cv = $('#spectrum'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = FAINT;
  ctx.font = '13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('This specimen is already a closed loop — it has a knot type.', cv.width / 2, cv.height / 2 - 8);
  ctx.fillText('Choose an OPEN cable to see the closure question.', cv.width / 2, cv.height / 2 + 14);
  $('#spectrum-table').innerHTML = '';
  $('#f-closure').innerHTML =
    `A closed loop is an embedding of the circle, so "which knot is it" has exactly one answer and this panel has nothing to decide. ` +
    `The question only becomes ill-posed for an <em>open</em> cable.`;
}

function renderSpectrum(spec) {
  const spectrum = directionalSpectrum(spec.points, identifyFast, 36);
  const radial = identifyFast(radialClosure(spec.points));
  const radialName = radial.name ?? (radial.tooBig ? 'too complex' : `unidentified (det ${radial.det})`);

  const cv = $('#spectrum'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const pad = { l: 60, r: 20, t: 26, b: 56 };
  const W = cv.width - pad.l - pad.r, H = cv.height - pad.t - pad.b;

  const bars = spectrum.tally;
  const maxV = Math.max(...bars.map((b) => b[1]), 1);
  const bw = Math.min(90, W / Math.max(bars.length, 1) * 0.6);

  ctx.strokeStyle = RULE;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + H); ctx.lineTo(pad.l + W, pad.t + H);
  ctx.stroke();

  bars.forEach(([name, count], i) => {
    const x = pad.l + (i + 0.5) * (W / bars.length) - bw / 2;
    const h = (count / maxV) * (H - 12);
    const y = pad.t + H - h;
    ctx.fillStyle = name === '0₁' ? 'rgba(74,107,51,0.75)' : 'rgba(158,59,50,0.8)';
    ctx.fillRect(x, y, bw, h);
    ctx.fillStyle = INK;
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(count), x + bw / 2, y - 7);
    ctx.fillStyle = FAINT;
    ctx.font = '12px ui-monospace, monospace';
    const short = name.length > 16 ? name.slice(0, 15) + '…' : name;
    ctx.fillText(short, x + bw / 2, pad.t + H + 20);
  });

  ctx.fillStyle = FAINT;
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (let k = 0; k <= 4; k++) {
    const v = Math.round((maxV * (4 - k)) / 4);
    ctx.fillText(String(v), pad.l - 8, pad.t + (H * k) / 4 + 4);
  }
  ctx.textAlign = 'center';
  ctx.fillText('knot type of the closure', pad.l + W / 2, cv.height - 12);

  $('#spectrum-table').innerHTML =
    '<tr><th>Closure</th><th class="n">Result</th></tr>' +
    `<tr><td>Radial (out from the centre of mass)</td><td class="n">${radialName}</td></tr>` +
    `<tr><td>Directional, dominant of ${spectrum.total}</td><td class="n">${spectrum.dominant ? spectrum.dominant[0] : '—'}</td></tr>` +
    `<tr><td>Distinct types over all directions</td><td class="n">${spectrum.distinct}</td></tr>` +
    `<tr><td>Agreement within the spectrum</td><td class="n">${(100 * spectrum.agreementFraction).toFixed(1)}%</td></tr>`;

  $('#f-closure').innerHTML = spectrum.distinct > 1
    ? `<b>This cable does not have a knot type.</b> Closing it toward infinity in ${spectrum.total} different directions produced ` +
      `<b>${spectrum.distinct}</b> different knots — <code>${spectrum.tally.map(([k, v]) => `${k}×${v}`).join('</code>, <code>')}</code>. ` +
      `Every one of those closures is a genuine knot with a genuine, provable type. The cable is the same cable. ` +
      `What changed was your decision about how to join the ends.`
    : `Every one of the ${spectrum.total} closure directions gave <b>${spectrum.dominant ? spectrum.dominant[0] : '—'}</b>, and the radial ` +
      `convention agrees. For <em>this</em> cable the answer happens to be robust — which is the honest outcome most of the time, ` +
      `and is measured rather than assumed. The ensemble panel below reports how often it is not.`;
}

// --- panel 4: the ensemble (worker) ------------------------------------------

let worker = null;
function startEnsemble() {
  const cv = $('#ensemble'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = FAINT;
  ctx.font = '13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('sampling…', cv.width / 2, cv.height / 2);

  try {
    worker = new Worker('js/worker.js', { type: 'module' });
  } catch (e) {
    $('#ens-status').textContent = `worker unavailable (${e.message}) — ensemble skipped`;
    return;
  }
  worker.onmessage = (ev) => {
    const d = ev.data;
    if (d.progress !== undefined) {
      $('#ens-status').textContent = `sampling ${Math.round(d.progress * 100)}% — each tangle is a fresh Monte Carlo run plus a 2ⁿ state sum`;
      return;
    }
    if (d.error) { $('#ens-status').textContent = `ensemble failed: ${d.error}`; return; }
    if (d.kind === 'knotting') {
      drawEnsemble(d.result);
      $('#ens-status').textContent =
        `${d.result.usable} tangles of ${d.result.params.n} segments, confined to ${d.result.params.confine.toFixed(2)} of the loop’s natural radius.`;
    }
  };
  worker.postMessage({
    id: 1, kind: 'knotting',
    opts: { count: 40, n: 160, moves: 12000, thickness: 0.15, confine: 0.20, seed: 7919 },
  });
}

function drawEnsemble(res) {
  const cv = $('#ensemble'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const pad = { l: 70, r: 24, t: 24, b: 58 };
  const W = cv.width - pad.l - pad.r, H = cv.height - pad.t - pad.b;

  const rows = res.rows.filter((r) => r.rawCrossings !== null);
  const maxRaw = Math.max(...rows.map((r) => r.rawCrossings), 10);

  // Two lanes: unknot along the bottom, knotted along the top.
  const laneY = (unknot) => pad.t + (unknot ? H * 0.78 : H * 0.22);

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + H); ctx.lineTo(pad.l + W, pad.t + H);
  ctx.stroke();
  ctx.setLineDash([3, 4]);
  for (const u of [true, false]) {
    ctx.strokeStyle = '#ddd4c2';
    ctx.beginPath(); ctx.moveTo(pad.l, laneY(u)); ctx.lineTo(pad.l + W, laneY(u)); ctx.stroke();
  }
  ctx.setLineDash([]);

  const sx = (v) => pad.l + (v / maxRaw) * W;
  for (const r of rows) {
    const x = sx(r.rawCrossings);
    const y = laneY(r.isUnknot);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, 7);
    ctx.fillStyle = r.isUnknot ? 'rgba(74,107,51,0.55)' : 'rgba(158,59,50,0.75)';
    ctx.fill();
    ctx.strokeStyle = r.isUnknot ? GREEN : RED;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    if (!r.isUnknot && r.name) {
      ctx.fillStyle = RED;
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(r.name, x, y - 14);
    }
  }

  ctx.fillStyle = INK;
  ctx.font = '600 12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('KNOTTED', pad.l + 8, laneY(false) - 26);
  ctx.fillStyle = GREEN;
  ctx.fillText('UNKNOT', pad.l + 8, laneY(true) + 30);

  ctx.fillStyle = FAINT;
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (let k = 0; k <= 5; k++) {
    const v = Math.round((maxRaw * k) / 5);
    ctx.fillText(String(v), sx(v), pad.t + H + 20);
  }
  ctx.fillText('crossings in the best projection, before any simplification', pad.l + W / 2, cv.height - 14);

  const worst = res.worstLooking[0];
  $('#f-ensemble').innerHTML =
    `<b>Looking tangled and being knotted are nearly unrelated.</b> Of ${res.usable} confined cable loops, ` +
    `<b>${res.knotted}</b> ${res.knotted === 1 ? 'was' : 'were'} genuinely knotted — <b>${(100 * res.knottedFraction).toFixed(1)}%</b>. ` +
    `The most tangled-looking quarter of the sample was <b>${(100 * res.worstLookingUnknotFraction).toFixed(0)}%</b> unknots. ` +
    (worst
      ? `The single worst-looking specimen showed <code>${worst.raw}</code> crossings in its best projection and reduced to ` +
        `<code>${worst.reduced}</code>: ${worst.unknot ? 'a cable you could pull straight with one hand' : `genuinely ${worst.name ?? 'knotted'}`}. `
      : '') +
    `Crossing number is a property of a <em>picture</em>; knottedness is a property of the <em>curve</em>, and the picture is a bad estimator of it.`;
}

// --- panel 5: oracles ---------------------------------------------------------

function renderOracles(r) {
  const cards = [];
  cards.push(`
    <div class="oracle">
      <h3>1 · Jones at &minus;1</h3>
      <p class="how">Kauffman bracket state sum over ${r.states ? r.states.toLocaleString() : '2ⁿ'} smoothings in exact ℤ Laurent arithmetic, then evaluated at t = &minus;1.</p>
      <div class="val">${r.jonesDet !== null ? r.jonesDet : '—'}</div>
      <div class="delta">V(t) = ${r.jones ? L.format(r.jones, 't') : '—'}</div>
    </div>`);
  cards.push(`
    <div class="oracle">
      <h3>2 · Alexander at &minus;1</h3>
      <p class="how">Fox calculus on the Wirtinger presentation, determinant of an (n&minus;1)-minor over ℤ[t]. No bracket, no state sum, no shared code.</p>
      <div class="val">${r.alexanderDet !== null ? r.alexanderDet : '—'}</div>
      <div class="delta${r.bridgeOK ? '' : ' bad'}">${r.bridgeOK ? 'agrees with route 1' : 'DISAGREES with route 1'}</div>
    </div>`);

  const cs = Object.entries(r.colourings ?? {});
  const colourLine = cs.map(([p, c]) => `p=${p}: ${c.count}${c.nontrivial ? '*' : ''}`).join('  ');
  const hit = cs.find(([p, c]) => c.nontrivial);
  cards.push(`
    <div class="oracle">
      <h3>3 · Fox colourings</h3>
      <p class="how">A knot has a non-trivial p-colouring exactly when p divides det(K). Counted by Gaussian elimination mod p; * marks non-trivial.</p>
      <div class="val">${hit ? hit[0] : '—'}<small>${hit ? ' divides det' : ' none of 3,5,7'}</small></div>
      <div class="delta${r.colourTheoremOK ? '' : ' bad'}">${colourLine} — theorem ${r.colourTheoremOK ? 'holds' : 'VIOLATED'}</div>
    </div>`);

  cards.push(`
    <div class="oracle${r.certificate ? '' : ' na'}">
      <h3>4 · Geometric certificate</h3>
      <p class="how">KMT reduction: delete any vertex whose triangle the rest of the cable stays clear of. Each deletion is an ambient isotopy, so the knot cannot change.</p>
      <div class="val">${r.certificate ? 'UNKNOT' : 'no certificate'}</div>
      <div class="delta">${r.reduction ? `${r.reduction.removed} vertices removed, ${r.points.length} remain` : '—'}</div>
    </div>`);

  $('#oracles').innerHTML = cards.join('');
}

// --- panel 6: checks ----------------------------------------------------------

function renderChecks() {
  const t0 = performance.now();
  const res = runAll();
  const ms = performance.now() - t0;
  const nPass = res.filter((r) => r.pass).length;
  $('#checks').innerHTML =
    res.map((r, i) => `
      <div class="check ${r.pass ? 'pass' : 'fail'}">
        <div class="idx">${i + 1}</div>
        <div class="mark">${r.pass ? 'PASS' : 'FAIL'}</div>
        <div>
          <div class="name">${r.name}</div>
          <div class="detail">${r.detail}</div>
        </div>
      </div>`).join('') +
    `<div class="check-summary"><b class="${nPass === res.length ? '' : 'bad'}">${nPass}/${res.length}</b> passed in ${ms.toFixed(0)} ms</div>`;
  return { ms, n: res.length };
}

// --- wiring -------------------------------------------------------------------

function populate() {
  const opts = [
    '<option value="drawer-closed">Drawer tangle — closed loop</option>',
    '<option value="drawer-open">Drawer tangle — open cable</option>',
    '<optgroup label="Known knots (parametric, for reference)">',
    ...curveIds().map((id) => {
      const i = curveInfo(id);
      return `<option value="${id}">${i.name} — ${i.label}</option>`;
    }),
    '</optgroup>',
  ];
  $('#specimen').innerHTML = opts.join('');
  $('#specimen').value = state.mode;
}

function regenerate() {
  $('#regen').disabled = true;
  $('#regen').textContent = 'working…';
  // Yield so the button state paints before the synchronous solve.
  requestAnimationFrame(() => setTimeout(() => {
    try {
      state.spec = buildSpecimen();
      // How tangled it looks, before anything is simplified.
      try {
        const raw = bestDiagram(state.spec.closed ? state.spec.points : radialClosure(state.spec.points), 12);
        state.rawCrossings = raw.crossings.length;
      } catch (e) { state.rawCrossings = null; }
      renderCertificate();
    } catch (e) {
      $('#verdict').className = 'verdict unsure';
      $('#verdict-label').textContent = 'NOT CERTIFIED';
      $('#verdict-note').textContent = e.message;
    }
    $('#regen').disabled = false;
    $('#regen').textContent = 'New tangle';
  }, 0));
}

function init() {
  populate();
  $('#specimen').addEventListener('change', (e) => {
    state.mode = e.target.value;
    state.seed = 1;
    regenerate();
  });
  $('#regen').addEventListener('click', () => {
    state.seed++;
    regenerate();
  });

  regenerate();

  // Checks and the ensemble come after the first paint: both are slow, and the
  // thing people came to look at is the certificate.
  requestAnimationFrame(() => setTimeout(() => {
    const { ms, n } = renderChecks();
    $('#foot-timing').textContent = `${n} checks in ${ms.toFixed(0)} ms · ensemble in a worker`;
    startEnsemble();
  }, 0));
}

init();
