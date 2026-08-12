// Blueprint renderer. Everything is drawn in metres and scaled at the edge, so
// the same code draws the editor and the running simulation.

import { MATERIALS } from './materials.js';
import { SIM_CONSTANTS } from './physics.js';

const BG = '#070c16';
const GRID_LINE = 'rgba(94, 234, 212, 0.10)';
const GRID_LINE_STRONG = 'rgba(94, 234, 212, 0.30)';
const TERRAIN = '#1b2740';
const TERRAIN_EDGE = '#64809f';

export function fit(canvas, world) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const scale = Math.min(rect.width / world.w, rect.height / world.h);
  return {
    dpr,
    scale,
    ox: (rect.width - world.w * scale) / 2,
    oy: (rect.height - world.h * scale) / 2,
    width: rect.width,
    height: rect.height,
  };
}

export function toWorld(view, px, py) {
  return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale };
}

function stressColor(ratio) {
  const r = Math.max(0, Math.min(1, ratio));
  // teal → amber → red, with the hand-off at 45% so "working hard" reads early.
  const stops = [
    [0, [56, 189, 248]],
    [0.45, [250, 204, 21]],
    [0.8, [249, 115, 22]],
    [1, [239, 68, 68]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (r <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const t = (r - t0) / (t1 - t0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return 'rgb(239, 68, 68)';
}

export function draw(ctx, view, level, state) {
  const { scale, ox, oy } = view;
  ctx.save();
  ctx.scale(view.dpr, view.dpr);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  // Sky above the deck line, void below it, so the gap reads as a drop.
  const sky = ctx.createLinearGradient(0, 0, 0, level.deckY);
  sky.addColorStop(0, '#070c16');
  sky.addColorStop(1, '#0d1626');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, level.world.w, level.deckY);
  const voidGrad = ctx.createLinearGradient(0, level.deckY, 0, level.world.h);
  voidGrad.addColorStop(0, '#080e1a');
  voidGrad.addColorStop(1, '#04070d');
  ctx.fillStyle = voidGrad;
  ctx.fillRect(0, level.deckY, level.world.w, level.world.h - level.deckY);

  drawGrid(ctx, level, scale);
  drawNoBuild(ctx, level, scale);
  drawTerrain(ctx, level, scale);
  drawGoal(ctx, level, scale);

  if (state.sim) drawSim(ctx, view, state);
  else drawEditor(ctx, view, state);

  drawSparks(ctx, state.sparks, scale);
  ctx.restore();
}

function drawGrid(ctx, level, scale) {
  const b = level.build;
  ctx.lineWidth = 1 / scale;
  ctx.strokeStyle = GRID_LINE;
  ctx.beginPath();
  for (let x = Math.ceil(b.x); x <= b.x + b.w; x++) {
    ctx.moveTo(x, b.y);
    ctx.lineTo(x, b.y + b.h);
  }
  for (let y = Math.ceil(b.y); y <= b.y + b.h; y++) {
    ctx.moveTo(b.x, y);
    ctx.lineTo(b.x + b.w, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(94, 234, 212, 0.16)';
  ctx.strokeRect(b.x, b.y, b.w, b.h);

  ctx.strokeStyle = GRID_LINE_STRONG;
  ctx.setLineDash([0.45, 0.35]);
  ctx.beginPath();
  ctx.moveTo(b.x, level.deckY);
  ctx.lineTo(b.x + b.w, level.deckY);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawNoBuild(ctx, level, scale) {
  for (const r of level.noBuild) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.07)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.18)';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let i = -r.h; i < r.w; i += 0.8) {
      ctx.moveTo(r.x + i, r.y + r.h);
      ctx.lineTo(r.x + i + r.h, r.y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
}

function drawTerrain(ctx, level, scale) {
  for (const s of level.solids) {
    if (s.ghost) {
      // Behind the carriageway: anchors the stays, does not block the truck.
      ctx.fillStyle = 'rgba(100, 128, 159, 0.18)';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([0.3, 0.25]);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.setLineDash([]);
      continue;
    }
    const grad = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    grad.addColorStop(0, TERRAIN);
    grad.addColorStop(1, '#0d1524');
    ctx.fillStyle = grad;
    ctx.fillRect(s.x, s.y, s.w, s.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(s.x, s.y, s.w, s.h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let i = -s.h; i < s.w; i += 0.7) {
      ctx.moveTo(s.x + i, s.y);
      ctx.lineTo(s.x + i + s.h, s.y + s.h);
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = TERRAIN_EDGE;
    ctx.lineWidth = 2.5 / scale;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + s.w, s.y);
    ctx.stroke();
  }
}

function drawGoal(ctx, level, scale) {
  const g = level.goal;
  ctx.save();
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.55)';
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([0.25, 0.25]);
  ctx.beginPath();
  ctx.moveTo(g.x, g.y - 2.6);
  ctx.lineTo(g.x, g.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(74, 222, 128, 0.75)';
  ctx.beginPath();
  ctx.moveTo(g.x, g.y - 2.6);
  ctx.lineTo(g.x + 1.3, g.y - 2.25);
  ctx.lineTo(g.x, g.y - 1.9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function memberPath(ctx, ax, ay, bx, by, slack) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  if (slack > 0.001) {
    // Slack cables hang instead of pointing straight at the far joint.
    ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + slack * 2.2, bx, by);
  } else {
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}

function drawEditor(ctx, view, state) {
  const { scale } = view;
  const ed = state.editor;
  for (const m of ed.members) {
    const a = ed.joints[m.a];
    const b = ed.joints[m.b];
    const mat = MATERIALS[m.material];
    ctx.strokeStyle = mat.color;
    ctx.lineWidth = mat.width / scale / 2.2;
    ctx.lineCap = 'round';
    memberPath(ctx, a.x, a.y, b.x, b.y, 0);
  }
  drawJoints(ctx, ed.joints, scale);

  if (state.ghost) {
    const { a, b, material, ok } = state.ghost;
    const mat = MATERIALS[material];
    ctx.strokeStyle = ok ? mat.color : '#ef4444';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = mat.width / scale / 2.2;
    ctx.setLineDash([0.3, 0.22]);
    memberPath(ctx, a.x, a.y, b.x, b.y, 0);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  if (state.hoverPoint) {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.beginPath();
    ctx.arc(state.hoverPoint.x, state.hoverPoint.y, 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.hoverMember >= 0 && state.tool === 'erase') {
    const m = ed.members[state.hoverMember];
    if (m) {
      const a = ed.joints[m.a];
      const b = ed.joints[m.b];
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = (MATERIALS[m.material].width + 2) / scale / 2.2;
      ctx.globalAlpha = 0.7;
      memberPath(ctx, a.x, a.y, b.x, b.y, 0);
      ctx.globalAlpha = 1;
    }
  }
}

function drawJoints(ctx, joints, scale) {
  for (const j of joints) {
    if (j.anchored) {
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(j.x, j.y);
      ctx.lineTo(j.x - 0.45, j.y + 0.75);
      ctx.lineTo(j.x + 0.45, j.y + 0.75);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = j.anchored ? '#e2e8f0' : '#64748b';
    ctx.beginPath();
    ctx.arc(j.x, j.y, j.anchored ? 0.19 : 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSim(ctx, view, state) {
  const { scale } = view;
  const sim = state.sim;
  ctx.lineCap = 'round';
  for (const m of sim.members) {
    if (m.broken) continue;
    const a = sim.particles[m.a];
    const b = sim.particles[m.b];
    const mat = MATERIALS[m.material];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const slack = mat.tensionOnly ? Math.max(0, m.rest - len) : 0;
    ctx.strokeStyle = slack > 0.001 ? 'rgba(148, 163, 184, 0.5)' : stressColor(m.ratio);
    ctx.lineWidth = mat.width / scale / 2.2;
    memberPath(ctx, a.x, a.y, b.x, b.y, slack);
  }

  for (const p of sim.particles) {
    if (p.r > 0) continue;
    ctx.fillStyle = p.anchored ? '#e2e8f0' : 'rgba(148, 163, 184, 0.85)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.anchored ? 0.17 : 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  drawTruck(ctx, sim, scale);
}

function drawTruck(ctx, sim, scale) {
  if (!sim.truck) return;
  const [rw, fw, rb, fb] = sim.truck.parts.map((i) => sim.particles[i]);

  ctx.fillStyle = '#38bdf8';
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 1.5 / scale;
  ctx.beginPath();
  ctx.moveTo(rw.x, rw.y);
  ctx.lineTo(fw.x, fw.y);
  ctx.lineTo(fb.x, fb.y);
  ctx.lineTo(rb.x, rb.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cab, drawn in the body's own frame so it leans with the truck.
  const ux = fb.x - rb.x;
  const uy = fb.y - rb.y;
  const vx = rb.x - rw.x;
  const vy = rb.y - rw.y;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(rb.x + ux * 0.55, rb.y + uy * 0.55);
  ctx.lineTo(rb.x + ux * 0.95, rb.y + uy * 0.95);
  ctx.lineTo(rb.x + ux * 0.95 + vx * 0.45, rb.y + uy * 0.95 + vy * 0.45);
  ctx.lineTo(rb.x + ux * 0.55 + vx * 0.45, rb.y + uy * 0.55 + vy * 0.45);
  ctx.closePath();
  ctx.fill();

  for (const wi of sim.truck.wheels) {
    const w = sim.particles[wi];
    ctx.fillStyle = '#0b1220';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.arc(w.x, w.y, SIM_CONSTANTS.WHEEL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawSparks(ctx, sparks, scale) {
  for (const s of sparks) {
    const a = Math.max(0, s.life / s.maxLife);
    ctx.strokeStyle = `rgba(248, 113, 113, ${a})`;
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.arc(s.x, s.y, (1 - a) * 1.4 + 0.15, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export { stressColor };
