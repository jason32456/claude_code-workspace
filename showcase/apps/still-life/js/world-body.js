import { FREE, GLASS } from './world-nav.js';

// A body keeps an integer origin (what the Eye is given) plus a sub-cell
// remainder (what only the simulation knows). Drift is added to the integer
// part, so a body carried by a current moves by exactly the current's integer
// step every tick, whatever its remainder is.
export function makeBody(x, y) {
  return { ox: Math.round(x), oy: Math.round(y), fx: 0, fy: 0 };
}

export const bodyX = (b) => b.ox + b.fx;
export const bodyY = (b) => b.oy + b.fy;

function settle(b) {
  const nx = Math.round(b.fx);
  const ny = Math.round(b.fy);
  b.ox += nx;
  b.fx -= nx;
  b.oy += ny;
  b.fy -= ny;
}

function allowed(delta, free) {
  let step = delta;
  for (let i = 0; i < 4; i++) {
    if (free(step)) return step;
    step /= 2;
  }
  return 0;
}

// Moves by a fractional amount, sliding along walls. Reports the glass tile it
// was pushing into, if any.
export function moveBody(b, dx, dy, radius, nav) {
  const bump = { glassTx: -1, glassTy: -1 };
  if (dx) {
    const blocked = nav.hit(bodyX(b) + dx, bodyY(b), radius);
    if (blocked === GLASS) {
      bump.glassTx = nav.hitTx;
      bump.glassTy = nav.hitTy;
    }
    b.fx += blocked === FREE ? dx : allowed(dx / 2, (s) => nav.hit(bodyX(b) + s, bodyY(b), radius) === FREE);
  }
  if (dy) {
    const blocked = nav.hit(bodyX(b), bodyY(b) + dy, radius);
    if (blocked === GLASS && bump.glassTx < 0) {
      bump.glassTx = nav.hitTx;
      bump.glassTy = nav.hitTy;
    }
    b.fy += blocked === FREE ? dy : allowed(dy / 2, (s) => nav.hit(bodyX(b), bodyY(b) + s, radius) === FREE);
  }
  settle(b);
  return bump;
}

// Integer carry by a current. Blocked axes simply do not move.
export function shiftBody(b, dx, dy, radius, nav) {
  if (dx && nav.hit(bodyX(b) + dx, bodyY(b), radius) === FREE) b.ox += dx;
  if (dy && nav.hit(bodyX(b), bodyY(b) + dy, radius) === FREE) b.oy += dy;
}
