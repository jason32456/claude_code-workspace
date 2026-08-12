export const W = 480;
export const H = 720;

const COMET_X = 120;
const COMET_R = 14;
const GRAVITY = 1500; // px/s^2
const FLAP_VY = -430; // px/s
const MAX_FALL_VY = 620;

const GATE_W = 64;
const GATE_SPACING = 250; // px between gate centers
const GAP_START = 210;
const GAP_MIN = 155;
const SPEED_START = 190; // px/s
const SPEED_MAX = 300;
const RAMP_SCORE = 25; // score at which difficulty caps

export function createGame() {
  return {
    state: "title", // title | playing | dead
    comet: { x: COMET_X, y: H / 2, vy: 0, angle: 0 },
    gates: [],
    trail: [],
    particles: [],
    stars: makeStars(),
    score: 0,
    best: Number(localStorage.getItem("neonFlapBest") || 0),
    shake: 0,
    flash: 0,
    spawnX: W + 100,
    deathCause: "",
  };
}

function makeStars() {
  const stars = [];
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.6 + 0.4,
      speed: Math.random() * 20 + 8,
    });
  }
  return stars;
}

export function resetRun(g) {
  g.state = "playing";
  g.comet.y = H / 2;
  g.comet.vy = 0;
  g.comet.angle = 0;
  g.gates = [];
  g.trail = [];
  g.particles = [];
  g.score = 0;
  g.shake = 0;
  g.flash = 0;
  g.spawnX = W + 100;
  spawnGate(g, g.spawnX);
}

function difficulty(score) {
  const t = Math.min(1, score / RAMP_SCORE);
  return {
    speed: SPEED_START + (SPEED_MAX - SPEED_START) * t,
    gap: GAP_START - (GAP_START - GAP_MIN) * t,
  };
}

function spawnGate(g, x) {
  const { gap } = difficulty(g.score);
  const margin = 80;
  const centerMin = margin + gap / 2;
  const centerMax = H - margin - gap / 2;
  const center = centerMin + Math.random() * (centerMax - centerMin);
  g.gates.push({ x, gapY: center, gap, passed: false, flash: 0 });
}

export function flap(g) {
  if (g.state === "title") {
    resetRun(g);
  }
  if (g.state === "dead") return;
  g.comet.vy = FLAP_VY;
}

export function update(g, dt) {
  for (const s of g.stars) {
    s.x -= s.speed * dt * (g.state === "playing" ? 1 : 0.3);
    if (s.x < 0) s.x = W;
  }

  if (g.state !== "playing") {
    updateParticles(g, dt);
    return;
  }

  const { speed } = difficulty(g.score);
  const c = g.comet;
  c.vy = Math.min(MAX_FALL_VY, c.vy + GRAVITY * dt);
  c.y += c.vy * dt;
  c.angle = Math.max(-0.5, Math.min(1.1, c.vy / 500));

  g.trail.unshift({ x: c.x, y: c.y });
  if (g.trail.length > 14) g.trail.pop();

  for (const gate of g.gates) {
    gate.x -= speed * dt;
    if (gate.flash > 0) gate.flash -= dt * 3;
  }
  while (g.gates.length && g.gates[0].x < -GATE_W) g.gates.shift();

  const lastGate = g.gates[g.gates.length - 1];
  if (lastGate.x < W - GATE_SPACING) {
    spawnGate(g, lastGate.x + GATE_SPACING);
  }

  for (const gate of g.gates) {
    if (!gate.passed && gate.x + GATE_W / 2 < c.x) {
      gate.passed = true;
      gate.flash = 1;
      g.score++;
    }
  }

  // collisions
  if (c.y - COMET_R < 0 || c.y + COMET_R > H) {
    die(g, "OUT OF BOUNDS");
  } else {
    for (const gate of g.gates) {
      if (c.x + COMET_R < gate.x - GATE_W / 2 || c.x - COMET_R > gate.x + GATE_W / 2) continue;
      const topEnd = gate.gapY - gate.gap / 2;
      const botStart = gate.gapY + gate.gap / 2;
      if (c.y - COMET_R < topEnd || c.y + COMET_R > botStart) {
        die(g, "WIPEOUT");
        break;
      }
    }
  }

  updateParticles(g, dt);
}

function die(g, cause) {
  g.state = "dead";
  g.deathCause = cause;
  g.shake = 1;
  g.flash = 1;
  burst(g, g.comet.x, g.comet.y);
  if (g.score > g.best) {
    g.best = g.score;
    localStorage.setItem("neonFlapBest", String(g.best));
  }
}

function burst(g, x, y) {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 220;
    g.particles.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 0.5 + Math.random() * 0.4,
      age: 0,
      hue: Math.random() < 0.5 ? "#4be8ff" : "#ff3ec9",
    });
  }
}

function updateParticles(g, dt) {
  for (const p of g.particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
  }
  g.particles = g.particles.filter((p) => p.age < p.life);
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3);
  if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 2.5);
}

export { COMET_R, GATE_W };
