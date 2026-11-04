// DOM HUD and the 2D yard diagram.
import * as T from './track.js';
import { blockById, TYPES } from './shifts.js';
import { sequence, routeTarget, evaluate, pathBits, leafOf, rear, kmh, GOOD, FIRM, HEAVY } from './sim.js';

const $ = (id) => document.getElementById(id);
const cls = (v) => (v <= GOOD ? 'good' : v <= FIRM ? 'firm' : v <= HEAVY ? 'hard' : 'smash');

export function createHud(handlers) {
  const diag = $('diagram');
  const dg = diag.getContext('2d');
  let lastEv = 0, accum = 0;

  for (let L = 0; L < T.N_TRACKS; L++) {
    const row = document.createElement('div');
    row.className = 'b';
    row.innerHTML = `<span class="n">${L + 1}</span><span class="blk"></span><span class="bar"><div></div></span><span class="last"></span>`;
    row.addEventListener('click', () => handlers.route(L));
    $('b-list').appendChild(row);
  }
  const rows = [...$('b-list').children];

  function toast(text, pts, kind) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="${kind || ''}">${text}</span>` + (pts ? `<span class="pts ${pts > 0 ? 'good' : 'bad'}">${pts > 0 ? '+' : ''}${pts}</span>` : '');
    $('toasts').prepend(el);
    while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
    setTimeout(() => (el.style.opacity = '0'), 3800);
    setTimeout(() => el.remove(), 4500);
  }

  function clock(S) {
    const start = S.shift.night ? 22 * 3600 + 15 * 60 : S.shiftIndex === 1 ? 5 * 3600 + 40 * 60 : 13 * 3600;
    const t = (start + S.t) % 86400;
    return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
  }

  function room(S) {
    const minRear = T.TRACK_END.slice();
    for (const b of S.bodies) {
      const L = leafOf(b);
      if (L >= 0 && Math.abs(b.v) < 1e-3) minRear[L] = Math.min(minRear[L], rear(b));
    }
    return minRear;
  }

  function update(S, ui, dt) {
    accum += dt;
    // toasts from new events
    while (lastEv < S.events.length) {
      const e = S.events[lastEv++];
      if (e.type === 'couple') toast(e.text, e.pts, e.cls);
      else if (e.type === 'bumper') toast(e.text, e.pts, 'bad');
      else if (e.type === 'misroute') toast(e.text, 0, 'bad');
      else if (e.type === 'open' || e.type === 'train' || e.type === 'blocked') toast(e.text);
    }
    if (accum < 0.12) return;
    accum = 0;

    const sh = S.shift;
    $('h-shift').textContent = sh.name;
    $('h-clock').textContent = clock(S);
    const w = S.wind;
    $('h-weather').innerHTML = `${sh.temp > 0 ? '+' : ''}${sh.temp} °C · ` + (Math.abs(w) < 0.5 ? 'calm' : `${w < 0 ? 'headwind' : 'tailwind'} <b>${Math.abs(w).toFixed(1)}</b> m/s`);
    const ev = evaluate(S);
    $('h-score').textContent = ev.total;
    $('h-max').textContent = `/ ${ev.max}`;
    $('h-fill').style.width = `${Math.max(0, Math.min(100, (ev.total / ev.max) * 100))}%`;
    $('h-hump').innerHTML = `<b>${(S.hump * 3.6).toFixed(1)}</b> km/h` + (S.train && S.train.v < 0.05 && S.hump > 0 ? ' <span class="bad">held</span>' : '');
    const left = sh.deadline - S.t;
    $('h-deadline').innerHTML = left > 0 ? `in ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : `<span class="bad">late ${Math.floor(-left)} s</span>`;

    // queue
    const seq = sequence(S).slice(0, 8);
    const tgt = routeTarget(S);
    $('q-list').innerHTML = seq.map((it) => {
      const blk = blockById[it.block];
      const chips = it.cars.map((c) => `<span class="chip ${c.loaded ? '' : 'e'}" style="background:${blk.color}" title="${c.type} ${(c.mass / 1000).toFixed(0)} t">${TYPES[c.type].letter}</span>`).join('');
      const plan = it.ref.plan;
      const tr = plan == null ? '<span class="tr none">?</span>' : `<span class="tr ${it.ref.manual ? 'man' : ''}">${plan + 1}</span>`;
      const est = it.kind === 'body' && it.ref.rrEst != null ? rrWord(it.ref.rrEst / S.coldF) : '';
      const mass = it.cars.reduce((a, c) => a + c.mass, 0) / 1000;
      return `<div class="q ${tgt && tgt.ref === it.ref ? 'target' : ''}"><span class="arrow">${tgt && tgt.ref === it.ref ? '▶' : ''}</span>${tr}<span class="chips">${chips}</span><span class="rr dim" title="mass">${mass.toFixed(0)}t</span><span class="rr">${est}</span></div>`;
    }).join('') || '<div class="dim small">No cuts waiting.</div>';

    // board
    const rm = room(S);
    rows.forEach((row, L) => {
      const blk = S.assign[L];
      const el = row.children[1];
      el.textContent = blk || 'spare';
      el.className = 'blk' + (blk ? '' : ' spare');
      el.style.background = blk ? blockById[blk].color : '';
      const free = rm[L] - T.CLEAR;
      const frac = Math.max(0, Math.min(1, 1 - free / (T.TRACK_END[L] - T.CLEAR)));
      const bar = row.children[2].firstChild;
      bar.style.width = `${frac * 100}%`;
      bar.style.background = free < 60 ? 'var(--bad)' : free < 140 ? 'var(--firm)' : blk ? blockById[blk].color : '#556';
      const lc = S.lastCouple[L];
      row.children[3].innerHTML = lc ? `<span class="${lc.cls}">${kmh(lc.v).toFixed(1)}</span>` : `<span class="dim">${Math.max(0, free).toFixed(0)} m</span>`;
      row.title = `${Math.max(0, free).toFixed(0)} m free`;
    });

    // gauge
    const p = ui.prediction;
    const fb = ui.focus;
    if (fb) {
      $('g-speed').textContent = kmh(fb.v).toFixed(1);
      $('g-zone').textContent = ui.focusZone;
      if (p) {
        const txt = p.kind === 'stall'
          ? `stops <b class="stall">${p.gap.toFixed(0)} m</b> short${p.leaf >= 0 ? ` on ${p.leaf + 1}` : ''}`
          : p.kind === 'bumper'
            ? `reaches the bumper on ${p.leaf + 1} at <b class="${cls(p.v)}">${kmh(p.v).toFixed(1)}</b> km/h`
            : `couples on ${p.leaf + 1} at <b class="${cls(p.v)}">${kmh(p.v).toFixed(1)}</b> km/h`;
        $('g-pred').innerHTML = (ui.assist ? 'If released now: ' + txt : '<span class="dim">Prediction off (G)</span>') +
          `<div class="dim small">${fb.cars.length} car${fb.cars.length > 1 ? 's' : ''} · ${(fb.mass / 1000).toFixed(0)} t · radar ${fb.rrEst != null ? rrWord(fb.rrEst / S.coldF) : '—'}</div>`;
      } else $('g-pred').innerHTML = '';
    } else {
      $('g-speed').textContent = '—';
      $('g-zone').textContent = 'WAITING';
      $('g-pred').innerHTML = '<span class="dim">Nothing rolling.</span>';
    }
    $('r-master').className = 'ret' + (S.input.master ? ' on' : ui.occ.master ? ' occ' : '');
    $('r-track').className = 'ret' + (S.input.track ? ' on' : ui.occ.track ? ' occ' : '');
    $('t-master')?.classList.toggle('on', S.input.master);
    $('t-track')?.classList.toggle('on', S.input.track);

    drawDiagram(S, ui);
  }

  function rrWord(rr) {
    if (rr < 0.0018) return '<span class="good">free</span>';
    if (rr < 0.0030) return '<span>avg</span>';
    return '<span class="stall">stiff</span>';
  }

  function drawDiagram(S, ui) {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const W = diag.clientWidth, H = diag.clientHeight;
    if (diag.width !== Math.round(W * dpr) || diag.height !== Math.round(H * dpr)) { diag.width = Math.round(W * dpr); diag.height = Math.round(H * dpr); }
    const g = dg;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const s0 = -90, s1 = 680;
    const X = (s) => 10 + ((s - s0) / (s1 - s0)) * (W - 20);
    const Z = (z) => H / 2 + (z / 19) * (H / 2 - 12);
    // track lines
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    const line = (a, b, bits, leaf) => {
      g.beginPath();
      for (let s = a; s <= b; s += 3) { const x = X(s), y = Z(T.lateral(s, bits)); s === a ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    };
    line(s0, T.NODES[0], [0, 0, 0]);
    for (let L = 0; L < T.N_TRACKS; L++) line(T.NODES[0], T.TRACK_END[L], T.leafBits(L), L);
    // crest
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = '10px system-ui';
    g.fillText('crest', X(0) - 12, Z(0) - 8);
    g.fillRect(X(0) - 0.5, Z(0) - 5, 1, 10);
    // retarders
    const ret = (a, b, bits, on) => {
      g.fillStyle = on ? '#ff4a2a' : 'rgba(255,255,255,0.25)';
      g.fillRect(X(a), Z(T.lateral((a + b) / 2, bits)) - 3, X(b) - X(a), 6);
    };
    ret(T.MASTER[0], T.MASTER[1], [0, 0, 0], S.input.master);
    for (let L = 0; L < T.N_TRACKS; L++) ret(T.TRACK_RET[0], T.TRACK_RET[1], T.leafBits(L), S.input.track);
    const narrow = W < 600;
    // track labels
    g.font = 'bold 11px system-ui';
    for (let L = 0; L < T.N_TRACKS && !narrow; L++) {
      const blk = S.assign[L];
      g.fillStyle = blk ? blockById[blk].color : 'rgba(255,255,255,0.4)';
      g.fillText(`${L + 1} ${blk || ''}`, X(T.TRACK_END[L]) + 4 > W - 50 ? X(T.TRACK_END[L]) - 48 : X(T.TRACK_END[L]) + 4, Z(T.trackZ(L)) + 4);
    }
    // switches
    for (let i = 0; i < 7; i++) {
      const { k, prefix } = T.switchNode(i);
      const bits = [...prefix, S.switches[i], 0, 0].slice(0, 3);
      const s = T.NODES[k];
      const x = X(s), y = Z(T.lateral(s, bits));
      const x2 = X(s + 18), y2 = Z(T.lateral(s + 18, bits));
      g.strokeStyle = '#7dffa0';
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      g.fillStyle = S.t - S.swT[i] < 0.6 ? '#fff' : '#7dffa0';
      g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
    }
    // cars
    const drawCar = (c, sc, bits) => {
      const a = sc - c.len / 2 + 0.6, b = sc + c.len / 2 - 0.6;
      const xa = X(a), xb = X(b);
      const y = Z(T.lateral(sc, bits));
      g.fillStyle = blockById[c.block].color;
      g.globalAlpha = c.pre ? 0.55 : 1;
      g.fillRect(xa, y - 4, Math.max(1.5, xb - xa), 8);
      if (c.damaged) { g.fillStyle = '#ff2a2a'; g.fillRect(xa, y - 6, Math.max(1.5, xb - xa), 2); }
      g.globalAlpha = 1;
    };
    for (const b of S.bodies) {
      const bits = pathBits(S, b);
      let off = 0;
      for (const c of b.cars) { drawCar(c, b.s - off - c.len / 2, bits); off += c.len; }
      if (!b.pre && Math.abs(b.v) > 0.05 && !narrow) {
        g.fillStyle = '#fff';
        g.font = '10px system-ui';
        g.fillText(kmh(b.v).toFixed(1), X(b.s) + 3, Z(T.lateral(b.s, bits)) - 6);
      }
    }
    if (S.train) {
      let off = 0;
      for (const cut of S.train.cuts) for (const c of cut.cars) { drawCar(c, S.train.front - off - c.len / 2, [0, 0, 0]); off += c.len; }
      g.fillStyle = '#e8742a';
      g.fillRect(X(S.train.front - off - 21), Z(0) - 4, X(0) - X(-21), 8);
    }
    // prediction
    const p = ui.prediction;
    if (ui.assist && p && p.body) {
      const bits = pathBits(S, p.body);
      const x = X(p.s), y = Z(T.lateral(p.s, bits));
      g.strokeStyle = p.cls === 'good' ? '#44e08a' : p.cls === 'firm' ? '#ffc23a' : p.cls === 'stall' ? '#66aaff' : '#ff5440';
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 6, 0, 7); g.stroke();
    }
  }

  function showResult(S, medalBest) {
    const r = S.result;
    const rowsHtml = [
      ['Cars placed on their block (+10 each)', r.placed],
      ['Couplings at ≤ 6.4 km/h (+5 per car)', r.couple],
      ['Damage (hard couplings, bumper hits)', r.damage],
      ['Wrong track or never sorted (−25 per car)', r.misroute],
      [`Gaps left for the trim engine (${r.gapM.toFixed(0)} m)`, Math.round(r.gaps)],
      ['Strings fouling the ladder', r.foul],
      ['Late for departure', r.late],
    ].map(([a, b]) => `<tr><td>${a}</td><td class="${b > 0 ? 'good' : b < 0 ? 'bad' : 'dim'}">${b > 0 ? '+' : ''}${b}</td></tr>`).join('');
    $('r-table').innerHTML = rowsHtml + `<tr class="tot"><td>Total</td><td>${r.total} / ${r.max}</td></tr>`;
    $('r-title').textContent = `${S.shift.name} — shift complete`;
    $('r-medal').innerHTML = r.medal ? `<span class="${r.medal}">${r.medal.toUpperCase()}</span>` : '<span class="dim">No medal. Bronze is 45%.</span>';
    $('result').classList.remove('hidden');
  }

  return { update, toast, showResult };
}
