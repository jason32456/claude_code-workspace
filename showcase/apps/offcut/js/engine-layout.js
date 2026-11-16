const SCREEN = 16 / 9;

function pack(items, rowWidth, gap) {
  const offsets = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;
  for (const it of items) {
    if (x > 0 && x + it.w > rowWidth) {
      y += rowH + gap;
      x = 0;
      rowH = 0;
    }
    offsets.push([x, y]);
    x += it.w + gap;
    rowH = Math.max(rowH, it.h);
    width = Math.max(width, x - gap);
  }
  return { offsets, width, height: y + rowH };
}

// Next-fit shelves in the given order, with the row width tuned so the sheet is
// roughly screen-shaped and compact.
export function shelfLayout(items, gap) {
  let total = 0;
  let widest = 0;
  for (const it of items) {
    total += (it.w + gap) * (it.h + gap);
    widest = Math.max(widest, it.w);
  }
  const base = Math.sqrt(total * SCREEN);
  let best = null;
  for (let f = 0.5; f <= 2.01; f += 0.05) {
    const layout = pack(items, Math.max(widest, base * f), gap);
    const aspect = layout.width / layout.height;
    const score = Math.abs(Math.log(aspect / SCREEN)) + 0.6 * Math.log((layout.width * layout.height) / total);
    if (!best || score < best.score - 1e-12) best = { score, layout };
  }
  return best.layout;
}
