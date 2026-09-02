import { TILE, TILE_SIZE, VIEW_COLS, VIEW_ROWS } from './constants.js';
import { idx, clamp, dist2 } from './utils.js';

const BASE_COLORS = {
  [TILE.WALL]: [42, 35, 32],
  [TILE.FLOOR]: [51, 42, 34],
  [TILE.STAIRS]: [74, 63, 42],
  [TILE.EMBERHEART]: [90, 42, 26],
};

function shade(rgb, brightness) {
  const [r, g, b] = rgb;
  // Warm bias: reds/greens fall off slower than blue, so lit tiles read as
  // torchlight rather than a flat white flashlight.
  const rr = clamp(Math.round(r * (0.35 + brightness * 0.9)), 0, 255);
  const gg = clamp(Math.round(g * (0.3 + brightness * 0.85)), 0, 255);
  const bb = clamp(Math.round(b * (0.25 + brightness * 0.6)), 0, 255);
  return `rgb(${rr},${gg},${bb})`;
}

export function render(ctx, game) {
  const canvas = ctx.canvas;
  ctx.fillStyle = '#050403';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { dungeon, player, visible, explored, monsters, items, currentLightRadius } = game;
  const camX = clamp(player.x - Math.floor(VIEW_COLS / 2), 0, Math.max(0, dungeon.width - VIEW_COLS));
  const camY = clamp(player.y - Math.floor(VIEW_ROWS / 2), 0, Math.max(0, dungeon.height - VIEW_ROWS));
  const flicker = 0.92 + Math.sin(performance.now() / 180) * 0.08;

  for (let ty = 0; ty < VIEW_ROWS; ty++) {
    for (let tx = 0; tx < VIEW_COLS; tx++) {
      const gx = camX + tx;
      const gy = camY + ty;
      if (gx < 0 || gy < 0 || gx >= dungeon.width || gy >= dungeon.height) continue;
      const i = idx(gx, gy, dungeon.width);
      const isVisible = visible.has(i);
      const isExplored = explored.has(i);
      if (!isVisible && !isExplored) continue;

      const tileVal = dungeon.tiles[i];
      const px = tx * TILE_SIZE;
      const py = ty * TILE_SIZE;

      if (isVisible) {
        const d = Math.sqrt(dist2(gx, gy, player.x, player.y));
        const brightness = clamp(1 - d / Math.max(1, currentLightRadius), 0.15, 1) * flicker;
        ctx.fillStyle = shade(BASE_COLORS[tileVal], brightness);
      } else {
        ctx.fillStyle = tileVal === TILE.WALL ? '#181616' : '#1e1c1c';
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      if (tileVal === TILE.STAIRS) {
        ctx.fillStyle = isVisible ? '#ffd27a' : '#5c5346';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('>', px + TILE_SIZE / 2, py + TILE_SIZE / 2 + 1);
      } else if (tileVal === TILE.EMBERHEART) {
        ctx.fillStyle = isVisible ? '#ff7a3a' : '#6b3a24';
        ctx.beginPath();
        ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, isVisible ? 9 + Math.sin(performance.now() / 150) * 2 : 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  for (const it of items) {
    const i = idx(it.x, it.y, dungeon.width);
    if (!visible.has(i)) continue;
    drawGlyph(ctx, it.glyph, it.color, (it.x - camX) * TILE_SIZE, (it.y - camY) * TILE_SIZE);
  }

  for (const m of monsters) {
    if (m.hp <= 0) continue;
    const i = idx(m.x, m.y, dungeon.width);
    if (!visible.has(i)) continue;
    const sx = (m.x - camX) * TILE_SIZE;
    const sy = (m.y - camY) * TILE_SIZE;
    drawGlyph(ctx, m.glyph, m.color, sx, sy);
    const barW = TILE_SIZE - 8;
    const frac = clamp(m.hp / m.maxHp, 0, 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(sx + 4, sy + 2, barW, 3);
    ctx.fillStyle = frac > 0.5 ? '#7dd87d' : frac > 0.25 ? '#e0c23a' : '#e0433a';
    ctx.fillRect(sx + 4, sy + 2, barW * frac, 3);
  }

  const psx = (player.x - camX) * TILE_SIZE;
  const psy = (player.y - camY) * TILE_SIZE;
  ctx.beginPath();
  ctx.fillStyle = '#ffe4a3';
  ctx.arc(psx + TILE_SIZE / 2, psy + TILE_SIZE / 2, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff9d3f';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawGlyph(ctx, glyph, color, sx, sy) {
  ctx.fillStyle = color;
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 + 1);
}
