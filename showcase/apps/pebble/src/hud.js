import { FAR_TEE, FAR_HOG, BACK_LINE, HALF_W, HOUSE_R, RING8, RING4, BUTTON, STONE_R, STONES_PER_TEAM } from './constants.js';

const $ = (id) => document.getElementById(id);

// The first 60% of the meter covers the draw range slowly; the rest covers hits.
const DRAW_LO = 1.85;
const DRAW_HI = 2.4;
const MAX_V = 4.2;
export function meterToV(t) {
  return t <= 0.6 ? DRAW_LO + (DRAW_HI - DRAW_LO) * (t / 0.6) : DRAW_HI + (MAX_V - DRAW_HI) * ((t - 0.6) / 0.4);
}
export function vToMeter(v) {
  return v <= DRAW_HI ? (0.6 * (v - DRAW_LO)) / (DRAW_HI - DRAW_LO) : 0.6 + (0.4 * (v - DRAW_HI)) / (MAX_V - DRAW_HI);
}

const MARKS = [
  [1.97, 'Hog line'],
  [2.06, 'Guard'],
  [2.13, 'Top of house'],
  [2.21, 'Button'],
  [2.285, 'Back line'],
  [2.6, 'Tap'],
  [3.2, 'Takeout'],
  [3.9, 'Peel'],
];

export function buildMeter() {
  const marks = $('meter-marks');
  marks.innerHTML = '';
  const h = () => $('meter').clientHeight;
  for (const [v, label] of MARKS) {
    const d = document.createElement('div');
    d.style.bottom = `${vToMeter(v) * 100}%`;
    const s = document.createElement('span');
    s.textContent = label;
    d.appendChild(s);
    marks.appendChild(d);
  }
  return h;
}

export function setMeter(t) {
  $('meter-fill').style.height = `${Math.min(1, t) * 100}%`;
}

export function show(id, on) {
  $(id).classList.toggle('hidden', !on);
}

const TEAM_NAME = { red: 'Red', yellow: 'Yellow' };

export function renderBoard(game, humanLabel) {
  const n = Math.max(game.ends, game.end);
  let html = '<tr><th></th>';
  for (let i = 1; i <= n; i++) html += `<th class="ends">${i > game.ends ? 'X' : i}</th>`;
  html += '<th>TOT</th></tr>';
  for (const team of ['red', 'yellow']) {
    const left = game.left?.[team] ?? STONES_PER_TEAM;
    html += `<tr><td class="team"><i style="background:var(--${team})"></i>${humanLabel(team)}${game.hammer === team ? '<span class="ham" title="hammer">◆</span>' : ''}<span class="left">${'●'.repeat(left)}${'○'.repeat(STONES_PER_TEAM - left)}</span></td>`;
    for (let i = 1; i <= n; i++) {
      const v = game.score[team][i - 1];
      html += `<td class="ends${i === game.end ? ' cur' : ''}">${v === undefined ? '' : v}</td>`;
    }
    html += `<td class="tot">${game.score[team].reduce((a, b) => a + b, 0)}</td></tr>`;
  }
  $('board').innerHTML = html;
}

const TOP = BACK_LINE + 0.55;
export function drawHouse(stones, highlight = null, broomX = null) {
  const c = $('house');
  const g = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  const k = W / (HALF_W * 2);
  const X = (x) => W / 2 + x * k;
  const Y = (y) => (TOP - y) * k;
  g.fillStyle = '#e9f0f5';
  g.fillRect(0, 0, W, H);
  const cx = X(0);
  const cy = Y(FAR_TEE);
  for (const [r, col] of [[HOUSE_R, '#1d5fbf'], [RING8, '#f4f7fa'], [RING4, '#c8262e'], [BUTTON, '#f4f7fa']]) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(cx, cy, r * k, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#1b1f28';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, cy); g.lineTo(W, cy);
  g.moveTo(0, Y(BACK_LINE)); g.lineTo(W, Y(BACK_LINE));
  g.moveTo(cx, 0); g.lineTo(cx, H);
  g.stroke();
  if (Y(FAR_HOG) < H) {
    g.fillStyle = '#c8262e';
    g.fillRect(0, Y(FAR_HOG) - 2, W, 4);
  }
  if (broomX !== null) {
    g.strokeStyle = '#20d0ff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(X(broomX), cy, 0.18 * k, 0, Math.PI * 2);
    g.stroke();
  }
  for (const s of stones) {
    if (!s.inPlay) continue;
    const sy = Y(s.y);
    if (sy < -10) continue;
    const drawY = Math.min(sy, H - STONE_R * k - 1);
    g.fillStyle = '#5d6066';
    g.beginPath();
    g.arc(X(s.x), drawY, STONE_R * k, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = s.team === 'red' ? '#e0373a' : '#f2c418';
    g.beginPath();
    g.arc(X(s.x), drawY, STONE_R * k * 0.62, 0, Math.PI * 2);
    g.fill();
    if (highlight?.includes(s.id)) {
      g.strokeStyle = '#111';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X(s.x), drawY, STONE_R * k + 3, 0, Math.PI * 2);
      g.stroke();
    }
    if (sy > H) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.font = '10px system-ui';
      g.textAlign = 'center';
      g.fillText('▼', X(s.x), H - 1);
    }
  }
}

let toastTimer = 0;
export function toast(html, ms = 2200) {
  const t = $('toast');
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function setText(id, text) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}

export { TEAM_NAME };
