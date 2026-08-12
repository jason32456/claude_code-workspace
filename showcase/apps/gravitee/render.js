import { ARENA } from "./physics.js";

export function generateStars(count) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * ARENA.width,
      y: Math.random() * ARENA.height,
      r: Math.random() * 1.3 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.2,
    });
  }
  return stars;
}

export function drawBackground(ctx, stars, t) {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);
  for (const s of stars) {
    const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
    ctx.globalAlpha = 0.25 + twinkle * 0.55;
    ctx.fillStyle = "#cfe0ff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawWalls(ctx, walls) {
  for (const w of walls) {
    ctx.fillStyle = "rgba(124, 136, 184, 0.18)";
    ctx.strokeStyle = "rgba(154, 175, 255, 0.55)";
    ctx.lineWidth = 2;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }
}

function wellColor(strength) {
  if (strength > 8_000_000) return { core: "#ffb66b", glow: "rgba(255, 166, 77, 0.55)" };
  if (strength > 5_500_000) return { core: "#8ad8ff", glow: "rgba(90, 208, 255, 0.5)" };
  return { core: "#a4f5dd", glow: "rgba(63, 240, 192, 0.45)" };
}

export function drawWells(ctx, wells, t) {
  for (const w of wells) {
    const { core, glow } = wellColor(w.strength);
    const pulse = 1 + 0.06 * Math.sin(t * 1.8 + w.x);
    const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.radius * 3.2 * pulse);
    g.addColorStop(0, glow);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.radius * 3.2 * pulse, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(
      w.x - w.radius * 0.3, w.y - w.radius * 0.3, 1,
      w.x, w.y, w.radius
    );
    body.addColorStop(0, "#fff");
    body.addColorStop(0.35, core);
    body.addColorStop(1, "rgba(20,24,48,0.9)");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawBlackHole(ctx, bh, t) {
  if (!bh) return;
  ctx.save();
  ctx.translate(bh.x, bh.y);
  ctx.rotate(t * 0.4);
  ctx.strokeStyle = "rgba(255, 93, 122, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, bh.radius * 2.1, bh.radius * 0.8, 0, 0, Math.PI * 1.4);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 93, 122, 0.35)";
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bh.x, bh.y, bh.horizonRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const core = ctx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, bh.radius);
  core.addColorStop(0, "#050508");
  core.addColorStop(0.8, "#0b0710");
  core.addColorStop(1, "rgba(255,93,122,0.4)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2);
  ctx.fill();
}

export function drawHole(ctx, hole, t, proximity) {
  const pulse = 0.6 + 0.4 * Math.sin(t * 3);
  const brighten = 1 + proximity * 0.6;
  ctx.save();
  ctx.shadowColor = "rgba(63, 240, 192, 0.8)";
  ctx.shadowBlur = 14 * brighten;
  ctx.strokeStyle = `rgba(63, 240, 192, ${0.55 + pulse * 0.3})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(3, 20, 16, 0.9)";
  ctx.beginPath();
  ctx.arc(hole.x, hole.y, hole.radius * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

export function drawTrail(ctx, trail) {
  for (let i = 0; i < trail.length; i++) {
    const p = trail[i];
    const alpha = (i / trail.length) * 0.5;
    ctx.fillStyle = `rgba(90, 208, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5 * (i / trail.length), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawBall(ctx, ball) {
  const g = ctx.createRadialGradient(
    ball.x - 2, ball.y - 2, 0,
    ball.x, ball.y, ball.radius * 2.2
  );
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
}

export function drawAimGuide(ctx, ball, dragVec, power) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(ball.x - dragVec.x, ball.y - dragVec.y);
  ctx.stroke();
  ctx.restore();

  const barW = 60;
  const barX = ball.x - barW / 2;
  const barY = ball.y + 24;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(barX, barY, barW, 5);
  ctx.fillStyle = power > 0.85 ? "#ff5d7a" : "#3ff0c0";
  ctx.fillRect(barX, barY, barW * power, 5);
}

export function drawTrajectoryPreview(ctx, points, t) {
  if (points.length < 2) return;
  ctx.save();
  ctx.setLineDash([6, 7]);
  ctx.lineDashOffset = -t * 40;
  ctx.strokeStyle = points.hitBlackHole
    ? "rgba(255, 93, 122, 0.85)"
    : "rgba(63, 240, 192, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
}

export function drawParticles(ctx, particles) {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color.replace("ALPHA", alpha.toFixed(3));
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
}
