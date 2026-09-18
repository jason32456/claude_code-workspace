import { speak, isKnownPhone } from './js/synth.js';
import { drawMatrix, drawSweep, drawEm, drawWave } from './js/charts.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const VOWELS = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
const isVowel = (p) => VOWELS.has(p.replace(/\d$/, ''));

const state = { dict: null, align: null, sweep: null, matrix: null, last: null, token: 0 };

/* ---------------- shared bits ---------------- */

function phoneRow(phones, compare) {
  const box = el('div', 'phones');
  if (!phones || !phones.length) {
    box.appendChild(el('span', 'ph silent', 'nothing'));
    return box;
  }
  phones.forEach((p, i) => {
    const n = el('span', `ph${isVowel(p) ? ' vowel' : ''}`, p);
    if (compare) n.classList.add(compare[i] === p ? 'match' : 'miss');
    box.appendChild(n);
  });
  return box;
}

function ribbon(chunks, { showConfidence = false } = {}) {
  const box = el('div', 'ribbon');
  for (const c of chunks) {
    const silent = !c.phones.length;
    const low = showConfidence && c.p !== undefined && c.p < 0.5;
    const n = el('div', `rib${silent ? ' silent' : ''}${low ? ' conf-low' : ''}`);
    n.appendChild(el('div', 'lt', c.letters));
    n.appendChild(el('div', 'arrow', '↓'));
    n.appendChild(el('div', 'pn', silent ? 'silent' : c.phones.join(' ')));
    if (c.p !== undefined) n.title = `p = ${c.p.toFixed(3)}`;
    box.appendChild(n);
  }
  return box;
}

function playButton(label, phones) {
  const b = el('button', 'act small', label);
  const playable = phones && phones.length && phones.every(isKnownPhone);
  b.disabled = !playable;
  b.onclick = () => speak(phones);
  return b;
}

function row(label, node) {
  const r = el('div', 'resultrow');
  r.appendChild(el('div', 'label', label));
  const body = el('div', 'body');
  body.appendChild(node);
  r.appendChild(body);
  return r;
}

/* ---------------- read-aloud ---------------- */

function renderPrediction(res) {
  const out = $('read-out');
  out.textContent = '';
  if (!res) {
    out.appendChild(el('div', 'pending', 'type letters a–z'));
    return;
  }
  state.last = res;
  const top = res.hypotheses[0];

  $('say-model').disabled = !(top && top.phones.every(isKnownPhone));
  $('say-truth').disabled = !res.inDictionary;

  const head = el('div', 'resultrow');
  head.appendChild(el('div', 'label', 'the model says'));
  const hb = el('div', 'body');
  hb.appendChild(phoneRow(top ? top.phones : [], res.inDictionary ? res.truth : null));
  hb.appendChild(ribbon(top ? top.trace : [], { showConfidence: true }));
  head.appendChild(hb);
  out.appendChild(head);

  if (res.inDictionary) {
    const t = el('div');
    t.appendChild(phoneRow(res.truth));
    if (res.truthAlignment) t.appendChild(ribbon(res.truthAlignment.chunks));
    out.appendChild(row('the dictionary says', t));
    const same = top && top.phones.join(' ') === res.truth.join(' ');
    const note = el('div', 'footnote',
      same
        ? 'exact match — but this word was almost certainly in its training data, so it is not evidence of anything. Try a word you invented.'
        : 'the model and the dictionary disagree. Play both.');
    out.appendChild(note);
  } else {
    out.appendChild(row('the dictionary says',
      el('div', 'footnote', 'not in the dictionary — so this is a genuine guess, from spelling alone.')));
  }

  if (res.hypotheses.length > 1) {
    const alts = el('div');
    for (const h of res.hypotheses.slice(1, 4)) {
      const line = el('div', 'altline');
      line.appendChild(phoneRow(h.phones));
      line.appendChild(playButton('▶', h.phones));
      alts.appendChild(line);
    }
    out.appendChild(row('runners-up', alts));
  }

  const wave = el('canvas');
  wave.width = 900;
  wave.height = 54;
  out.appendChild(row('waveform', wave));
  requestAnimationFrame(() => {
    if (top && top.phones.every(isKnownPhone)) {
      import('./js/synth.js').then((S) => drawWave(wave, S.render(top.phones, { sampleRate: 22050 })));
    }
  });
}

function ask(word) {
  state.token++;
  worker.postMessage({ type: 'pronounce', word, token: state.token });
}

/* ---------------- the trial ---------------- */

function renderTrial(data) {
  const out = $('trial-out');
  out.textContent = '';

  for (const v of data.verdicts) {
    const card = el('div', 'verdict');
    const h = el('h3');
    h.innerHTML = `<span class="lit">${v.letters}</span> ${v.claim} → /${v.says}/`;
    const tag = el('span', `tag ${v.survives ? 'alive' : 'dead'}`,
      v.survives ? 'possible but rare' : 'never happens');
    h.appendChild(tag);
    card.appendChild(h);
    card.appendChild(el('div', 'sub',
      `For “ghoti” this has to work word-${v.requiredPosition}.`));

    const bars = el('div', 'posbars');
    const total = Math.max(1, ...['initial', 'medial', 'final'].map((p) => v.positionCounts[p].seen));
    for (const posName of ['initial', 'medial', 'final']) {
      const { seen, hit } = v.positionCounts[posName];
      const needed = posName === v.requiredPosition;
      bars.appendChild(el('div', 'pname', `word-${posName}`));
      const track = el('div', `track${needed ? ' needed' : ''}`);
      const bg = el('i');
      bg.style.width = `${(seen / total) * 100}%`;
      track.appendChild(bg);
      const fg = el('b');
      // A rate like 47 in 48,937 is 0.1% of the track and would render as nothing at
      // all, which reads identically to zero. Keep a hairline so "rare" and "never"
      // stay visually distinct -- the difference between them is the whole argument.
      fg.style.width = hit === 0 ? '0' : `max(2px, ${(hit / total) * 100}%)`;
      track.appendChild(fg);
      bars.appendChild(track);
      const num = el('div', 'num');
      num.innerHTML = hit > 0
        ? `<span class="hit">${hit.toLocaleString()}</span> of ${seen.toLocaleString()}`
        : `<span class="zero">0</span> of ${seen.toLocaleString()}`;
      bars.appendChild(num);
    }
    card.appendChild(bars);

    const ev = el('div', 'evidence');
    if (v.survives) {
      ev.innerHTML = `It does happen word-${v.requiredPosition}, in <code>${v.timesInRequiredPosition}</code> of `
        + `<code>${v.spanSeenInPosition.toLocaleString()}</code> words — `
        + `<code>${(v.rateInPosition * 100).toFixed(3)}%</code>. `
        + `Examples: ${v.examples[v.requiredPosition].slice(0, 5).map((w) => `<code>${w}</code>`).join(' ')}.`;
    } else {
      const spells = v.positionOutcomes.map(([k, c]) => `<code>${k}</code> ×${c}`).join(', ');
      ev.innerHTML = `Word-${v.requiredPosition}, <code>${v.letters}</code> appears in `
        + `<code>${v.spanSeenInPosition.toLocaleString()}</code> words and spells /${v.says}/ in `
        + `<code>none of them</code>. What it spells there instead: ${spells || '—'}. `
        + (v.timesAnywhere
          ? `It does make /${v.says}/ elsewhere — ${v.timesAnywhere.toLocaleString()} times — just never here.`
          : '');
    }
    card.appendChild(ev);
    out.appendChild(card);
  }

  const fin = el('div', 'finale');
  const top = data.ghoti.hypotheses[0];
  fin.appendChild(el('div', 'small', 'So when a model that has read 117,493 English words is handed the word'));
  fin.appendChild(el('div', 'big', 'ghoti'));
  const pr = el('div');
  pr.style.display = 'flex';
  pr.style.justifyContent = 'center';
  pr.style.gap = '8px';
  pr.style.margin = '10px 0';
  pr.style.flexWrap = 'wrap';
  pr.appendChild(phoneRow(top.phones));
  fin.appendChild(pr);
  const btns = el('div');
  btns.style.display = 'flex';
  btns.style.gap = '8px';
  btns.style.justifyContent = 'center';
  btns.style.flexWrap = 'wrap';
  btns.appendChild(playButton('▶ hear “ghoti”', top.phones));
  btns.appendChild(playButton('▶ hear “fish”', data.fish.truth || data.fish.hypotheses[0].phones));
  fin.appendChild(btns);
  fin.appendChild(el('div', 'small', 'it does not say fish, and it never could.'));
  out.appendChild(fin);

  const extra = el('div', 'panel');
  extra.style.marginTop = '18px';
  extra.appendChild(el('h2', null, 'A bonus casualty'));
  const wq = data.women;
  const lede = el('p', 'lede');
  lede.innerHTML = 'The joke needs <code>women</code> to be evidence that <code>o</code> can say /ɪ/. '
    + 'It can, in 0.096% of medial <code>o</code>s. The model, having seen 105,744 words, finds that '
    + 'so implausible that it gets <code>women</code> wrong — it has learned the rule and this word is the exception:';
  extra.appendChild(lede);
  const cmp = el('div');
  cmp.appendChild(row('model', (() => {
    const d = el('div');
    d.appendChild(phoneRow(wq.hypotheses[0].phones, wq.truth));
    d.appendChild(playButton('▶ hear it', wq.hypotheses[0].phones));
    return d;
  })()));
  cmp.appendChild(row('dictionary', (() => {
    const d = el('div');
    d.appendChild(phoneRow(wq.truth));
    d.appendChild(playButton('▶ hear it', wq.truth));
    return d;
  })()));
  extra.appendChild(cmp);
  out.appendChild(extra);
}

/* ---------------- other views ---------------- */

function renderAlign(data) {
  state.align = data;
  state.matrix = data;
  drawMatrix($('matrix'), data);
  $('matrix-note').textContent =
    `26 letters x ${data.baseNames.length} phones, plus silence. Chunk lengths learned by EM: `
    + `${(data.aProb[0] * 100).toFixed(1)}% of chunks are one letter, ${(data.aProb[1] * 100).toFixed(1)}% are two.`;

  const out = $('samples-out');
  out.textContent = '';
  for (const s of data.samples) {
    const r = el('div', 'resultrow');
    r.appendChild(el('div', 'label', s.word));
    const b = el('div', 'body');
    b.appendChild(ribbon(s.chunks));
    r.appendChild(b);
    out.appendChild(r);
  }
  drawEm($('emcurve'), data.emHistory);
  const proper = data.emHistory.filter((p) => p.proper);
  $('em-note').textContent = `${data.emHistory.length} passes over ${state.dict.config.emWords.toLocaleString()} words. `
    + `${proper.length} scored (the first runs on the unnormalised prior, so its Z is not a likelihood). `
    + `Final ${proper.length ? proper[proper.length - 1].logLik.toFixed(0) : '—'}.`;
}

function renderScore(s) {
  const out = $('score-out');
  out.textContent = '';
  const stats = el('div', 'stats');
  const add = (v, k, teal) => {
    const d = el('div', 'stat');
    d.appendChild(el('div', `v${teal ? ' teal' : ''}`, v));
    d.appendChild(el('div', 'k', k));
    stats.appendChild(d);
  };
  add(pct(s.wordAccuracy), 'whole word exactly right');
  add(pct(s.wordAccuracyNoStress), 'right ignoring stress', true);
  add(pct(s.phonemeErrorRate), 'phoneme error rate', true);
  add(s.n.toLocaleString(), 'unseen words scored');
  out.appendChild(stats);
  out.appendChild(el('div', 'footnote',
    `Every one of those ${s.n.toLocaleString()} words was held out of the aligner and the counts. `
    + `“English spelling is chaotic” is a claim this number can argue with: a model given no rules at all, `
    + `only examples, reconstructs ${pct(s.wordAccuracyNoStress)} of unseen pronunciations sound for sound.`));
  $('badge-score').textContent = pct(s.wordAccuracy);

  const out2 = $('misses-out');
  out2.textContent = '';
  const grid = el('div', 'misses');
  for (const m of s.worst) {
    const c = el('div', 'miss');
    c.appendChild(el('div', 'w', m.word));
    const l1 = el('div', 'ln');
    l1.appendChild(el('span', null, 'truth'));
    l1.appendChild(phoneRow(m.truth));
    l1.appendChild(playButton('▶', m.truth));
    const l2 = el('div', 'ln');
    l2.appendChild(el('span', null, 'guess'));
    l2.appendChild(phoneRow(m.pred, m.truth));
    l2.appendChild(playButton('▶', m.pred));
    c.appendChild(l1);
    c.appendChild(l2);
    grid.appendChild(c);
  }
  out2.appendChild(grid);
  out2.appendChild(el('div', 'footnote',
    'Read the list before deciding what English is like. These are overwhelmingly surnames and '
    + 'loanwords — names carry the spelling conventions of the language they came from, and no amount '
    + 'of English evidence predicts them. The famous irregulars are largely not here.'));
}

function renderSweep(d) {
  state.sweep = d.sweep;
  let best = d.sweep[0];
  for (const s of d.sweep) if (s.wordAccuracy > best.wordAccuracy) best = s;
  drawSweep($('sweep'), d.sweep, best.width);

  const out = $('sweep-out');
  out.textContent = '';
  const t = el('table', 'data');
  t.innerHTML = '<thead><tr><th>width</th><th>window</th><th class="mono">word acc</th>'
    + '<th class="mono">no stress</th><th class="mono">PER</th><th class="mono">contexts</th></tr></thead>';
  const tb = el('tbody');
  for (const s of d.sweep) {
    const tr = el('tr');
    if (s.width === best.width) tr.className = 'best';
    tr.innerHTML = `<td class="mono">${s.width}</td><td>${s.letters} letters</td>`
      + `<td class="mono">${pct(s.wordAccuracy)}</td><td class="mono">${pct(s.wordAccuracyNoStress)}</td>`
      + `<td class="mono">${pct(s.phonemeErrorRate)}</td><td class="mono">${s.contexts.toLocaleString()}</td>`;
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  out.appendChild(t);

  if (d.done) {
    const last = d.sweep[d.sweep.length - 1];
    const turned = best.width < last.width;
    const rivals = d.sweep.filter((s) => s.width !== best.width);
    const runnerUp = rivals.reduce((a, b) => (b.wordAccuracy > a.wordAccuracy ? b : a));
    const tight = best.wordAccuracy - runnerUp.wordAccuracy < 0.005;
    out.appendChild(el('div', 'footnote', turned
      ? `Accuracy peaks at width ${best.width} (${pct(best.wordAccuracy)}) and then falls to `
        + `${pct(last.wordAccuracy)} by width ${last.width}, even though the wider model has strictly more `
        + `information available. Past the peak the contexts are so specific that they mostly match a single `
        + `training word, so the model is recalling rather than generalising. Scored on ${d.n.toLocaleString()} `
        + `held-out words, so the peak itself is worth about a point either way`
        + `${tight ? ` — widths ${best.width} and ${runnerUp.width} are inside that, and the honest reading is that they are tied` : ''}. `
        + `The decoder everywhere else on this page runs at width ${state.dict.config.decodeContext}.`
      : `Accuracy is still rising at width ${last.width}, so the expected decline was not reached within `
        + `the widths measured. Reported as measured.`));
  }
}

function renderChecks(results) {
  const out = $('checks-out');
  out.textContent = '';
  let passed = 0;
  for (const r of results) {
    if (r.pass) passed++;
    const d = el('div', `check ${r.pass ? 'pass' : 'fail'}`);
    d.appendChild(el('div', 'mark', r.pass ? '✓' : '✗'));
    const t = el('div', 'txt');
    t.appendChild(el('div', 'nm', r.name));
    t.appendChild(el('div', 'dt', r.detail));
    d.appendChild(t);
    out.appendChild(d);
  }
  $('badge-checks').textContent = `${passed}/${results.length}`;
}

/* ---------------- worker ---------------- */

const worker = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });

worker.onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'progress': {
      const stages = ['dict', 'align', 'model', 'forensics', 'score', 'sweep', 'checks'];
      const i = stages.indexOf(m.stage);
      const overall = (i + (m.pct || 0)) / stages.length;
      $('bar').style.width = `${Math.max(2, overall * 100)}%`;
      $('note').textContent = m.note || m.stage;
      break;
    }
    case 'dict':
      state.dict = m;
      $('note').textContent = `${m.nWords.toLocaleString()} words, ${m.nPhones} phone symbols, `
        + `${(m.bytes / 1e6).toFixed(2)} MB — ${m.train.toLocaleString()} for training, `
        + `${m.heldOut.toLocaleString()} held out`;
      break;
    case 'align':
      renderAlign(m);
      break;
    case 'model':
      break;
    case 'interactive':
      $('say-model').disabled = false;
      renderPrediction(m.preview);
      break;
    case 'prediction':
      if (m.token === state.token) renderPrediction(m.result);
      break;
    case 'forensics':
      renderTrial(m);
      $('badge-trial').textContent = `${m.verdicts.filter((v) => !v.survives).length}/3 impossible`;
      break;
    case 'score':
      renderScore(m);
      break;
    case 'sweep':
      renderSweep(m);
      break;
    case 'checks':
      renderChecks(m.results);
      break;
    case 'done':
      $('loader').classList.add('done');
      $('bar').style.width = '100%';
      $('note').textContent = 'trained, scored and checked — all in this tab, from a 1.4 MB dictionary';
      break;
    case 'error':
      $('note').textContent = `failed: ${m.message}`;
      break;
    default:
      break;
  }
};

/* ---------------- shell ---------------- */

const EXAMPLES = ['ghoti', 'ghost', 'thorough', 'colonel', 'blorvitch', 'knightsbridge', 'psychology', 'women', 'squanch'];
for (const w of EXAMPLES) {
  const c = el('span', 'chip', w);
  c.onclick = () => { $('word').value = w; ask(w); };
  $('examples').appendChild(c);
}

let timer = null;
$('word').addEventListener('input', (e) => {
  clearTimeout(timer);
  const w = e.target.value;
  timer = setTimeout(() => ask(w), 140);
});
$('say-model').onclick = () => {
  if (state.last && state.last.hypotheses[0]) speak(state.last.hypotheses[0].phones);
};
$('say-truth').onclick = () => {
  if (state.last && state.last.truth) speak(state.last.truth);
};

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  for (const t of $('tabs').querySelectorAll('button')) t.setAttribute('aria-selected', String(t === b));
  for (const v of document.querySelectorAll('section.view')) {
    v.hidden = v.id !== `view-${b.dataset.view}`;
  }
  // Canvases sized while hidden have no width, so redraw on reveal.
  if (b.dataset.view === 'system' && state.matrix) drawMatrix($('matrix'), state.matrix);
  if (b.dataset.view === 'score') {
    if (state.sweep) {
      let best = state.sweep[0];
      for (const s of state.sweep) if (s.wordAccuracy > best.wordAccuracy) best = s;
      drawSweep($('sweep'), state.sweep, best.width);
    }
    if (state.align) drawEm($('emcurve'), state.align.emHistory);
  }
});

window.addEventListener('resize', () => {
  if (state.matrix && !$('view-system').hidden) drawMatrix($('matrix'), state.matrix);
});

worker.postMessage({ type: 'start' });
