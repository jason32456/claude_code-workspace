const PAGE_WIDTH_MM = 180;
const PAGE_HEIGHT_MM = 125;
const GAP_MM = 14;

const fmt = (v) => (Math.round(v * 100) / 100).toString();
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function apply(m, [x, y]) {
  return [m[0] * x - m[1] * y + m[2], m[1] * x + m[0] * y + m[3]];
}

function boundsOf(shape) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of shape) {
    for (const [x, y] of r.outer) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

function centroid(points) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    const k = x0 * y1 - x1 * y0;
    a += k;
    cx += (x0 + x1) * k;
    cy += (y0 + y1) * k;
  }
  return Math.abs(a) < 1e-12 ? points[0] : [cx / (3 * a), cy / (3 * a)];
}

function outlinePath(shape, place) {
  return shape
    .flatMap((r) => [r.outer, ...r.holes])
    .map((ring) => `M${ring.map((p) => place(p).map(fmt).join(' ')).join('L')}Z`)
    .join('');
}

function pageGroup(id, title, shape, pieces, poseOf, scale, offset, withCuts) {
  const [minX, minY] = boundsOf(shape);
  const place = ([x, y]) => [(x - minX) * scale + offset[0], (y - minY) * scale + offset[1]];
  const cuts = pieces
    .map((piece) => {
      const ring = piece.ring.map((p) => place(apply(poseOf(piece), p)));
      return `<polygon points="${ring.map((p) => p.map(fmt).join(',')).join(' ')}"/>`;
    })
    .join('');
  const numbers = pieces
    .map((piece) => {
      const ring = piece.ring.map((p) => apply(poseOf(piece), p));
      const [cx, cy] = place(centroid(ring));
      const size = Math.min(5, Math.max(1.3, Math.sqrt(piece.area) * scale * 0.5));
      return `<text x="${fmt(cx)}" y="${fmt(cy)}" font-size="${fmt(size)}">${piece.id + 1}</text>`;
    })
    .join('');
  return `<g id="${id}">
<text class="title" x="${fmt(offset[0])}" y="${fmt(offset[1] - 5)}">${esc(title)}</text>
<g class="cuts" fill="none" stroke="${withCuts ? '#000' : '#999'}" stroke-width="${withCuts ? 0.25 : 0.12}" stroke-linejoin="round">${cuts}</g>
<path class="outline" d="${outlinePath(shape, place)}" fill="none" stroke="#000" stroke-width="0.5" fill-rule="evenodd"/>
<g class="numbers" text-anchor="middle" dominant-baseline="central" fill="#000" font-family="system-ui, sans-serif">${numbers}</g>
</g>`;
}

export function buildPuzzleSvg(result) {
  const [ax0, ay0, ax1, ay1] = boundsOf(result.a.shape);
  const [bx0, by0, bx1, by1] = boundsOf(result.b.shape);
  const aw = ax1 - ax0;
  const ah = ay1 - ay0;
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const scale = Math.min(PAGE_WIDTH_MM / Math.max(aw, bw), (PAGE_HEIGHT_MM * 2 - GAP_MM) / (ah + bh));
  const margin = 10;
  const titleRoom = 8;
  const width = Math.max(aw, bw) * scale + 2 * margin;
  const pageB = bh * scale + titleRoom + margin;
  const pageA = ah * scale + titleRoom + margin;
  const height = pageB + GAP_MM + pageA + margin;
  const b = pageGroup('puzzle', 'Puzzle: cut along every line, then number each piece', result.b.shape, result.pieces, (p) => p.b[0], scale, [margin, margin + titleRoom], true);
  const a = pageGroup('solution', 'Solution: the same pieces rebuilt as the first shape', result.a.shape, result.pieces, (p) => p.a[0], scale, [margin, pageB + GAP_MM + titleRoom], false);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}">
<title>Offcut puzzle</title>
<style>.title{font:3px system-ui,sans-serif;fill:#000}</style>
<rect width="100%" height="100%" fill="#fff"/>
${b}
${a}
</svg>`;
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadPuzzle(result) {
  download(new Blob([buildPuzzleSvg(result)], { type: 'image/svg+xml' }), 'offcut-puzzle.svg');
}

export function downloadFrame(canvas, background) {
  const flat = document.createElement('canvas');
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  flat.toBlob((blob) => blob && download(blob, 'offcut-frame.png'), 'image/png');
}
