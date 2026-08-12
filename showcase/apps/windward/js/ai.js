import { DEG, RAD, BOAT } from './config.js';
import { angleDelta, optimalTrim, clamp } from './sailing.js';
import { MARKS } from './course.js';

const UPWIND_ANGLE = 44;
const DOWNWIND_ANGLE = 132;
const TAN_UP = Math.tan(UPWIND_ANGLE * DEG);
const TAN_DOWN = Math.tan((180 - DOWNWIND_ANGLE) * DEG);

/**
 * A layline helm. The interesting part is not steering — it is deciding which
 * side of the course to be on, which is the same decision a human is making.
 */
export class Helm {
  constructor(profile) {
    this.p = profile;
    this.tack = Math.random() < 0.5 ? 1 : -1;
    this.trimNoise = 0;
    this.noiseT = Math.random() * 10;
    this.tackTimer = 0;
    this.lastTackAt = -99;
  }

  // Aim slightly past the mark toward the next leg so the turn is an arc, not
  // a collision.
  aimPoint(progress) {
    const m = MARKS[progress.markIndex];
    const next = MARKS[(progress.markIndex + 1) % MARKS.length];
    const dx = next.x - m.x;
    const dz = next.z - m.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: m.x + (dx / len) * 11, z: m.z + (dz / len) * 11 };
  }

  update(b, progress, wind, dt, time) {
    this.noiseT += dt;
    this.tackTimer -= dt;

    const aim = this.aimPoint(progress);
    const windFrom = wind.directionFrom(b.x, b.z);

    // Wind frame: +u points at the wind's source, +v across it.
    const upX = Math.sin(windFrom), upZ = Math.cos(windFrom);
    const crX = Math.cos(windFrom), crZ = -Math.sin(windFrom);
    const relX = aim.x - b.x;
    const relZ = aim.z - b.z;
    let du = relX * upX + relZ * upZ;
    let dv = relX * crX + relZ * crZ;

    // Detour for pressure: a gust worth having is worth a few boat lengths.
    if (this.p.gustSeek > 0) {
      let bestBias = 0;
      let bestScore = 0;
      for (const g of wind.gusts) {
        if (g.strength <= 1.05) continue;
        const gd = Math.hypot(g.x - b.x, g.z - b.z);
        if (gd > this.p.gustSeek + g.radius) continue;
        const gv = (g.x - b.x) * crX + (g.z - b.z) * crZ;
        const gu = (g.x - b.x) * upX + (g.z - b.z) * upZ;
        if (Math.sign(gu) !== Math.sign(du) && Math.abs(du) > 30) continue;
        const score = (g.strength - 1) * (1 - gd / (this.p.gustSeek + g.radius));
        if (score > bestScore) { bestScore = score; bestBias = gv; }
      }
      dv += bestBias * bestScore * 0.8;
    }

    // Bearing to the mark expressed as an angle off the wind. The boat can
    // steer this directly only if it is outside the no-go cone upwind, or
    // inside the useful running angle downwind — that is the layline test.
    const direct = Math.atan2(dv, du) * RAD;
    const limit = du > 0 ? UPWIND_ANGLE : DOWNWIND_ANGLE;
    const canLay = du > 0 ? Math.abs(direct) >= limit : Math.abs(direct) <= limit;

    let theta;
    if (canLay) {
      theta = direct * DEG;
      this.tack = Math.sign(dv) || this.tack;
    } else {
      const want = Math.sign(dv) || 1;
      const band = clamp(this.p.laylineSlop + Math.abs(du) * 0.28, 15, 58);
      if (this.tack !== want && Math.abs(dv) > band && this.tackTimer <= 0) {
        this.tack = want;
        this.tackTimer = 5;
        this.lastTackAt = time;
      }
      theta = this.tack * limit * DEG;
    }

    const targetHeading = windFrom + theta;
    const err = angleDelta(b.heading, targetHeading) * RAD;

    // PD on heading. Without the rate term the helm hunts, and a boat that
    // hunts spends the whole beat swinging through the eye of the wind.
    const kp = 2.1 / Math.max(0.6, this.p.reaction * 0.5 + 0.5);
    const kd = 0.5;
    b.rudder = clamp(kp * err - kd * b.yawRate * RAD, -BOAT.rudderMax, BOAT.rudderMax);

    this.trimNoise = Math.sin(this.noiseT * 0.7) * this.p.trimError;
    b.trim = clamp(optimalTrim(Math.abs(b.awa)) + this.trimNoise, 0, 90);

    b.hiking = Math.abs(b.heel * RAD) > 16 && Math.random() < 0.9;

    // Momentum lost swinging the bow through the eye of the wind.
    const throughWind = Math.abs(b.awa) < 32 && Math.abs(b.yawRate) > 0.14;
    b.dragMul = throughWind ? 1 + (1 - this.p.tackLoss) * 5 : 1;
  }
}
