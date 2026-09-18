// Drawing the font's own structure.
//
// The glyph view exists to make the parse falsifiable: if the on-curve /
// off-curve classification or the implied-midpoint rule were wrong, the outline
// drawn from our points would visibly disagree with the filled shape.

import { outlineToPath, toPath2D, parseGlyph } from './glyf.js';

const INK = '#e2e6ee';
const MUTED = '#7b8798';
const ON_CURVE = '#5fd0a0';
const OFF_CURVE = '#e0913a';
const IMPLIED = '#6ba5f5';

export function fitCanvas(canvas, cssHeight) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 600;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
  canvas.style.height = `${cssHeight}px`;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h: cssHeight };
}

// The table directory as a proportional byte map — the point being that you can
// see at a glance that GPOS is most of the file.
export function drawByteMap(host, font, droppedTags = new Set()) {
  host.replaceChildren();
  const total = font.byteLength;
  const rows = font.order
    .map((tag) => ({ tag, ...font.tables.get(tag) }))
    .sort((a, b) => b.length - a.length);

  for (const t of rows) {
    const pct = (t.length / total) * 100;
    const row = document.createElement('div');
    row.className = `byte-row${droppedTags.has(t.tag) ? ' dropped' : ''}`;
    row.innerHTML = `
      <span class="byte-tag">${t.tag.replace(/ /g, ' ')}</span>
      <span class="byte-bar"><i style="width:${Math.max(0.4, pct)}%"></i></span>
      <span class="byte-size">${fmtBytes(t.length)}</span>
      <span class="byte-pct">${pct.toFixed(1)}%</span>`;
    row.title = `${t.tag} — offset ${t.offset}, ${t.length} bytes, checksum 0x${t.checksum.toString(16).padStart(8, '0')}`;
    host.append(row);
  }
}

export const fmtBytes = (n) =>
  (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB`
    : n >= 1024 ? `${(n / 1024).toFixed(1)} KB`
      : `${n} B`);

// One glyph, large, with its construction exposed.
export function drawGlyph(canvas, font, gid, opts = {}) {
  const { showPoints = true, showMetrics = true, height = 380 } = opts;
  const { g, w, h } = fitCanvas(canvas, height);
  g.fillStyle = '#0e1319';
  g.fillRect(0, 0, w, h);
  if (gid === undefined || gid === null) return;

  let glyph = null;
  try { glyph = parseGlyph(font, gid); } catch { return; }
  if (!glyph) return;

  const upm = font.head.unitsPerEm;
  const asc = font.hhea.ascender;
  const desc = font.hhea.descender;
  const span = asc - desc;
  const scale = (h * 0.88) / span;
  const originY = h * 0.5 + (span / 2 + desc) * scale;
  const advance = font.hmtx.advances[gid] ?? 0;
  const originX = w / 2 - (advance * scale) / 2;

  // Em box, baseline, ascender/descender, and the two sidebearings.
  if (showMetrics) {
    g.strokeStyle = '#232c38';
    g.lineWidth = 1;
    g.setLineDash([]);
    const line = (y, label) => {
      g.beginPath();
      g.moveTo(0, originY - y * scale);
      g.lineTo(w, originY - y * scale);
      g.stroke();
      g.fillStyle = MUTED;
      g.font = '10px ui-monospace, monospace';
      g.fillText(label, 6, originY - y * scale - 4);
    };
    line(0, 'baseline');
    line(asc, `ascender ${asc}`);
    line(desc, `descender ${desc}`);
    line(upm, `em ${upm}`);

    g.strokeStyle = '#2f3a49';
    g.setLineDash([3, 3]);
    for (const [x, label] of [[0, 'origin'], [advance, `advance ${advance}`]]) {
      g.beginPath();
      g.moveTo(originX + x * scale, 0);
      g.lineTo(originX + x * scale, h);
      g.stroke();
      g.fillStyle = MUTED;
      g.fillText(label, originX + x * scale + 4, 14);
    }
    g.setLineDash([]);
  }

  if (glyph.empty) {
    g.fillStyle = MUTED;
    g.font = '13px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('this glyph has no outline (it is blank, like a space)', w / 2, h / 2);
    g.textAlign = 'left';
    return;
  }

  const cmds = outlineToPath(glyph.contours);
  const path = toPath2D(cmds, scale, originX, originY);

  g.fillStyle = 'rgba(226,230,238,0.90)';
  g.fill(path, 'nonzero');
  g.strokeStyle = 'rgba(107,165,245,0.55)';
  g.lineWidth = 1;
  g.stroke(path);

  if (!showPoints) return;

  // Control polygon, then the points themselves. An implied on-curve point is
  // drawn hollow because the file never stored it.
  const X = (x) => originX + x * scale;
  const Y = (y) => originY - y * scale;

  g.strokeStyle = 'rgba(224,145,58,0.45)';
  g.setLineDash([2, 2]);
  for (const c of cmds) {
    if (c.type !== 'Q') continue;
    g.beginPath();
    g.moveTo(X(c.cx), Y(c.cy));
    g.lineTo(X(c.x), Y(c.y));
    g.stroke();
  }
  g.setLineDash([]);

  const dot = (x, y, color, r, hollow) => {
    g.beginPath();
    g.arc(X(x), Y(y), r, 0, Math.PI * 2);
    if (hollow) { g.strokeStyle = color; g.lineWidth = 1.5; g.stroke(); }
    else { g.fillStyle = color; g.fill(); }
  };

  // Stored points.
  const stored = new Set();
  for (const pts of glyph.contours) {
    for (const p of pts) {
      stored.add(`${Math.round(p.x)},${Math.round(p.y)}`);
      dot(p.x, p.y, p.on ? ON_CURVE : OFF_CURVE, p.on ? 3.2 : 2.6, !p.on);
    }
  }
  // Implied midpoints: an endpoint of a curve that was never a stored point.
  for (const c of cmds) {
    if (c.type !== 'Q') continue;
    if (!stored.has(`${Math.round(c.x)},${Math.round(c.y)}`)) {
      dot(c.x, c.y, IMPLIED, 2.8, true);
    }
  }
}

// The glyph palette: every retained glyph, small, drawn from our own parse.
export function drawPalette(host, font, gids, selectedGid, onSelect) {
  host.replaceChildren();
  const upm = font.head.unitsPerEm;

  for (const gid of gids) {
    const cell = document.createElement('button');
    cell.className = `glyph-cell${gid === selectedGid ? ' selected' : ''}`;
    cell.type = 'button';
    const cv = document.createElement('canvas');
    const S = 54;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = S * dpr;
    cv.height = S * dpr;
    cv.style.width = `${S}px`;
    cv.style.height = `${S}px`;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    let glyph = null;
    try { glyph = parseGlyph(font, gid); } catch { /* drawn blank */ }
    if (glyph && !glyph.empty) {
      const scale = (S * 0.62) / upm;
      const advance = font.hmtx.advances[gid] ?? upm;
      g.fillStyle = INK;
      g.fill(toPath2D(outlineToPath(glyph.contours), scale,
        S / 2 - (advance * scale) / 2, S * 0.76));
    } else {
      g.strokeStyle = '#2f3a49';
      g.setLineDash([3, 2]);
      g.strokeRect(S * 0.25, S * 0.25, S * 0.5, S * 0.5);
    }
    cell.append(cv);
    const label = document.createElement('span');
    label.textContent = String(gid);
    cell.append(label);
    cell.title = `glyph id ${gid}`;
    cell.addEventListener('click', () => onSelect(gid));
    host.append(cell);
  }
}
