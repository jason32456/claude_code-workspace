export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function smoothDamp(
  current: number,
  target: number,
  velocity: { v: number },
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity,
): number {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let diff = current - target;
  const origTarget = target;
  const maxDelta = maxSpeed * smoothTime;
  diff = clamp(diff, -maxDelta, maxDelta);
  target = current - diff;
  const temp = (velocity.v + omega * diff) * dt;
  velocity.v = (velocity.v - omega * temp) * exp;
  let out = target + (diff + temp) * exp;
  if (origTarget - current > 0 === out > origTarget) {
    out = origTarget;
    velocity.v = (out - origTarget) / dt;
  }
  return out;
}
