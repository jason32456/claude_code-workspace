import { D2R, wrap180, bearingOf, dirOf } from './world.js';
import { colonyCounts, nearEntrance, M_PER_S, isOpen } from './sim.js';

const $ = (id) => document.getElementById(id);
export const fmtClock = (h) => { const m = Math.floor(h * 60 + 1e-6); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const fmtH = (h) => (h >= 24 ? 'dusk' : fmtClock(h));
const stars = (q) => '★★★★★'.slice(0, Math.max(1, Math.round(q * 5))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(1, Math.round(q * 5)));
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

export function createHud() {
  const toasts = $('toasts'), labels = $('labels');
  const labelEls = new Map();
  let memKey = '', sim = null;
  const state = { mapSunUp: false, assist: false };

  function setDay(s) {
    sim = s;
    $('h-day').textContent = s.day.name;
    const g = s.day.targets[2] * 1.15;
    ['m1', 'm2', 'm3'].forEach((id, i) => ($(id).style.left = `${(s.day.targets[i] / g) * 100}%`));
    state.mapSunUp = s.day.sunUp; state.assist = s.day.sunUp;
    memKey = ''; labels.innerHTML = ''; labelEls.clear(); toasts.innerHTML = '';
  }

  function toast(html, cls = '', dur = 3) {
    const d = document.createElement('div');
    d.className = 'toast ' + cls; d.innerHTML = html; toasts.appendChild(d);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => d.remove(), dur * 1000);
  }

  function drawTape(s) {
    const c = $('tapec'), g = c.getContext('2d'), W = c.width, H = c.height, P = s.player;
    g.clearRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(30,20,8,0)'); grd.addColorStop(0.15, 'rgba(30,20,8,0.6)'); grd.addColorStop(0.85, 'rgba(30,20,8,0.6)'); grd.addColorStop(1, 'rgba(30,20,8,0)');
    g.fillStyle = grd; g.fillRect(0, 8, W, 30);
    const fov = 140, px = (b) => W / 2 + (wrap180(b - P.yaw) / fov) * W;
    g.textAlign = 'center'; g.font = '600 11px system-ui';
    for (let b = 0; b < 360; b += 15) {
      const x = px(b); if (x < 0 || x > W) continue;
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[b];
      g.fillStyle = card ? '#fff6e2' : 'rgba(255,246,226,0.5)';
      g.fillRect(x - 0.5, 30, 1, card ? 8 : 5);
      if (card) g.fillText(card, x, 27); else if (b % 45 === 0) g.fillText(b, x, 27);
    }
    const mark = (b, txt, col, y = 20) => {
      let x = px(b), off = false;
      if (x < 12) { x = 12; off = true; } if (x > W - 12) { x = W - 12; off = true; }
      g.fillStyle = col; g.font = (off ? '16px' : '20px') + ' system-ui'; g.fillText(txt, x, y);
    };
    mark(s.sun.az, '☀', '#ffd34a', 22);
    mark(bearingOf(-P.x, -P.z), '⌂', '#ffffff', 22);
    g.fillStyle = '#f5b82a'; g.beginPath(); g.moveTo(W / 2 - 6, 44); g.lineTo(W / 2 + 6, 44); g.lineTo(W / 2, 37); g.fill();
  }

  function drawMinimap(s) {
    const c = $('minimap'), g = c.getContext('2d'), W = c.width, R = W / 2, P = s.player, sc = (R - 8) / 1650;
    g.clearRect(0, 0, W, W);
    g.save(); g.beginPath(); g.arc(R, R, R - 1, 0, 7); g.clip();
    g.fillStyle = 'rgba(40,60,20,0.55)'; g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let k = 1; k <= 6; k++) { g.beginPath(); g.arc(R, R, k * 250 * sc, 0, 7); g.stroke(); }
    for (const p of s.patches) {
      const m = P.mem[p.id];
      g.globalAlpha = m ? 0.95 : 0.4;
      g.fillStyle = p.color; g.beginPath(); g.arc(R + p.x * sc, R + p.z * sc, Math.max(3, p.r * sc), 0, 7); g.fill();
      if (m && p.toxic) { g.fillStyle = '#ff6a5a'; g.font = '10px system-ui'; g.fillText('☠', R + p.x * sc + 5, R + p.z * sc - 4); }
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,215,90,0.85)';
    for (const b of s.bees) if (b.s !== 'idle' && b.s !== 'dead' && b.s !== 'unload') g.fillRect(R + b.x * sc - 0.6, R + b.z * sc - 0.6, 1.4, 1.4);
    const [sx, sz] = dirOf(s.sun.az);
    g.strokeStyle = 'rgba(255,211,74,0.7)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(R, R); g.lineTo(R + sx * R, R + sz * R); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ffd34a'; g.font = '14px system-ui'; g.textAlign = 'center'; g.fillText('☀', R + sx * (R - 14), R + sz * (R - 14) + 5);
    g.fillStyle = '#fff'; g.fillRect(R - 3, R - 3, 6, 6);
    g.save(); g.translate(R + P.x * sc, R + P.z * sc); g.rotate(P.yaw * D2R);
    g.fillStyle = '#f5b82a'; g.strokeStyle = '#2a1a05'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.fillStyle = 'rgba(255,246,226,0.7)'; g.font = '700 10px system-ui'; g.fillText('N', R, 12);
    g.restore();
  }

  function drawDanceMap(s) {
    const c = $('dancemap'), g = c.getContext('2d'), W = c.width, R = W / 2, P = s.player, D = s.dance;
    const seen = P.sunSeen.az, rot = state.mapSunUp ? -seen : 0;
    let maxd = 600;
    for (const id of P.memOrder) maxd = Math.max(maxd, P.mem[id].dist + 150);
    const sc = (R - 16) / maxd;
    const pt = (b, d) => { const a = (b + rot) * D2R; return [R + Math.sin(a) * d * sc, R - Math.cos(a) * d * sc]; };
    g.clearRect(0, 0, W, W);
    g.fillStyle = 'rgba(20,12,4,0.6)'; g.beginPath(); g.arc(R, R, R - 2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,220,150,0.13)'; g.fillStyle = 'rgba(255,246,226,0.4)'; g.font = '9px system-ui'; g.textAlign = 'left';
    for (let d = 250; d < maxd; d += 250) { g.beginPath(); g.arc(R, R, d * sc, 0, 7); g.stroke(); g.fillText(`${d} m · ${(d / M_PER_S).toFixed(0)} s`, R + 3, R - d * sc + 10); }
    if (!state.mapSunUp) { g.fillStyle = 'rgba(255,246,226,0.6)'; g.font = '700 10px system-ui'; g.textAlign = 'center'; g.fillText('N', R, 11); }
    // sun as last seen
    const [ex, ey] = pt(seen, maxd);
    g.strokeStyle = '#ffd34a'; g.lineWidth = 2; g.beginPath(); g.moveTo(R, R); g.lineTo(ex, ey); g.stroke(); g.lineWidth = 1;
    g.fillStyle = '#ffd34a'; g.font = '16px system-ui'; g.textAlign = 'center';
    const [lx, ly] = pt(seen, maxd * 0.9); g.fillText('☀', lx, ly + 5);
    // patches
    const sel = D.forPatch ? P.mem[D.forPatch] : null;
    for (const id of P.memOrder) {
      const m = P.mem[id], [x, y] = pt(m.bearing, m.dist);
      g.fillStyle = m.color; g.beginPath(); g.arc(x, y, id === D.forPatch ? 7 : 5, 0, 7); g.fill();
      if (id === D.forPatch) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.lineWidth = 1; }
      g.fillStyle = 'rgba(255,246,226,0.85)'; g.font = '10px system-ui'; g.fillText(m.name.split(' ')[0] + (m.toxic ? ' ☠' : ''), x, y - 9);
    }
    if (sel) {
      const [x, y] = pt(sel.bearing, sel.dist);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(R, R); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      const a0 = (seen + rot - 90) * D2R, da = wrap180(sel.bearing - seen) * D2R;
      g.strokeStyle = 'rgba(125,255,176,0.8)'; g.beginPath(); g.arc(R, R, 34, a0, a0 + da, da < 0); g.stroke();
    }
    // runs this session: what you said, against the sun you remember
    D.runs.forEach((r, i) => {
      const [x, y] = pt(seen + r.angle, r.dist);
      g.fillStyle = i === D.runs.length - 1 ? '#ffffff' : 'rgba(255,255,255,0.45)';
      g.beginPath(); g.arc(x, y, i === D.runs.length - 1 ? 3.5 : 2.2, 0, 7); g.fill();
    });
    if (D.state === 'run') {
      const [x, y] = pt(seen + D.th, D.t * M_PER_S);
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(R, R); g.lineTo(x, y); g.stroke(); g.lineWidth = 1;
    }
    g.fillStyle = '#fff'; g.fillRect(R - 3, R - 3, 6, 6);

    const ago = Math.round((s.hour - P.sunSeen.hour) * 60);
    let info = `<span class="dim">Sun last seen <b style="color:${ago > 20 ? '#ff9a7a' : '#fff6e2'}">${ago} min ago</b> at ${Math.round(seen)}°.</span>`;
    if (sel) {
      const p = s.patches[sel.i], open = isOpen(s, p);
      info = `Dancing for <b style="color:${sel.color}">${sel.name}</b> ${stars(sel.q)}${sel.toxic ? ' <span class="warn">☠ sprayed</span>' : ''}${!open ? ' <span class="warn">closed now</span>' : ''}<br>` + info;
      if (state.assist) info += `<br><span style="color:#7dffb0">Run at ${wrap180(sel.bearing - seen) >= 0 ? '+' : ''}${Math.round(wrap180(sel.bearing - seen))}° from up, for ${(sel.dist / M_PER_S).toFixed(1)} s</span>`;
    } else info = 'You have nothing to dance about yet. <b>E</b> to fly out and taste something.<br>' + info;
    $('dm-info').innerHTML = info;
    const t = D.state === 'run' ? D.t : D.runs.length ? D.runs[D.runs.length - 1].dur : 0;
    $('dm-sec').textContent = t.toFixed(1); $('dm-m').textContent = Math.round(t * M_PER_S);
    $('dm-mode').textContent = state.mapSunUp ? '· M: sun-up' : '· M: north-up';
  }

  function memList(s) {
    const P = s.player, sel = s.dance?.forPatch ?? null;
    const key = P.memOrder.join() + '|' + sel + '|' + Math.floor(s.hour * 4);
    if (key === memKey) return;
    memKey = key;
    if (!P.memOrder.length) return;
    $('mem-list').innerHTML = P.memOrder.map((id, i) => {
      const m = P.mem[id], p = s.patches[m.i], open = isOpen(s, p);
      const win = m.window[0] > 0 || m.window[1] < 24 ? ` · blooms ${fmtH(m.window[0])}–${fmtH(m.window[1])}` : '';
      const warn = m.toxic ? '<span class="warn">☠ sprayed, bitter</span>' : p.hornet ? '<span class="warn">hornets!</span>' : !open ? '<span class="warn">closed</span>' : '';
      return `<div class="mrow ${id === sel ? 'sel' : ''}"><span class="sw" style="background:${m.color}"></span><span class="nm">${i + 1}. ${m.name}</span><span class="st">${stars(m.q)}</span>
        <span class="vv">${Math.round(m.bearing)}° · ${fmtDist(m.dist)} · ${(m.dist / M_PER_S).toFixed(1)} s${win} ${warn}</span></div>`;
    }).join('');
  }

  function patchLabels(s, scene) {
    const P = s.player;
    for (const p of s.patches) {
      const m = P.mem[p.id];
      let el = labelEls.get(p.id);
      if (!m || P.inHive) { if (el) el.style.display = 'none'; continue; }
      if (!el) { el = document.createElement('div'); el.className = 'plabel'; labels.appendChild(el); labelEls.set(p.id, el); }
      const pr = scene.project(p.x, p.y + 12, p.z);
      const d = Math.hypot(P.x - p.x, P.z - p.z);
      if (!pr.vis || d > 1400) { el.style.display = 'none'; continue; }
      el.style.display = 'block'; el.style.left = pr.x + 'px'; el.style.top = pr.y + 'px';
      el.style.borderColor = p.color; el.style.opacity = d < 40 ? 0.3 : 1;
      const html = `${p.name} <span class="st">${stars(p.q)}</span>${p.toxic ? ' ☠' : ''} <span class="dim">${Math.round((100 * p.stock) / p.cap)}%</span>`;
      if (el.innerHTML !== html) el.innerHTML = html;
    }
  }

  function update(s, scene) {
    const P = s.player;
    document.body.classList.toggle('inhive', P.inHive);
    $('h-clock').textContent = fmtClock(s.hour);
    $('h-sun').textContent = `sun ${Math.round(s.sun.az)}° · ${Math.round(s.sun.alt)}° up`;
    $('h-nectar').textContent = Math.round(s.nectar).toLocaleString();
    $('h-fill').style.width = `${Math.min(100, (s.nectar / (s.day.targets[2] * 1.15)) * 100)}%`;
    const c = colonyCounts(s);
    $('h-idle').textContent = c.idle; $('h-out').textContent = c.out; $('h-dead').textContent = c.dead;
    $('h-energy').style.width = `${P.energy * 100}%`;
    $('h-flight').textContent = `${Math.round(P.speed)} m/s · ${Math.round(P.y - s.ground(P.x, P.z))} m up · home ${fmtDist(Math.hypot(P.x, P.z))}`;
    memList(s);
    $('dancepanel').classList.toggle('hidden', !P.inHive);
    let prompt = '';
    if (P.inHive) drawDanceMap(s);
    else {
      drawTape(s); drawMinimap(s); patchLabels(s, scene);
      if (P.exhausted) prompt = 'Out of honey: land on open flowers or crawl home';
      else if (P.sipPatch >= 0) prompt = P.sip < 1 ? `Tasting ${s.patches[P.sipPatch].name}…` : `${s.patches[P.sipPatch].name}: tasted. Sipping refills your crop`;
      else if (nearEntrance(s)) prompt = 'Fly into the entrance or press E to go in and dance';
      else {
        for (const p of s.patches) {
          const d = Math.hypot(P.x - p.x, P.z - p.z);
          if (d < p.r + 30 && !P.mem[p.id]) { prompt = `${p.name}: drop below 6 m and slow down (S) to taste`; break; }
        }
      }
    }
    if (P.inHive) { patchLabels(s, scene); }
    $('prompt').textContent = prompt;
  }

  return { setDay, update, toast, state, stars };
}
