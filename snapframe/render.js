import { gradientById, RATIOS } from './presets.js';

const BAR_RATIO = 0.055;
const BAR_MIN = 26;
const BAR_MAX = 52;

function barHeight(settings, imgW) {
  if (settings.frame === 'none') return 0;
  return Math.round(Math.min(BAR_MAX, Math.max(BAR_MIN, imgW * BAR_RATIO)));
}

function ratioValue(id) {
  return RATIOS.find((r) => r.id === id)?.value ?? null;
}

// Layout is computed at 1× and everything downstream just multiplies by scale,
// so the preview and the exported PNG can never drift apart.
export function layout(image, settings) {
  const imgW = image.width;
  const imgH = image.height;
  const bar = barHeight(settings, imgW);
  const innerW = imgW;
  const innerH = imgH + bar;
  const pad = (settings.padding / 100) * Math.max(imgW, imgH);

  let width = innerW + pad * 2;
  let height = innerH + pad * 2;

  // A tilted frame sweeps a larger box; grow the canvas so corners stay inside.
  if (settings.tilt !== 0) {
    const rad = (Math.abs(settings.tilt) * Math.PI) / 180;
    const sweptW = innerW * Math.cos(rad) + innerH * Math.sin(rad);
    const sweptH = innerW * Math.sin(rad) + innerH * Math.cos(rad);
    width = Math.max(width, sweptW + pad * 2);
    height = Math.max(height, sweptH + pad * 2);
  }

  const ratio = ratioValue(settings.ratio);
  if (ratio) {
    if (width / height < ratio) width = height * ratio;
    else height = width / ratio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
    innerW,
    innerH,
    bar,
  };
}

function paintBackground(ctx, settings, w, h) {
  if (settings.bgMode === 'transparent') return;
  if (settings.bgMode === 'solid') {
    ctx.fillStyle = settings.solid;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const { stops } = gradientById(settings.gradient);
  const rad = (settings.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  const grad = ctx.createLinearGradient(
    cx - (dx * len) / 2,
    cy - (dy * len) / 2,
    cx + (dx * len) / 2,
    cy + (dy * len) / 2
  );
  stops.forEach((color, i) => grad.addColorStop(i / (stops.length - 1), color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function roundedPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function paintChrome(ctx, settings, w, bar, radius) {
  const dark = settings.frame === 'dark';
  ctx.save();
  roundedPath(ctx, 0, 0, w, bar * 2, radius);
  ctx.clip();
  ctx.fillStyle = dark ? '#1f2430' : '#eceef1';
  ctx.fillRect(0, 0, w, bar);
  ctx.restore();

  ctx.fillStyle = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, bar - 1, w, 1);

  const r = Math.max(3, bar * 0.16);
  const gap = r * 3.2;
  const cy = bar / 2;
  ['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {
    ctx.beginPath();
    ctx.arc(gap + i * gap, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

export function render(ctx, image, settings, scale) {
  const box = layout(image, settings);
  const w = box.width * scale;
  const h = box.height * scale;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  paintBackground(ctx, settings, w, h);

  ctx.translate(w / 2, h / 2);
  if (settings.tilt !== 0) ctx.rotate((settings.tilt * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.translate(-box.innerW / 2, -box.innerH / 2);

  const radius = settings.radius;
  const strength = settings.shadow / 100;
  if (strength > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${0.05 + strength * 0.45})`;
    ctx.shadowBlur = strength * Math.max(box.innerW, box.innerH) * 0.09;
    ctx.shadowOffsetY = strength * Math.max(box.innerW, box.innerH) * 0.03;
    ctx.fillStyle = '#000';
    roundedPath(ctx, 0, 0, box.innerW, box.innerH, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  roundedPath(ctx, 0, 0, box.innerW, box.innerH, radius);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, box.innerW, box.innerH);
  ctx.drawImage(image, 0, box.bar, image.width, image.height);
  if (box.bar > 0) paintChrome(ctx, settings, box.innerW, box.bar, radius);
  ctx.restore();

  if (settings.border) {
    ctx.save();
    ctx.lineWidth = Math.max(1, box.innerW / 900);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    roundedPath(
      ctx,
      ctx.lineWidth / 2,
      ctx.lineWidth / 2,
      box.innerW - ctx.lineWidth,
      box.innerH - ctx.lineWidth,
      radius
    );
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
  return box;
}

export function renderToCanvas(image, settings, scale) {
  const box = layout(image, settings);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.width * scale);
  canvas.height = Math.round(box.height * scale);
  render(canvas.getContext('2d'), image, settings, scale);
  return canvas;
}
