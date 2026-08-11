import { BOAT, WIND, DEG, RAD, GRAVITY } from './config.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Signed shortest angle from a to b, in radians.
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function headingVec(h) {
  return { x: Math.sin(h), z: Math.cos(h) };
}

// Lift rises to a peak at alphaOpt then decays to zero at 90 degrees, where the
// sail has become a parachute. Both halves matter: the first is upwind speed,
// the second is why a dead run is slower than a broad reach.
export function liftCoeff(alphaDeg) {
  if (alphaDeg <= 0) return 0;
  const { clMax, alphaOpt } = BOAT;
  if (alphaDeg < alphaOpt) return clMax * Math.sin((Math.PI / 2) * (alphaDeg / alphaOpt));
  const t = clamp((alphaDeg - alphaOpt) / (90 - alphaOpt), 0, 1);
  return clMax * Math.cos((Math.PI / 2) * t);
}

// A luffing sail is not a clean sail: it flogs, and a flogging sail is a
// parachute pointed the wrong way. This is what actually stops a boat that
// tries to point too high.
export function dragCoeff(alphaDeg) {
  if (alphaDeg < 0) {
    const flog = clamp(-alphaDeg / 14, 0, 1);
    return BOAT.cd0 + BOAT.cdFlog * flog;
  }
  const s = Math.sin(clamp(alphaDeg, 0, 90) * DEG);
  return BOAT.cd0 + BOAT.cdAlpha * s * s;
}

// The boom stops at the centreline, and even hard in the sail still stands at
// a small angle. That floor is the entire reason a no-go zone exists.
export function effectiveTrim(trim) {
  return Math.max(trim, BOAT.trimMin);
}

export function optimalTrim(awaAbsDeg) {
  return clamp(awaAbsDeg - BOAT.alphaOpt, 0, 90);
}

/**
 * Apparent wind in the boat frame.
 * `windVec` is the air's velocity (where it is going), `vel` the boat's.
 * Returns the apparent wind speed and the signed angle off the bow of the
 * direction it blows FROM — 0 is head to wind, +/-180 is dead astern.
 */
export function apparentWind(windVec, vel, heading) {
  const ax = windVec.x - vel.x;
  const az = windVec.z - vel.z;
  const speed = Math.hypot(ax, az);
  if (speed < 1e-4) return { speed: 0, angle: 0, dirX: 0, dirZ: 0 };
  const fromAngle = Math.atan2(-ax, -az);
  return { speed, angle: angleDelta(heading, fromAngle), dirX: ax / speed, dirZ: az / speed };
}

/**
 * One physics substep for any boat, player or AI. Mutates and returns `b`.
 *
 * b: { x, z, heading, vx, vz, trim, rudder, heel, heelVel, hiking, stamina }
 * env: { wind:{x,z}, slopeX, slopeZ, dt, dragMul }
 */
export function stepBoat(b, env) {
  const dt = env.dt;
  const fwd = headingVec(b.heading);
  const stbd = { x: fwd.z, z: -fwd.x };

  const aw = apparentWind(env.wind, { x: b.vx, z: b.vz }, b.heading);
  const awaAbs = Math.abs(b.awa = aw.angle * RAD);
  b.aws = aw.speed;

  const alpha = awaAbs - effectiveTrim(b.trim);
  b.alpha = alpha;
  b.luffing = alpha <= 0.5;

  const q = 0.5 * 1.225 * aw.speed * aw.speed;
  const cl = liftCoeff(alpha);
  const cd = dragCoeff(alpha);
  const liftMag = q * BOAT.sailArea * cl;
  const dragMag = q * BOAT.sailArea * cd;

  // Drag acts along the apparent wind; lift acts across it. The sail always
  // sets to leeward, so pick the perpendicular that actually drives the boat.
  let lx = -aw.dirZ;
  let lz = aw.dirX;
  if (lx * fwd.x + lz * fwd.z < 0) { lx = -lx; lz = -lz; }

  let fx = liftMag * lx + dragMag * aw.dirX;
  let fz = liftMag * lz + dragMag * aw.dirZ;

  // Heel spills wind out of the top of the rig; hiking buys it back.
  const heelDeg = Math.abs(b.heel * RAD);
  const spill = clamp(1 - Math.max(0, heelDeg - BOAT.heelSpill) * BOAT.heelSpillRate, 0.35, 1);
  fx *= spill;
  fz *= spill;

  let drive = fx * fwd.x + fz * fwd.z;
  const side = fx * stbd.x + fz * stbd.z;

  // Gravity down a wave face. This is the surf.
  const slopeDrive = -(env.slopeX * fwd.x + env.slopeZ * fwd.z) * GRAVITY * BOAT.mass * BOAT.surfGain * 0.1;
  drive += slopeDrive;
  b.surf = slopeDrive / BOAT.mass;

  const vFwd = b.vx * fwd.x + b.vz * fwd.z;
  const vSide = b.vx * stbd.x + b.vz * stbd.z;

  // Wave-making resistance climbs steeply as the hull approaches its own
  // wake — the reason a displacement boat has a wall, not a top speed.
  const over = Math.max(0, Math.abs(vFwd) / BOAT.hullSpeed - 0.82);
  const dragMul = (env.dragMul || 1) * (1 + BOAT.wavePenalty * over * over);
  const resFwd = -BOAT.dragFwd * dragMul * vFwd * Math.abs(vFwd);
  const resSide = -BOAT.dragSide * vSide * Math.abs(vSide);

  const accFwd = (drive + resFwd) / BOAT.mass;
  const accSide = (side + resSide) / BOAT.mass;

  b.vx += (accFwd * fwd.x + accSide * stbd.x) * dt;
  b.vz += (accFwd * fwd.z + accSide * stbd.z) * dt;

  b.speed = Math.hypot(b.vx, b.vz);

  // Rudder authority scales with flow over the blade: no steerage way when
  // stopped. Weather helm nudges the bow up into the wind under load.
  const flow = clamp(Math.abs(vFwd) / 3.2, 0, 1);
  const helm = -side / (BOAT.mass * 9) * BOAT.weatherHelm * flow;
  b.yawRate = (b.rudder * DEG) * BOAT.turnGain * flow + helm;
  b.heading += b.yawRate * dt;

  // Heel as a damped spring. Hiking cancels side force before it can tip the
  // boat, but never reverses it — you cannot heel to windward by leaning.
  const relief = b.hiking ? BOAT.hikeRelief : 0;
  const effSide = Math.sign(side || 1) * Math.max(0, Math.abs(side) - relief);
  const target = -effSide / BOAT.heelStiffness;
  b.heelVel += (target - b.heel) * 44 * dt;
  b.heelVel *= Math.exp(-7.5 * dt);
  b.heel += b.heelVel * dt;
  b.heel = clamp(b.heel, -55 * DEG, 55 * DEG);

  b.x += b.vx * dt;
  b.z += b.vz * dt;

  return b;
}

// Velocity made good toward a bearing: the number that decides whether a
// zig-zag beats a straight line.
export function vmg(speed, heading, bearing) {
  return speed * Math.cos(angleDelta(heading, bearing));
}

export function makeBoat(x, z, heading) {
  return {
    x, z, heading,
    vx: 0, vz: 0,
    trim: 45, rudder: 0,
    heel: 0, heelVel: 0,
    hiking: false, stamina: 100,
    speed: 0, awa: 0, aws: 0, alpha: 0, yawRate: 0, surf: 0,
    luffing: false,
  };
}
