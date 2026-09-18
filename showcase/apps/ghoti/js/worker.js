// The training pipeline, off the main thread.
//
// Results are posted stage by stage rather than in one lump at the end: the aligner's
// findings are worth looking at while the pronouncer is still counting, and the page is
// answering typed words long before the sweep has finished.

import { decodeDict } from './dict.js';
import { createModel, emIteration, viterbiAlign, LC_MAX, MOVE_PRIOR } from './align.js';
import { makeSplit } from './split.js';
import { createPronouncer, trainPronouncer, pronounce, distribution } from './model.js';
import { evaluateSet } from './evaluate.js';
import { runForensics, verdict } from './forensics.js';
import { runChecks } from './checks.js';

export const CONFIG = {
  emWords: 20000,
  emPasses: 12,
  maxContext: 7,      // built wide enough to show where extra context starts to hurt
  decodeContext: 5,   // the width the sweep picks out as best
  alpha: 1.0,
  scoreWords: 2500,
  sweepWords: 1000,
};

let dict = null;
let model = null;
let pron = null;
let split = null;
let emHistory = [];
let verdicts = null;

const post = (type, payload) => self.postMessage({ type, ...payload });
const progress = (stage, pct, note) => post('progress', { stage, pct, note });

// Marginalise the aligner's parameters into a letter x base-phone picture: what each
// single letter spells, summed over stress and including the silent option.
function correspondenceMatrix() {
  const nBase = dict.baseNames.length;
  const cols = nBase + 1; // +1 for "silent"
  const m = new Float64Array(26 * cols);
  for (let lc = 0; lc < 26; lc++) {
    for (let pc = 0; pc <= dict.nPhones; pc++) {
      const p = model.prob[lc * model.pcMax + pc];
      if (!p) continue;
      const col = pc === 0 ? nBase : dict.baseIds[pc - 1];
      m[lc * cols + col] += p;
    }
  }
  // Order the phone columns by the letter that most often spells them, so the
  // correspondence shows up as a diagonal instead of being scattered by the arbitrary
  // order the phones happened to appear in the file. Purely presentational: no value
  // changes, only which column it is drawn in.
  const order = [];
  for (let c = 0; c < nBase; c++) {
    let bestRow = 0;
    let bestVal = -1;
    let mass = 0;
    for (let r = 0; r < 26; r++) {
      const v = m[r * cols + c];
      mass += v;
      if (v > bestVal) { bestVal = v; bestRow = r; }
    }
    order.push({ c, bestRow, mass });
  }
  order.sort((a, b) => a.bestRow - b.bestRow || b.mass - a.mass);
  order.push({ c: nBase }); // silence stays pinned to the right

  const sorted = new Float64Array(26 * cols);
  for (let r = 0; r < 26; r++) {
    order.forEach((o, k) => { sorted[r * cols + k] = m[r * cols + o.c]; });
  }
  const names = order.slice(0, nBase).map((o) => dict.baseNames[o.c]);
  return { matrix: Array.from(sorted), cols, baseNames: names, rows: 26 };
}

function alignmentOf(word) {
  const idx = dict.words.indexOf(word);
  if (idx < 0) return null;
  const phoneIds = dict.phoneIds(idx);
  const r = viterbiAlign(model, dict.letters(idx), phoneIds);
  if (!r) return null;
  return {
    word,
    chunks: r.chunks.map((c) => ({
      letters: word.slice(c.i, c.i + c.a),
      phones: Array.from(phoneIds.slice(c.j, c.j + c.b)).map((p) => dict.phones[p]),
      i: c.i,
      a: c.a,
    })),
  };
}

function predictionOf(word, upto = CONFIG.decodeContext) {
  const hyps = pronounce(pron, word, { upto, topK: 4 });
  const idx = dict.words.indexOf(word);
  const truth = idx >= 0 ? Array.from(dict.phoneIds(idx)).map((p) => dict.phones[p]) : null;
  return {
    word,
    inDictionary: idx >= 0,
    truth,
    truthAlignment: idx >= 0 ? alignmentOf(word) : null,
    hypotheses: hyps.map((h) => ({
      phones: h.phones.map((p) => dict.phones[p]),
      logProb: h.score,
      trace: h.trace.map((t) => ({
        letters: word.slice(t.i, t.i + t.a),
        phones: t.emitted.map((p) => dict.phones[p]),
        p: t.p,
        i: t.i,
        a: t.a,
      })),
    })),
  };
}

async function run() {
  progress('dict', 0, 'fetching the dictionary');
  const res = await fetch(new URL('../data/dict.bin', import.meta.url));
  if (!res.ok) throw new Error(`could not load data/dict.bin (${res.status})`);
  const buf = await res.arrayBuffer();
  dict = decodeDict(buf);
  split = makeSplit(dict.nWords);
  post('dict', {
    nWords: dict.nWords,
    nPhones: dict.nPhones,
    nBase: dict.baseNames.length,
    bytes: buf.byteLength,
    train: split.train.length,
    heldOut: split.heldOut.length,
    config: CONFIG,
    movePrior: MOVE_PRIOR,
  });

  progress('align', 0, 'learning which letters make which sounds');
  model = createModel(dict.nPhones);
  const emSet = split.train.slice(0, CONFIG.emWords);
  emHistory = [];
  for (let i = 0; i < CONFIG.emPasses; i++) {
    const r = emIteration(model, dict, emSet);
    emHistory.push({ pass: i + 1, logLik: r.logLik, proper: r.proper, skipped: r.skipped });
    progress('align', (i + 1) / CONFIG.emPasses, `EM pass ${i + 1} of ${CONFIG.emPasses}`);
  }
  post('align', {
    emHistory,
    aProb: Array.from(model.aProb),
    ...correspondenceMatrix(),
    samples: ['knight', 'nation', 'tough', 'photograph', 'queue', 'psychology', 'women', 'xylophone']
      .map(alignmentOf)
      .filter(Boolean),
  });

  progress('model', 0, 'counting spelling contexts');
  pron = createPronouncer({ maxContext: CONFIG.maxContext, alpha: CONFIG.alpha });
  const stats = trainPronouncer(pron, model, dict, split.train, (p) => progress('model', p, 'counting spelling contexts'));
  post('model', {
    ...stats,
    nDecisions: pron.nDecisions,
    levels: pron.levels.map((m) => m.size),
  });
  post('interactive', { ready: true, preview: predictionOf('ghoti') });

  progress('forensics', 0, 'putting the joke on trial');
  const all = new Uint32Array(dict.nWords);
  for (let i = 0; i < dict.nWords; i++) all[i] = i;
  const tallies = runForensics(model, dict, all, undefined, (p) => progress('forensics', p, 'putting the joke on trial'));
  verdicts = verdict(tallies);
  post('forensics', {
    verdicts,
    ghoti: predictionOf('ghoti'),
    fish: predictionOf('fish'),
    women: predictionOf('women'),
  });

  progress('score', 0, 'reading words it has never seen');
  const evalSet = split.heldOut.slice(0, CONFIG.scoreWords);
  const score = evaluateSet(dict, evalSet, (w) => {
    const h = pronounce(pron, w, { upto: CONFIG.decodeContext });
    return h.length ? h[0].phones : [];
  }, { collectWorst: 18 });
  post('score', {
    ...score,
    worst: score.worst.map((x) => ({
      word: x.word,
      truth: x.truth.map((p) => dict.phones[p]),
      pred: x.pred.map((p) => dict.phones[p]),
      dist: x.dist,
    })),
  });

  const sweep = [];
  const sweepSet = split.heldOut.slice(0, CONFIG.sweepWords);
  for (let upto = 0; upto <= CONFIG.maxContext; upto++) {
    progress('sweep', upto / CONFIG.maxContext, `context width ${upto}`);
    const r = evaluateSet(dict, sweepSet, (w) => {
      const h = pronounce(pron, w, { upto });
      return h.length ? h[0].phones : [];
    });
    sweep.push({
      width: upto,
      letters: 2 * upto + 1,
      wordAccuracy: r.wordAccuracy,
      wordAccuracyNoStress: r.wordAccuracyNoStress,
      phonemeErrorRate: r.phonemeErrorRate,
      contexts: pron.levels[upto].size,
    });
    post('sweep', { sweep: sweep.slice(), n: sweepSet.length, done: upto === CONFIG.maxContext });
  }

  // The widest levels existed only to find where extra context starts costing accuracy.
  // The decoder runs at CONFIG.decodeContext, so drop the rest and give the memory back.
  pron.levels.length = CONFIG.decodeContext + 1;
  pron.maxContext = CONFIG.decodeContext;

  progress('checks', 0, 'checking the machinery against things it did not compute');
  const results = runChecks({ dict, model, pron, split, emHistory, forensics: verdicts });
  post('checks', { results });
  post('done', {});
}

self.onmessage = (e) => {
  const { type } = e.data;
  if (type === 'start') {
    run().catch((err) => post('error', { message: err && err.message ? err.message : String(err) }));
    return;
  }
  if (!pron) return;
  if (type === 'pronounce') {
    const word = String(e.data.word || '').toLowerCase().replace(/[^a-z]/g, '');
    post('prediction', { result: word ? predictionOf(word, e.data.upto) : null, token: e.data.token });
  }
};
