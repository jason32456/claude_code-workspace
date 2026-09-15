// Decoder for data/dict.bin — the front-coded CMU Pronouncing Dictionary.
// See tools/build-dict.py for the writer; the layout is documented there.

export const A = 'a'.charCodeAt(0);

export function decodeDict(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'GHOT') {
    throw new Error('dict.bin: bad magic');
  }
  const version = view.getUint16(4, true);
  if (version !== 1) throw new Error(`dict.bin: unsupported version ${version}`);
  const nPhones = view.getUint16(6, true);
  const nWords = view.getUint32(8, true);

  let p = 12;
  const phones = new Array(nPhones);
  for (let i = 0; i < nPhones; i++) {
    const len = bytes[p++];
    let s = '';
    for (let k = 0; k < len; k++) s += String.fromCharCode(bytes[p + k]);
    p += len;
    phones[i] = s;
  }

  const words = new Array(nWords);
  // Letters are stored as 0..25 and phone ids as-is, both in one flat array with
  // an offset table, so the hot loops never touch a string or allocate.
  const letterOff = new Uint32Array(nWords + 1);
  const phoneOff = new Uint32Array(nWords + 1);
  const letterBuf = new Uint8Array(nWords * 12);
  const phoneBuf = new Uint8Array(nWords * 12);
  let lp = 0;
  let pp = 0;
  let prev = '';

  for (let i = 0; i < nWords; i++) {
    const shared = bytes[p++];
    const suffixLen = bytes[p++];
    let suffix = '';
    for (let k = 0; k < suffixLen; k++) suffix += String.fromCharCode(bytes[p + k]);
    p += suffixLen;
    const word = prev.slice(0, shared) + suffix;
    prev = word;
    words[i] = word;

    letterOff[i] = lp;
    for (let k = 0; k < word.length; k++) letterBuf[lp++] = word.charCodeAt(k) - A;

    const n = bytes[p++];
    phoneOff[i] = pp;
    for (let k = 0; k < n; k++) phoneBuf[pp++] = bytes[p + k];
    p += n;
  }
  letterOff[nWords] = lp;
  phoneOff[nWords] = pp;

  // Strip stress digits once: the aligner works over phone identity, and stress
  // is carried separately so the synthesiser can still use it.
  const base = phones.map((s) => s.replace(/\d+$/, ''));
  const stress = phones.map((s) => {
    const m = s.match(/(\d+)$/);
    return m ? Number(m[1]) : -1;
  });
  const baseIds = [];
  const baseIndex = new Map();
  for (const b of base) {
    if (!baseIndex.has(b)) baseIndex.set(b, baseIndex.size);
    baseIds.push(baseIndex.get(b));
  }

  return {
    words,
    phones,
    nPhones,
    nWords,
    letterOff,
    phoneOff,
    letterBuf,
    phoneBuf,
    base,
    stress,
    baseIds,
    baseNames: [...baseIndex.keys()],
    phoneStr(i) {
      const s = this.phoneOff[i];
      const e = this.phoneOff[i + 1];
      const out = [];
      for (let k = s; k < e; k++) out.push(this.phones[this.phoneBuf[k]]);
      return out;
    },
    phoneIds(i) {
      return this.phoneBuf.subarray(this.phoneOff[i], this.phoneOff[i + 1]);
    },
    letters(i) {
      return this.letterBuf.subarray(this.letterOff[i], this.letterOff[i + 1]);
    },
  };
}
