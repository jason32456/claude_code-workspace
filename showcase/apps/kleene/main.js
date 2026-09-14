import { compile } from './js/compile.js';
import { groupedEdges, liveCount } from './js/dfa.js';
import { decide, describe, sampleStrings } from './js/equiv.js';
import { compileProgram, BacktrackVM, runThompson } from './js/engine.js';
import { renderAutomaton, nfaGraphSpec, dfaGraphSpec, renderAst } from './js/render.js';
import { renderChart, renderLegend } from './js/chart.js';
import { astChildren } from './js/parser.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------- presets

const COMPILE_PRESETS = [
  ['(a|b)*abb', 'the textbook automaton — 4 states minimized'],
  ['(a|b)*', 'two states before minimizing, one after'],
  ['a{2,3}', 'a bounded repeat, expanded'],
  ['[0-9]{3}-[0-9]{4}', 'classes keep the alphabet small'],
  ['(ab)*a', 'the loop is a back-edge'],
  ['\\d+\\.\\d{2}', 'escapes resolve to character sets'],
  ['(a*b*)*', 'determinizing collapses a lot of it'],
  ['[a-z]+@[a-z]+\\.[a-z]{2,3}', 'a familiar shape, as a machine'],
  ['a?a?a?aaa', 'subset construction blows up before minimizing'],
  ['(a+)\\1', 'rejected — not a regular language'],
  ['a(?=b)', 'rejected — lookaround'],
];

const RACE_PRESETS = [
  ['(a|a)*', 'aaaaaaaaaaaaaaaaX', 'the classic: two ways to match every a'],
  ['(a+)+', 'aaaaaaaaaaaaaaaaX', 'nested quantifiers, same blowup'],
  ['(a|aa)*', 'aaaaaaaaaaaaaaaaaaaaX', 'overlapping alternatives'],
  ['(a|b|ab)*', 'ababababababababX', 'three ways through the same text'],
  ['(a|b)*abb', 'aababbababbabbX', 'a well-behaved pattern — both stay cheap'],
  ['[a-z]+@[a-z]+', 'aaaaaaaaaaaaaaaa', 'no ambiguity, so no blowup'],
];

const EQUIV_PRESETS = [
  ['(a|b)*', '(a*b*)*', 'equal — both are every string of a and b'],
  ['(ab)*a', 'a(ba)*', 'equal — the same language, written from either end'],
  ['a{2,3}', 'aa|aaa', 'equal — a bounded repeat is alternation'],
  ['[0-9]+', '\\d\\d*', 'equal — one or more is one then any number'],
  ['(a|b)*abb', '(a|b)*abb(a|b)*', 'different — the second allows a suffix'],
  ['a*', 'a+', 'different, and the shortest witness is the empty string'],
  ['a{2,3}', 'a{2,4}', 'different — the witness has to be 4 long'],
  ['(a|b)+', '(b|a)+', 'equal — order inside an alternation is irrelevant'],
  ['[a-z]', '[a-y]', 'different by exactly one character'],
];

// The fixture suite. A wrong verdict is the one unacceptable failure, so the
// answers here were established independently of the code under test.
const FIXTURES = [
  ['(a|b)*', '(a*b*)*', true],
  ['(ab)*a', 'a(ba)*', true],
  ['a{2,3}', 'aa|aaa', true],
  ['[0-9]+', '\\d\\d*', true],
  ['a*', '(a|aa)*', true],
  ['(a|b)+', '(b|a)+', true],
  ['a?', '|a', true],
  ['(ab|a)(b|)', 'ab|abb|a', true],
  ['x', 'x', true],
  ['(a|b)*abb', '(a|b)*abb', true],
  ['a*', 'a+', false],
  ['(a|b)*', 'a*', false],
  ['a{2,3}', 'a{2,4}', false],
  ['abc', 'abd', false],
  ['[a-z]', '[a-y]', false],
  ['(ab)*', '(ba)*', false],
  ['a|b', 'a', false],
  ['(a|b)*abb', '(a|b)*abb(a|b)*', false],
];

const STAGE_NOTES = {
  tokens:
    'The pattern, resolved. Escapes and classes have become <b>character sets</b>; '
    + 'nothing here knows about matching yet.',
  ast:
    'Precedence made explicit: alternation binds loosest, then concatenation, then '
    + 'the postfix quantifiers. <b>Click any node</b> to light up the NFA states it '
    + 'produces — Thompson’s construction is compositional, so every state '
    + 'belongs to exactly one node.',
  nfa:
    'Thompson’s construction. Each AST node contributes a fragment with one entry '
    + 'and one exit, glued together with <b>ε-transitions</b> (dashed). Linear in '
    + 'the size of the pattern, and nondeterministic: many states can be active at once.',
  dfa:
    'Subset construction. Each state here is a <b>set</b> of NFA states — all the '
    + 'places the NFA could be at once — so the machine is deterministic. This is the '
    + 'step that can blow up, and sometimes does.',
  min:
    'Hopcroft partition refinement: states that cannot be told apart by any suffix '
    + 'are merged. The result is the <b>canonical</b> machine for this language — two '
    + 'patterns are equivalent exactly when their minimal DFAs are isomorphic.',
};

// --------------------------------------------------------------- state

const state = {
  mode: 'compile',
  stage: 'nfa',
  selectedAst: null,
  hideTrap: true,
  compiled: null,
  raceToken: 0,
};

// -------------------------------------------------------- diagnostics

function showError(host, err, source) {
  host.hidden = false;
  host.replaceChildren();

  const msg = document.createElement('p');
  msg.className = 'msg';
  msg.textContent = err.message;
  host.append(msg);

  if (typeof err.pos === 'number' && source) {
    const pre = document.createElement('pre');
    const caretLine = ' '.repeat(Math.max(0, err.pos)) + '^'.repeat(Math.max(1, err.length ?? 1));
    pre.append(document.createTextNode(`${source}\n`));
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.textContent = caretLine;
    pre.append(caret);
    host.append(pre);
  }
  if (err.hint) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = err.hint;
    host.append(hint);
  }
}

// ------------------------------------------------------- compile view

function countAst(node) {
  return 1 + astChildren(node).reduce((n, c) => n + countAst(c), 0);
}

function renderStats(c) {
  const host = $('stats');
  host.replaceChildren();
  const dfaLive = liveCount(c.minDfa);
  const reduced = c.stats.dfaStates > c.stats.minStates;
  const items = [
    ['Tokens', c.tokens.length, false],
    ['AST nodes', countAst(c.ast), false],
    ['NFA states', c.stats.nfa.states, false],
    ['ε-edges', c.stats.nfa.epsilon, false],
    ['Alphabet classes', c.stats.classes, false],
    ['DFA states', c.stats.dfaStates, false],
    ['Minimal', `${dfaLive}${c.minDfa.trap >= 0 ? ' + trap' : ''}`, reduced],
  ];
  for (const [label, value, isReduced] of items) {
    const d = document.createElement('dl');
    d.className = `stat${isReduced ? ' is-reduced' : ''}`;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    d.append(dt, dd);
    host.append(d);
  }
}

function renderTokens(host, c) {
  host.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'token-scroll';
  const table = document.createElement('table');
  table.className = 'token-table';
  table.innerHTML =
    '<thead><tr><th>#</th><th>Text</th><th>Kind</th><th>Resolves to</th></tr></thead>';
  const tbody = document.createElement('tbody');
  c.tokens.forEach((t, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td class="t-note">${i}</td>`
      + `<td class="t-text"></td>`
      + `<td class="t-kind">${t.kind}</td>`
      + `<td class="t-note"></td>`;
    tr.children[1].textContent = t.text;
    tr.children[3].textContent = t.note ?? '';
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  host.append(wrap);
}

function renderStage() {
  const c = state.compiled;
  const body = $('stage-body');
  const actions = $('stage-actions');
  $('stage-note').innerHTML = STAGE_NOTES[state.stage];
  if (!c) { body.replaceChildren(); return; }

  const graphStage = state.stage === 'nfa' || state.stage === 'dfa' || state.stage === 'min';
  actions.hidden = !graphStage;
  $('hide-trap').closest('label').hidden = state.stage === 'nfa';

  if (state.stage === 'tokens') { renderTokens(body, c); return; }

  if (state.stage === 'ast') {
    body.replaceChildren();
    renderAst(body, c.ast, {
      selected: state.selectedAst,
      onSelect: (node) => {
        state.selectedAst = state.selectedAst === node.id ? null : node.id;
        state.stage = 'nfa';
        syncStageTabs();
        renderStage();
      },
    });
    return;
  }

  if (state.stage === 'nfa') {
    const spec = nfaGraphSpec(c.nfa, { highlightAst: state.selectedAst });
    renderAutomaton(body, spec);
    return;
  }

  const dfa = state.stage === 'dfa' ? c.dfa : c.minDfa;
  const edges = groupedEdges(dfa, { hideTrap: state.hideTrap });
  renderAutomaton(body, dfaGraphSpec(dfa, edges, { hideTrap: state.hideTrap }));
}

function syncStageTabs() {
  for (const tab of document.querySelectorAll('.stage-tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.stage === state.stage));
  }
}

// There is nothing to look at when the pattern does not compile, so the whole
// pipeline section steps aside for the diagnostic rather than leaving an empty
// grid under it.
function setPipelineVisible(visible) {
  for (const sel of ['.stage-bar', '#stage-note', '#stage-actions', '#stage-body']) {
    document.querySelector(sel).hidden = !visible;
  }
}

function recompile() {
  const source = $('pattern').value;
  const diag = $('diagnostic');
  try {
    state.compiled = compile(source);
    diag.hidden = true;
    setPipelineVisible(true);
    renderStats(state.compiled);
    renderStage();
  } catch (err) {
    state.compiled = null;
    showError(diag, err, source);
    setPipelineVisible(false);
    $('stats').replaceChildren();
    $('stage-body').replaceChildren();
  }
}

// ---------------------------------------------------------- race view

const RACE_BUDGET = 4_000_000;
const CHART_BUDGET = 400_000;

function raceRun() {
  const token = ++state.raceToken;
  const pattern = $('race-pattern').value;
  const subject = $('race-subject').value;
  const diag = $('race-diagnostic');

  let program;
  try {
    const c = compile(pattern);
    program = compileProgram(c.ast);
    diag.hidden = true;
  } catch (err) {
    showError(diag, err, pattern);
    $('bt-steps').textContent = '—';
    $('th-steps').textContent = '—';
    $('ratio-line').textContent = '';
    $('chart').replaceChildren();
    return;
  }

  // Thompson is linear, so it always finishes immediately.
  const th = runThompson(program, subject, { budget: RACE_BUDGET });
  $('th-steps').textContent = th.steps.toLocaleString();
  $('th-verdict').textContent = th.matched ? 'matches' : 'no match';
  $('th-verdict').className = th.matched ? 'yes' : 'no';
  $('th-threads').textContent = String(th.maxThreads);

  // The backtracker runs in slices so a pathological pattern spins a counter
  // instead of freezing the page.
  const vm = new BacktrackVM(program, subject, { budget: RACE_BUDGET });
  const btSteps = $('bt-steps');
  const btVerdict = $('bt-verdict');
  const btStack = $('bt-stack');

  const tick = () => {
    if (token !== state.raceToken) return;
    vm.runSlice(60_000);
    btSteps.textContent = vm.steps.toLocaleString();
    btStack.textContent = vm.maxStackDepth.toLocaleString();

    if (vm.status === 'running') { requestAnimationFrame(tick); return; }

    const over = vm.status === 'budget';
    btSteps.classList.toggle('over', over);
    btVerdict.textContent = over
      ? 'gave up'
      : (vm.status === 'matched' ? 'matches' : 'no match');
    btVerdict.className = over ? 'over' : (vm.status === 'matched' ? 'yes' : 'no');

    const ratio = Math.round(vm.steps / Math.max(1, th.steps));
    const line = $('ratio-line');
    line.replaceChildren();
    if (over) {
      line.innerHTML =
        `The backtracking VM hit its <b>${RACE_BUDGET.toLocaleString()}</b>-instruction `
        + `budget and stopped. Thompson finished the same job in <b>${th.steps.toLocaleString()}</b>.`;
    } else if (ratio >= 10) {
      line.innerHTML =
        `Same pattern, same subject, same answer — and the backtracking VM did `
        + `<b>${ratio.toLocaleString()}x</b> the work.`;
    } else {
      line.innerHTML =
        `Both engines stayed cheap here (<b>${ratio}x</b>). Nothing in this pattern `
        + `gives the backtracker a choice it has to undo.`;
    }
    if (!over && vm.result().matched !== th.matched) {
      line.innerHTML += ' <span style="color:#e5484d">Engines disagree — that is a bug.</span>';
    }

    buildChart(program, subject, token);
  };

  btSteps.classList.remove('over');
  btVerdict.textContent = 'running…';
  btVerdict.className = '';
  requestAnimationFrame(tick);
}

// Growth curve: the same pattern against a lengthening prefix of the subject.
// The subject is treated as a repeated body plus a final character, so
// "aaaaX" grows as "aX", "aaX", "aaaX", ...
function buildChart(program, subject, token) {
  const chars = Array.from(subject);
  const tail = chars.length > 1 && chars[chars.length - 1] !== chars[0]
    ? chars[chars.length - 1] : '';
  const body = tail ? chars.slice(0, -1) : chars;
  const maxN = Math.min(body.length, 22);
  if (maxN < 2) { $('chart').replaceChildren(); return; }

  const points = [];
  for (let n = 1; n <= maxN; n++) {
    if (token !== state.raceToken) return;
    const s = body.slice(0, n).join('') + tail;
    const bt = new BacktrackVM(program, s, { budget: CHART_BUDGET }).run();
    const th = runThompson(program, s, { budget: CHART_BUDGET });
    points.push({
      n: n + (tail ? 1 : 0),
      backtrack: bt.steps,
      thompson: th.steps,
      capped: bt.exhausted,
    });
  }
  const anyCapped = points.some((p) => p.capped);
  renderChart($('chart'), points, { capped: anyCapped ? CHART_BUDGET : null });
  $('chart-sub').textContent = anyCapped
    ? 'Same pattern, one more character each step. Log scale — a straight line here '
      + 'is exponential growth. Points on the dashed line hit the step budget and stopped.'
    : 'Same pattern, one more character each step. Log scale — a straight line here '
      + 'is exponential growth.';
}

// --------------------------------------------------------- equiv view

function runDecide() {
  const pa = $('eq-a').value;
  const pb = $('eq-b').value;
  const diag = $('eq-diagnostic');
  const verdict = $('verdict');

  let result;
  try {
    result = decide(pa, pb);
    diag.hidden = true;
  } catch (err) {
    showError(diag, err, err.pos !== undefined ? (err.source ?? '') : '');
    verdict.className = 'verdict error';
    verdict.replaceChildren();
    verdict.innerHTML = '<h2>Cannot decide</h2>';
    const p = document.createElement('p');
    p.textContent = err.message;
    verdict.append(p);
    $('eq-graph-a').replaceChildren();
    $('eq-graph-b').replaceChildren();
    return;
  }

  verdict.replaceChildren();
  verdict.className = `verdict ${result.equal ? 'equal' : 'differ'}`;

  const h = document.createElement('h2');
  h.textContent = result.equal
    ? 'Equivalent — the same language'
    : 'Not equivalent';
  verdict.append(h);

  const p = document.createElement('p');
  if (result.equal) {
    p.innerHTML =
      `The product automaton was explored exhaustively — <b>${result.explored}</b> `
      + 'reachable state pairs — and no pair disagreed on acceptance. That is a proof '
      + 'over all infinitely many strings, not a sample of them.';
  } else {
    p.innerHTML =
      `A disagreeing pair was reachable after <b>${result.explored}</b> pairs. Because `
      + 'the search is breadth-first, the string below is the <b>shortest</b> one on '
      + 'which the two patterns differ.';
  }
  verdict.append(p);

  if (!result.equal) {
    const row = document.createElement('div');
    row.className = 'witness';
    const label = document.createElement('span');
    label.className = 'witness-label';
    label.textContent = 'Shortest distinguishing string';
    const value = document.createElement('span');
    value.className = `witness-value${result.witness === '' ? ' empty' : ''}`;
    value.textContent = result.witness === ''
      ? '(the empty string)'
      : JSON.stringify(result.witness);
    const who = document.createElement('span');
    who.className = 'witness-label';
    who.textContent = `matched by ${result.acceptedBy === 'a' ? 'A only' : 'B only'}`;
    row.append(label, value, who);
    verdict.append(row);

    if (!result.verified) {
      const warn = document.createElement('p');
      warn.style.color = '#e5484d';
      warn.textContent =
        'Self-check failed: re-running the witness through both machines did not '
        + 'reproduce the disagreement. Treat this verdict as unreliable.';
      verdict.append(warn);
    }
  } else {
    const note = describe(result.a);
    const s = document.createElement('p');
    s.className = 'samples';
    // "matches nothing" and "matches everything" say it all; anything else is
    // more tangible as a handful of actual members.
    if (note === 'matches nothing' || note === 'matches every string') {
      s.textContent = `This language ${note}.`;
    } else {
      s.append(document.createTextNode('Shortest members: '));
      for (const str of sampleStrings(result.a, 6)) {
        const code = document.createElement('code');
        code.textContent = str === '' ? '(empty)' : str;
        s.append(code);
      }
    }
    verdict.append(s);
  }

  const drawOne = (hostId, capId, compiled, name) => {
    const edges = groupedEdges(compiled.minDfa, { hideTrap: true });
    renderAutomaton($(hostId), dfaGraphSpec(compiled.minDfa, edges, { hideTrap: true }));
    $(capId).textContent =
      `${name} — minimal DFA, ${liveCount(compiled.minDfa)} live state`
      + `${liveCount(compiled.minDfa) === 1 ? '' : 's'}`;
  };
  drawOne('eq-graph-a', 'cap-a', result.a, 'Pattern A');
  drawOne('eq-graph-b', 'cap-b', result.b, 'Pattern B');
}

function runFixtures() {
  const host = $('test-output');
  host.replaceChildren();
  let pass = 0;
  const lines = [];

  for (const [a, b, expected] of FIXTURES) {
    let ok = false;
    let detail = '';
    try {
      const r = decide(a, b);
      ok = r.equal === expected && r.verified;
      detail = r.equal
        ? 'equal'
        : `differ on ${r.witness === '' ? '(empty)' : JSON.stringify(r.witness)}`;
    } catch (err) {
      detail = `threw: ${err.message}`;
    }
    if (ok) pass++;
    lines.push([ok, `${a}  vs  ${b}`, detail]);
  }

  for (const [ok, pair, detail] of lines) {
    const div = document.createElement('div');
    div.className = ok ? 'pass' : 'fail';
    div.textContent = `${ok ? 'PASS' : 'FAIL'}  ${pair.padEnd(34)} ${detail}`;
    host.append(div);
  }

  // The textbook invariant, checked separately from the pair fixtures.
  const abb = compile('(a|b)*abb');
  const live = liveCount(abb.minDfa);
  const abbOk = live === 4;
  if (abbOk) pass++;
  const extra = document.createElement('div');
  extra.className = abbOk ? 'pass' : 'fail';
  extra.textContent =
    `${abbOk ? 'PASS' : 'FAIL'}  (a|b)*abb minimizes to 4 live states — got ${live}`;
  host.append(extra);

  const total = FIXTURES.length + 1;
  const sum = document.createElement('div');
  sum.className = `summary ${pass === total ? 'pass' : 'fail'}`;
  sum.textContent = `${pass} / ${total} passed`;
  host.append(sum);
}

// ------------------------------------------------------------- wiring

function fillSelect(id, rows, format) {
  const sel = $(id);
  sel.replaceChildren();
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Pick an example…';
  sel.append(blank);
  rows.forEach((row, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = format(row);
    sel.append(opt);
  });
}

function setMode(mode) {
  state.mode = mode;
  for (const tab of document.querySelectorAll('.mode-tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
  }
  $('view-compile').hidden = mode !== 'compile';
  $('view-race').hidden = mode !== 'race';
  $('view-equiv').hidden = mode !== 'equiv';
  if (mode === 'race') raceRun();
  if (mode === 'equiv') runDecide();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function init() {
  fillSelect('preset-compile', COMPILE_PRESETS, ([p, why]) => `${p}  —  ${why}`);
  fillSelect('preset-race', RACE_PRESETS, ([p, , why]) => `${p}  —  ${why}`);
  fillSelect('preset-equiv', EQUIV_PRESETS, ([a, b, why]) => `${a} vs ${b}  —  ${why}`);
  renderLegend($('chart-legend'));

  for (const tab of document.querySelectorAll('.mode-tab')) {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  }
  for (const tab of document.querySelectorAll('.stage-tab')) {
    tab.addEventListener('click', () => {
      state.stage = tab.dataset.stage;
      syncStageTabs();
      renderStage();
    });
  }

  const onPattern = debounce(() => { state.selectedAst = null; recompile(); }, 160);
  $('pattern').addEventListener('input', onPattern);
  $('preset-compile').addEventListener('change', (ev) => {
    const row = COMPILE_PRESETS[Number(ev.target.value)];
    if (!row) return;
    $('pattern').value = row[0];
    state.selectedAst = null;
    recompile();
  });

  $('hide-trap').addEventListener('change', (ev) => {
    state.hideTrap = ev.target.checked;
    renderStage();
  });
  $('reset-view').addEventListener('click', () => {
    $('stage-body').querySelector('svg.automaton')?.reset?.();
  });

  const onRace = debounce(raceRun, 220);
  $('race-pattern').addEventListener('input', onRace);
  $('race-subject').addEventListener('input', onRace);
  $('preset-race').addEventListener('change', (ev) => {
    const row = RACE_PRESETS[Number(ev.target.value)];
    if (!row) return;
    $('race-pattern').value = row[0];
    $('race-subject').value = row[1];
    raceRun();
  });

  const onEq = debounce(runDecide, 220);
  $('eq-a').addEventListener('input', onEq);
  $('eq-b').addEventListener('input', onEq);
  $('preset-equiv').addEventListener('change', (ev) => {
    const row = EQUIV_PRESETS[Number(ev.target.value)];
    if (!row) return;
    $('eq-a').value = row[0];
    $('eq-b').value = row[1];
    runDecide();
  });
  $('run-tests').addEventListener('click', runFixtures);

  syncStageTabs();
  recompile();
}

init();
