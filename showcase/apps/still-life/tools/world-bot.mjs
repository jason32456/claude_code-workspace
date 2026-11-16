// Scripted players for world-sim.mjs.
//   naive   walks the shortest path and never stops.
//   freeze  walks the path, freezes whenever a seeker could pick it out (in range
//           with a clear line), and uses a snapshot look-ahead of the real
//           simulation to veto a step that would get it noticed or caught.
//   stealth rides the current and steers only in short bursts while watched.
import { DETECTION, PLAYER, SEEKER, TILE } from '../js/world-config.js';
import { bodyX, bodyY } from '../js/world-body.js';

const EIGHT = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function tileBlocked(lv, blocked, tx, ty) {
  const kind = lv.nav.kindAt(tx, ty);
  if (kind === 2 && blocked.glassIsFree) return false;
  return kind !== 0 || blocked.has(ty * lv.nav.tcols + tx);
}

// Cheapest-path field to a goal tile. Tiles inside a river or drifting ground
// are cheap: being carried is free.
function distanceField(lv, blocked, gx, gy) {
  const { tcols, trows } = lv.nav;
  const cost = (tx, ty) => {
    const x = tx * TILE + 5;
    const y = ty * TILE + 5;
    const carried = lv.ground || lv.rivers.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    return carried ? 0.25 : 1;
  };
  const dist = new Float64Array(tcols * trows).fill(Infinity);
  const done = new Uint8Array(tcols * trows);
  dist[gy * tcols + gx] = 0;
  for (;;) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < bestD) { bestD = dist[i]; best = i; }
    if (best < 0) break;
    done[best] = 1;
    const cx = best % tcols;
    const cy = (best - cx) / tcols;
    for (const [sx, sy] of EIGHT) {
      const nx = cx + sx;
      const ny = cy + sy;
      if (tileBlocked(lv, blocked, nx, ny)) continue;
      if (sx && sy && (tileBlocked(lv, blocked, cx + sx, cy) || tileBlocked(lv, blocked, cx, cy + sy))) continue;
      const step = (sx && sy ? 1.4 : 1) * cost(nx, ny);
      const idx = ny * tcols + nx;
      if (bestD + step < dist[idx]) dist[idx] = bestD + step;
    }
  }
  for (let i = 0; i < dist.length; i++) if (!isFinite(dist[i])) dist[i] = -1;
  return dist;
}

function keepAwayFromAnchored(lv, radius) {
  const blocked = new Set();
  for (const seeker of lv.seekers) {
    if (seeker.route.length > 1) continue;
    const tx = Math.floor(seeker.x / TILE);
    const ty = Math.floor(seeker.y / TILE);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) blocked.add((ty + dy) * lv.nav.tcols + tx + dx);
    }
  }
  return blocked;
}

function mediumVelocity(lv, x, y) {
  for (const r of lv.rivers) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return { x: r.vx, y: r.vy };
  }
  return lv.ground ? { x: lv.ground.vx, y: lv.ground.vy } : { x: 0, y: 0 };
}

function rollout(world, input, hold, horizon) {
  const snapshot = world.debug.snapshot();
  const before = new Set(snapshot.seekers.map((s, i) => (s.state === 'hunt' || s.state === 'investigate' ? i : -1)));
  let verdict = 'ok';
  for (let t = 0; t < horizon && verdict === 'ok'; t++) {
    world.debug.advance(t < hold ? input : {});
    const { rt } = world.debug;
    if (rt.state === 'caught') verdict = 'caught';
    else if (rt.state === 'cleared') break;
    else if (rt.seekers.some((s, i) => (s.state === 'hunt' || s.state === 'investigate') && !before.has(i))) verdict = 'noticed';
  }
  world.debug.restore(snapshot);
  return verdict;
}

export function createBot(world, mode) {
  const fields = new Map();
  const recent = [];
  let committed = { input: {}, ticks: 0 };
  const stats = { dashes: 0 };

  const bot = () => {
    const { rt } = world.debug;
    const lv = world.debug.level();
    if (rt.state === 'title') return { dx: 1, dy: 0 };
    if (rt.state !== 'play') return {};
    if (committed.ticks > 0) {
      committed.ticks--;
      return committed.input;
    }

    const p = rt.player;
    const px = bodyX(p);
    const py = bodyY(p);
    recent.push(p.visible ? 1 : 0);
    if (recent.length > DETECTION.window - 1) recent.shift();

    const blocked = keepAwayFromAnchored(lv, mode === 'naive' ? 0 : 1);
    blocked.glassIsFree = mode === 'naive';
    const fieldFor = (g) => {
      const key = `${rt.levelIndex}:${g.x}:${g.y}:${mode}`;
      if (!fields.has(key)) fields.set(key, distanceField(lv, blocked, Math.floor(g.x / TILE), Math.floor(g.y / TILE)));
      return fields.get(key);
    };
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);

    let goal = lv.gate;
    let bestD = Infinity;
    const open = lv.sparks.filter((_, i) => !rt.sparkTaken[i]);
    for (const s of open) {
      const d = fieldFor(s)[ty * lv.nav.tcols + tx];
      if (d >= 0 && d < bestD) { bestD = d; goal = s; }
    }
    if (open.length && bestD === Infinity) goal = open[0];

    const dist = fieldFor(goal);
    let aimX = goal.x;
    let aimY = goal.y;
    if (tx !== Math.floor(goal.x / TILE) || ty !== Math.floor(goal.y / TILE)) {
      let best = null;
      let bestScore = Infinity;
      for (const [sx, sy] of EIGHT) {
        const nx = tx + sx;
        const ny = ty + sy;
        if (tileBlocked(lv, blocked, nx, ny)) continue;
        if (sx && sy && (tileBlocked(lv, blocked, tx + sx, ty) || tileBlocked(lv, blocked, tx, ty + sy))) continue;
        const d = dist[ny * lv.nav.tcols + nx];
        if (d < 0) continue;
        const score = d * 100 + Math.hypot(goal.x - (nx * TILE + 5), goal.y - (ny * TILE + 5));
        if (score < bestScore) { bestScore = score; best = [nx, ny]; }
      }
      if (best) { aimX = best[0] * TILE + 5; aimY = best[1] * TILE + 5; }
    }
    const toX = aimX - px;
    const toY = aimY - py;
    const toLen = Math.hypot(toX, toY) || 1;
    const follow = { dx: toX / toLen, dy: toY / toLen };

    let exposed = false;
    for (const s of rt.seekers) {
      const sx = bodyX(s);
      const sy = bodyY(s);
      const range = (s.state === 'listen' ? SEEKER.listeningRange : SEEKER.movingRange) + 8;
      if (Math.hypot(sx - px, sy - py) <= range && lv.nav.los(sx, sy, px, py)) exposed = true;
    }

    if (mode === 'naive') return follow;

    if (mode === 'freeze') {
      const options = [];
      if (!exposed) for (const hold of [90, 45, 15]) options.push({ input: follow, hold });
      options.push({ input: {}, hold: 10 });
      for (const [sx, sy] of EIGHT) {
        const n = Math.hypot(sx, sy);
        for (const hold of [30, 12]) options.push({ input: { dx: sx / n, dy: sy / n }, hold });
      }
      const lenient = [{ input: follow, hold: 60 }, ...options];
      for (const [pass, list] of [[0, options], [1, lenient]]) {
        for (const { input, hold } of list) {
          const verdict = rollout(world, input, hold, hold + 130);
          if (verdict === 'ok' || (pass === 1 && verdict === 'noticed')) {
            if (pass === 1) stats.dashes++;
            committed = { input, ticks: hold - 1 };
            return input;
          }
        }
      }
      return {};
    }

    // stealth
    if (exposed && recent.reduce((a, b) => a + b, 0) >= DETECTION.needed - 1) return {};
    const drift = mediumVelocity(lv, px, py);
    const driftSpeed = Math.hypot(drift.x, drift.y);
    const want = exposed && driftSpeed > 0 ? driftSpeed : PLAYER.speed;
    const ux = (toX / toLen) * want - drift.x;
    const uy = (toY / toLen) * want - drift.y;
    const mag = Math.hypot(ux, uy) / PLAYER.speed;
    if (mag < 0.12) return {};
    return { dx: ux / PLAYER.speed / Math.max(1, mag), dy: uy / PLAYER.speed / Math.max(1, mag) };
  };
  bot.stats = stats;
  return bot;
}
