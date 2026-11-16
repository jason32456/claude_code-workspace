import {
  BUMP, GATE_REACH, PLAYER, SEEKER, SPARK_REACH, STILL_HINT,
} from './world-config.js';
import { bodyX, bodyY, makeBody, moveBody, shiftBody } from './world-body.js';
import { flowStep } from './world-flow.js';
import { hearKnock, makeSeeker, updateSeeker } from './world-seeker.js';

// The per-level slice of runtime state. Plain data only, so a whole world can be
// snapshotted with structuredClone.
export function resetLevelState(rt, lv) {
  rt.player = { ...makeBody(lv.start.x, lv.start.y), dx: 0, dy: 0, visible: false, moving: false };
  rt.seekers = lv.seekers.map(makeSeeker);
  rt.sparkTaken = lv.sparks.map(() => false);
  rt.gateOpen = lv.sparks.length === 0;
  rt.glass = lv.glass.map(() => ({ start: -9999, length: 0, gapUntil: 0 }));
  rt.knockGap = 0;
  rt.driftClock = 0;
  rt.moveTicks = 0;
  rt.stillTicks = 0;
  rt.stillHint = false;
}

// How the medium under a point moves this tick: a river's flow, the drifting
// ground, or nothing. This is the only definition of "at rest" the law needs.
export function mediumAt(rt, lv, x, y) {
  for (const river of lv.rivers) {
    if (x >= river.x && x < river.x + river.w && y >= river.y && y < river.y + river.h) {
      return { dx: flowStep(rt.clock, river.vx), dy: flowStep(rt.clock, river.vy) };
    }
  }
  if (lv.ground) return { dx: flowStep(rt.driftClock, lv.ground.vx), dy: flowStep(rt.driftClock, lv.ground.vy) };
  return { dx: 0, dy: 0 };
}

function playerVelocity(input) {
  let { dx, dy } = input;
  let mag = Math.hypot(dx, dy);
  if (mag < PLAYER.deadZone) return { vx: 0, vy: 0, moving: false };
  if (mag > 1) {
    dx /= mag;
    dy /= mag;
    mag = 1;
  }
  const speed = PLAYER.speed * (PLAYER.slowestShare + (1 - PLAYER.slowestShare) * mag);
  const length = Math.hypot(dx, dy);
  return { vx: (dx / length) * speed, vy: (dy / length) * speed, moving: true };
}

function knock(rt, lv, fx, tx, ty) {
  const index = lv.pieceOfTile[ty * lv.nav.tcols + tx];
  const piece = rt.glass[index];
  if (!piece || rt.knockGap > 0 || rt.clock < piece.gapUntil) return;
  piece.start = rt.clock;
  piece.length = BUMP.shiverTicks;
  piece.gapUntil = rt.clock + BUMP.pieceGap;
  rt.knockGap = BUMP.knockGap;
  const px = bodyX(rt.player);
  const py = bodyY(rt.player);
  fx.knock(px, py);
  for (const seeker of rt.seekers) {
    if (Math.hypot(bodyX(seeker) - px, bodyY(seeker) - py) <= SEEKER.earshot) hearKnock(seeker, px, py);
  }
}

// Advances a level in play by one tick. Returns 'caught', 'cleared' or null.
export function tickPlay(rt, lv, input, fx) {
  const { nav } = lv;
  const p = rt.player;
  rt.driftClock++;
  if (rt.knockGap > 0) rt.knockGap--;

  const medium = mediumAt(rt, lv, bodyX(p), bodyY(p));
  const startX = p.ox;
  const startY = p.oy;
  shiftBody(p, medium.dx, medium.dy, PLAYER.radius, nav);
  const move = playerVelocity(input);
  const bump = moveBody(p, move.vx, move.vy, PLAYER.radius, nav);
  p.dx = p.ox - startX;
  p.dy = p.oy - startY;
  p.visible = p.dx !== medium.dx || p.dy !== medium.dy;
  p.moving = move.moving;

  if (p.visible) rt.moveTicks++;
  rt.stillTicks = move.moving ? 0 : rt.stillTicks + 1;
  if (rt.moveTicks >= STILL_HINT.moveTicks && rt.stillTicks >= STILL_HINT.stillTicks) rt.stillHint = true;

  if (bump.glassTx >= 0 && move.moving) knock(rt, lv, fx, bump.glassTx, bump.glassTy);

  const px = bodyX(p);
  const py = bodyY(p);
  const env = { nav, rt, px, py, visible: p.visible };
  let caught = false;
  rt.seekers.forEach((seeker, i) => {
    updateSeeker(seeker, lv.seekers[i], env);
    if (Math.hypot(bodyX(seeker) - px, bodyY(seeker) - py) < SEEKER.touch) caught = true;
  });
  if (caught) return 'caught';

  lv.sparks.forEach((spark, i) => {
    if (rt.sparkTaken[i] || Math.hypot(spark.x - px, spark.y - py) >= SPARK_REACH) return;
    rt.sparkTaken[i] = true;
    fx.spark();
    if (rt.sparkTaken.every(Boolean)) rt.gateOpen = true;
  });

  if (rt.gateOpen && lv.gate && Math.hypot(lv.gate.x - px, lv.gate.y - py) < GATE_REACH) return 'cleared';
  return null;
}
