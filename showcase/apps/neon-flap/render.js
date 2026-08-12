import { W, H, COMET_R, GATE_W } from "./game.js";

export function render(ctx, g) {
  ctx.save();

  if (g.shake > 0) {
    const s = g.shake * 8;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  drawBackground(ctx, g);
  drawGates(ctx, g);
  drawTrail(ctx, g);
  drawComet(ctx, g);
  drawParticles(ctx, g);

  ctx.restore();

  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255, 40, 60, ${g.flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBackground(ctx, g) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0a0e24");
  grad.addColorStop(1, "#05060f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#dfe9ff";
  for (const s of g.stars) {
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGates(ctx, g) {
  for (const gate of g.gates) {
    const topEnd = gate.gapY - gate.gap / 2;
    const botStart = gate.gapY + gate.gap / 2;
    const color = Math.floor(gate.x / 250) % 2 === 0 ? "#4be8ff" : "#ff3ec9";
    const glow = 10 + gate.flash * 25;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.fillStyle = "rgba(13, 18, 36, 0.85)";

    ctx.fillRect(gate.x - GATE_W / 2, 0, GATE_W, topEnd);
    ctx.strokeRect(gate.x - GATE_W / 2, 0, GATE_W, topEnd);

    ctx.fillRect(gate.x - GATE_W / 2, botStart, GATE_W, H - botStart);
    ctx.strokeRect(gate.x - GATE_W / 2, botStart, GATE_W, H - botStart);

    ctx.restore();
  }
}

function drawTrail(ctx, g) {
  for (let i = 0; i < g.trail.length; i++) {
    const p = g.trail[i];
    const t = 1 - i / g.trail.length;
    ctx.beginPath();
    ctx.fillStyle = `rgba(75, 232, 255, ${t * 0.35})`;
    ctx.arc(p.x, p.y, COMET_R * t, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawComet(ctx, g) {
  if (g.state === "title") return;
  const c = g.comet;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);

  const grad = ctx.createLinearGradient(-COMET_R, 0, COMET_R, 0);
  grad.addColorStop(0, "#4be8ff");
  grad.addColorStop(1, "#ff3ec9");

  ctx.shadowColor = "#4be8ff";
  ctx.shadowBlur = 18;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, COMET_R, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawParticles(ctx, g) {
  for (const p of g.particles) {
    const t = 1 - p.age / p.life;
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = p.hue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 * t, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
