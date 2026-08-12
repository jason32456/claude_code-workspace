// Shared gravity integrator — used identically for live flight and the
// aim-time trajectory preview, so the preview is always physically accurate.

export const ARENA = { width: 900, height: 600 };
export const BALL_RADIUS = 8;
export const RESTITUTION = 0.68;
export const MIN_WELL_DIST = 46;
export const MAX_ACCEL = 1400;
export const CAPTURE_SPEED = 260;
export const SUBSTEP_DT = 1 / 240;

export function createBall(x, y) {
  return { x, y, vx: 0, vy: 0, radius: BALL_RADIUS, resting: true };
}

export function accelerationAt(px, py, wells, blackHole) {
  let ax = 0;
  let ay = 0;
  for (const w of wells) {
    let dx = w.x - px;
    let dy = w.y - py;
    let distSq = dx * dx + dy * dy;
    let dist = Math.sqrt(distSq) || 0.0001;
    if (dist < MIN_WELL_DIST) dist = MIN_WELL_DIST;
    const a = Math.min(w.strength / (dist * dist), MAX_ACCEL);
    ax += (a * dx) / dist;
    ay += (a * dy) / dist;
  }
  if (blackHole) {
    let dx = blackHole.x - px;
    let dy = blackHole.y - py;
    let distSq = dx * dx + dy * dy;
    let dist = Math.sqrt(distSq) || 0.0001;
    if (dist < MIN_WELL_DIST) dist = MIN_WELL_DIST;
    const a = Math.min(blackHole.strength / (dist * dist), MAX_ACCEL);
    ax += (a * dx) / dist;
    ay += (a * dy) / dist;
  }
  return { ax, ay };
}

function resolveWallCollision(ball, wall) {
  const closestX = Math.max(wall.x, Math.min(ball.x, wall.x + wall.w));
  const closestY = Math.max(wall.y, Math.min(ball.y, wall.y + wall.h));
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= ball.radius * ball.radius) return false;
  const dist = Math.sqrt(distSq) || 0.0001;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = ball.radius - dist;
  ball.x += nx * overlap;
  ball.y += ny * overlap;
  const vDotN = ball.vx * nx + ball.vy * ny;
  if (vDotN < 0) {
    ball.vx -= (1 + RESTITUTION) * vDotN * nx;
    ball.vy -= (1 + RESTITUTION) * vDotN * ny;
  }
  return true;
}

function resolveBorder(ball, arena) {
  let bounced = false;
  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.vx = -ball.vx * RESTITUTION;
    bounced = true;
  } else if (ball.x + ball.radius > arena.width) {
    ball.x = arena.width - ball.radius;
    ball.vx = -ball.vx * RESTITUTION;
    bounced = true;
  }
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.vy = -ball.vy * RESTITUTION;
    bounced = true;
  } else if (ball.y + ball.radius > arena.height) {
    ball.y = arena.height - ball.radius;
    ball.vy = -ball.vy * RESTITUTION;
    bounced = true;
  }
  return bounced;
}

// Advances `ball` by dt (internally substepped for stability).
// Returns { hitBlackHole, sunk, bounced }.
export function stepBall(ball, level, dt) {
  const steps = Math.max(1, Math.round(dt / SUBSTEP_DT));
  const h = dt / steps;
  let hitBlackHole = false;
  let bounced = false;

  for (let i = 0; i < steps; i++) {
    const { ax, ay } = accelerationAt(ball.x, ball.y, level.wells, level.blackHole);
    ball.vx += ax * h;
    ball.vy += ay * h;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    for (const wall of level.walls) {
      if (resolveWallCollision(ball, wall)) bounced = true;
    }
    if (resolveBorder(ball, ARENA)) bounced = true;

    if (level.blackHole) {
      const dx = ball.x - level.blackHole.x;
      const dy = ball.y - level.blackHole.y;
      if (Math.hypot(dx, dy) < level.blackHole.horizonRadius) {
        hitBlackHole = true;
        break;
      }
    }
  }

  const speed = Math.hypot(ball.vx, ball.vy);
  ball.resting = speed < 4;

  return { hitBlackHole, bounced, speed };
}

export function distanceToHole(ball, hole) {
  return Math.hypot(ball.x - hole.x, ball.y - hole.y);
}

export function isSunk(ball, hole) {
  const speed = Math.hypot(ball.vx, ball.vy);
  return distanceToHole(ball, hole) < hole.radius - ball.radius * 0.3 && speed < CAPTURE_SPEED;
}

// Simulates a candidate shot forward without mutating game state — used
// for the dashed aim-preview line.
export function simulateTrajectory(startBall, level, vx, vy, maxSteps = 140) {
  const ball = { x: startBall.x, y: startBall.y, vx, vy, radius: startBall.radius };
  const points = [{ x: ball.x, y: ball.y }];
  const dt = 1 / 60;
  let bounces = 0;
  for (let i = 0; i < maxSteps; i++) {
    const result = stepBall(ball, level, dt);
    points.push({ x: ball.x, y: ball.y });
    if (result.hitBlackHole) {
      points.hitBlackHole = true;
      break;
    }
    if (result.bounced) {
      bounces += 1;
      if (bounces > 2) break;
    }
    if (isSunk(ball, level.hole)) {
      points.sunk = true;
      break;
    }
  }
  return points;
}
