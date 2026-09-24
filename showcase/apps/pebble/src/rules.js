import { FAR_TEE, FAR_HOG, HOUSE_R, STONE_R, HALF_W, FGZ_STONES } from './constants.js';

export function distToButton(s) {
  return Math.hypot(s.x, s.y - FAR_TEE);
}

export function inHouse(s) {
  return s.inPlay && distToButton(s) - STONE_R < HOUSE_R;
}

// Between the far hog line and the tee line, not touching the house.
export function inFGZ(s) {
  return s.inPlay && s.y - STONE_R > FAR_HOG && s.y < FAR_TEE && !inHouse(s);
}

// { team, points, ranked } — points 0 and team null for a blank end.
export function scoreEnd(stones) {
  const ranked = stones.filter(inHouse).sort((a, b) => distToButton(a) - distToButton(b));
  if (!ranked.length) return { team: null, points: 0, ranked };
  const team = ranked[0].team;
  let points = 0;
  for (const s of ranked) {
    if (s.team !== team) break;
    points++;
  }
  return { team, points, ranked };
}

// Applied once every stone has stopped. Mutates stones; returns what was ruled.
// before is a snapshot taken just before delivery; thrownCount is how many
// stones of this end had already been delivered before this one.
export function adjudicate(stones, before, shooter, ctx, thrownCount) {
  const events = [];
  const s = stones.find((t) => t.id === shooter.id);
  if (s.inPlay && !ctx.shooterHit && s.y - STONE_R < FAR_HOG) {
    s.inPlay = false;
    s.out = 'hog';
    events.push({ type: 'hog' });
  }
  if (thrownCount < FGZ_STONES) {
    const violated = before.some((b) => {
      if (b.team === shooter.team || !inFGZ(b)) return false;
      const now = stones.find((t) => t.id === b.id);
      return !now.inPlay;
    });
    if (violated) {
      for (const b of before) {
        const now = stones.find((t) => t.id === b.id);
        Object.assign(now, b, { moving: false, vx: 0, vy: 0 });
      }
      s.inPlay = false;
      s.out = 'fgz';
      events.push({ type: 'fgz' });
    }
  }
  for (const r of ctx.removed) {
    if (r.id !== shooter.id || !events.length) events.push({ type: 'out', id: r.id, reason: r.reason });
  }
  return events;
}

export function isGuardLane(s) {
  return inFGZ(s) && Math.abs(s.x) < HALF_W - 0.6;
}
