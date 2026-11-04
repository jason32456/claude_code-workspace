// The expert bot works the same inputs a player has and knows only what the
// radar measured.
import * as T from './track.js';
import { predict, route, routeTarget, rear, leafOf, pathBits } from './sim.js';

export function makeBot(kind = 'expert') {
  return { kind, next: 0 };
}

const inZone = (b, z) => {
  let off = 0;
  for (const c of b.cars) {
    const sc = b.s - off - c.len / 2;
    off += c.len;
    if (sc > z[0] - 2 && sc < z[1]) return true;
  }
  return false;
};

function trackRoom(S) {
  const minRear = T.TRACK_END.slice();
  const moving = Array(T.N_TRACKS).fill(0);
  for (const b of S.bodies) {
    const L = leafOf(b);
    if (L >= 0 && Math.abs(b.v) < 1e-3) minRear[L] = Math.min(minRear[L], rear(b));
    else if (b.plan != null && !b.pre) moving[L >= 0 ? L : b.plan] += b.len;
  }
  return minRear.map((m, L) => m - T.CLEAR - 8 - moving[L]);
}

// Will b reach the switch where it parts from the cut ahead before that cut
// has cleared it?
export function conflict(S, b) {
  const mine = pathBits(S, b);
  for (const a of S.bodies) {
    if (a === b || a.s <= b.s || a.pre || rear(a) > T.CLEAR + 5) continue;
    const theirs = pathBits(S, a);
    let k = 0;
    while (k < 3 && mine[k] === theirs[k]) k++;
    if (k === 3) continue;
    const clearAt = T.NODES[k] + T.FOUL;
    if (rear(a) > clearAt) continue;
    const ta = (clearAt - rear(a)) / Math.max(a.v, 0.3);
    const tb = (T.NODES[k] - 3 - b.s) / Math.max(b.v, 0.3);
    if (tb < ta + 3) return true;
  }
  return false;
}

export function botStep(S, bot) {
  if (S.t < bot.next) return;
  bot.next = S.t + 0.1;
  S.hump = S.shift.hump;
  if (bot.kind === 'nobrake') { S.input.master = S.input.track = false; return; }
  if (bot.kind === 'noroute') {
    for (const L of Object.keys(S.assign)) S.assign[L] = null;
    for (const k of Object.keys(S.order)) S.order[k] = [];
  }

  if (bot.kind === 'expert') {
    // Open an overflow track when a block has nowhere left to go.
    const it = routeTarget(S);
    if (it && !it.ref.manual) {
      const room = trackRoom(S);
      const len = it.cars.reduce((a, c) => a + c.len, 0);
      const mine = (S.order[it.block] || []).filter((L) => S.assign[L] === it.block);
      const need = !mine.some((L) => room[L] >= len + 70);
      if (need) {
        let best = -1;
        for (let L = 0; L < T.N_TRACKS; L++) if (S.assign[L] == null && (best < 0 || room[L] > room[best])) best = L;
        if (best >= 0) route(S, best);
      }
    }
  }

  let master = false, track = false;
  for (const b of S.bodies) {
    if (b.pre || b.v <= 0) continue;
    if (inZone(b, T.MASTER)) {
      const p = predict(S, b, { track: true });
      if (p.kind !== 'stall' && p.v > 0.9 && b.v > 2.5) master = true;
      if (conflict(S, b)) master = true;
    }
    if (inZone(b, T.TRACK_RET)) {
      const p = predict(S, b, {});
      if (p.kind === 'couple' && p.v > 1.35 || p.kind === 'bumper' && p.v > 0.5) track = true;
    }
  }
  S.input.master = master;
  S.input.track = track;
}
