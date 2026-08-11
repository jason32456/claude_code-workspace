import { DEG, RAD, WIND, RACE } from './config.js';
import { MARKS } from './course.js';
import { angleDelta, optimalTrim, clamp } from './sailing.js';

const $ = (id) => document.getElementById(id);

export function pointOfSail(twaAbs, speed = 99) {
  if (twaAbs < 50 && speed < 1.6) return 'IN IRONS';
  if (twaAbs < 32) return 'PINCHING';
  if (twaAbs < 60) return 'CLOSE HAULED';
  if (twaAbs < 80) return 'CLOSE REACH';
  if (twaAbs < 100) return 'BEAM REACH';
  if (twaAbs < 150) return 'BROAD REACH';
  return 'RUNNING';
}

export function formatTime(s) {
  if (!isFinite(s) || s < 0) return '--:--.-';
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

export class Hud {
  constructor() {
    this.compass = $('compass');
    this.trim = $('trim-dial');
    this.map = $('minimap');
    this.mapBox = this.computeMapBox();
    this.flashUntil = 0;
    this.message = '';
    this.messageUntil = 0;
  }

  computeMapBox() {
    const xs = MARKS.map((m) => m.x);
    const zs = MARKS.map((m) => m.z);
    const pad = 46;
    return {
      minX: Math.min(...xs) - pad,
      maxX: Math.max(...xs) + pad,
      minZ: Math.min(...zs) - pad,
      maxZ: Math.max(...zs) + pad,
    };
  }

  say(text, seconds = 2.2, time = 0) {
    this.message = text;
    this.messageUntil = time + seconds;
    const el = $('msg');
    el.textContent = text;
    el.classList.add('show');
  }

  flash(time) { this.flashUntil = time + 0.45; }

  drawCompass(d) {
    const { ctx, w, h } = fitCanvas(this.compass);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 10;
    ctx.clearRect(0, 0, w, h);

    // Boat-up frame: everything is drawn relative to where the bow points,
    // which is how a helmsman actually thinks.
    const twaRel = angleDelta(d.heading, d.windFrom);
    const inIrons = Math.abs(twaRel * RAD) < WIND.noGo;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,18,30,0.62)';
    ctx.fill();

    // No-go cone, drawn around the wind's bearing.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const a0 = twaRel - WIND.noGo * DEG;
    const a1 = twaRel + WIND.noGo * DEG;
    ctx.arc(0, 0, r, -a0 - Math.PI / 2, -a1 - Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = inIrons ? 'rgba(255,72,72,0.4)' : 'rgba(255,120,90,0.17)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(190,222,245,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    for (let a = 0; a < 360; a += 30) {
      const t = a * DEG;
      const inner = a % 90 === 0 ? r - 11 : r - 6;
      ctx.beginPath();
      ctx.moveTo(Math.sin(t) * inner, -Math.cos(t) * inner);
      ctx.lineTo(Math.sin(t) * r, -Math.cos(t) * r);
      ctx.strokeStyle = 'rgba(190,222,245,0.35)';
      ctx.stroke();
    }

    // Bearing to the next mark.
    const mb = angleDelta(d.heading, d.markBearing);
    ctx.save();
    ctx.rotate(mb);
    ctx.beginPath();
    ctx.moveTo(0, -r + 2);
    ctx.lineTo(-5.5, -r + 13);
    ctx.lineTo(5.5, -r + 13);
    ctx.closePath();
    ctx.fillStyle = '#7ef0c0';
    ctx.fill();
    ctx.restore();

    // Wind arrow: blows from the rim toward the middle.
    ctx.save();
    ctx.rotate(twaRel);
    const grad = ctx.createLinearGradient(0, -r, 0, 0);
    grad.addColorStop(0, '#eaf6ff');
    grad.addColorStop(1, 'rgba(234,246,255,0.15)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -r + 5);
    ctx.lineTo(0, -r * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.2);
    ctx.lineTo(-6, -r * 0.42);
    ctx.lineTo(6, -r * 0.42);
    ctx.closePath();
    ctx.fillStyle = '#eaf6ff';
    ctx.fill();
    ctx.restore();

    // The boat, always pointing up.
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(7, 10);
    ctx.lineTo(0, 6);
    ctx.lineTo(-7, 10);
    ctx.closePath();
    ctx.fillStyle = inIrons ? '#ff6b5e' : '#ffd76b';
    ctx.fill();

    ctx.restore();

    ctx.fillStyle = 'rgba(214,236,252,0.8)';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.abs(twaRel * RAD).toFixed(0)}° TWA`, cx, h - 3);
  }

  drawTrim(d) {
    const { ctx, w, h } = fitCanvas(this.trim);
    ctx.clearRect(0, 0, w, h);

    const pad = 10;
    const barW = w - pad * 2;
    const y = h * 0.52;
    const opt = optimalTrim(Math.abs(d.awa));
    const toX = (deg) => pad + (deg / 90) * barW;

    ctx.fillStyle = 'rgba(6,18,30,0.6)';
    ctx.fillRect(pad, y - 9, barW, 18);

    // The band worth living in.
    ctx.fillStyle = 'rgba(126,240,192,0.28)';
    ctx.fillRect(toX(Math.max(0, opt - 6)), y - 9, toX(Math.min(90, opt + 6)) - toX(Math.max(0, opt - 6)), 18);

    ctx.strokeStyle = '#7ef0c0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX(opt), y - 11);
    ctx.lineTo(toX(opt), y + 11);
    ctx.stroke();

    const x = toX(clamp(d.trim, 0, 90));
    ctx.fillStyle = d.luffing ? '#ff6b5e' : '#ffd76b';
    ctx.beginPath();
    ctx.moveTo(x, y - 13);
    ctx.lineTo(x + 5, y - 20);
    ctx.lineTo(x - 5, y - 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 1.5, y - 9, 3, 18);

    ctx.font = '600 9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(214,236,252,0.65)';
    ctx.textAlign = 'left';
    ctx.fillText('IN', pad, y + 22);
    ctx.textAlign = 'right';
    ctx.fillText('OUT', w - pad, y + 22);
    ctx.textAlign = 'center';
    ctx.fillStyle = d.luffing ? '#ff6b5e' : 'rgba(214,236,252,0.85)';
    ctx.fillText(d.luffing ? 'LUFFING' : `α ${d.alpha.toFixed(0)}°`, w / 2, y + 22);
  }

  drawMap(d) {
    const { ctx, w, h } = fitCanvas(this.map);
    ctx.clearRect(0, 0, w, h);
    const b = this.mapBox;
    const sx = w / (b.maxX - b.minX);
    const sz = h / (b.maxZ - b.minZ);
    const s = Math.min(sx, sz);
    const ox = (w - (b.maxX - b.minX) * s) / 2;
    const oz = (h - (b.maxZ - b.minZ) * s) / 2;
    const X = (x) => ox + (x - b.minX) * s;
    // +Z is upwind, and upwind belongs at the top of the picture.
    const Z = (z) => h - (oz + (z - b.minZ) * s);

    ctx.fillStyle = 'rgba(6,20,34,0.66)';
    ctx.fillRect(0, 0, w, h);

    for (const g of d.gusts) {
      const strong = g.strength > 1;
      ctx.beginPath();
      ctx.arc(X(g.x), Z(g.z), g.radius * s, 0, Math.PI * 2);
      ctx.fillStyle = strong ? 'rgba(120,200,255,0.20)' : 'rgba(255,255,255,0.055)';
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(160,200,230,0.3)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i < MARKS.length; i++) {
      const m = MARKS[i];
      if (i === 0) ctx.moveTo(X(m.x), Z(m.z));
      else ctx.lineTo(X(m.x), Z(m.z));
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    MARKS.forEach((m, i) => {
      ctx.beginPath();
      ctx.arc(X(m.x), Z(m.z), i === d.markIndex ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = i === d.markIndex ? '#7ef0c0' : `#${m.color.toString(16).padStart(6, '0')}`;
      ctx.fill();
    });

    for (const boat of d.fleet) {
      ctx.save();
      ctx.translate(X(boat.x), Z(boat.z));
      ctx.rotate(-boat.heading);
      ctx.beginPath();
      ctx.moveTo(0, -5.5);
      ctx.lineTo(3.4, 4);
      ctx.lineTo(-3.4, 4);
      ctx.closePath();
      ctx.fillStyle = boat.isPlayer ? '#ffd76b' : `#${boat.color.toString(16).padStart(6, '0')}`;
      ctx.fill();
      ctx.restore();
    }

    // Wind arrow, corner of the map.
    ctx.save();
    ctx.translate(w - 18, 18);
    ctx.rotate(d.windFrom + Math.PI);
    ctx.strokeStyle = 'rgba(234,246,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.lineTo(-3.5, 3);
    ctx.lineTo(3.5, 3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(234,246,255,0.9)';
    ctx.fill();
    ctx.restore();
  }

  update(d, time) {
    // The instruments have no layout while the HUD is hidden behind an overlay.
    if (this.compass.clientWidth > 20) {
      this.drawCompass(d);
      this.drawTrim(d);
      this.drawMap(d);
    }

    $('speed-val').textContent = (d.speed * 1.94384).toFixed(1);
    $('pos-label').textContent = pointOfSail(Math.abs(d.twa), d.speed);
    $('heel-val').textContent = `${Math.abs(d.heel * RAD).toFixed(0)}°`;
    $('wind-val').textContent = `${(d.windSpeed * 1.94384).toFixed(0)}`;
    $('lap-val').textContent = `${Math.min(d.lap + 1, RACE.laps)}/${RACE.laps}`;
    $('place-val').textContent = `${d.place}/${d.fleetSize}`;
    $('time-val').textContent = formatTime(d.elapsed);
    $('best-val').textContent = d.best ? formatTime(d.best) : '--:--.-';
    $('mark-val').textContent = `${d.markName} ${Math.round(d.markDist)}m`;

    $('stamina-fill').style.width = `${d.stamina}%`;
    $('stamina').classList.toggle('spent', d.stamina < 22);

    const gustEl = $('gust');
    const g = d.gustFactor;
    gustEl.classList.toggle('up', g > 1.06);
    gustEl.classList.toggle('down', g < 0.94);
    gustEl.textContent = g > 1.06 ? 'GUST' : g < 0.94 ? 'LULL' : '';

    const el = $('msg');
    if (time > this.messageUntil) el.classList.remove('show');

    document.body.classList.toggle('penalty', time < this.flashUntil);
    $('assist').classList.toggle('on', d.autoTrim);
  }
}
