export const PRESET_SIZE = 360;

const C = PRESET_SIZE / 2;

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function star(ctx) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 72 : 160;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([C + r * Math.cos(a), C + 8 + r * Math.sin(a)]);
  }
  polygon(ctx, pts);
}

function heart(ctx) {
  ctx.beginPath();
  ctx.moveTo(C, 318);
  ctx.bezierCurveTo(30, 220, 22, 120, 82, 70);
  ctx.bezierCurveTo(130, 32, 170, 60, C, 112);
  ctx.bezierCurveTo(190, 60, 230, 32, 278, 70);
  ctx.bezierCurveTo(338, 120, 330, 220, C, 318);
  ctx.fill();
}

function crescent(ctx) {
  ctx.beginPath();
  ctx.arc(C, C, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(C + 66, C - 26, 122, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function fish(ctx) {
  ctx.beginPath();
  ctx.moveTo(32, C);
  ctx.bezierCurveTo(90, 70, 210, 70, 262, C);
  ctx.bezierCurveTo(210, 290, 90, 290, 32, C);
  ctx.fill();
  polygon(ctx, [[240, C], [334, 96], [312, C], [334, 264]]);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(92, C - 14, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function cat(ctx) {
  ctx.beginPath();
  ctx.ellipse(C - 20, 252, 84, 66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(C - 40, 130, 62, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, [[C - 98, 118], [C - 94, 40], [C - 52, 86]]);
  polygon(ctx, [[C + 18, 118], [C + 14, 40], [C - 28, 86]]);
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(C + 54, 270);
  ctx.bezierCurveTo(C + 140, 290, C + 150, 200, C + 112, 160);
  ctx.stroke();
}

export const PRESETS = [
  { name: 'square', label: 'Square', draw: (ctx) => ctx.fillRect(60, 60, 240, 240) },
  { name: 'strip', label: 'Long rectangle', draw: (ctx) => ctx.fillRect(10, C - 36, 340, 72) },
  { name: 'triangle', label: 'Triangle', draw: (ctx) => polygon(ctx, [[C, 36], [336, 312], [24, 312]]) },
  { name: 'star', label: 'Star', draw: star },
  { name: 'heart', label: 'Heart', draw: heart },
  { name: 'arrow', label: 'Arrow', draw: (ctx) => polygon(ctx, [[20, 130], [190, 130], [190, 50], [340, C], [190, 310], [190, 230], [20, 230]]) },
  { name: 'cross', label: 'Cross', draw: (ctx) => polygon(ctx, [[130, 30], [230, 30], [230, 130], [330, 130], [330, 230], [230, 230], [230, 330], [130, 330], [130, 230], [30, 230], [30, 130], [130, 130]]) },
  { name: 'crescent', label: 'Crescent', draw: crescent },
  { name: 'fish', label: 'Fish', draw: fish },
  { name: 'cat', label: 'Cat', draw: cat },
];

export function findPreset(name) {
  return PRESETS.find((p) => p.name === name) ?? null;
}

export function drawPreset(ctx, preset, color = '#000') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  preset.draw(ctx);
  ctx.restore();
}
