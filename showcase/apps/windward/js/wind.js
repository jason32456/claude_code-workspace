import { WIND } from './config.js';

function rand(a, b) { return a + Math.random() * (b - a); }

/**
 * The wind is a field, not a constant. Three layers stack:
 *   base       — the gradient breeze for the race
 *   oscillation— two beating sinusoids, so shifts never repeat cleanly
 *   gusts      — drifting cells of stronger (or weaker) air, drawn on the water
 *
 * The renderer reads the same cell list the physics samples, so a dark patch
 * on the water is genuinely more breeze.
 */
export class WindField {
  constructor(baseFrom = WIND.baseFrom, baseSpeed = WIND.baseSpeed) {
    this.baseFrom = baseFrom;
    this.baseSpeed = baseSpeed;
    this.time = 0;
    this.shift = 0;
    this.gusts = [];
    for (let i = 0; i < WIND.gustCount; i++) this.gusts.push(this.spawnGust(true));
  }

  spawnGust(anywhere = false) {
    const half = WIND.fieldSize / 2;
    const lull = Math.random() < 0.3;
    // Cells enter from upwind and drift down the course.
    const along = anywhere ? rand(-half, half) : -half - rand(0, 60);
    const across = rand(-half, half);
    const dir = this.baseFrom + Math.PI;
    const cos = Math.cos(dir), sin = Math.sin(dir);
    return {
      x: across * cos - along * sin,
      z: -across * sin - along * cos,
      radius: rand(WIND.gustRadiusMin, WIND.gustRadiusMax),
      strength: lull ? rand(WIND.lullStrength, 0.9) : rand(WIND.gustStrengthMin, WIND.gustStrengthMax),
      bias: rand(-WIND.gustBias, WIND.gustBias),
      life: rand(28, 70),
    };
  }

  update(dt) {
    this.time += dt;
    this.shift =
      WIND.shiftAmp * Math.sin((this.time / WIND.shiftPeriodA) * Math.PI * 2) * 0.65 +
      WIND.shiftAmp * Math.sin((this.time / WIND.shiftPeriodB) * Math.PI * 2 + 1.1) * 0.35;

    const drift = this.baseSpeed * WIND.gustDriftMul;
    const dirFrom = this.baseFrom + this.shift;
    const dx = -Math.sin(dirFrom) * drift;
    const dz = -Math.cos(dirFrom) * drift;

    for (const g of this.gusts) {
      g.x += dx * dt;
      g.z += dz * dt;
      g.life -= dt;
      if (g.life <= 0) Object.assign(g, this.spawnGust(false));
    }
  }

  // Direction the wind is blowing FROM, at this point, right now.
  directionFrom(x, z) {
    let bias = 0;
    for (const g of this.gusts) {
      const f = this.falloff(g, x, z);
      if (f > 0) bias += g.bias * f;
    }
    return this.baseFrom + this.shift + bias;
  }

  falloff(g, x, z) {
    const d = Math.hypot(x - g.x, z - g.z);
    if (d >= g.radius) return 0;
    const t = d / g.radius;
    return t < 0.35 ? 1 : 1 - (t - 0.35) / 0.65;
  }

  strengthAt(x, z) {
    let mul = 1;
    for (const g of this.gusts) {
      const f = this.falloff(g, x, z);
      if (f > 0) mul *= 1 + (g.strength - 1) * f;
    }
    return this.baseSpeed * mul;
  }

  // Air velocity vector — what the sail model actually consumes.
  sample(x, z, out = { x: 0, z: 0, speed: 0, from: 0 }) {
    const from = this.directionFrom(x, z);
    const speed = this.strengthAt(x, z);
    out.from = from;
    out.speed = speed;
    out.x = -Math.sin(from) * speed;
    out.z = -Math.cos(from) * speed;
    return out;
  }
}
