// A procedurally drawn "app screenshot" so SnapFrame is usable with an empty
// clipboard — and so the README screenshots don't depend on an external file.

const CODE = [
  [[0.06, '#c792ea'], [0.09, '#82aaff'], [0.05, '#c3cee3'], [0.11, '#ecc48d']],
  [[0.04, '#c3cee3'], [0.14, '#82aaff'], [0.06, '#f78c6c']],
  [[0.08, '#c792ea'], [0.1, '#82aaff'], [0.05, '#c3cee3'], [0.16, '#ecc48d']],
  [],
  [[0.05, '#697098'], [0.24, '#697098']],
  [[0.07, '#c792ea'], [0.12, '#82aaff'], [0.04, '#c3cee3'], [0.09, '#f78c6c'], [0.06, '#c3cee3']],
  [[0.1, '#c3cee3'], [0.07, '#addb67'], [0.13, '#ecc48d']],
  [[0.05, '#c792ea'], [0.16, '#82aaff']],
  [],
  [[0.06, '#697098'], [0.19, '#697098']],
  [[0.09, '#c792ea'], [0.11, '#82aaff'], [0.05, '#c3cee3'], [0.14, '#addb67']],
  [[0.12, '#c3cee3'], [0.08, '#f78c6c'], [0.1, '#ecc48d']],
];

const BARS = [0.62, 0.88, 0.44, 0.71, 0.95, 0.53, 0.8, 0.66];

export function createDemoImage(width = 1400, height = 880) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b1021';
  ctx.fillRect(0, 0, width, height);

  const sidebar = width * 0.2;
  ctx.fillStyle = '#0f1530';
  ctx.fillRect(0, 0, sidebar, height);

  ctx.fillStyle = '#7f5af0';
  ctx.beginPath();
  ctx.arc(sidebar * 0.18, height * 0.06, width * 0.012, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(sidebar * 0.28, height * 0.05, sidebar * 0.42, height * 0.018);

  for (let i = 0; i < 7; i++) {
    const y = height * (0.14 + i * 0.052);
    const active = i === 2;
    if (active) {
      ctx.fillStyle = 'rgba(127,90,240,0.18)';
      ctx.fillRect(sidebar * 0.08, y - height * 0.012, sidebar * 0.84, height * 0.038);
    }
    ctx.fillStyle = active ? '#a78bfa' : 'rgba(255,255,255,0.22)';
    ctx.fillRect(sidebar * 0.14, y, sidebar * (0.3 + (i % 3) * 0.14), height * 0.014);
  }

  const padX = sidebar + width * 0.035;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(padX, height * 0.055, width * 0.2, height * 0.026);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(padX, height * 0.1, width * 0.34, height * 0.014);

  const cardW = (width - padX - width * 0.04 - width * 0.03) / 3;
  ['#7f5af0', '#2cb67d', '#ff8906'].forEach((color, i) => {
    const x = padX + i * (cardW + width * 0.015);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, height * 0.15, cardW, height * 0.13);
    ctx.fillStyle = color;
    ctx.fillRect(x, height * 0.15, cardW * 0.16, height * 0.006);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x + cardW * 0.06, height * 0.185, cardW * 0.42, height * 0.03);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + cardW * 0.06, height * 0.235, cardW * 0.66, height * 0.012);
  });

  const chartX = padX;
  const chartY = height * 0.32;
  const chartW = width * 0.42;
  const chartH = height * 0.34;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(chartX, chartY, chartW, chartH);
  const barW = (chartW * 0.72) / BARS.length;
  BARS.forEach((v, i) => {
    const bh = chartH * 0.66 * v;
    const x = chartX + chartW * 0.1 + i * (barW * 1.25);
    const grad = ctx.createLinearGradient(0, chartY + chartH - bh, 0, chartY + chartH);
    grad.addColorStop(0, '#7f5af0');
    grad.addColorStop(1, 'rgba(127,90,240,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, chartY + chartH * 0.86 - bh, barW, bh);
  });

  const codeX = chartX + chartW + width * 0.025;
  const codeW = width - codeX - width * 0.035;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(codeX, chartY, codeW, chartH);
  const lineH = chartH / (CODE.length + 2);
  CODE.forEach((line, i) => {
    let x = codeX + codeW * 0.06;
    const y = chartY + lineH * (i + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(codeX + codeW * 0.02, y, codeW * 0.012, lineH * 0.34);
    line.forEach(([w, color]) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, codeW * w, lineH * 0.34);
      x += codeW * (w + 0.02);
    });
  });

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(padX, height * 0.71, width - padX - width * 0.035, height * 0.22);
  for (let i = 0; i < 4; i++) {
    const y = height * (0.755 + i * 0.045);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(padX + width * 0.02, y, width * 0.1, height * 0.014);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(padX + width * 0.15, y, width * 0.18, height * 0.014);
    ctx.fillStyle = i % 2 ? '#2cb67d' : '#ff8906';
    ctx.fillRect(width - width * 0.12, y, width * 0.05, height * 0.014);
  }

  return canvas;
}
