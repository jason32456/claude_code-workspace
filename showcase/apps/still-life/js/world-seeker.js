import { DETECTION, SEEKER, TILE } from './world-config.js';
import { bodyX, bodyY, makeBody, moveBody } from './world-body.js';
import { randomInt } from './world-random.js';

const HISTORY_MASK = (1 << DETECTION.window) - 1;
const SECOND = 60;

const bits = (n) => {
  let count = 0;
  for (let v = n; v; v >>= 1) count += v & 1;
  return count;
};

export function makeSeeker(def) {
  return {
    ...makeBody(def.x, def.y),
    state: 'patrol',
    wp: 0,
    timer: 0,
    tx: def.x,
    ty: def.y,
    hist: 0,
    moving: false,
    sx: def.x,
    sy: def.y,
    st: 0,
    stuck: 0,
    nudge: 0,
  };
}

function startListening(s, def, rt, range) {
  const [lo, hi] = range || def.listen;
  s.state = 'listen';
  s.timer = randomInt(rt, Math.round(lo * SECOND), Math.round(hi * SECOND));
  s.hist = 0;
  s.nudge = 0;
}

function recentre(s) {
  s.ox = Math.floor(bodyX(s) / TILE) * TILE + TILE / 2;
  s.oy = Math.floor(bodyY(s) / TILE) * TILE + TILE / 2;
  s.fx = 0;
  s.fy = 0;
}

function watchForStuck(s) {
  if (++s.st < SEEKER.stuckCheckTicks) return;
  s.st = 0;
  const moved = Math.hypot(bodyX(s) - s.sx, bodyY(s) - s.sy);
  s.sx = bodyX(s);
  s.sy = bodyY(s);
  if (moved >= 3) {
    s.stuck = 0;
    return;
  }
  s.nudge = 24;
  if (++s.stuck >= 3) {
    recentre(s);
    s.stuck = 0;
  }
}

// Walks toward a point along the tile graph. 'arrived' once within reach of it.
function steer(s, goalX, goalY, speed, nav) {
  const x = bodyX(s);
  const y = bodyY(s);
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const gx = Math.floor(goalX / TILE);
  const gy = Math.floor(goalY / TILE);
  let aimX = goalX;
  let aimY = goalY;
  if (s.nudge > 0) {
    s.nudge--;
    aimX = tx * TILE + TILE / 2;
    aimY = ty * TILE + TILE / 2;
  } else if (tx !== gx || ty !== gy) {
    const next = nav.next(tx, ty, gx, gy);
    if (!next) return 'unreachable';
    aimX = next[0] * TILE + TILE / 2;
    aimY = next[1] * TILE + TILE / 2;
  }
  const dx = aimX - x;
  const dy = aimY - y;
  const d = Math.hypot(dx, dy);
  if (d > 1e-6) {
    const step = Math.min(speed, d);
    moveBody(s, (dx / d) * step, (dy / d) * step, SEEKER.radius, nav);
  }
  watchForStuck(s);
  return Math.hypot(goalX - bodyX(s), goalY - bodyY(s)) < 2.5 ? 'arrived' : 'moving';
}

export function hearKnock(s, x, y) {
  if (s.state === 'hunt') return;
  s.state = 'investigate';
  s.tx = x;
  s.ty = y;
  s.timer = SEEKER.giveUpTicks;
  s.nudge = 0;
}

// `env` carries the world the seeker is allowed to know about: the tile map, the
// player's position and whether the player is visible this tick. Nothing else
// about the player ever reaches a seeker.
export function updateSeeker(s, def, env) {
  const { nav, rt } = env;
  const x0 = bodyX(s);
  const y0 = bodyY(s);
  const distance = Math.hypot(env.px - x0, env.py - y0);
  const range = s.state === 'listen' ? SEEKER.listeningRange : SEEKER.movingRange;
  const perceived = env.visible && distance <= range && nav.los(x0, y0, env.px, env.py);
  s.hist = ((s.hist << 1) | (perceived ? 1 : 0)) & HISTORY_MASK;

  if (s.state === 'hunt') {
    if (perceived) {
      s.tx = env.px;
      s.ty = env.py;
      s.timer = SEEKER.giveUpTicks;
    }
  } else if (bits(s.hist) >= DETECTION.needed) {
    s.state = 'hunt';
    s.tx = env.px;
    s.ty = env.py;
    s.timer = SEEKER.giveUpTicks;
    s.hist = 0;
    s.nudge = 0;
  }

  if (s.state === 'listen') {
    if (--s.timer <= 0) s.state = 'patrol';
  } else if (s.state === 'patrol') {
    const wp = def.route[s.wp];
    const result = steer(s, wp.x, wp.y, def.patrolSpeed, nav);
    if (result === 'arrived' || result === 'unreachable') {
      s.wp = (s.wp + 1) % def.route.length;
      if (wp.stop && result === 'arrived') startListening(s, def, rt);
    }
  } else {
    const speed = s.state === 'hunt' ? def.huntSpeed : def.investigateSpeed;
    const result = steer(s, s.tx, s.ty, speed, nav);
    if ((result === 'arrived' && !perceived) || result === 'unreachable' || --s.timer <= 0) {
      startListening(s, def, rt, SEEKER.afterHuntListen);
    }
  }

  s.moving = s.state !== 'listen' && Math.hypot(bodyX(s) - x0, bodyY(s) - y0) > 0.01;
}
