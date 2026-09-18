// Crib — wiring the machine, the crib analysis and the bombe to the screen.

import { Enigma, ROTOR_NAMES, chr, ord, N, encipherWith } from './js/enigma.js';
import {
  alignments, buildMenu, selectScramblers, testRegister, predictStops, SCRAMBLER_BUDGET,
} from './js/menu.js';
import { closure, buildAdjacency, cribPositions, buildPermTable, posIndex } from './js/bombe.js';
import { plugSpec, IC_RANDOM, IC_GERMAN } from './js/scoring.js';
import { drawWiring, drawMenu, drawBoard, tracePress } from './js/render.js';
import { runFixtures } from './js/fixtures.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

const CRIBS = [
  ['KEINEBESONDERENEREIGNISSE', 'keine besonderen Ereignisse — "nothing to report"'],
  ['WETTERVORHERSAGE', 'Wettervorhersage — "weather forecast"'],
  ['OBERKOMMANDODERWEHRMACHT', 'Oberkommando der Wehrmacht'],
  ['ANDIEGRUPPE', 'an die Gruppe — "to the group"'],
  ['MORGENGRAUEN', 'Morgengrauen — "dawn"'],
];

const state = {
  mode: 'machine',
  machine: null,
  cipher: '',
  crib: CRIBS[0][0],
  offset: 0,
  aligns: [],
  fullMenu: null,
  menu: null,
  testReg: 0,
  discarded: null,       // the key the app threw away, revealed only at the end
  worker: null,
  running: false,
  stops: [],
  lastLive: null,
};

/* ----------------------------------------------------------------- setup */

function init() {
  for (const i of [0, 1, 2]) {
    const sel = $('rotor' + i);
    for (const name of ROTOR_NAMES) {
      const o = document.createElement('option');
      o.value = name; o.textContent = name;
      sel.appendChild(o);
    }
    sel.value = ['I', 'II', 'III'][i];
    sel.addEventListener('change', rebuildMachine);
  }
  for (const id of ['reflector', 'rings', 'ground', 'plugboard']) {
    $(id).addEventListener('input', rebuildMachine);
    $(id).addEventListener('change', rebuildMachine);
  }

  const preset = $('crib-preset');
  for (const [text, label] of CRIBS) {
    const o = document.createElement('option');
    o.value = text; o.textContent = label;
    preset.appendChild(o);
  }
  preset.addEventListener('change', () => { $('crib').value = preset.value; onCribChanged(); });
  $('crib').addEventListener('input', onCribChanged);

  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });

  $('btn-step').addEventListener('click', () => stepMachine(1));
  $('btn-double').addEventListener('click', jumpToDoubleStep);
  $('btn-reset').addEventListener('click', () => { rebuildMachine(); $('step-log').textContent = ''; });
  $('btn-encipher').addEventListener('click', () => doEncipher(false));
  $('btn-discard').addEventListener('click', () => doEncipher(true));
  $('btn-run').addEventListener('click', runSearch);
  $('btn-stop').addEventListener('click', cancelSearch);
  $('order-scope').addEventListener('change', () => { if (state.menu) setMenuStats(state.menu); });
  $('btn-fixtures').addEventListener('click', runProof);

  const strip = $('align-strip');
  strip.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { nudgeOffset(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { nudgeOffset(1); e.preventDefault(); }
  });

  rebuildMachine();
  doEncipher(false);
  setMode('machine');
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-tab').forEach((t) => {
    t.setAttribute('aria-selected', String(t.dataset.mode === mode));
  });
  for (const m of ['machine', 'crib', 'bombe', 'proof']) {
    $('view-' + m).hidden = m !== mode;
  }
  if (mode === 'crib') renderCrib();
  if (mode === 'bombe') renderBoard(state.lastLive);
}

/* --------------------------------------------------------------- machine */

function readSettings() {
  return {
    rotors: [$('rotor0').value, $('rotor1').value, $('rotor2').value],
    reflector: $('reflector').value,
    rings: ($('rings').value || 'AAA').toUpperCase().padEnd(3, 'A').slice(0, 3),
    ground: ($('ground').value || 'AAA').toUpperCase().padEnd(3, 'A').slice(0, 3),
    plugboard: $('plugboard').value,
  };
}

function rebuildMachine() {
  const err = $('machine-error');
  try {
    state.machine = new Enigma(readSettings());
    err.hidden = true;
  } catch (e) {
    err.hidden = false;
    err.textContent = e.message;
    return;
  }
  renderMachine();
}

function renderMachine() {
  const m = state.machine;
  if (!m) return;

  const windows = $('windows');
  windows.innerHTML = '';
  m.pos.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'window';
    d.innerHTML = `<span class="w-letter">${chr(p)}</span><span class="w-name">${m.rotorNames[i]}</span>`;
    windows.appendChild(d);
  });

  const traced = tracePress(m, 'A');
  drawWiring($('wiring'), m, traced);

  $('stat-self').textContent = String(m.selfEncipherments);
  $('stat-presses').textContent = fmt(m.keypresses);
  $('stat-keyspace').textContent = keyspaceText(m.plugPairs.length);
}

function keyspaceText(plugs) {
  // 60 rotor orders × 26³ positions × 26³ rings ... the plugboard term is the
  // one that matters, and it is the one the bombe refuses to search.
  const orders = 60, positions = 17576;
  let plugWays = 1;
  let remaining = N;
  for (let i = 0; i < plugs; i++) {
    plugWays *= (remaining * (remaining - 1)) / 2 / (i + 1) * (i + 1);
    remaining -= 2;
  }
  // exact count: 26! / ((26-2p)! · p! · 2^p)
  plugWays = plugboardCount(plugs);
  const total = orders * positions * plugWays;
  return total.toExponential(2).replace('e+', ' × 10^');
}

function plugboardCount(p) {
  let r = 1;
  for (let i = 0; i < 2 * p; i++) r *= (N - i);
  let fact = 1;
  for (let i = 1; i <= p; i++) fact *= i;
  return r / (fact * Math.pow(2, p));
}

function stepMachine(times) {
  const m = state.machine;
  if (!m) return;
  const log = [];
  for (let i = 0; i < times; i++) {
    const before = m.window;
    const r = m.step();
    log.push(`${before} → ${m.window}${r.doubleStep ? '   ← double step: the middle rotor moves twice in a row' : ''}`);
  }
  const box = $('step-log');
  box.textContent = log.join('\n');
  renderMachine();
}

/**
 * Park the rotors one press before the anomaly, then walk through it.
 *
 * Stepping 26 times from an arbitrary window usually shows nothing: the double
 * step needs the *middle* rotor sitting on its own notch, which happens once
 * every 650 presses. So the machine is placed there rather than left to
 * stumble into it.
 */
function jumpToDoubleStep() {
  const m = state.machine;
  if (!m) return;
  const midNotch = m.data[1].turnover;
  const rightNotch = m.data[2].turnover;
  m.pos = [m.pos[0], (midNotch - 1 + N) % N, rightNotch];
  renderMachine();
  stepMachine(3);
}

function doEncipher(discard) {
  const settings = readSettings();
  let cipher;
  try {
    cipher = encipherWith(settings, $('plaintext').value);
  } catch (e) {
    $('machine-error').hidden = false;
    $('machine-error').textContent = e.message;
    return;
  }
  state.cipher = cipher;
  $('ciphertext').value = cipher;

  if (discard) {
    state.discarded = { ...settings };
    $('discard-note').textContent =
      'Key discarded. From here the solver sees only the ciphertext and your crib.';
    $('discard-note').style.color = '#d9a441';
  } else {
    state.discarded = null;
    $('discard-note').textContent = '';
  }

  const m = state.machine;
  if (m) { m.keypresses = 0; m.selfEncipherments = 0; }
  rebuildMachine();
  onCribChanged();
}

/* ------------------------------------------------------------------ crib */

function onCribChanged() {
  state.crib = ($('crib').value || '').toUpperCase().replace(/[^A-Z]/g, '');
  state.aligns = state.cipher && state.crib.length && state.crib.length <= state.cipher.length
    ? alignments(state.cipher, state.crib) : [];

  const valid = state.aligns.filter((a) => a.valid);
  if (valid.length) {
    if (!state.aligns[state.offset] || !state.aligns[state.offset].valid) {
      state.offset = bestOffset(valid);
    }
  }
  renderCrib();
}

/** The alignment with the most closures — the one worth running. */
function bestOffset(valid) {
  let best = valid[0].offset, bestScore = -1;
  for (const a of valid) {
    const m = selectScramblers(buildMenu(state.cipher, state.crib, a.offset));
    const score = m.closures * 100 + m.E;
    if (score > bestScore) { bestScore = score; best = a.offset; }
  }
  return best;
}

function nudgeOffset(delta) {
  const valid = state.aligns.filter((a) => a.valid).map((a) => a.offset);
  if (!valid.length) return;
  const i = valid.indexOf(state.offset);
  const next = valid[Math.min(valid.length - 1, Math.max(0, (i < 0 ? 0 : i) + delta))];
  state.offset = next;
  renderCrib();
}

function renderCrib() {
  const total = state.aligns.length;
  const valid = state.aligns.filter((a) => a.valid);

  $('crib-stats').innerHTML = '';
  const chip = (text, cls = '') => {
    const d = document.createElement('span');
    d.className = 'chip ' + cls;
    d.innerHTML = text;
    $('crib-stats').appendChild(d);
  };
  if (!total) {
    chip('Encipher a message first, then guess a word of it.', 'warn');
    drawMenu($('menu-graph'), { vertices: [], edges: [] }, null);
    return;
  }
  const pct = total ? Math.round((100 * valid.length) / total) : 0;
  chip(`offsets <b>${total}</b>`);
  chip(`survive the self-encipherment filter <b>${valid.length}</b> (${pct}%)`, 'good');
  chip(`ruled out for free <b>${total - valid.length}</b>`, 'bad');

  // The strip of offsets.
  const strip = $('align-strip');
  strip.innerHTML = '';
  strip.setAttribute('aria-valuemax', String(total - 1));
  strip.setAttribute('aria-valuenow', String(state.offset));
  state.aligns.forEach((a) => {
    const t = document.createElement('div');
    t.className = 'tick' + (a.valid ? '' : ' dead') + (a.offset === state.offset ? ' sel' : '');
    t.title = a.valid ? `offset ${a.offset}` : `offset ${a.offset} — impossible: ${a.clashes.length} letter(s) would encipher to themselves`;
    if (a.valid) t.addEventListener('click', () => { state.offset = a.offset; renderCrib(); });
    strip.appendChild(t);
  });

  renderBands();

  const current = state.aligns[state.offset];
  const verdict = $('align-verdict');
  if (!current || !current.valid) {
    verdict.className = 'verdict bad';
    verdict.textContent = current
      ? `Offset ${state.offset} is impossible — ${current.clashes.map((i) => state.crib[i]).join(', ')} would encipher to itself.`
      : 'No alignment selected.';
    state.fullMenu = state.menu = null;
    drawMenu($('menu-graph'), { vertices: [], edges: [] }, null);
    setMenuStats(null);
    return;
  }

  verdict.className = 'verdict good';
  verdict.textContent = `Offset ${state.offset} is possible. Every letter differs from its ciphertext.`;

  state.fullMenu = buildMenu(state.cipher, state.crib, state.offset);
  state.menu = selectScramblers(state.fullMenu);
  state.testReg = testRegister(state.menu);
  drawMenu($('menu-graph'), state.menu, state.testReg);
  setMenuStats(state.menu);
}

function renderBands() {
  const bc = $('band-cipher'), bk = $('band-crib');
  bc.innerHTML = ''; bk.innerHTML = '';
  const a = state.aligns[state.offset];
  for (let i = 0; i < state.cipher.length; i++) {
    const s = document.createElement('span');
    s.textContent = state.cipher[i];
    const within = i >= state.offset && i < state.offset + state.crib.length;
    if (within) s.className = 'under';
    bc.appendChild(s);

    const k = document.createElement('span');
    if (within) {
      const j = i - state.offset;
      k.textContent = state.crib[j];
      k.className = a && a.clashes.includes(j) ? 'clash' : 'on';
    } else {
      k.textContent = '.';
    }
    bk.appendChild(k);
  }
}

function setMenuStats(menu) {
  const put = (id, v) => { $(id).textContent = v; };
  if (!menu) {
    ['m-e', 'm-v', 'm-c', 'm-closures', 'm-used', 'm-test', 'm-predict'].forEach((i) => put(i, '—'));
    $('m-predict-note').textContent = '';
    return;
  }
  put('m-e', menu.E);
  put('m-v', menu.V);
  put('m-c', menu.C);
  put('m-closures', menu.closures);
  put('m-used', `${menu.edges.length} / ${SCRAMBLER_BUDGET}`);
  put('m-test', chr(state.testReg));

  const scope = $('order-scope') ? $('order-scope').value : 'all';
  const positions = (scope === 'known' ? 1 : 60) * 17576;
  const predicted = predictStops(menu.closures, positions);
  put('m-predict', menu.closures === 0 ? 'no filtering' : `≈ ${fmt(Math.round(predicted))}`);
  $('m-predict-note').textContent = menu.closures === 0
    ? 'With no closures the menu cannot contradict anything. Every position stops, and the search tells you nothing. Drag the crib until loops appear.'
    : `Each closure is another 1-in-26 coincidence a wrong hypothesis has to survive, so the estimate is ${fmt(positions)} ÷ 26^${menu.closures}.`;
}

/* ----------------------------------------------------------------- bombe */

function runSearch() {
  if (!state.menu || !state.menu.edges.length) {
    setMode('crib');
    return;
  }
  cancelSearch();

  state.stops = [];
  state.running = true;
  $('btn-run').disabled = true;
  $('btn-stop').disabled = false;
  $('stop-list').innerHTML = '';
  $('stops-note').textContent = 'Running…';
  $('progress-bar').style.width = '0%';

  const scope = $('order-scope').value;
  const orders = scope === 'known' ? [readSettings().rotors] : null;

  const worker = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
  state.worker = worker;
  worker.onmessage = (ev) => onWorkerMessage(ev.data);
  worker.postMessage({
    type: 'run',
    menu: plainMenu(state.menu),
    fullMenu: plainMenu(state.fullMenu),
    testReg: state.testReg,
    reflector: $('reflector').value,
    orders,
    cipher: state.cipher,
    crib: state.crib,
    offset: state.offset,
    maxStops: 4000,
  });
}

/** Structured clone cannot carry the typed arrays and helpers, so send plain data. */
function plainMenu(menu) {
  return { edges: menu.edges.map((e) => ({ p: e.p, c: e.c, t: e.t, id: e.id })) };
}

function cancelSearch() {
  if (state.worker) {
    state.worker.postMessage({ type: 'cancel' });
    state.worker.terminate();
    state.worker = null;
  }
  state.running = false;
  $('btn-run').disabled = false;
  $('btn-stop').disabled = true;
}

function onWorkerMessage(msg) {
  if (msg.type === 'progress') {
    const pct = (100 * msg.tested) / msg.totalPositions;
    $('progress-bar').style.width = pct.toFixed(1) + '%';
    setRunStats([
      ['tested', fmt(msg.tested)],
      ['of', fmt(msg.totalPositions)],
      ['rotor order', msg.order.join(' ')],
      ['window', msg.position.map(chr).join('')],
      ['stops', fmt(msg.stops ?? 0)],
      ['rate', fmt(Math.round(msg.tested / Math.max(0.001, msg.elapsed / 1000))) + '/s'],
    ]);
  } else if (msg.type === 'stop') {
    if (msg.live) { state.lastLive = msg.live; renderBoard(msg.live); }
  } else if (msg.type === 'evaluating') {
    $('stops-note').textContent = `${fmt(msg.stops)} stops — completing plugboards against the full crib…`;
  } else if (msg.type === 'done') {
    finishSearch(msg);
  } else if (msg.type === 'error') {
    $('stops-note').textContent = 'Error: ' + msg.message;
    cancelSearch();
  } else if (msg.type === 'cancelled') {
    $('stops-note').textContent = 'Stopped.';
    cancelSearch();
  }
}

function setRunStats(pairs) {
  const box = $('run-stats');
  box.innerHTML = '';
  for (const [k, v] of pairs) {
    const d = document.createElement('span');
    d.className = 'chip';
    d.innerHTML = `${k} <b>${v}</b>`;
    box.appendChild(d);
  }
}

function finishSearch(msg) {
  cancelSearch();
  $('progress-bar').style.width = '100%';

  const winners = msg.ranked.filter((s) => s.cribMatch);
  const predicted = state.menu ? predictStops(state.menu.closures, msg.totalPositions) : null;
  setRunStats([
    ['positions tested', fmt(msg.tested)],
    ['stops predicted', predicted == null ? '—' : '≈ ' + fmt(Math.round(predicted))],
    ['stops measured', fmt(msg.stops)],
    ['survived plugboard completion', fmt(msg.survivors)],
    ['reproduce the crib', fmt(winners.length)],
    ['elapsed', (msg.elapsed / 1000).toFixed(1) + 's'],
  ]);

  $('stops-note').innerHTML = winners.length
    ? `Of ${fmt(msg.tested)} positions, ${fmt(msg.stops)} stopped the machine, ${fmt(msg.survivors)} survived plugboard completion, and <b>${fmt(winners.length)}</b> reproduce the crib exactly.`
    : `${fmt(msg.stops)} stops, none of which reproduce the crib. Try an alignment with more closures.`;

  const list = $('stop-list');
  list.innerHTML = '';
  msg.ranked.slice(0, 25).forEach((s) => list.appendChild(stopCard(s)));

  if (winners.length && state.discarded) revealKey(winners[0]);
}

function stopCard(s) {
  const d = document.createElement('div');
  d.className = 'stop' + (s.cribMatch ? ' win' : '');
  const key = `${s.order.join(' ')}  ·  ${s.ground.map(chr).join('')}`;
  d.innerHTML = `
    <div class="stop-head">
      <span class="key">${key}</span>
      <span class="meta">crib ${s.cribHits}/${state.crib.length}</span>
      <span class="meta">IC ${s.ic.toFixed(4)}</span>
      <span class="meta">${s.cribMatch ? 'reproduces the crib' : ''}</span>
    </div>
    <div class="stop-body">${s.plaintext.slice(0, 120)}${s.plaintext.length > 120 ? '…' : ''}</div>
    <div class="stop-plugs">plugs: ${plugSpec(s.pairs) || '(none forced)'}</div>`;
  return d;
}

function revealKey(win) {
  const truth = state.discarded;
  const got = {
    rotors: win.order.join(' '),
    ground: win.ground.map(chr).join(''),
    plugboard: plugSpec(win.pairs),
  };
  const same = got.rotors === truth.rotors.join(' ')
    && got.ground === truth.ground
    && got.plugboard === normalisePlugs(truth.plugboard);

  const note = document.createElement('div');
  note.className = 'panel';
  note.style.borderColor = same ? 'var(--accent)' : 'var(--warn)';
  note.innerHTML = `
    <h2>The key the app discarded</h2>
    <div class="stat-line"><span>rotor order</span><b>${truth.rotors.join(' ')} &nbsp;→&nbsp; recovered ${got.rotors}</b></div>
    <div class="stat-line"><span>ground setting</span><b>${truth.ground} &nbsp;→&nbsp; recovered ${got.ground}</b></div>
    <div class="stat-line"><span>plugboard</span><b>${normalisePlugs(truth.plugboard)}</b></div>
    <div class="stat-line"><span>recovered plugboard</span><b>${got.plugboard}</b></div>
    <div class="stat-line big"><span>verdict</span><b>${same ? 'exact match' : 'partial — see above'}</b></div>
    <p class="note">The solver never saw any of this. It was given a ciphertext and one guessed word.</p>`;
  const list = $('stop-list');
  list.parentNode.insertBefore(note, list);
}

function normalisePlugs(spec) {
  const text = (spec || '').toUpperCase().replace(/[^A-Z]/g, '');
  const pairs = [];
  for (let i = 0; i < text.length; i += 2) {
    const a = ord(text[i]), b = ord(text[i + 1]);
    pairs.push([Math.min(a, b), Math.max(a, b)]);
  }
  pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return plugSpec(pairs);
}

function renderBoard(live) {
  drawBoard($('board'), live, state.testReg);
  $('board-caption').textContent = live
    ? `Live wires from a stop, with the test register (${chr(state.testReg)}) outlined. A hypothesis that lit all 26 would have been a contradiction.`
    : 'Run the bombe to see a stop’s live wires. The dashed diagonal is the identity the board encodes.';
}

/* ----------------------------------------------------------------- proof */

function runProof() {
  const list = $('fixture-list');
  list.innerHTML = '';
  $('fixture-summary').textContent = 'running…';

  // Yield a frame so the "running" state paints before the slow case blocks.
  setTimeout(() => {
    const r = runFixtures();
    list.innerHTML = '';
    for (const f of r.results) {
      const d = document.createElement('div');
      d.className = 'fixture ' + (f.ok ? 'pass' : 'fail');
      d.innerHTML = `
        <span class="mark">${f.ok ? '✓' : '✗'}</span>
        <div class="body">
          <div>${f.name}</div>
          <div class="why">${f.why}</div>
          ${f.detail ? `<div class="detail">${f.detail}</div>` : ''}
        </div>
        <span class="meta note">${Math.round(f.ms)}ms</span>`;
      list.appendChild(d);
    }
    $('fixture-summary').textContent = `${r.passed}/${r.ran} passing`;
    $('fixture-summary').style.color = r.allPassed ? 'var(--accent)' : 'var(--danger)';
  }, 30);
}

/* ------------------------------------------------------------------ misc */

void closure; void buildAdjacency; void cribPositions; void buildPermTable;
void posIndex; void IC_RANDOM; void IC_GERMAN; void N;

init();
