const PITCH = 34;

export function tableShape(t) {
  if (t.shape === 'round') return { kind: 'circle', r: 22 + t.seats * 3.1 };
  if (t.shape === 'long') return { kind: 'rect', w: Math.ceil(t.seats / 2) * PITCH, h: 46 };
  return { kind: 'rect', w: t.seats * PITCH, h: 36 };
}

// Seat centres in room coordinates, in the same order as tableTopology().
export function seatPositions(t) {
  const shape = tableShape(t);
  const local = [];
  if (t.shape === 'round') {
    const R = shape.r + 17;
    for (let i = 0; i < t.seats; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / t.seats;
      local.push([R * Math.cos(a), R * Math.sin(a)]);
    }
  } else if (t.shape === 'long') {
    const top = Math.ceil(t.seats / 2);
    const x0 = -shape.w / 2 + PITCH / 2;
    for (let i = 0; i < top; i++) local.push([x0 + i * PITCH, -shape.h / 2 - 16]);
    for (let i = top; i < t.seats; i++) local.push([x0 + (i - top) * PITCH, shape.h / 2 + 16]);
  } else {
    const x0 = -shape.w / 2 + PITCH / 2;
    for (let i = 0; i < t.seats; i++) local.push([x0 + i * PITCH, -shape.h / 2 - 16]);
  }
  const r = ((t.rot || 0) * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return local.map(([x, y]) => ({ x: t.x + x * c - y * s, y: t.y + x * s + y * c }));
}

export const initials = (name) => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '')).toUpperCase();
};

export const happyHue = (h) => 4 + 126 * h;
