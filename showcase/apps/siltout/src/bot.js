import { forwardOf, lineChafes, nearestPerm, G, neutralVolume, REACH } from './sim.js';

// Autopilot divers for the bench and the screenshot script.
//   expert  : ties off before the line can wrap, frog kicks, unties on the way out
//   notie   : primary tie-off only, then swims in regardless
//   flutter : expert line work, but flutter kicks close to the floor
export function makeBot(kind = 'expert') {
  return { kind, phase: 'primary', wp: 1, path: null, tie: null, failT: null, hold: 0 };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function pathPoints(S, ids, kind) {
  const low = kind === 'flutter';
  return ids.map((id) => {
    const n = S.cave.nodes[id];
    const dy = n.chamber ? 0 : low ? -n.r * S.cave.flat * 0.45 : 0.1;
    return [n.p[0], n.p[1] + dy, n.p[2]];
  });
}

function steer(S, target, opts = {}) {
  const D = S.diver, I = S.input;
  let d = [target[0] - D.pos[0], target[1] - D.pos[1], target[2] - D.pos[2]];
  const Lt = Math.hypot(...d) || 1e-6;
  if (Lt > 1.2) {
    const v = Math.hypot(...D.vel);
    const look = 0.8 + v * 1.5;
    const pr = [D.pos[0] + (d[0] / Lt) * look, D.pos[1] + (d[1] / Lt) * look, D.pos[2] + (d[2] / Lt) * look];
    const dd = S.cave.D(...pr);
    if (dd > -0.75) {
      const g = S.cave.grad(...pr);
      const k = (dd + 0.75) * 4;
      d = [d[0] / Lt - g[0] * k, d[1] / Lt - g[1] * k, d[2] / Lt - g[2] * k].map((x) => x * Lt);
    }
  }
  const L = Math.hypot(...d) || 1e-6;
  const yaw = Math.atan2(d[2], d[0]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, d[1] / L)));
  let dy = yaw - D.yaw;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  I.yaw = Math.max(-1, Math.min(1, dy * 3));
  I.pitch = Math.max(-1, Math.min(1, (pitch - D.pitch) * 3));
  const facing = Math.abs(dy) < 0.9 && Math.abs(pitch - D.pitch) < 0.9;
  I.fwd = facing && L > (opts.stop ?? 0.3) ? 1 : 0;
  I.flutter = !!opts.flutter;
  I.back = 0;
  return L;
}

function trim(S) {
  const D = S.diver, I = S.input;
  const net = G * (D.wingS / D.ata - neutralVolume(D.gas, S.site.gas)) + D.vel[1] * 60;
  I.inflate = net < -2.5;
  I.dump = net > 2.5;
}

function chooseAnchor(S, last, ahead) {
  const D = S.diver;
  const used = new Set(S.reel.ties.filter((t) => t.kind === 'anchor').map((t) => t.id));
  let best = null, bs = Infinity;
  for (const a of S.cave.anchors) {
    if (used.has(a.id)) continue;
    const d = dist(a.p, D.pos);
    if (d > 7) continue;
    if (lineChafes(S, last, a.p)) continue;
    const clear = !lineChafes(S, a.p, ahead);
    const s = d + (clear ? 0 : 20) - dist(a.p, last) * 0.3;
    if (s < bs) { bs = s; best = a; }
  }
  return best;
}

export function botStep(S, bot) {
  if (S.done) return;
  const D = S.diver, R = S.reel, I = S.input, site = S.site;
  const flutter = bot.kind === 'flutter';
  trim(S);
  I.touch = false;

  if (S.light.failed && !S.light.backup) {
    if (bot.failT == null) bot.failT = S.t;
    if (S.t - bot.failT > 1.5) { S.actions.push('light'); bot.failT = null; }
  }

  if (bot.phase === 'primary') {
    if (site.perm) { bot.phase = 'in'; bot.path = pathPoints(S, site.route, bot.kind); return; }
    const a = S.cave.anchors.find((x) => x.primary);
    const ap = [a.p[0], a.p[1] + 1.3, a.p[2]];
    steer(S, ap, { stop: 0.4 });
    if (dist(D.pos, a.p) < REACH - 0.4) {
      I.fwd = 0; S.actions.push('tie');
      bot.phase = 'in'; bot.path = pathPoints(S, site.route, bot.kind);
    }
    return;
  }

  if (bot.phase === 'in') {
    if (S.objective) {
      bot.phase = 'out';
      bot.path = pathPoints(S, site.route.slice().reverse(), bot.kind);
      bot.wp = 1;
      return;
    }
    const P = bot.path;
    while (bot.wp < P.length - 1 && dist(D.pos, P[bot.wp]) < 2.6) bot.wp++;
    const tgt = P[bot.wp];

    if (site.perm && site.jumpAt != null && !R.ties.length && site.route[bot.wp - 1] === site.jumpAt) {
      const np = nearestPerm(S);
      if (np.d < 1.5) { S.actions.push('tie'); return; }
      steer(S, np.q, { stop: 0.2 });
      return;
    }

    if (bot.tie) {
      const a = bot.tie;
      const ap = [a.p[0] - a.n[0] * 1.1, a.p[1] - a.n[1] * 1.1 + 0.2, a.p[2] - a.n[2] * 1.1];
      const L = steer(S, ap, { stop: 0.3, flutter });
      if (dist(D.pos, a.p) < REACH - 0.3 || (L < 0.5 && dist(D.pos, a.p) < REACH)) {
        S.actions.push('tie'); bot.tie = null;
      } else if (L < 0.5) bot.tie = null;
      return;
    }

    if (R.ties.length && !R.broken && bot.kind !== 'notie') {
      const last = R.ties[R.ties.length - 1].p;
      const d = [tgt[0] - D.pos[0], tgt[1] - D.pos[1], tgt[2] - D.pos[2]];
      const L = Math.hypot(...d) || 1;
      const ahead = [D.pos[0] + (d[0] / L) * 2.5, D.pos[1] + (d[1] / L) * 2.5, D.pos[2] + (d[2] / L) * 2.5];
      if (R.wrapped || lineChafes(S, last, ahead)) {
        const far = [D.pos[0] + (d[0] / L) * Math.min(L, 8), D.pos[1] + (d[1] / L) * Math.min(L, 8), D.pos[2] + (d[2] / L) * Math.min(L, 8)];
        const a = chooseAnchor(S, last, far);
        if (a) { bot.tie = a; return; }
      }
    }
    steer(S, tgt, { flutter, stop: 0 });
    return;
  }

  if (bot.phase === 'out') {
    if (R.ties.length) {
      const last = R.ties[R.ties.length - 1];
      if (R.broken) {
        if (steer(S, last.p, { stop: 0.4 }) < REACH - 0.4) S.actions.push('tie');
        return;
      }
      const ap = last.kind === 'perm' ? last.p : (() => {
        const a = S.cave.anchors[last.id];
        return [a.p[0] - a.n[0] * 1.1, a.p[1] - a.n[1] * 1.1 + 0.2, a.p[2] - a.n[2] * 1.1];
      })();
      const L = steer(S, ap, { stop: 0.3, flutter });
      if (dist(D.pos, last.p) < REACH - 0.4 || L < 0.5) { I.fwd = 0; S.actions.push('untie'); bot.hold = 0.3; }
      return;
    }
    if (site.perm && !bot.permOut) {
      bot.permOut = true;
      const pts = S.cave.perm.pts;
      const np = nearestPerm(S);
      bot.path = [D.pos.slice()].concat(pts.slice(0, np.seg + 1).reverse().map((p) => [p[0], p[1] + 0.6, p[2]]));
      bot.wp = 1;
    } else if (!bot.homing) {
      bot.homing = true;
      let k = 0, bd = Infinity;
      bot.path.forEach((p, i) => { const d = dist(p, D.pos); if (d < bd) { bd = d; k = i; } });
      bot.path = [D.pos.slice()].concat(bot.path.slice(k + 1));
      bot.wp = 1;
    }
    const P = bot.path;
    while (bot.wp < P.length - 1 && dist(D.pos, P[bot.wp]) < 2.6) bot.wp++;
    let tgt = P[bot.wp];
    const B = S.cave.basin;
    if (bot.wp >= P.length - 1 && Math.hypot(D.pos[0] - B.p[0], D.pos[2] - B.p[2]) < B.r * 0.8) tgt = [B.p[0], -1, B.p[2]];
    steer(S, tgt, { flutter, stop: 0 });
    if (tgt[1] === -1) { I.inflate = true; I.dump = false; }
  }
}

export { forwardOf };
