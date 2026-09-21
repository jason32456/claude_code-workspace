// Draws a broken paragraph.
//
// Nothing here asks the browser to lay out text. Every glyph run is placed at
// the scaled-point offset the engine computed, converted to pixels, because
// the point of the page is to show what the algorithm decided rather than what
// the browser would have done with the same words.

import { lineStart } from './linebreak.js';

export const SP_PER_PT = 65536;

/** Positions of every box and gap on every line, in scaled points. */
export function layout(items, scored) {
  const out = [];
  let prev = -1;
  scored.lines.forEach((line, index) => {
    const start = lineStart(items, prev);
    const end = line.position;
    // Glue on the last line does not stretch: \parfillskip absorbs the slack,
    // so the line sits at its natural width and stops.
    const loose = line.fil > 0;
    const ratio = loose ? 0 : Math.max(line.ratio, -1);
    const boxes = [];
    const gaps = [];
    let x = 0;
    for (let i = start; i < end; i++) {
      const it = items[i];
      if (it.type === 'box') {
        boxes.push({ x, width: it.width, text: it.glyphs ?? it.text, word: it.word });
        x += it.width;
      } else if (it.type === 'glue') {
        const give = ratio >= 0 ? it.stretch : it.shrink;
        const w = it.width + ratio * give;
        gaps.push({ x, width: w, natural: it.width, stretch: it.stretch, shrink: it.shrink, ratio });
        x += w;
      }
    }
    const tail = items[end];
    if (tail && tail.type === 'penalty' && tail.flagged && tail.width > 0) {
      boxes.push({ x, width: tail.width, text: '-', hyphen: true });
      x += tail.width;
    }
    out.push({ index, boxes, gaps, width: x, ...line });
    prev = end;
  });
  return out;
}

/**
 * Render into a container.
 *
 * @param {HTMLElement} el
 * @param {object[]} lines from layout()
 * @param {{measure:number, pxPerPt:number, springs?:boolean, rivers?:boolean, marks?:Set<number>}} opts
 */
export function draw(el, lines, opts) {
  const { measure, pxPerPt, springs = false, marks = null } = opts;
  const toPx = (sp) => (sp / SP_PER_PT) * pxPerPt;
  // cmr10 is a ten point font, so a point of it is pxPerPt pixels and the type
  // itself is ten of them. Leading is set here rather than in CSS so the small
  // side-by-side panels stay in proportion.
  const fontPx = pxPerPt * 10;
  const lineHeight = fontPx * 1.55;

  el.style.fontSize = `${fontPx}px`;
  el.style.width = `${toPx(measure)}px`;
  el.style.height = `${lines.length * lineHeight}px`;
  el.replaceChildren();

  lines.forEach((line) => {
    const row = document.createElement('div');
    row.className = 'ln';
    row.style.top = `${line.index * lineHeight}px`;
    row.style.height = `${lineHeight}px`;
    row.dataset.badness = String(Math.min(line.badness, 10000));
    row.dataset.fitness = String(line.fitness);

    if (springs) {
      for (const g of line.gaps) {
        const s = document.createElement('i');
        // Warm where the line has been pulled apart, cool where squeezed:
        // the amount of colour is the adjustment ratio, so a badness of 88 is
        // visible before the number is read.
        const t = Math.max(-1, Math.min(1, g.ratio));
        s.className = 'gap';
        s.style.left = `${toPx(g.x)}px`;
        s.style.width = `${Math.max(toPx(g.width), 1)}px`;
        s.style.setProperty('--t', t.toFixed(3));
        s.style.opacity = String(Math.min(0.85, 0.12 + Math.abs(t) * 0.8));
        row.appendChild(s);
      }
    }

    for (const b of line.boxes) {
      const w = document.createElement('span');
      w.className = b.hyphen ? 'w hy' : 'w';
      if (marks && b.word !== undefined && marks.has(b.word)) w.classList.add('moved');
      w.style.left = `${toPx(b.x)}px`;
      w.textContent = b.text;
      row.appendChild(w);
    }
    el.appendChild(row);
  });
}

/** The per-line gutter: badness, fitness and whether the line was hyphenated. */
export function drawGutter(el, lines, lineHeight = 29.45) {
  el.replaceChildren();
  el.style.setProperty('--leading', `${lineHeight}px`);
  const names = ['very loose', 'loose', 'decent', 'tight'];
  lines.forEach((line) => {
    const row = document.createElement('div');
    row.className = 'gl';
    const b = Math.min(line.badness, 10000);
    row.innerHTML = `<b>${b}</b><i>${names[line.fitness]}</i>`;
    row.dataset.fitness = String(line.fitness);
    row.title = `badness ${b} · ${names[line.fitness]} · ${line.demerits.toLocaleString()} demerits`;
    el.appendChild(row);
  });
}
