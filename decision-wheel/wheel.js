const COLORS = [
  '#ff6f61', '#6fd6ff', '#ffd166', '#06d6a0', '#c77dff',
  '#ff9a4d', '#4dccff', '#f78fb3', '#84e296', '#f4a261',
];

export class Wheel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = [];
    this.rotation = 0; // radians, current visual rotation
    this.spinning = false;
    this.onTick = null;
    this.onFinish = null;
  }

  setOptions(options) {
    this.options = options;
    this.draw();
  }

  get sliceAngle() {
    return (Math.PI * 2) / Math.max(this.options.length, 1);
  }

  draw() {
    const { ctx, canvas } = this;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 6;

    ctx.clearRect(0, 0, size, size);

    if (this.options.length === 0) {
      ctx.fillStyle = '#2a2640';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a9a3c2';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add options to begin', cx, cy);
      return;
    }

    const slice = this.sliceAngle;

    this.options.forEach((label, i) => {
      const start = this.rotation + i * slice;
      const end = start + slice;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + slice / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1a1730';
      ctx.font = `600 ${Math.max(12, Math.min(18, 220 / this.options.length))}px sans-serif`;
      const maxWidth = radius - 30;
      let text = label;
      while (ctx.measureText(text).width > maxWidth && text.length > 1) {
        text = text.slice(0, -1);
      }
      if (text !== label) text = text.slice(0, -1) + '…';
      ctx.fillText(text, radius - 14, 0);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1730';
    ctx.fill();
    ctx.strokeStyle = '#3d3760';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Spins so the winning slice ends under the top pointer.
  spinTo(winnerIndex, durationMs = 5000) {
    if (this.spinning || this.options.length === 0) return;
    this.spinning = true;

    const slice = this.sliceAngle;
    const pointerAngle = -Math.PI / 2; // top of the wheel
    const targetSliceCenter = winnerIndex * slice + slice / 2;
    const jitter = (Math.random() - 0.5) * slice * 0.6;

    // Normalize rotation into [0, 2PI) before adding full spins.
    const current = this.rotation % (Math.PI * 2);
    const extraSpins = 6 + Math.floor(Math.random() * 3);
    // We need: current + delta ≡ pointerAngle - targetSliceCenter (mod 2PI)
    let desiredFinal = pointerAngle - targetSliceCenter - jitter;
    while (desiredFinal < current) desiredFinal += Math.PI * 2;
    const totalRotation = (desiredFinal - current) + extraSpins * Math.PI * 2;

    const startRotation = this.rotation;
    const startTime = performance.now();
    let lastTickSlice = -1;

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      this.rotation = startRotation + totalRotation * eased;
      this.draw();

      const currentSlice = Math.floor(((this.rotation % (Math.PI * 2)) + Math.PI * 2) / slice);
      if (currentSlice !== lastTickSlice) {
        lastTickSlice = currentSlice;
        if (this.onTick) this.onTick();
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.spinning = false;
        if (this.onFinish) this.onFinish(winnerIndex);
      }
    };

    requestAnimationFrame(animate);
  }
}
