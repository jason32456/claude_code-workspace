// Menu + kitchen ⇄ URL-safe string. 'z' prefix = deflate-raw, 'j' = plain JSON,
// so a browser without CompressionStream can still open links it made itself.

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

const EQ = ['none', 'burner', 'oven'];

// Compact positional form. Steps reference predecessors by global index.
export function pack(m) {
  const index = new Map();
  m.dishes.forEach((d) => d.steps.forEach((s) => index.set(s.id, index.size)));
  return {
    v: 1, n: m.name, s: m.serve,
    k: [m.kitchen.cooks, m.kitchen.burners, m.kitchen.ovens.map((o) => [o.name, o.slots])],
    d: m.dishes.map((d) => [d.name, d.color, d.offset || 0, d.steps.map((s) => {
      const row = [s.label, s.dur, s.hands, EQ.indexOf(s.equip), s.temp || 0, s.slots || 1, s.hold || 0];
      if (Array.isArray(s.after)) row.push(s.after.map((id) => index.get(id)).filter((x) => x != null));
      return row;
    })]),
  };
}

export function unpack(o) {
  if (!o || o.v !== 1 || !Array.isArray(o.d) || !Array.isArray(o.k)) throw new Error('Not a Heard menu');
  const ids = [];
  let n = 0;
  o.d.forEach((d) => d[3].forEach(() => ids.push('s' + n++)));
  let g = 0;
  return {
    name: String(o.n || 'Shared menu'),
    serve: /^\d\d:\d\d$/.test(o.s) ? o.s : '19:00',
    kitchen: { cooks: +o.k[0] || 1, burners: +o.k[1] || 0, ovens: (o.k[2] || []).map(([name, slots]) => ({ name: String(name), slots: +slots || 1 })) },
    dishes: o.d.map(([name, color, offset, steps], di) => ({
      id: 'd' + di, name: String(name), color: +color || 0, offset: +offset || 0,
      steps: steps.map((r) => {
        const s = { id: ids[g++], label: String(r[0]), dur: +r[1], hands: +r[2], equip: EQ[r[3]] || 'none', temp: +r[4] || 0, slots: +r[5] || 1, hold: +r[6] || 0 };
        if (Array.isArray(r[7])) s.after = r[7].map((i) => ids[i]).filter(Boolean);
        return s;
      }),
    })),
  };
}

export async function encode(menu) {
  const bytes = new TextEncoder().encode(JSON.stringify(pack(menu)));
  if (typeof CompressionStream === 'function') {
    try { return 'z' + b64u.enc(await pipe(bytes, CompressionStream)); } catch { /* fall through */ }
  }
  return 'j' + b64u.enc(bytes);
}

export async function decode(str) {
  const kind = str[0];
  let bytes = b64u.dec(str.slice(1));
  if (kind === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser can\u2019t open compressed links');
    bytes = await pipe(bytes, DecompressionStream);
  } else if (kind !== 'j') throw new Error('Unrecognised link');
  return unpack(JSON.parse(new TextDecoder().decode(bytes)));
}
