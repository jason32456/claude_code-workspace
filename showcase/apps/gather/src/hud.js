import { TOOLS } from './input.js';

const $ = (id) => document.getElementById(id);

export const el = {
  hud: $('hud'),
  overlay: $('overlay'),
  title: $('title-screen'),
  brief: $('brief-screen'),
  score: $('score-screen'),
  end: $('end-screen'),
  toast: $('toast'),
  tools: $('tools'),
  toolTip: $('tool-tip'),
  heatwash: $('heatwash'),
};

export function buildToolList(onPick) {
  el.tools.innerHTML = '';
  TOOLS.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'tool';
    row.dataset.i = i;
    row.style.color = '#' + t.color.toString(16).padStart(6, '0');
    row.innerHTML = `<kbd>${i + 1}</kbd><span class="swatch"></span><span class="tl">${t.label}</span>`;
    row.style.pointerEvents = 'auto';
    row.addEventListener('click', () => onPick(i));
    el.tools.appendChild(row);
  });
}

export function setTool(i) {
  [...el.tools.children].forEach((c, j) => {
    c.classList.toggle('on', j === i);
    c.querySelector('.tl').style.color = j === i ? '' : '#9d958a';
  });
  el.toolTip.textContent = TOOLS[i].hint;
}

export function toast(text, color = '#ff7a4a') {
  el.toast.textContent = text;
  el.toast.style.color = color;
  el.toast.classList.remove('show');
  void el.toast.offsetWidth;
  el.toast.classList.add('show');
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function updateGauges(g, secondsLeft) {
  const T = g.meanTemp();
  const tipT = g.tipTemp();
  $('temp-fill').style.width = clamp((T - 300) / (1180 - 300), 0, 1) * 100 + '%';
  $('temp-num').textContent = Math.round(tipT) + '°';
  $('temp-soft').style.left = ((620 - 300) / 880) * 100 + '%';
  $('temp-melt').style.left = ((1080 - 300) / 880) * 100 + '%';

  const sp = clamp(Math.abs(g.omega) / 11, 0, 1);
  $('spin-fill').style.width = sp * 100 + '%';
  $('spin-num').textContent = Math.abs(g.omega).toFixed(1);
  $('spin-mid').style.left = (3.2 / 11) * 100 + '%';

  $('blow-fill').style.width = g.pressure * 100 + '%';
  $('blow-num').textContent = Math.round(g.pressure * 100) + '%';

  $('wall-num').textContent = (g.meanWall() * 10).toFixed(1);
  $('len-num').textContent = g.L.toFixed(1);
  $('sag-warn').classList.toggle('hidden', g.maxSag() < 0.8);

  const m = Math.max(0, Math.floor(secondsLeft / 60));
  const s = Math.max(0, Math.floor(secondsLeft % 60));
  const c = $('clock');
  c.textContent = `${m}:${String(s).padStart(2, '0')}`;
  c.classList.toggle('urgent', secondsLeft < 20);
}

export function setOrderCard(order, index, results) {
  $('order-num').textContent = index + 1;
  $('order-name').textContent = order.name;
  $('order-brief').textContent = order.brief;
  $('order-hint').textContent = order.hint;
  $('order-form').textContent = order.open ? 'OPEN FORM' : 'CLOSED FORM';
  drawProfile($('silhouette'), order, null);
  const pips = $('order-pips');
  pips.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span');
    if (i < results.length) s.className = results[i].total >= 60 ? 'done' : 'fail';
    else if (i === index) s.className = 'now';
    pips.appendChild(s);
  }
}

export function setShiftScore(v) {
  $('shift-score').textContent = v;
}

// Silhouette: target as a filled outline, the live piece drawn over it.
export function drawProfile(canvas, order, glass) {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const samples = 48;
  const tgt = [];
  let maxR = 0;
  let maxL = order.length;
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const r = order.r(u);
    tgt.push([u * order.length, r]);
    maxR = Math.max(maxR, r);
  }
  let mine = null;
  if (glass) {
    mine = [];
    const p = glass.profile(samples);
    for (let i = 0; i < samples; i++) {
      mine.push([(i / (samples - 1)) * glass.L, p[i]]);
      maxR = Math.max(maxR, p[i]);
    }
    maxL = Math.max(maxL, glass.L);
  }

  const pad = 8;
  const sx = (w - pad * 2) / maxL;
  const sy = (h / 2 - pad - 5) / maxR;
  const s = Math.min(sx, sy);
  const ox = (w - maxL * s) / 2;
  const oy = h / 2;

  const path = (pts) => {
    c.beginPath();
    pts.forEach(([z, r], i) => {
      const x = ox + z * s;
      const y = oy - r * s;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    for (let i = pts.length - 1; i >= 0; i--) {
      c.lineTo(ox + pts[i][0] * s, oy + pts[i][1] * s);
    }
    c.closePath();
  };

  c.strokeStyle = 'rgba(255,255,255,0.13)';
  c.setLineDash([3, 4]);
  c.beginPath();
  c.moveTo(pad, oy);
  c.lineTo(w - pad, oy);
  c.stroke();
  c.setLineDash([]);

  path(tgt);
  c.fillStyle = 'rgba(99,182,255,0.13)';
  c.fill();
  c.strokeStyle = 'rgba(99,182,255,0.7)';
  c.lineWidth = 1.4;
  c.stroke();

  if (mine) {
    path(mine);
    c.fillStyle = 'rgba(255,140,50,0.2)';
    c.fill();
    c.strokeStyle = 'rgba(255,160,70,0.95)';
    c.lineWidth = 1.6;
    c.stroke();
  }

  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.font = '9px system-ui, sans-serif';
  c.fillText('BASE', ox, h - 2);
  c.textAlign = 'right';
  c.fillText(order.open ? 'RIM' : 'SEALED', ox + maxL * s, h - 2);
  c.textAlign = 'left';
}

export function showPanel(which) {
  for (const p of [el.title, el.brief, el.score, el.end]) p.classList.add('hidden');
  if (!which) {
    el.overlay.classList.add('hidden');
    return;
  }
  el.overlay.classList.remove('hidden');
  which.classList.remove('hidden');
}

export function fillBrief(order, index) {
  $('brief-num').textContent = index + 1;
  $('brief-name').textContent = order.name;
  $('brief-buyer').textContent = order.buyer;
  $('brief-body').textContent = order.brief;
  $('brief-hint').textContent = order.hint;
  requestAnimationFrame(() => drawProfile($('brief-shape'), order, null));
}

export function fillScore(result, order, glass, ruined) {
  $('score-kicker').textContent = ruined ? ruined : 'BENCHED';
  $('score-grade').textContent = ruined ? 'LOSS' : result.grade;
  $('score-total').innerHTML = `<b>${result.total}</b><span>/100</span>`;
  const parts = $('score-parts');
  parts.innerHTML = '';
  for (const [label, v] of result.parts) {
    const row = document.createElement('div');
    row.className = 'part';
    row.innerHTML = `<span class="pl">${label.toUpperCase()}</span><span class="pb"><div style="width:${v}%"></div></span><span class="pv">${v}</span>`;
    parts.appendChild(row);
  }
  $('score-note').textContent = result.note;
  requestAnimationFrame(() => drawProfile($('score-shape'), order, glass));
}

export function fillEnd(results, orders) {
  const total = results.reduce((a, r) => a + r.total, 0);
  $('end-total').innerHTML = `<b>${total}</b><span>/500</span>`;
  const rank =
    total >= 430 ? 'MAESTRO' : total >= 350 ? 'GAFFER' : total >= 260 ? 'JOURNEYMAN' : total >= 170 ? 'APPRENTICE' : 'SWEEPING UP';
  $('end-rank').textContent = rank;
  const list = $('end-list');
  list.innerHTML = '';
  results.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'endrow';
    row.innerHTML = `<span>${orders[i].name} <span style="color:#6b645c">· ${r.grade}</span></span><span>${r.total}</span>`;
    list.appendChild(row);
  });
}
