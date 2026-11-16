const MAX_POINTS = 6000;

const b36 = (n) => n.toString(36);

function encodeRing(ring) {
  let px = 0;
  let py = 0;
  const out = [];
  for (const [x, y] of ring) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    out.push(b36(rx - px), b36(ry - py));
    px = rx;
    py = ry;
  }
  return out.join('.');
}

function decodeRing(text) {
  const nums = text.split('.').map((s) => parseInt(s, 36));
  if (nums.length < 6 || nums.length % 2 || nums.some((n) => !Number.isFinite(n))) return null;
  const ring = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < nums.length; i += 2) {
    x += nums[i];
    y += nums[i + 1];
    ring.push([x, y]);
  }
  return ring;
}

export function encodeShape(shape) {
  return shape.map((r) => [r.outer, ...r.holes].map(encodeRing).join('_')).join('~');
}

export function decodeShape(text) {
  if (!text || text.length > 120000) return null;
  const shape = [];
  let points = 0;
  for (const regionText of text.split('~')) {
    const rings = regionText.split('_').map(decodeRing);
    if (rings.some((r) => !r)) return null;
    points += rings.reduce((n, r) => n + r.length, 0);
    if (points > MAX_POINTS) return null;
    shape.push({ outer: rings[0], holes: rings.slice(1) });
  }
  return shape.length ? shape : null;
}

export function encodeSide(side) {
  if (side.mode === 'word') return `w:${encodeURIComponent(side.text)}`;
  if (side.mode === 'shape') return `p:${side.preset}`;
  return side.drawn ? `d:${encodeShape(side.drawn)}` : 'd:';
}

export function decodeSide(text) {
  if (!text || text.length < 2) return null;
  const kind = text.slice(0, 2);
  const body = text.slice(2);
  if (kind === 'w:') {
    try {
      return { mode: 'word', text: decodeURIComponent(body).slice(0, 14) };
    } catch {
      return null;
    }
  }
  if (kind === 'p:') return { mode: 'shape', preset: body };
  if (kind === 'd:') return { mode: 'draw', drawn: decodeShape(body) };
  return null;
}

export function encodeState(a, b, detail) {
  const params = new URLSearchParams();
  params.set('a', encodeSide(a));
  params.set('b', encodeSide(b));
  params.set('detail', String(detail));
  return params.toString();
}

export function decodeState(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const a = decodeSide(params.get('a'));
  const b = decodeSide(params.get('b'));
  if (!a || !b) return null;
  const detail = Number(params.get('detail'));
  return { a, b, detail: Number.isFinite(detail) ? Math.min(100, Math.max(0, detail)) : null };
}
