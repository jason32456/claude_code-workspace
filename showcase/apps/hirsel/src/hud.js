import { PHASE_NAME, CMD_NAME, penGeometry, currentTarget } from './sim.js';

const $ = (id) => document.getElementById(id);

export const fmtClock = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function objective(sim) {
  const c = sim.course, j = sim.j;
  switch (sim.phase) {
    case 'ready': return '<b>D</b> come bye sends her out on your left · <b>A</b> away to me on your right';
    case 'outrun': return `${c.dog.name} is running out. <b>E</b> get out if she cuts in on the sheep. She stops herself at the top.`;
    case 'lift': return '<b>W</b> walk up, gently. The judge watches how the sheep first move.';
    case 'fetch': return j.leg === 0 ? 'Fetch them straight down through the fetch gates.' : 'Bring them on to your post.';
    case 'drive': {
      const n = c.drive.length;
      if (j.leg < n) return j.leg === 0 ? 'Drive them away from you through the first drive gate.' : 'Cross-drive through the second gate.';
      return c.ring ? 'Bring them back into the shedding ring.' : 'Bring them to the pen.';
    }
    case 'shed': return `In the ring: get close, then <b>Space</b> in here to split them. Hold at least ${c.shedMin} off for the judge.`;
    case 'pen': return 'Pen them. The gate swings shut when every ewe is in.';
    default: return '';
  }
}

export function createHud() {
  const mm = $('minimap'), g = mm.getContext('2d');
  let course = null, toastT = 0, lastLog = 0, mapBox = null;

  function setCourse(sim) {
    course = sim.course;
    lastLog = 0;
    $('h-course').textContent = `${course.grade} · ${course.name}`;
    $('ticker').innerHTML = '';
    $('wind').classList.toggle('hidden', !(course.wind > 0));
    const rows = Object.keys(course.phases).map((p) => `<div class="row" id="card-${p}"><span class="pn">${PHASE_NAME[p]}</span><span class="pv"><b>${course.phases[p]}</b>/${course.phases[p]}</span></div>`);
    $('card-rows').innerHTML = rows.join('');
    const F = course.field;
    const W = mm.width, H = mm.height, pad = 8;
    const s = Math.min((W - pad * 2) / (F.x1 - F.x0), (H - pad * 2) / (F.z1 - F.z0));
    mapBox = { s, ox: W / 2 - ((F.x0 + F.x1) / 2) * s, oz: H / 2 - ((F.z0 + F.z1) / 2) * s };
  }

  function toast(title, sub = '', dur = 1.8) {
    const t = $('toast');
    t.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    t.classList.add('on');
    toastT = dur;
  }

  function drawMap(sim, assist) {
    const { s, ox, oz } = mapBox, c = sim.course, F = c.field;
    const X = (x) => ox + x * s, Z = (z) => oz + z * s;
    g.clearRect(0, 0, mm.width, mm.height);
    g.fillStyle = 'rgba(64, 92, 40, 0.85)';
    g.fillRect(X(F.x0), Z(F.z0), (F.x1 - F.x0) * s, (F.z1 - F.z0) * s);
    g.strokeStyle = c.walls ? '#b9b3a3' : '#c9a77c';
    g.lineWidth = 2;
    g.strokeRect(X(F.x0), Z(F.z0), (F.x1 - F.x0) * s, (F.z1 - F.z0) * s);
    g.fillStyle = 'rgba(70, 82, 30, 0.9)';
    for (const [x, z, r] of c.gorse) { g.beginPath(); g.arc(X(x), Z(z), r * s, 0, Math.PI * 2); g.fill(); }
    if (assist) {
      g.setLineDash([3, 3]);
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(X(c.lift.x), Z(c.lift.z)); g.lineTo(X(c.fetch.x), Z(c.fetch.z)); g.lineTo(X(0), Z(0));
      for (const d of c.drive) g.lineTo(X(d.x), Z(d.z));
      if (c.ring) g.lineTo(X(c.ring.x), Z(c.ring.z));
      const o = penGeometry(c.pen).outside; g.lineTo(X(o[0]), Z(o[1]));
      g.stroke();
      g.setLineDash([]);
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    for (const gt of [c.fetch, ...c.drive]) {
      const tx = -gt.nz, tz = gt.nx;
      g.beginPath();
      g.moveTo(X(gt.x + tx * gt.w / 2), Z(gt.z + tz * gt.w / 2)); g.lineTo(X(gt.x + tx * (gt.w / 2 + 2.6)), Z(gt.z + tz * (gt.w / 2 + 2.6)));
      g.moveTo(X(gt.x - tx * gt.w / 2), Z(gt.z - tz * gt.w / 2)); g.lineTo(X(gt.x - tx * (gt.w / 2 + 2.6)), Z(gt.z - tz * (gt.w / 2 + 2.6)));
      g.stroke();
    }
    if (c.ring) {
      g.strokeStyle = 'rgba(255,248,230,0.8)'; g.setLineDash([2, 3]);
      g.beginPath(); g.arc(X(c.ring.x), Z(c.ring.z), c.ring.r * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
    const pg = penGeometry(c.pen);
    g.strokeStyle = '#e0bf86'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(X(pg.fl[0]), Z(pg.fl[1])); g.lineTo(X(pg.bl[0]), Z(pg.bl[1])); g.lineTo(X(pg.br[0]), Z(pg.br[1])); g.lineTo(X(pg.fr[0]), Z(pg.fr[1]));
    if (sim.gateClosed) g.lineTo(X(pg.fl[0]), Z(pg.fl[1]));
    g.stroke();
    if (assist && sim.trail.length > 1) {
      g.strokeStyle = 'rgba(255, 220, 120, 0.9)'; g.lineWidth = 1.5;
      g.beginPath();
      sim.trail.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.lineTo(X(sim.flock.x), Z(sim.flock.z));
      g.stroke();
    }
    if (assist && ['lift', 'fetch', 'drive', 'shed', 'pen'].includes(sim.phase)) {
      const T = currentTarget(sim);
      g.fillStyle = 'rgba(158, 240, 255, 0.9)';
      g.beginPath(); g.arc(X(T.x), Z(T.z), 2.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#f6f1e2';
    for (const sh of sim.sheep) { g.beginPath(); g.arc(X(sh.x), Z(sh.z), 2.4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#111'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(X(sim.dog.x), Z(sim.dog.z), 3.2, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#5ea2ff';
    g.beginPath(); g.moveTo(X(0), Z(0) - 4); g.lineTo(X(0) + 3.5, Z(0) + 3); g.lineTo(X(0) - 3.5, Z(0) + 3); g.fill();
  }

  function update(sim, dt, assist) {
    const c = sim.course;
    $('h-clock').textContent = fmtClock(c.timeLimit - sim.clock);
    $('h-clock').classList.toggle('low', sim.running && c.timeLimit - sim.clock < 60);
    $('h-phase').textContent = sim.phase === 'ready' ? 'At the post' : sim.phase === 'over' ? 'Finished' : PHASE_NAME[sim.phase];
    $('h-obj').innerHTML = objective(sim);
    for (const p of Object.keys(c.phases)) {
      const row = $(`card-${p}`);
      if (!row) continue;
      const left = c.phases[p] - sim.lost[p];
      row.querySelector('b').textContent = left;
      row.className = 'row' + (sim.phase === p ? ' on' : sim.done[p] ? ' done' : '');
    }
    const tot = Object.keys(c.phases).reduce((a, p) => a + c.phases[p] - sim.lost[p], 0);
    $('card-total').textContent = tot;
    if (sim.log.length > lastLog) {
      const box = $('ticker');
      for (const l of sim.log.slice(lastLog)) {
        const d = document.createElement('div');
        d.innerHTML = `<b>−${l.pts}</b> ${PHASE_NAME[l.phase]}: ${l.why}`;
        box.prepend(d);
      }
      while (box.children.length > 4) box.lastChild.remove();
      lastLog = sim.log.length;
    }
    const dog = sim.dog;
    document.querySelectorAll('#whistles button').forEach((b) => {
      const on = b.dataset.cmd === dog.heard && sim.t - dog.heardT < 1.2;
      b.classList.toggle('heard', on);
    });
    $('dogstate').textContent = `${c.dog.name}: ${dogWord(dog)}${dog.steady ? ' (steady)' : ''}${dog.width ? ` · +${dog.width} m wide` : ''}`;
    if (c.wind > 0) $('wind-fill').style.width = `${Math.round(sim.wind * 100)}%`;
    toastT -= dt;
    if (toastT <= 0) $('toast').classList.remove('on');
    drawMap(sim, assist);
  }

  return {
    setCourse, toast, update,
    show(on) { $('hud').classList.toggle('hidden', !on); },
    flashLost() { const w = $('whistles'); w.classList.remove('lost'); void w.offsetWidth; w.classList.add('lost'); },
    hideToast() { $('toast').classList.remove('on'); toastT = 0; },
  };
}

function dogWord(d) {
  switch (d.state) {
    case 'heel': return 'at your feet';
    case 'outrun': return d.dir > 0 ? 'outrun, come bye side' : 'outrun, away side';
    case 'flank': return d.dir > 0 ? 'flanking come bye' : 'flanking away';
    case 'walk': return 'walking up';
    case 'lie': return 'down';
    case 'inhere': return 'coming in';
    case 'hold': return 'holding';
    case 'recall': return 'coming back';
  }
  return d.state;
}

export { CMD_NAME };
