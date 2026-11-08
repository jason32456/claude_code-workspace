// Group ⇄ URL-safe string. 'z' prefix = deflate-raw, 'j' = plain JSON, so a
// browser without CompressionStream can still open links that it made itself.

const b64u = {
  enc(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

async function pipe(bytes, Stream) {
  const rs = new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'));
  return new Uint8Array(await new Response(rs).arrayBuffer());
}

// Compact form: short keys, members referenced by index.
export function pack(g) {
  const idx = Object.fromEntries(g.members.map((m, i) => [m.id, i]));
  const mapObj = (o) => Object.entries(o || {}).map(([id, v]) => [idx[id], v]);
  return {
    v: 1,
    n: g.name,
    b: g.base,
    m: g.members.map((m) => [m.name, m.color]),
    e: g.expenses.map((x) => {
      const s = x.split;
      const sp = { o: s.mode };
      if (s.ids) sp.i = s.ids.map((id) => idx[id]);
      if (s.weights) sp.w = mapObj(s.weights);
      if (s.amounts) sp.a = mapObj(s.amounts);
      if (s.items) sp.l = s.items.map((it) => [it.name, it.price, it.ids.map((id) => idx[id])]);
      if (s.tax) sp.t = s.tax;
      if (s.tip) sp.p = s.tip;
      const o = { t: x.title, d: x.date, a: x.amount, p: x.payers.map((p) => [idx[p.id], p.amount ?? 0]), s: sp };
      if (x.kind === 'transfer') o.k = 1;
      if (x.category && x.category !== 'other') o.c = x.category;
      if (x.currency && x.currency !== g.base) { o.u = x.currency; o.r = x.rate; }
      return o;
    }),
  };
}

export function unpack(o, makeId = (i) => 'm' + i) {
  if (!o || o.v !== 1 || !Array.isArray(o.m) || !Array.isArray(o.e)) throw new Error('Not an Evens group');
  const ids = o.m.map((_, i) => makeId(i));
  const unObj = (arr) => Object.fromEntries((arr || []).map(([i, v]) => [ids[i], v]));
  return {
    name: String(o.n || 'Shared group'),
    base: o.b || 'EUR',
    members: o.m.map(([name, color], i) => ({ id: ids[i], name: String(name), color })),
    expenses: o.e.map((x, k) => {
      const s = x.s;
      const split = { mode: s.o };
      if (s.i) split.ids = s.i.map((i) => ids[i]);
      if (s.w) split.weights = unObj(s.w);
      if (s.a) split.amounts = unObj(s.a);
      if (s.l) split.items = s.l.map(([name, price, is]) => ({ name, price, ids: is.map((i) => ids[i]) }));
      if (s.t) split.tax = s.t;
      if (s.p) split.tip = s.p;
      return {
        id: 'x' + k,
        kind: x.k ? 'transfer' : 'expense',
        title: String(x.t ?? ''),
        date: x.d,
        amount: x.a,
        currency: x.u || o.b || 'EUR',
        rate: x.u ? x.r : 1,
        category: x.c || 'other',
        payers: x.p.map(([i, amount]) => ({ id: ids[i], amount })),
        split,
      };
    }),
  };
}

export async function encode(group) {
  const bytes = new TextEncoder().encode(JSON.stringify(pack(group)));
  if (typeof CompressionStream === 'function') {
    try { return 'z' + b64u.enc(await pipe(bytes, CompressionStream)); } catch { /* fall through */ }
  }
  return 'j' + b64u.enc(bytes);
}

export async function decode(str, makeId) {
  const kind = str[0];
  let bytes = b64u.dec(str.slice(1));
  if (kind === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser can’t open compressed links');
    bytes = await pipe(bytes, DecompressionStream);
  } else if (kind !== 'j') throw new Error('Unrecognised link');
  return unpack(JSON.parse(new TextDecoder().decode(bytes)), makeId);
}
