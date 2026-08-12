import { AMBIENT_RADIUS } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W = 0, H = 0, dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
}
window.addEventListener('resize', resize);
resize();

// Total visibility of a world point: ping afterimage + ambient glow around player.
function lightAt(state, wx, wy) {
  const tx = Math.floor(wx), ty = Math.floor(wy);
  let v = 0;
  if (tx >= 0 && ty >= 0 && tx < state.cols && ty < state.rows) {
    v = state.light[ty * state.cols + tx];
  }
  const d = Math.hypot(wx - state.player.x, wy - state.player.y);
  const amb = Math.max(0, 1 - d / AMBIENT_RADIUS) * 0.95;
  return Math.min(1, v + amb);
}

export function render(state, t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#030711';
  ctx.fillRect(0, 0, W, H);

  const tile = Math.min((W - 40) / state.cols, (H - 80) / state.rows);
  const ox = (W - state.cols * tile) / 2 + (state.shake ? (Math.random() - 0.5) * state.shake * 22 : 0);
  const oy = (H - state.rows * tile) / 2 + 20 + (state.shake ? (Math.random() - 0.5) * state.shake * 22 : 0);
  const px = (wx) => ox + wx * tile;
  const py = (wy) => oy + wy * tile;

  // --- tiles ---
  for (let ty = 0; ty < state.rows; ty++) {
    for (let tx = 0; tx < state.cols; tx++) {
      const v = lightAt(state, tx + 0.5, ty + 0.5);
      if (v < 0.02) continue;
      const x = px(tx), y = py(ty);
      if (state.grid[ty][tx] === 1) {
        // glow halo then wall body
        ctx.fillStyle = `rgba(77, 232, 255, ${(v * 0.16).toFixed(3)})`;
        ctx.fillRect(x - 2, y - 2, tile + 4, tile + 4);
        const body = 0.12 + v * 0.75;
        ctx.fillStyle = `rgba(${Math.round(30 + 60 * v)}, ${Math.round(90 + 130 * v)}, ${Math.round(120 + 135 * v)}, ${body.toFixed(3)})`;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      } else {
        ctx.fillStyle = `rgba(60, 130, 160, ${(v * 0.07).toFixed(3)})`;
        ctx.fillRect(x, y, tile, tile);
      }
    }
  }

  // --- ping rings ---
  for (const p of state.pings) {
    const a = Math.max(0, 1 - p.r / p.maxR);
    ctx.strokeStyle = `rgba(77, 232, 255, ${(a * 0.5).toFixed(3)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), p.r * tile, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(77, 232, 255, ${(a * 0.18).toFixed(3)})`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), p.r * tile, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- exit ---
  {
    const e = state.exit;
    const v = lightAt(state, e.x, e.y);
    const pulse = 0.6 + 0.4 * Math.sin(t * 3);
    const base = e.open ? 0.25 * pulse : 0; // an open gate glows on its own
    const a = Math.min(1, base + v);
    if (a > 0.02) {
      const color = e.open ? '255, 206, 86' : '110, 130, 160';
      ctx.strokeStyle = `rgba(${color}, ${a.toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px(e.x), py(e.y), tile * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${color}, ${(a * 0.35).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px(e.x), py(e.y), tile * (e.open ? 0.2 * pulse + 0.08 : 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- shards ---
  for (const s of state.shards) {
    if (s.taken) continue;
    const twinkle = 0.1 + 0.08 * Math.sin(t * 2.5 + s.phase);
    const a = Math.min(1, twinkle + lightAt(state, s.x, s.y));
    const x = px(s.x), y = py(s.y);
    const r = tile * 0.2 * (1 + 0.12 * Math.sin(t * 4 + s.phase));
    ctx.fillStyle = `rgba(63, 224, 197, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(63, 224, 197, ${(a * 0.25).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- lurkers ---
  for (const l of state.lurkers) {
    const a = lightAt(state, l.x, l.y);
    if (a < 0.03) continue;
    const x = px(l.x), y = py(l.y);
    const r = l.r * tile;
    const wob = 1 + 0.15 * Math.sin(t * 6 + l.phase);
    const color = l.state === 'aggro' ? '255, 84, 112' : '210, 90, 160';
    ctx.fillStyle = `rgba(${color}, ${(a * 0.2).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9 * wob, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${color}, ${(a * 0.9).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r * wob, 0, Math.PI * 2);
    ctx.fill();
    // a darker maw, oriented the way it drifts
    ctx.fillStyle = `rgba(10, 2, 8, ${(a * 0.8).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x + Math.cos(l.dir) * r * 0.4, y + Math.sin(l.dir) * r * 0.4, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- player ---
  {
    const p = state.player;
    const x = px(p.x), y = py(p.y);
    const flicker = p.invuln > 0 && Math.floor(t * 12) % 2 === 0;
    if (!flicker) {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, tile * AMBIENT_RADIUS);
      grad.addColorStop(0, 'rgba(140, 240, 255, 0.16)');
      grad.addColorStop(1, 'rgba(140, 240, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - tile * AMBIENT_RADIUS, y - tile * AMBIENT_RADIUS, tile * AMBIENT_RADIUS * 2, tile * AMBIENT_RADIUS * 2);
      ctx.fillStyle = '#e6fbff';
      ctx.beginPath();
      ctx.arc(x, y, p.r * tile * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(77, 232, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, p.r * tile * 1.25, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // --- vignette + danger tint ---
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(3, 7, 17, 0)');
  vg.addColorStop(1, 'rgba(3, 7, 17, 0.88)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  if (state.heartbeatLevel > 0.25) {
    const throb = state.heartbeatLevel * (0.10 + 0.06 * Math.sin(t * 7));
    ctx.fillStyle = `rgba(255, 40, 70, ${throb.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export function renderIdle(t) {
  // Behind the title screen: slow ambient rings drifting in the void.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#030711';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 3; i++) {
    const r = ((t * 40 + i * 220) % 700);
    const a = Math.max(0, 0.22 * (1 - r / 700));
    ctx.strokeStyle = `rgba(77, 232, 255, ${a.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}
