import { compile, emptyPlan, occupancyFromPlan, seatingFromOcc, DEFAULT_SETTINGS } from './js/core/plan.js';
import { explain, hardViolations, softScore } from './js/core/score.js';
import { lint } from './js/core/lint.js';
import { EFFORT } from './js/core/solver.js';
import { demoPlan } from './js/core/demo.js';
import { parseGuests, guestsFromParties, newId } from './js/core/importer.js';
import { renderFloor, svgPoint } from './js/ui/floor.js';
import { renderGuests } from './js/ui/guests.js';
import { renderInspector } from './js/ui/inspector.js';
import { buildPrint } from './js/ui/print.js';

const STORE = 'placecard.plan.v1';
const $ = (id) => document.getElementById(id);

const app = {
  plan: null, P: null, occ: null, ex: null, findings: [], hard: [], soft: 0,
  sel: null, mode: 'seat', hover: null, filter: 'all', search: '',
  solving: false, history: [], whatif: new Map(), chart: [],
};

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.guests)) return normalise(p);
    }
  } catch { /* storage blocked or corrupt: fall through to the demo */ }
  return demoPlan();
}

function normalise(p) {
  const base = emptyPlan();
  return { ...base, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings || {}) }, locks: p.locks || {}, seating: p.seating || {}, wishes: p.wishes || [] };
}

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(app.plan)); } catch { /* private mode */ }
}

function recompute() {
  app.P = compile(app.plan);
  app.occ = occupancyFromPlan(app.P, app.plan);
  // Drop seat entries that no longer resolve (deleted tables, shrunk tables).
  app.plan.seating = seatingFromOcc(app.P, app.occ);
  app.ex = explain(app.P, app.occ);
  app.hard = hardViolations(app.P, app.occ);
  app.soft = softScore(app.P, app.occ);
  app.findings = lint(app.P);
}

function render() {
  renderGuests(app);
  renderFloor(app);
  renderInspector(app);
  $('plan-name').value = app.plan.name;
  $('btn-undo').disabled = app.history.length === 0;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === app.mode));
}

function refresh() { recompute(); render(); save(); }

// Every mutation goes through here, so undo is one snapshot per user action.
function commit(fn) {
  if (app.solving) stopSolve(false);
  app.history.push(JSON.stringify(app.plan));
  if (app.history.length > 60) app.history.shift();
  fn(app.plan);
  app.whatif.clear();
  refresh();
}

function undo() {
  if (!app.history.length) return;
  if (app.solving) stopSolve(false);
  app.plan = JSON.parse(app.history.pop());
  app.whatif.clear();
  refresh();
}

let toastTimer;
app.toast = (msg) => {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
};

app.select = (sel) => {
  const changed = JSON.stringify(sel) !== JSON.stringify(app.sel);
  app.sel = sel;
  render();
  if (changed) $('inspector').scrollTop = 0;
  if (sel?.guest) {
    const row = document.querySelector(`.guest-row[data-guest="${CSS.escape(sel.guest)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }
};

app.updateGuest = (id, fields) => commit((p) => Object.assign(p.guests.find((g) => g.id === id), fields));
app.removeGuest = (id) => commit((p) => {
  p.guests = p.guests.filter((g) => g.id !== id);
  p.wishes = p.wishes.filter((w) => w.a !== id && w.b !== id);
  delete p.locks[id]; delete p.seating[id];
  app.sel = null;
});
app.leaveParty = (id) => commit((p) => {
  const g = p.guests.find((x) => x.id === id);
  const rest = p.guests.filter((x) => x.party === g.party && x.id !== id);
  if (rest.length === 1) rest[0].party = '';
  g.party = '';
});
app.unseat = (id) => commit((p) => { delete p.seating[id]; delete p.locks[id]; });
app.setLock = (id, mode) => commit((p) => {
  const key = p.seating[id];
  if (mode === 'none' || !key) delete p.locks[id];
  else if (mode === 'seat') p.locks[id] = { seat: key };
  else p.locks[id] = { table: key.split(':').slice(0, -1).join(':') };
});
app.addWish = (a, b, type) => {
  if (app.plan.wishes.some((w) => w.type === type && ((w.a === a && w.b === b) || (w.a === b && w.b === a)))) {
    app.toast('That wish already exists.');
    return;
  }
  commit((p) => {
    p.wishes = p.wishes.filter((w) => !((w.a === a && w.b === b) || (w.a === b && w.b === a)));
    p.wishes.push({ id: newId('w'), type, a, b });
  });
};
app.removeWish = (id) => commit((p) => { p.wishes = p.wishes.filter((w) => w.id !== id); });

app.updateTable = (id, fields) => commit((p) => Object.assign(p.tables.find((t) => t.id === id), fields));
app.removeTable = (id) => commit((p) => {
  p.tables = p.tables.filter((t) => t.id !== id);
  for (const [gid, lk] of Object.entries(p.locks)) {
    if (lk.table === id || (lk.seat && lk.seat.startsWith(id + ':'))) delete p.locks[gid];
  }
  app.sel = null;
});
app.clearTable = (id) => commit((p) => {
  for (const [gid, key] of Object.entries(p.seating)) if (key.startsWith(id + ':') && !p.locks[gid]) delete p.seating[gid];
});
app.updateSettings = (fields) => commit((p) => Object.assign(p.settings, fields));

function addTable(shape) {
  commit((p) => {
    const nums = p.tables.map((t) => +(t.name.match(/^Table (\d+)$/)?.[1] || 0));
    const num = Math.max(0, ...nums) + 1;
    const name = shape === 'head' ? 'Head table' : shape === 'long' ? `Long table ${num}` : `Table ${num}`;
    const id = newId('t');
    const spot = freeSpot(p);
    p.tables.push({ id, name, shape, seats: shape === 'round' ? 10 : shape === 'long' ? 12 : 8, x: spot.x, y: spot.y, rot: 0 });
    app.sel = { table: id };
  });
}

function freeSpot(p) {
  for (let y = 120; y < 2000; y += 210) {
    for (let x = 140; x < 1150; x += 250) {
      if (p.tables.every((t) => Math.hypot(t.x - x, t.y - y) > 200)) return { x, y };
    }
  }
  return { x: 600, y: 400 };
}

// Drop guest g onto a seat; whoever sat there takes g's old seat (or stands up).
function moveGuest(gid, key) {
  const p = app.plan;
  const occupant = Object.keys(p.seating).find((id) => p.seating[id] === key);
  if (occupant === gid) return;
  if (occupant && p.locks[occupant]?.seat) { app.toast(`${nameOf(occupant)} is locked to that seat.`); return; }
  const from = p.seating[gid];
  const tableOfKey = (k) => k.split(':').slice(0, -1).join(':');
  if (occupant && p.locks[occupant]?.table && (!from || tableOfKey(from) !== p.locks[occupant].table)) {
    app.toast(`${nameOf(occupant)} is locked to their table.`); return;
  }
  commit((pl) => {
    pl.seating[gid] = key;
    if (occupant) { if (from) pl.seating[occupant] = from; else delete pl.seating[occupant]; }
    const lk = pl.locks[gid];
    if (lk?.seat) lk.seat = key;
    else if (lk?.table && lk.table !== tableOfKey(key)) lk.table = tableOfKey(key);
  });
}
const nameOf = (id) => app.plan.guests.find((g) => g.id === id)?.name || 'Guest';

// ---------- solver worker ----------
const worker = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
let costSeq = 0;
const costJobs = new Map();

worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'progress' && app.solving && m.jobId === app.jobId) {
    app.chart.push(m.best);
    drawChart();
    app.occ = Int32Array.from(m.occ);
    app.ex = explain(app.P, app.occ);
    renderFloor(app);
    const now = performance.now();
    if (!app.lastPanel || now - app.lastPanel > 300) {
      app.lastPanel = now;
      app.hard = hardViolations(app.P, app.occ);
      app.soft = softScore(app.P, app.occ);
      renderGuests(app);
      renderInspector(app);
    }
    $('solve-status').textContent = `${fmt(m.iter)} / ${fmt(m.iterations)} moves · ${fmt(m.rate)}/s`;
  } else if (m.type === 'done' && app.solving && m.jobId === app.jobId) {
    app.solving = false;
    setSolveButton();
    const occ = Int32Array.from(m.occ);
    app.plan.seating = seatingFromOcc(app.P, occ);
    app.whatif.clear();
    refresh();
    const seated = app.ex.filter((r) => r.seat >= 0);
    const avg = seated.reduce((s, r) => s + r.happiness, 0) / Math.max(1, seated.length);
    $('solve-status').textContent = `${fmt(m.iter)} moves in ${(m.ms / 1000).toFixed(1)}s`;
    app.toast(m.hard ? `Best found still breaks ${m.hard} hard rule${m.hard === 1 ? '' : 's'}. See the pre-flight check.` : `Seated. No hard rules broken, ${Math.round(avg * 100)}% average happiness.`);
  } else if (m.type === 'whatif') {
    const key = costJobs.get(m.id);
    costJobs.delete(m.id);
    if (key && app.whatif.get(key) === 'pending') {
      app.whatif.set(key, m.result);
      renderInspector(app);
    }
  }
};

const fmt = (x) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${Math.round(x / 1e3)}k` : `${Math.round(x)}`);

function startSolve() {
  if (!app.plan.guests.length || !app.plan.tables.length) { app.toast('Add guests and tables first.'); return; }
  const errors = app.findings.filter((f) => f.level === 'error');
  if (errors.length) app.toast(`Pre-flight: ${errors[0].title}. The solver will do its best anyway.`);
  app.history.push(JSON.stringify(app.plan));
  app.solving = true;
  app.chart = [];
  setSolveButton();
  const seed = Math.max(1, Math.round(+$('seed').value) || 1);
  const effort = $('effort').value;
  app.plan.settings.seed = seed;
  app.plan.settings.effort = effort;
  const iterations = Math.round(EFFORT[effort] * Math.max(1, app.plan.guests.length / 100));
  app.jobId = (app.jobId || 0) + 1;
  worker.postMessage({ type: 'solve', jobId: app.jobId, plan: app.plan, occ: Array.from(app.occ), seed, iterations });
}

// keep=false abandons the run (an edit arrived mid-solve); otherwise the
// worker's best-so-far is applied when it reports back.
function stopSolve(keep = true) {
  worker.postMessage({ type: 'stop' });
  if (!keep) {
    app.solving = false;
    setSolveButton();
    $('solve-status').textContent = 'Stopped';
  }
}

function setSolveButton() {
  const b = $('btn-solve');
  b.textContent = app.solving ? 'Stop' : 'Solve seating';
  b.classList.toggle('stop', app.solving);
}

function drawChart() {
  const c = $('chart'), ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = 220, h = 40;
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pts = app.chart;
  if (pts.length < 2) return;
  const sorted = [...pts].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.15)], hi = sorted[sorted.length - 1];
  const span = Math.max(1, hi - lo);
  ctx.strokeStyle = '#2f5d4a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  pts.forEach((v, i) => {
    const x = 4 + (i / (pts.length - 1)) * (w - 8);
    const y = h - 5 - Math.max(0, Math.min(1, (v - lo) / span)) * (h - 10);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

app.askCost = (key) => {
  const [type, a, b] = key.split('|');
  app.whatif.set(key, 'pending');
  renderInspector(app);
  const id = ++costSeq;
  costJobs.set(id, key);
  worker.postMessage({ type: 'whatif', id, plan: app.plan, occ: Array.from(app.occ), wish: { type, a, b } });
};
app.applyCost = (key) => {
  const r = app.whatif.get(key);
  if (!r || r === 'pending') return;
  commit((p) => { p.seating = seatingFromOcc(app.P, Int32Array.from(r.occ)); });
  app.toast(`Applied. ${r.moved.length} guests moved.`);
};
app.dismissCost = (key) => { app.whatif.delete(key); renderInspector(app); };

// ---------- drag & drop (list → seat, seat → seat, tables in layout mode) ----------
const svg = $('floor');
const ghost = $('ghost');
let drag = null;

function seatAt(x, y) {
  const el = document.elementFromPoint(x, y)?.closest?.('[data-seat]');
  return el ? el.dataset.seat : null;
}

function beginGuestDrag(e, gid) {
  drag = { kind: 'guest', gid, x0: e.clientX, y0: e.clientY, moved: false, over: null };
}

svg.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (app.mode === 'layout') {
    const tg = e.target.closest('[data-table]');
    if (!tg) { app.select(null); return; }
    const t = app.plan.tables.find((x) => x.id === tg.dataset.table);
    const p = svgPoint(svg, e.clientX, e.clientY);
    drag = { kind: 'table', id: t.id, dx: p.x - t.x, dy: p.y - t.y, moved: false, snapshot: JSON.stringify(app.plan) };
    svg.setPointerCapture(e.pointerId);
    return;
  }
  const seat = e.target.closest('[data-seat]');
  if (seat?.dataset.guest) { beginGuestDrag(e, seat.dataset.guest); return; }
  if (seat && app.sel?.guest) { moveGuest(app.sel.guest, seat.dataset.seat); return; }
  const tg = e.target.closest('[data-table]');
  app.select(tg ? { table: tg.dataset.table } : null);
});

$('guest-list').addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.guest-row');
  if (!row || e.button !== 0) return;
  beginGuestDrag(e, row.dataset.guest);
});

window.addEventListener('pointermove', (e) => {
  if (!drag) {
    if (app.mode === 'seat' && e.pointerType === 'mouse') {
      const g = e.target.closest?.('#floor [data-guest]')?.dataset.guest || null;
      if (g !== app.hover) { app.hover = g; renderFloor(app); }
    }
    return;
  }
  if (drag.kind === 'table') {
    const p = svgPoint(svg, e.clientX, e.clientY);
    const t = app.plan.tables.find((x) => x.id === drag.id);
    t.x = Math.max(60, Math.round((p.x - drag.dx) / 10) * 10);
    t.y = Math.max(60, Math.round((p.y - drag.dy) / 10) * 10);
    drag.moved = true;
    renderFloor(app);
    return;
  }
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
  if (!drag.moved) {
    drag.moved = true;
    ghost.textContent = nameOf(drag.gid);
    ghost.hidden = false;
    app.hover = null;
  }
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = e.clientY + 'px';
  const key = seatAt(e.clientX, e.clientY);
  if (key !== drag.over) {
    svg.querySelectorAll('.seat.drop').forEach((n) => n.classList.remove('drop'));
    if (key) svg.querySelector(`[data-seat="${CSS.escape(key)}"]`)?.classList.add('drop');
    drag.over = key;
  }
});

window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  ghost.hidden = true;
  if (d.kind === 'table') {
    if (d.moved) {
      app.history.push(d.snapshot);
      save();
      render();
    } else app.select({ table: d.id });
    return;
  }
  if (!d.moved) { app.select({ guest: d.gid }); return; }
  const key = seatAt(e.clientX, e.clientY);
  if (key) moveGuest(d.gid, key);
  else renderFloor(app);
});

window.addEventListener('pointercancel', () => {
  if (!drag) return;
  if (drag.kind === 'table' && drag.moved) { app.history.push(drag.snapshot); save(); }
  drag = null;
  ghost.hidden = true;
  render();
});

svg.addEventListener('pointerleave', () => { if (app.hover && !drag) { app.hover = null; renderFloor(app); } });

// ---------- toolbar, menus, import/export ----------
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { app.mode = b.dataset.mode; app.hover = null; render(); }));
document.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => { addTable(b.dataset.add); app.mode = 'layout'; render(); }));
$('btn-solve').addEventListener('click', () => (app.solving ? stopSolve() : startSolve()));
$('btn-undo').addEventListener('click', undo);
$('plan-name').addEventListener('change', (e) => commit((p) => { p.name = e.target.value.trim() || 'Untitled event'; }));
$('guest-search').addEventListener('input', (e) => { app.search = e.target.value; renderGuests(app); });
document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
  app.filter = b.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
  renderGuests(app);
}));

document.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', (e) => {
  e.stopPropagation();
  const pop = document.querySelector(`[data-pop="${b.dataset.menu}"]`);
  const open = pop.hidden;
  document.querySelectorAll('.menu-pop').forEach((p) => { p.hidden = true; });
  pop.hidden = !open;
}));
document.addEventListener('click', () => document.querySelectorAll('.menu-pop').forEach((p) => { p.hidden = true; }));

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const slug = () => app.plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'seating';

document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
  const act = b.dataset.act;
  if (act === 'demo') { commit(() => {}); app.plan = demoPlan(); app.sel = null; refresh(); app.toast('Demo loaded. Press “Solve seating”.'); }
  if (act === 'new') { commit(() => {}); app.plan = emptyPlan(); app.sel = null; refresh(); }
  if (act === 'open') $('file-open').click();
  if (act === 'save') download(`${slug()}.json`, JSON.stringify(app.plan, null, 2), 'application/json');
  if (act === 'csv') {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [['Name', 'Party', 'Group', 'Dietary', 'Table', 'Seat', 'Happiness'].join(',')];
    app.P.guests.forEach((g, i) => {
      const s = app.ex[i].seat;
      const partyNames = g.party ? app.plan.guests.filter((x) => x.party === g.party).map((x) => x.name).join(' & ') : '';
      rows.push([q(g.name), q(partyNames), q(g.tag), q(g.diet), q(s >= 0 ? app.plan.tables[app.P.seatTable[s]].name : ''), s >= 0 ? app.P.seatLocal[s] + 1 : '', Math.round(app.ex[i].happiness * 100) + '%'].join(','));
    });
    download(`${slug()}.csv`, rows.join('\n'), 'text/csv');
  }
}));

$('file-open').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (!Array.isArray(p.guests) || !Array.isArray(p.tables)) throw new Error('not a plan');
    commit(() => {});
    app.plan = normalise(p);
    app.sel = null;
    refresh();
    app.toast(`Opened “${app.plan.name}”.`);
  } catch {
    app.toast('That file is not a Placecard plan.');
  }
});

document.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => {
  buildPrint(app, b.dataset.print);
  window.print();
}));

const dlg = $('import-dialog');
$('btn-import').addEventListener('click', () => { $('import-text').value = ''; updatePreview(); dlg.showModal(); $('import-text').focus(); });
function updatePreview() {
  const parties = parseGuests($('import-text').value);
  const n = parties.reduce((s, p) => s + p.members.length, 0);
  $('import-preview').textContent = n ? `${n} guest${n === 1 ? '' : 's'} in ${parties.length} part${parties.length === 1 ? 'y' : 'ies'}.` : '';
  $('import-go').disabled = !n;
}
$('import-text').addEventListener('input', updatePreview);
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'ok') return;
  const guests = guestsFromParties(parseGuests($('import-text').value));
  if (!guests.length) return;
  commit((p) => { p.guests.push(...guests); });
  app.filter = 'unseated';
  document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x.dataset.filter === 'unseated'));
  render();
  app.toast(`Added ${guests.length} guests. Drag them to seats, or press “Solve seating”.`);
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    e.preventDefault();
    undo();
  }
  if (e.key === 'Escape' && app.sel && !dlg.open) app.select(null);
});

app.plan = load();
$('seed').value = app.plan.settings.seed;
$('effort').value = app.plan.settings.effort;
refresh();
if (!Object.keys(app.plan.seating).length && app.plan.guests.length) app.toast('A demo wedding of 96 guests. Press “Solve seating” to seat them.');

