export const DIRS4 = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

export function idx(x, y, width) {
  return y * width + x;
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function choice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// entries: [{ value, weight }]
export function weightedChoice(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    if (r < e.weight) return e.value;
    r -= e.weight;
  }
  return entries[entries.length - 1].value;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function dist2(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return dx * dx + dy * dy;
}

export function adjacent(a, b) {
  return dist2(a.x, a.y, b.x, b.y) <= 1;
}
