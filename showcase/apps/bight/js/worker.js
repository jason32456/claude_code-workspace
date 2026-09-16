// The ensemble experiments run here so the page stays live. Each tangle is a
// fresh Monte Carlo sampler run plus a 2^n state sum, which is seconds of work,
// and there are dozens of them.

import { knottingEnsemble, closureDisagreement, jonesVersusAlexander } from './experiments.js';

self.onmessage = (ev) => {
  const { kind, opts, id } = ev.data;
  const onProgress = (f) => self.postMessage({ id, kind, progress: f });
  try {
    let result;
    if (kind === 'knotting') result = knottingEnsemble({ ...opts, onProgress });
    else if (kind === 'closure') result = closureDisagreement({ ...opts, onProgress });
    else if (kind === 'jvsa') result = jonesVersusAlexander({ ...opts, onProgress });
    else throw new Error(`unknown experiment ${kind}`);
    // BigInt does not survive structured cloning, so anything that came out of
    // the exact arithmetic is stringified before it crosses the boundary.
    self.postMessage({ id, kind, done: true, result: JSON.parse(JSON.stringify(result, bigintSafe)) });
  } catch (e) {
    self.postMessage({ id, kind, error: e.message + '\n' + (e.stack ?? '') });
  }
};

function bigintSafe(key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}
