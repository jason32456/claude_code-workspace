import { tableShape, seatPositions, initials, happyHue } from './geometry.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function renderFloor(app) {
  const { plan, P, occ, ex } = app;
  const svg = document.getElementById('floor');
  svg.classList.toggle('layout-mode', app.mode === 'layout');
  fitViewBox(svg, plan, app.mode);

  const centres = new Map();
  const selGuest = app.sel?.guest;
  const focus = app.hover || selGuest;
  const focusIdx = focus ? P.gIndex.get(focus) : undefined;
  const related = new Set();
  if (focusIdx !== undefined) {
    related.add(focusIdx);
    ex[focusIdx].items.forEach((it) => related.add(it.other));
  }

  let html = '';
  plan.tables.forEach((t, ti) => {
    const shape = tableShape(t);
    const pos = seatPositions(t);
    const seated = P.tableSeats[ti].filter((s) => occ[s] >= 0).length;
    const sel = app.sel?.table === t.id ? ' sel' : '';
    html += `<g class="tbl${sel}" data-table="${esc(t.id)}">`;
    html += `<g transform="translate(${t.x} ${t.y}) rotate(${t.rot || 0})">`;
    html += shape.kind === 'circle'
      ? `<circle class="top" r="${shape.r}"/>`
      : `<rect class="top" x="${-shape.w / 2}" y="${-shape.h / 2}" width="${shape.w}" height="${shape.h}" rx="5"/>`;
    html += `</g>`;
    const upright = t.shape !== 'round' && (t.rot === 90 || t.rot === 270) ? ` transform="rotate(-90 ${t.x} ${t.y})"` : '';
    html += `<g${upright}><text class="tname" x="${t.x}" y="${t.y - 5}">${esc(t.name)}</text>`;
    html += `<text class="tsub" x="${t.x}" y="${t.y + 11}">${seated}/${t.seats}</text></g>`;
    pos.forEach((p, i) => {
      const s = P.tableSeats[ti][i];
      centres.set(s, p);
      const g = occ[s];
      if (g < 0) {
        html += `<g class="seat empty" data-seat="${esc(P.seatKeys[s])}"><circle cx="${p.x}" cy="${p.y}" r="13"/></g>`;
        return;
      }
      const guest = P.guests[g];
      const row = ex[g];
      const cls = ['seat'];
      if (row.hardBroken) cls.push('broken');
      if (plan.locks[guest.id]) cls.push('locked');
      if (selGuest === guest.id) cls.push('sel');
      if (focusIdx !== undefined && !related.has(g)) cls.push('dim');
      const fill = `hsl(${happyHue(row.happiness)} 55% 76%)`;
      html += `<g class="${cls.join(' ')}" data-seat="${esc(P.seatKeys[s])}" data-guest="${esc(guest.id)}">`
        + `<circle cx="${p.x}" cy="${p.y}" r="13" fill="${fill}"/>`
        + `<text x="${p.x}" y="${p.y}">${esc(initials(guest.name))}</text>`
        + `<title>${esc(guest.name)}${guest.tag ? ' · ' + esc(guest.tag) : ''} — ${Math.round(row.happiness * 100)}% happy</title></g>`;
    });
    html += `</g>`;
  });
  document.getElementById('tables').innerHTML = html;

  let lines = '';
  if (focusIdx !== undefined && ex[focusIdx].seat >= 0) {
    const a = centres.get(ex[focusIdx].seat);
    for (const it of ex[focusIdx].items) {
      const sb = ex[it.other].seat;
      if (sb < 0) continue;
      const b = centres.get(sb);
      const apart = it.type === 'apart' || it.type === 'never';
      const dx = b.x - a.x, dy = b.y - a.y;
      const bend = Math.hypot(dx, dy) > 120 ? 0.12 : 0;
      const cx = (a.x + b.x) / 2 - dy * bend, cy = (a.y + b.y) / 2 + dx * bend;
      lines += `<path class="wish-line ${it.ok ? 'good' : 'bad'}${apart ? ' apart' : ''}" d="M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}"/>`;
    }
  }
  document.getElementById('lines').innerHTML = lines;
  app.centres = centres;
}

// Frame the tables rather than a fixed room, so a small plan fills the pane.
// In layout mode the frame only grows, or dragging a table would rescale it
// under the pointer.
function fitViewBox(svg, plan, mode) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of plan.tables) {
    for (const p of seatPositions(t)) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
  }
  if (!plan.tables.length) { x0 = 0; y0 = 0; x1 = 1200; y1 = 820; }
  const pad = 60;
  let box = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  const prev = svg._box;
  if (mode === 'layout' && prev) box = [Math.min(box[0], prev[0]), Math.min(box[1], prev[1]), Math.max(box[2], prev[2]), Math.max(box[3], prev[3])];
  svg._box = box;
  const w = Math.max(400, box[2] - box[0]), h = Math.max(300, box[3] - box[1]);
  const vb = `${box[0]} ${box[1]} ${w} ${h}`;
  if (svg.getAttribute('viewBox') !== vb) {
    svg.setAttribute('viewBox', vb);
    const room = svg.querySelector('.room');
    room.setAttribute('x', box[0] - 2000); room.setAttribute('y', box[1] - 2000);
    room.setAttribute('width', w + 4000); room.setAttribute('height', h + 4000);
  }
}

export function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
