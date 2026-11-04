import { HALF, bearingOf, wrap180, fmtClock, clamp } from './world.js';
import { T_RED, FUEL0, equilibriumTe, GOAL_R } from './sim.js';
import { PALETTES } from './scene.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const LADDER_TOP = 1300;

export function createHud() {
  const state = { aid: true };
  const lad = $('ladder'), lx = lad.getContext('2d');
  const mm = $('minimap'), mx = mm.getContext('2d');

  function setFlight(sim) {
    $('h-flight').textContent = sim.F.name;
    const box = $('h-tasks'); box.innerHTML = '';
    sim.F.tasks.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = 'task'; d.id = 'task' + i;
      d.innerHTML = `<span class="tn">${t.kind === 'HWZ' ? '◇' : '✕'} ${t.name}</span><span class="tp">—</span>`;
      box.appendChild(d);
    });
    const m = sim.F.medals, max = sim.F.tasks.length * 1000 + 200;
    ['m1', 'm2', 'm3'].forEach((id, i) => ($(id).style.left = `${(m[i] / max) * 100}%`));
  }

  function toast(html, cls = '', secs = 4) {
    const t = document.createElement('div');
    t.className = 'toast ' + cls; t.innerHTML = html;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), secs * 1000);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }

  function goalBearing(sim, b) {
    const t = sim.F.tasks[b.taskIdx];
    if (!t) return null;
    let best = null;
    for (const [gx, gz] of t.goals) {
      const d = Math.hypot(gx - b.x, gz - b.z);
      if (!best || d < best.d) best = { d, brg: bearingOf(gx - b.x, gz - b.z), x: gx, z: gz };
    }
    return best;
  }

  function drawLadder(sim, b) {
    const w = lad.width, h = lad.height, W = sim.world;
    lx.clearRect(0, 0, w, h);
    const top = 30, bot = h - 10, ys = (agl) => bot - (agl / LADDER_TOP) * (bot - top);
    const gb = goalBearing(sim, b);
    const cx = 64;
    lx.font = '10px ui-monospace, monospace';
    for (let i = 0; i < sim.ladder.length; i++) {
      const L = sim.ladder[i];
      if (L.h > LADDER_TOP) break;
      const y = ys(L.h);
      const spd = Math.hypot(L.x, L.z), to = bearingOf(L.x, L.z);
      const age = sim.t - sim.ladderT[i];
      const alpha = clamp(1 - age / 900, 0.35, 1);
      let col = '200,200,190';
      if (gb) {
        const off = Math.abs(wrap180(to - gb.brg));
        col = off < 15 ? '120,255,150' : off < 40 ? '255,214,90' : '200,200,190';
      }
      lx.strokeStyle = lx.fillStyle = `rgba(${col},${alpha})`;
      const len = 6 + spd * 3.2, a = to * Math.PI / 180;
      const dx = Math.sin(a) * len, dy = -Math.cos(a) * len;
      lx.lineWidth = 2;
      lx.beginPath(); lx.moveTo(cx - dx / 2, y - dy / 2 * 0.5); lx.lineTo(cx + dx / 2, y + dy / 2 * 0.5); lx.stroke();
      const hx = cx + dx / 2, hy = y + dy / 2 * 0.5, ha = Math.atan2(dy * 0.5, dx);
      lx.beginPath(); lx.moveTo(hx, hy); lx.lineTo(hx - 6 * Math.cos(ha - 0.5), hy - 6 * Math.sin(ha - 0.5)); lx.lineTo(hx - 6 * Math.cos(ha + 0.5), hy - 6 * Math.sin(ha + 0.5)); lx.fill();
      if (i % 2 === 0) {
        lx.fillStyle = 'rgba(255,246,226,0.55)';
        lx.fillText(String(L.h).padStart(4, ' '), 2, y + 3);
      }
      lx.fillStyle = `rgba(${col},${alpha})`;
      lx.fillText(`${String(Math.round(to)).padStart(3, '0')}° ${spd.toFixed(1)}`, 112, y + 3);
    }
    // You, your hold, and your real track over the ground.
    const agl = b.y - W.L0;
    const yb = ys(clamp(agl, 0, LADDER_TOP));
    lx.strokeStyle = '#ffd34a'; lx.lineWidth = 1.5;
    lx.beginPath(); lx.moveTo(30, yb); lx.lineTo(w - 4, yb); lx.stroke();
    lx.fillStyle = '#ffd34a';
    lx.beginPath(); lx.moveTo(30, yb); lx.lineTo(22, yb - 5); lx.lineTo(22, yb + 5); lx.fill();
    if (b.hold != null) {
      const yh = ys(clamp(b.hold - W.L0, 0, LADDER_TOP));
      lx.setLineDash([4, 4]); lx.strokeStyle = 'rgba(140,220,255,0.9)';
      lx.beginPath(); lx.moveTo(30, yh); lx.lineTo(w - 4, yh); lx.stroke(); lx.setLineDash([]);
    }
    // Header: bearing to the goal.
    lx.fillStyle = 'rgba(255,246,226,0.85)';
    lx.font = '11px ui-rounded, system-ui, sans-serif';
    if (gb) lx.fillText(`goal ${String(Math.round(gb.brg)).padStart(3, '0')}°  ${(gb.d / 1000).toFixed(2)} km`, 4, 11);
    else lx.fillText('all goals flown — find a field', 4, 11);
  }

  function drawMinimap(sim, b, groundCanvas, predict) {
    const w = mm.width, R = 2600, s = w / (2 * R);
    mx.save();
    mx.clearRect(0, 0, w, w);
    mx.beginPath(); mx.arc(w / 2, w / 2, w / 2, 0, 6.283); mx.clip();
    mx.fillStyle = '#3a4a30'; mx.fillRect(0, 0, w, w);
    if (groundCanvas) {
      const T = groundCanvas.width, k = T / (2 * HALF);
      mx.drawImage(groundCanvas, (b.x - R + HALF) * k, (b.z - R + HALF) * k, 2 * R * k, 2 * R * k, 0, 0, w, w);
    }
    const P = (x, z) => [w / 2 + (x - b.x) * s, w / 2 + (z - b.z) * s];
    // Power lines.
    mx.strokeStyle = 'rgba(30,30,36,0.9)'; mx.lineWidth = 1.5;
    for (const L of sim.world.lines) { mx.beginPath(); L.forEach((sp, i) => { const a = P(...sp.a), c = P(...sp.b); if (!i) mx.moveTo(...a); mx.lineTo(...c); }); mx.stroke(); }
    // Goals.
    sim.F.tasks.forEach((t, ti) => t.goals.forEach(([gx, gz]) => {
      const [px, py] = P(gx, gz);
      const done = ti < b.taskIdx, act = ti === b.taskIdx;
      mx.strokeStyle = done ? 'rgba(255,255,255,0.35)' : t.kind === 'HWZ' ? '#ffb02e' : '#fff';
      mx.lineWidth = act ? 3 : 2;
      mx.beginPath(); mx.moveTo(px - 5, py - 5); mx.lineTo(px + 5, py + 5); mx.moveTo(px + 5, py - 5); mx.lineTo(px - 5, py + 5); mx.stroke();
      if (act) { mx.beginPath(); mx.arc(px, py, GOAL_R * s, 0, 6.283); mx.strokeStyle = 'rgba(255,255,255,0.25)'; mx.lineWidth = 1; mx.stroke(); }
    }));
    // Tracks.
    sim.balloons.forEach((q, i) => {
      const pal = PALETTES[(q.color ?? i) % PALETTES.length];
      if (q.track.length > 1) {
        mx.strokeStyle = q === b ? 'rgba(255,233,168,0.9)' : hex(pal[0]) + '88';
        mx.lineWidth = q === b ? 1.6 : 1;
        mx.beginPath(); q.track.forEach((p, k) => { const [px, py] = P(p[0], p[2]); k ? mx.lineTo(px, py) : mx.moveTo(px, py); }); mx.lineTo(...P(q.x, q.z)); mx.stroke();
      }
      const [px, py] = P(q.x, q.z);
      mx.fillStyle = hex(pal[0]); mx.strokeStyle = '#fff'; mx.lineWidth = q === b ? 2 : 1;
      mx.beginPath(); mx.arc(px, py, q === b ? 5 : 3.5, 0, 6.283); mx.fill(); mx.stroke();
    });
    for (const mk of sim.markers) {
      const [px, py] = P(mk.x, mk.z);
      mx.fillStyle = mk.who === b.id ? '#ffd34a' : 'rgba(255,255,255,0.6)';
      mx.fillRect(px - 2, py - 2, 4, 4);
    }
    if (predict) { const [px, py] = P(predict.x, predict.z); mx.strokeStyle = '#ffe14a'; mx.lineWidth = 1.5; mx.beginPath(); mx.arc(px, py, 4, 0, 6.283); mx.stroke(); }
    // Pibals.
    for (const pb of sim.pibals) if (pb.alive) { const [px, py] = P(pb.x, pb.z); mx.fillStyle = '#fff'; mx.fillRect(px - 1, py - 1, 2, 2); }
    mx.restore();
    mx.fillStyle = 'rgba(255,246,226,0.8)'; mx.font = 'bold 11px system-ui'; mx.fillText('N', w / 2 - 4, 12);
  }

  function update(sim, b, extra = {}) {
    const W = sim.world, F = sim.F;
    const clock = F.clock + sim.t / 3600;
    $('h-clock').textContent = fmtClock(clock);
    const tl = F.thermals - sim.t, dl = F.deadline - sim.t;
    $('h-time').textContent = tl > 0 ? `thermals in ${Math.ceil(tl / 60)} min` : `land within ${Math.max(0, Math.ceil(dl / 60))} min`;
    $('h-time').className = tl > 0 ? 'dim small' : 'warn small';
    F.tasks.forEach((t, i) => {
      const el = $('task' + i); if (!el) return;
      const s = b.score.tasks[i];
      el.className = 'task' + (i === b.taskIdx ? ' act' : '') + (s ? ' done' : '');
      el.querySelector('.tp').textContent = s ? (s.skipped ? 'skipped' : `${s.pts} · ${Math.round(s.d)} m`) : i < b.taskIdx ? 'falling…' : '—';
    });
    const tot = b.score.total, max = F.tasks.length * 1000 + 200;
    $('h-total').textContent = tot;
    $('h-fill').style.width = `${clamp(tot / max, 0, 1) * 100}%`;
    $('h-markers').textContent = '●'.repeat(b.markersLeft) + '○'.repeat(Math.max(0, 4 - b.markersLeft));

    const g = W.ground(b.x, b.z), agl = b.y - g;
    $('i-agl').textContent = Math.max(0, Math.round(agl));
    $('i-msl').textContent = `${Math.round(b.y - W.L0)} m above launch`;
    const vs = b.vy;
    $('i-vs').textContent = (vs >= 0 ? '+' : '') + vs.toFixed(1);
    $('i-vs').className = vs > 0.3 ? 'up' : vs < -0.3 ? 'dn' : '';
    $('i-vbar').style.height = `${clamp(Math.abs(vs) / 4, 0, 1) * 50}%`;
    $('i-vbar').style.bottom = vs >= 0 ? '50%' : `${50 - clamp(Math.abs(vs) / 4, 0, 1) * 50}%`;
    $('i-vbar').style.background = vs >= 0 ? '#7dffa0' : '#ff8a6a';
    const te = b.Te - 273.15, eq = equilibriumTe(sim, b, b.y) - 273.15;
    $('i-te').textContent = `${te.toFixed(0)}°C`;
    $('i-te').className = b.Te > T_RED - 5 ? 'warn' : '';
    const tpos = (c) => clamp((c - 40) / (125 - 40), 0, 1) * 100;
    $('i-tfill').style.width = `${tpos(te)}%`;
    $('i-teq').style.left = `${tpos(eq)}%`;
    $('i-fuel').style.width = `${(b.fuel / FUEL0) * 100}%`;
    $('i-fueltxt').textContent = `${Math.round((b.fuel / FUEL0) * 100)}%`;
    $('i-burn').classList.toggle('on', !!b.burner);
    $('i-vent').classList.toggle('on', b.vent > 0.05);
    $('i-hold').textContent = b.hold != null ? `HOLD ${Math.round(b.hold - W.L0)} m` : 'HOLD off';
    $('i-hold').classList.toggle('on', b.hold != null);
    const spd = Math.hypot(b.vx, b.vz);
    $('i-trk').textContent = `${String(Math.round(bearingOf(b.vx, b.vz))).padStart(3, '0')}° · ${spd.toFixed(1)} m/s`;
    $('i-speed').textContent = extra.speed > 1 ? `▶▶ ×${extra.speed}` : '';

    // Prompt line.
    const fd = W.fieldAt(b.x, b.z);
    let msg = '';
    if (b.wire && b.wire.d < 220 && b.wire.h > b.y - 12 && b.wire.h < b.y + 50) msg = `<span class="warn">⚠ POWER LINE ${Math.round(b.wire.d)} m — wires at ${Math.round(b.wire.h - g)} m</span>`;
    else if (!b.flying) msg = 'Hold <kbd>Space</kbd> to burn and take off';
    else if (agl < 60) msg = `Below: <b class="${fd.legal ? 'ok' : 'warn'}">${fd.name}</b>${fd.legal ? ' — fine to land' : ' — do not land here'}`;
    else if (extra.predict && state.aid) msg = `Marker would land <b>${Math.round(extra.predict.d)} m</b> from the goal · <kbd>M</kbd> to drop`;
    if (b.taskIdx >= F.tasks.length && b.flying && agl < 60 && fd.legal) msg += ' · vent (<kbd>X</kbd>) to put down';
    $('prompt').innerHTML = msg;

    drawLadder(sim, b);
    drawMinimap(sim, b, extra.groundCanvas, state.aid ? extra.predict : null);
  }

  return { state, setFlight, toast, update, goalBearing };
}
