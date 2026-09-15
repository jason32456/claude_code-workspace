// Scoring against held-out truth.
//
// Word accuracy is the fraction of unseen words whose entire pronunciation comes back
// exactly right. Phoneme error rate is Levenshtein distance over phone sequences
// divided by the total length of the truth. Both are computed only on words excluded
// from every training pass.

export function levenshtein(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[m];
}

// `predictFn(word)` returns an array of phone ids.
export function evaluateSet(dict, indices, predictFn, { collectWorst = 0 } = {}) {
  let exact = 0;
  let exactNoStress = 0;
  let editTotal = 0;
  let phoneTotal = 0;
  let n = 0;
  const worst = [];

  for (let t = 0; t < indices.length; t++) {
    const w = indices[t];
    const word = dict.words[w];
    const truth = Array.from(dict.phoneIds(w));
    const pred = predictFn(word);
    n++;

    const same = pred.length === truth.length && pred.every((p, k) => p === truth[k]);
    if (same) exact++;

    const tb = truth.map((p) => dict.baseIds[p]);
    const pb = pred.map((p) => dict.baseIds[p]);
    if (pb.length === tb.length && pb.every((p, k) => p === tb[k])) exactNoStress++;

    const d = levenshtein(pred, truth);
    editTotal += d;
    phoneTotal += truth.length;

    if (collectWorst && d > 0) {
      worst.push({ word, truth, pred, dist: d, rel: d / truth.length });
      if (worst.length > collectWorst * 6) {
        worst.sort((x, y) => y.rel - x.rel || y.dist - x.dist);
        worst.length = collectWorst * 2;
      }
    }
  }

  worst.sort((x, y) => y.rel - x.rel || y.dist - x.dist);
  return {
    n,
    wordAccuracy: exact / n,
    wordAccuracyNoStress: exactNoStress / n,
    phonemeErrorRate: editTotal / phoneTotal,
    worst: worst.slice(0, collectWorst),
  };
}
