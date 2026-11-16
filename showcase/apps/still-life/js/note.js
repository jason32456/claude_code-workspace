import { textMask } from './shape.js';
import { clampNote } from './note-link.js';

// A message that exists only while it moves. Every line travels a closed loop
// at one cell per tick and never rests, because a line that pauses vanishes.
const LOOP_SIDE = 6;
const MARGIN = 8;
const HEIGHTS = [30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10];

function wrapLines(words, height, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || textMask(candidate, { height }).w <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function layout(message, cols, rows) {
  const words = message.split(' ').filter(Boolean);
  if (!words.length) return [];
  const maxWidth = cols - LOOP_SIDE - MARGIN * 2;
  const maxHeight = rows - LOOP_SIDE - MARGIN * 2;
  let fallback = null;
  for (const height of HEIGHTS) {
    const lines = wrapLines(words, height, maxWidth).map((text) => textMask(text, { height }));
    const gap = Math.round(height * 0.45);
    const total = lines.reduce((sum, mask) => sum + mask.h, 0) + gap * (lines.length - 1);
    const plan = { lines, gap, total, maxWidth };
    const heightFits = total <= maxHeight;
    if (heightFits && lines.every((mask) => mask.w <= maxWidth)) return plan;
    // A word wider than the grid scrolls as a marquee, but only when no
    // smaller size lets every line stand still on the grid.
    if (heightFits && !fallback && height >= 14) fallback = plan;
    if (height === HEIGHTS[HEIGHTS.length - 1]) return fallback || plan;
  }
  return fallback;
}

function loopOffset(t, side) {
  const perimeter = side * 4;
  const s = ((t % perimeter) + perimeter) % perimeter;
  if (s < side) return [s, 0];
  if (s < side * 2) return [side, s - side];
  if (s < side * 3) return [side * 3 - s, side];
  return [0, side * 4 - s];
}

export function createNote({ cols, rows, text }) {
  const message = clampNote(text || '').toLocaleUpperCase();
  const plan = layout(message, cols, rows);
  const items = [];
  const motion = [];

  if (plan && plan.lines.length) {
    let y = Math.round((rows - plan.total) / 2) - LOOP_SIDE / 2;
    plan.lines.forEach((mask, k) => {
      const marquee = mask.w > plan.maxWidth;
      items.push({ id: `note-line-${k}`, mask, x: 0, y: Math.round(y), u: 0, v: 0, simmer: 0 });
      motion.push({
        marquee,
        baseX: Math.round((cols - mask.w) / 2 - LOOP_SIDE / 2),
        baseY: Math.round(y),
        phase: k * 5,
        reverse: k % 2 === 1,
      });
      y += mask.h + plan.gap;
    });
  }

  const sceneState = { items };
  let tick = 0;

  function place() {
    items.forEach((item, k) => {
      const m = motion[k];
      if (m.marquee) {
        const span = item.mask.w + cols;
        item.x = cols - (((tick + m.phase * 9) % span) + span) % span;
        item.y = m.baseY;
        return;
      }
      const [dx, dy] = loopOffset(m.reverse ? -tick - m.phase : tick + m.phase, LOOP_SIDE);
      item.x = m.baseX + dx;
      item.y = m.baseY + dy;
    });
  }
  place();

  return {
    step() {
      tick++;
      place();
    },
    scene: () => sceneState,
    info: () => ({ state: 'note', level: 0, levelCount: 0, title: '', deaths: 0 }),
    unlockAudio() {},
    setMuted() {},
  };
}
