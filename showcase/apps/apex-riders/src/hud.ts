import * as THREE from 'three';
import { BikeState } from './bike';
import { Track } from './track';
import { formatTime, clamp } from './utils';

export class Hud {
  private speedEl: HTMLElement;
  private boostFill: HTMLElement;
  private lapTimeEl: HTMLElement;
  private bestTimeEl: HTMLElement;
  private lapCounterEl: HTMLElement;
  private driftEl: HTMLElement;
  private speedLinesEl: HTMLElement;
  private minimapCtx: CanvasRenderingContext2D;
  private minimapScale = 1;
  private minimapOffset = new THREE.Vector2();

  constructor(track: Track) {
    this.speedEl = document.getElementById('speed-value')!;
    this.boostFill = document.getElementById('boost-fill')!;
    this.lapTimeEl = document.getElementById('lap-time')!;
    this.bestTimeEl = document.getElementById('best-time')!;
    this.lapCounterEl = document.getElementById('lap-counter')!;
    this.driftEl = document.getElementById('drift-indicator')!;
    this.speedLinesEl = document.getElementById('speed-lines')!;

    const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.minimapCtx = canvas.getContext('2d')!;
    this._buildMinimap(track);
  }

  private _buildMinimap(track: Track) {
    const ctx = this.minimapCtx;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const positions = track.getPositions();

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of positions) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const pad = 12;
    const rangeX = maxX - minX + pad * 2, rangeZ = maxZ - minZ + pad * 2;
    this.minimapScale = Math.min((W - 10) / rangeX, (H - 10) / rangeZ);
    this.minimapOffset.set(-(minX - pad), -(minZ - pad));

    // Draw track ribbon once to an offscreen canvas
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#555';
    ctx.lineWidth = track.width * this.minimapScale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const x = (p.x + this.minimapOffset.x) * this.minimapScale + 5;
      const y = (p.z + this.minimapOffset.y) * this.minimapScale + 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Store this as background
    this._minimapBg = ctx.getImageData(0, 0, W, H);
  }

  private _minimapBg: ImageData | null = null;

  update(bike: BikeState, lapTime: number, bestTime: number | null, lapNum: number) {
    const kmh = Math.round(bike.speed * 3.6);
    this.speedEl.textContent = String(kmh);

    const boost = clamp(bike.boostMeter, 0, 1);
    this.boostFill.style.width = `${boost * 100}%`;
    this.boostFill.classList.toggle('full', boost >= 0.99);

    this.lapTimeEl.textContent = formatTime(lapTime);

    if (bestTime !== null) {
      this.bestTimeEl.textContent = `Best: ${formatTime(bestTime)}`;
    }
    this.lapCounterEl.textContent = `LAP ${lapNum}`;

    this.driftEl.classList.toggle('visible', bike.isDrifting);

    const speedFrac = Math.min(bike.speed / 50, 1);
    this.speedLinesEl.classList.toggle('active', speedFrac > 0.7);
    (this.speedLinesEl as HTMLElement).style.opacity = String(speedFrac * speedFrac * 0.6);

    this._drawMinimap(bike);
  }

  private _drawMinimap(bike: BikeState) {
    const ctx = this.minimapCtx;
    const W = ctx.canvas.width, H = ctx.canvas.height;

    if (this._minimapBg) ctx.putImageData(this._minimapBg, 0, 0);

    // Draw bike dot
    const bx = (bike.position.x + this.minimapOffset.x) * this.minimapScale + 5;
    const by = (bike.position.z + this.minimapOffset.y) * this.minimapScale + 5;

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(
      bx + Math.sin(bike.heading) * 7,
      by + Math.cos(bike.heading) * 7,
    );
    ctx.stroke();

    ctx.restore();
  }
}
