// 2D layer drawn over the WebGL world in each view: pots and their plants, the
// spring's mouth, steam and bloom effects (all in screen coordinates), then the
// view-local furniture: the sill strip and arrows to things off-window.

import { makePlant, drawPlant, speciesColor } from './plants.js';

export class Overlay {
  constructor() {
    this.plants = [];
    this.fx = [];
    this.growth = [];
    this.version = -1;
  }

  setLevel(lv) {
    this.level = lv;
    this.plants = lv.pots.map((p) => makePlant(p.seed, p.species, lv.scale));
    this.growth = lv.pots.map(() => 0);
    this.fx.length = 0;
  }

  // Events come from the world: steam puffs and blooms become short-lived
  // effects in screen space.
  ingest(events, time) {
    if (!events) return;
    for (const ev of events) {
      if (ev.e === 'steam' && this.fx.length < 160) this.fx.push({ k: 'steam', x: ev.x, y: ev.y, t0: time, r: Math.random() });
      else if (ev.e === 'bloom') {
        for (let i = 0; i < 18; i++) this.fx.push({ k: 'spark', x: ev.x, y: ev.y - 30, t0: time, a: (i / 18) * Math.PI * 2, r: Math.random() });
      }
    }
  }

  // Plants grow toward their pot's fill; full pots run on to bloom.
  update(snap, dt) {
    if (!this.level || !snap || !snap.fills) return;
    for (let i = 0; i < this.growth.length; i++) {
      const p = this.level.pots[i];
      const f = Math.min(1, (snap.fills[i] || 0) / p.need);
      const target = f >= 1 ? 1 : f * 0.82;
      const g = this.growth[i];
      this.growth[i] = g + (target - g) * Math.min(1, dt * (target > g ? 1.8 : 6));
    }
  }

  draw(ctx, dpr, ox, oy, w, h, snap, time, opts = {}) {
    const lv = this.level;
    if (!lv) return;
    ctx.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
    const vis = (x, y, m) => x > ox - m && x < ox + w + m && y > oy - m && y < oy + h + m;

    lv.pots.forEach((p, i) => {
      const plant = this.plants[i];
      if (!vis(p.cx, p.y, Math.max(p.w, plant.height + 40))) return;
      drawPlant(ctx, plant, p.cx, p.y + 1, this.growth[i], time);
      drawPot(ctx, p, snap ? Math.min(1, (snap.fills?.[i] || 0) / p.need) : 0, time);
    });

    lv.springs.forEach((s, i) => {
      if (!vis(s.x, s.y, 60)) return;
      const on = snap?.springOn?.[i];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.dy, s.dx));
      ctx.fillStyle = on ? 'rgba(150,235,255,0.9)' : 'rgba(110,170,190,0.45)';
      ctx.beginPath();
      ctx.ellipse(-2, 0, 4, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!on) {
        ctx.fillStyle = 'rgba(160,220,240,0.55)';
        ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.rotate(-Math.atan2(s.dy, s.dx));
        ctx.fillText('SPRING', 0, -30);
      }
      ctx.restore();
    });

    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      const age = time - f.t0;
      if (f.k === 'steam') {
        if (age > 1.4) { this.fx.splice(i, 1); continue; }
        if (!vis(f.x, f.y, 60)) continue;
        const a = (1 - age / 1.4) * 0.35;
        ctx.fillStyle = `rgba(230,236,240,${a})`;
        ctx.beginPath();
        ctx.arc(f.x + Math.sin(age * 3 + f.r * 9) * 6, f.y - age * 46, 4 + age * 9, 0, Math.PI * 2);
        ctx.fill();
      } else {
        if (age > 1.6) { this.fx.splice(i, 1); continue; }
        if (!vis(f.x, f.y, 120)) continue;
        const d = age * (70 + f.r * 40);
        const a = 1 - age / 1.6;
        ctx.fillStyle = `rgba(255,236,170,${a})`;
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(f.a) * d, f.y + Math.sin(f.a) * d - age * 20, 2.2 * a + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (opts.sill) drawSill(ctx, w, h, opts.sill);
    if (opts.arrows) this.drawArrows(ctx, ox, oy, w, h, snap, opts.arrowTop || 26);
  }

  drawArrows(ctx, ox, oy, w, h, snap, topInset) {
    const lv = this.level;
    const targets = [];
    lv.springs.forEach((s) => targets.push({ x: s.x, y: s.y, kind: 'spring' }));
    lv.pots.forEach((p, i) => {
      const full = snap && snap.fills && snap.fills[i] >= p.need;
      if (!full) targets.push({ x: p.cx, y: p.y + p.h / 2, kind: 'pot', color: speciesColor(p.species) });
    });
    // Arrows ride a rectangle inset from the view's edges (more at the top,
    // where the HUD lives) and point from its centre toward the target.
    const m = 26;
    const x0 = m, x1 = w - m, y0 = Math.min(topInset, h / 2 - 10), y1 = h - m;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const t of targets) {
      const lx = t.x - ox, ly = t.y - oy;
      if (lx > 0 && lx < w && ly > 0 && ly < h) continue;
      const dx = lx - cx, dy = ly - cy;
      const sx = dx !== 0 ? (x1 - cx) / Math.abs(dx) : Infinity;
      const sy = dy !== 0 ? (dy < 0 ? cy - y0 : y1 - cy) / Math.abs(dy) : Infinity;
      const s = Math.min(sx, sy);
      const ax = cx + dx * s, ay = cy + dy * s;
      const ang = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(8,14,24,0.7)';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = t.kind === 'spring' ? '#7fe3ff' : t.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (t.kind === 'spring') {
        ctx.fillStyle = '#7fe3ff';
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.quadraticCurveTo(5, 1, 0, 5); ctx.quadraticCurveTo(-5, 1, 0, -6);
        ctx.fill();
      } else {
        ctx.fillStyle = t.color;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 2.3, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.rotate(ang);
      ctx.fillStyle = t.kind === 'spring' ? '#7fe3ff' : t.color;
      ctx.beginPath();
      ctx.moveTo(19, 0); ctx.lineTo(14, -4); ctx.lineTo(14, 4); ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      if (dist > 200) {
        ctx.fillStyle = 'rgba(200,225,240,0.55)';
        ctx.font = '500 9px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        const ty = ay > h - 40 ? ay - 18 : ay + 25;
        ctx.fillText(`${Math.round(dist)} px`, ax, ty);
      }
    }
  }
}

function drawPot(ctx, p, f, time) {
  const { x, y, w, h } = p;
  const bw = w * 0.76;
  const rim = h * 0.2;
  ctx.fillStyle = '#9a4d33';
  ctx.beginPath();
  ctx.moveTo(x + 3, y + rim);
  ctx.lineTo(x + w - 3, y + rim);
  ctx.lineTo(x + (w + bw) / 2, y + h);
  ctx.lineTo(x + (w - bw) / 2, y + h);
  ctx.closePath();
  ctx.fill();
  const grd = ctx.createLinearGradient(x, 0, x + w, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0.28)');
  grd.addColorStop(0.35, 'rgba(255,200,160,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.fillStyle = '#b8603f';
  roundRect(ctx, x, y, w, rim, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,220,190,0.18)';
  ctx.fillRect(x + 3, y + 1.5, w - 6, 1.5);
  // Soil darkens as it drinks.
  const dry = [92, 64, 44], wet = [38, 26, 20];
  const c = dry.map((d, i) => Math.round(d + (wet[i] - d) * f));
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + 2, w / 2 - 4, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Gauge: a little window into the pot that fills with water.
  const gx = x + w / 2 - 12, gy = y + rim + 7, gw = 24, gh = 5;
  ctx.fillStyle = 'rgba(20,10,6,0.55)';
  roundRect(ctx, gx, gy, gw, gh, 2.5);
  ctx.fill();
  if (f > 0) {
    ctx.fillStyle = f >= 1 ? `rgba(160,255,200,${0.8 + 0.2 * Math.sin(time * 4)})` : 'rgba(110,215,245,0.95)';
    roundRect(ctx, gx + 1, gy + 1, Math.max(2, (gw - 2) * f), gh - 2, 2);
    ctx.fill();
  }
}

function drawSill(ctx, w, h, sill) {
  const y = h - 1.5;
  ctx.fillStyle = sill.hover || sill.open ? 'rgba(160,220,240,0.5)' : 'rgba(160,220,240,0.16)';
  if (sill.open) {
    const gx = sill.x;
    ctx.fillRect(0, y - 1.5, Math.max(0, gx - 24), 3);
    ctx.fillRect(gx + 24, y - 1.5, Math.max(0, w - gx - 24), 3);
    ctx.fillStyle = 'rgba(127,227,255,0.9)';
    ctx.fillRect(gx - 27, y - 6, 3, 7);
    ctx.fillRect(gx + 24, y - 6, 3, 7);
  } else {
    ctx.fillRect(0, y - 1.5, w, 3);
  }
  if (!sill.open && sill.hover) {
    ctx.fillStyle = 'rgba(200,235,250,0.8)';
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('hold to open the sill', Math.min(w - 70, Math.max(70, sill.x)), y - 9);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
