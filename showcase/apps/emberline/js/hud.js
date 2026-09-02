import { WORLD, N, PLANE } from './config.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
export const clock = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      load: $('load-fill'),
      loadVal: $('load-val'),
      speed: $('speed-val'),
      agl: $('agl-val'),
      aglBox: $('agl-box'),
      ha: $('ha-val'),
      cont: $('cont-val'),
      contFill: $('cont-fill'),
      struct: $('struct-val'),
      mission: $('mission-val'),
      time: $('time-val'),
      windVal: $('wind-val'),
      forecast: $('forecast'),
      msg: $('msg'),
      warn: $('warn'),
      mode: $('mode-val'),
      reticle: $('reticle'),
    };
    this.map = $('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.compass = $('compass');
    this.compCtx = this.compass.getContext('2d');
    this.msgT = 0;
    this.mapAcc = 0;
  }

  say(text, kind = '') {
    this.el.msg.textContent = text;
    this.el.msg.className = kind;
    this.msgT = 3.2;
  }

  update(dt, g) {
    const p = g.plane;
    const f = g.fire;
    const e = this.el;

    const loadPct = (p.load / PLANE.capacity) * 100;
    e.load.style.width = `${loadPct}%`;
    e.load.className = loadPct < 20 ? 'low' : '';
    e.loadVal.textContent = `${Math.round(p.load)} L`;
    e.speed.textContent = Math.round(p.speed);
    const agl = Math.max(0, p.agl);
    e.agl.textContent = Math.round(agl);
    e.aglBox.className = agl < PLANE.warnAlt ? 'stat danger' : agl < 70 ? 'stat good' : 'stat';

    e.ha.textContent = Math.round(f.hectares);
    const c = Math.round(f.containment * 100);
    e.cont.textContent = `${c}%`;
    e.contFill.style.width = `${c}%`;
    e.struct.textContent = `${g.structuresSafe}/${g.structures.length}`;
    e.time.textContent = clock(g.elapsed);
    e.windVal.textContent = `${Math.round(g.wind.speed)} m/s ${bearing(g.wind.dir)}`;
    e.mode.textContent = g.rig.name.toUpperCase();

    if (g.nextShift) {
      const left = Math.max(0, g.nextShift.t - g.elapsed);
      e.forecast.textContent = `SHIFT ${clock(left)} → ${bearing(g.nextShift.dir)} ${g.nextShift.speed} m/s`;
      e.forecast.className = left < 30 ? 'soon' : '';
    } else {
      e.forecast.textContent = 'FORECAST STEADY';
      e.forecast.className = '';
    }

    const warns = [];
    if (agl < PLANE.warnAlt && p.alive) warns.push('PULL UP');
    if (p.load < 400) warns.push('LOAD EMPTY — SCOOP AT THE LAKE');
    if (p.outOfBounds) warns.push('LEAVING THE FIRE GROUND');
    if (g.threatened > 0) warns.push(`${g.threatened} STRUCTURE${g.threatened > 1 ? 'S' : ''} THREATENED`);
    e.warn.textContent = warns.join('   ·   ');

    this.msgT -= dt;
    e.msg.style.opacity = this.msgT > 0 ? 1 : 0;

    this.compassDraw(g);
    this.mapAcc += dt;
    if (this.mapAcc > 0.12) {
      this.mapAcc = 0;
      this.mapDraw(g);
    }
  }

  compassDraw(g) {
    const c = this.compCtx;
    const s = this.compass.width;
    const r = s / 2 - 6;
    c.clearRect(0, 0, s, s);
    c.translate(s / 2, s / 2);

    c.strokeStyle = 'rgba(255,220,180,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, 0, r, 0, 6.29);
    c.stroke();

    c.fillStyle = 'rgba(255,225,190,0.55)';
    c.font = '9px ui-monospace, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [lbl, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
      const rad = (a * Math.PI) / 180;
      c.fillText(lbl, Math.sin(rad) * (r - 7), -Math.cos(rad) * (r - 7));
    }

    // wind arrow — points the way the wind is pushing the fire
    const wr = (g.wind.dir * Math.PI) / 180;
    c.rotate(wr);
    c.fillStyle = '#ff8a3c';
    c.beginPath();
    c.moveTo(0, -r + 12);
    c.lineTo(6, 4);
    c.lineTo(0, 0);
    c.lineTo(-6, 4);
    c.closePath();
    c.fill();
    c.rotate(-wr);

    // aircraft heading tick
    const hr = g.plane.heading;
    c.rotate(hr);
    c.strokeStyle = '#9fe8ff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -r + 2);
    c.lineTo(0, -r + 9);
    c.stroke();
    c.rotate(-hr);

    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  mapDraw(g) {
    const c = this.mapCtx;
    const S = this.map.width;
    c.clearRect(0, 0, S, S);
    c.imageSmoothingEnabled = false;
    c.drawImage(g.terrain.canvas, 0, 0, S, S);

    const toMap = (x, z) => [((x + WORLD / 2) / WORLD) * S, ((z + WORLD / 2) / WORLD) * S];

    // active flame front
    c.fillStyle = '#ffcf6a';
    const b = g.fire.burning;
    const step = Math.max(1, Math.floor(b.length / 900));
    for (let i = 0; i < b.length; i += step) {
      const k = b[i];
      c.fillRect(((k % N) / N) * S - 1, (((k / N) | 0) / N) * S - 1, 2.5, 2.5);
    }

    for (const s of g.structures) {
      const [x, y] = toMap(s.x, s.z);
      c.fillStyle = s.lost ? '#4a4a4a' : s.threat > 0 ? '#ff5a3c' : '#eaf3ff';
      c.fillRect(x - 2, y - 2, 4, 4);
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 0.7;
      c.strokeRect(x - 2, y - 2, 4, 4);
    }

    const [px, py] = toMap(g.plane.pos.x, g.plane.pos.z);
    c.save();
    c.translate(px, py);
    c.rotate(g.plane.heading);
    c.fillStyle = '#9fe8ff';
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(4.5, 5);
    c.lineTo(0, 2.5);
    c.lineTo(-4.5, 5);
    c.closePath();
    c.fill();
    c.restore();

    const wr = (g.wind.dir * Math.PI) / 180;
    c.save();
    c.translate(S - 18, 18);
    c.rotate(wr);
    c.strokeStyle = '#ff8a3c';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(0, 9);
    c.moveTo(0, 9);
    c.lineTo(4, 3);
    c.moveTo(0, 9);
    c.lineTo(-4, 3);
    c.stroke();
    c.restore();
  }
}

export function bearing(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
