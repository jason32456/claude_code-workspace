// A handler that works by the balance point: put the dog on the far side of
// the flock from where they should go, stop it there, then walk it on. Drives
// the title-screen demo and the bench. Returns a whistle or null each call.
import { currentTarget, flankRadius, clusters } from './sim.js';

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function createBot(opts = {}) {
  return { last: -9, gap: opts.gap ?? 0.6, side: opts.side ?? 'comebye', shedAt: -99, careless: !!opts.careless };
}

// Pure pursuit along the judge's line: aim a little ahead of where the flock
// projects onto the current leg, carrying on through a gate along its normal.
function aimPoint(sim) {
  const j = sim.j, F = sim.flock;
  if (!((sim.phase === 'fetch' || sim.phase === 'drive') && j.legs)) return currentTarget(sim);
  const L = j.legs[j.leg];
  const ex = L.bx - L.ax, ez = L.bz - L.az, len = Math.hypot(ex, ez) || 1, ux = ex / len, uz = ez / len;
  const ahead = (F.x - L.ax) * ux + (F.z - L.az) * uz + 14;
  if (ahead <= len) return { x: L.ax + ux * ahead, z: L.az + uz * ahead };
  if (L.gate) return { x: L.bx + L.gate.nx * (ahead - len), z: L.bz + L.gate.nz * (ahead - len) };
  return { x: L.bx, z: L.bz };
}

export function botWhistle(sim, mem) {
  if (sim.result || sim.t - mem.last < mem.gap) return null;
  const say = (c) => { mem.last = sim.t; return c; };
  const dog = sim.dog, F = sim.flock;
  // Commands already whistled but not yet acted on count as given.
  const pending = dog.queue.length ? dog.queue[dog.queue.length - 1].cmd : null;
  if (pending) return null;

  if (sim.phase === 'ready') return say(mem.side);
  if (sim.phase === 'outrun') {
    if (mem.careless) return null;
    let near = Infinity;
    for (const s of sim.sheep) near = Math.min(near, Math.hypot(s.x - dog.x, s.z - dog.z));
    if (near < 0.75 * F.fz && dog.width < 12 && (sim.j.outrunPhi ?? 0) < 2.6) return say('getout');
    return null;
  }

  if (mem.careless) {
    if (dog.state === 'lie') return say('walk');
    return null;
  }

  if (sim.phase === 'shed') {
    if (dog.state === 'inhere' || (dog.state === 'hold' && sim.t - mem.shedAt < 4)) return null;
    // Split and held: leave the dog alone while the judge counts.
    if (clusters(sim.sheep).length > 1 && sim.t - mem.shedAt < 10 && dog.state !== 'flank') return null;
  }

  const T = aimPoint(sim);
  let ux = F.x - T.x, uz = F.z - T.z;
  const ud = Math.hypot(ux, uz) || 1;
  ux /= ud; uz /= ud;
  const want = Math.atan2(uz, ux);
  const have = Math.atan2(dog.z - F.z, dog.x - F.x);
  const err = wrap(want - have);
  const dC = Math.hypot(dog.x - F.x, dog.z - F.z);
  const R = flankRadius(sim);

  if (sim.phase === 'shed' && Math.abs(err) < 0.5 && dC < R + 6) {
    // Split the flock across its long axis: come in from the side it is
    // strung out along, once the sheep have settled.
    const g = clusters(sim.sheep);
    if (g.length === 1 && sim.t - mem.shedAt > 6 && F.speed < 1.2 && dog.state !== 'flank') {
      mem.shedAt = sim.t;
      return say('inhere');
    }
  }

  const flanking = dog.state === 'flank';
  const tol = sim.phase === 'pen' ? 0.22 : 0.3;
  if (flanking) {
    if (Math.abs(err) < tol * 0.6) return say(F.speed < 1.4 ? 'walk' : 'lie');
    const dir = err > 0 ? 1 : -1;
    if (dir !== dog.dir && Math.abs(err) > 0.5) return say(dir > 0 ? 'comebye' : 'away');
    return null;
  }
  if (Math.abs(err) > tol + 0.15) return say(err > 0 ? 'comebye' : 'away');
  const fast = sim.phase === 'pen' ? 1.2 : 2.4;
  if (dog.state === 'walk') {
    if (F.speed > fast) return say('lie');
    if (dog.steady && F.speed < 0.6) return say('walk');
    if (!dog.steady && (sim.phase === 'pen' || sim.phase === 'shed')) return say('steady');
    return null;
  }
  if (['lie', 'hold', 'heel'].includes(dog.state) && F.speed < fast * 0.6) return say('walk');
  if (dog.state === 'recall') return say(err > 0 ? 'comebye' : 'away');
  return null;
}
