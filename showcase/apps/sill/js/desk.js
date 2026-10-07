// Simulated desktop: the page is the screen. Fake windows behave like real ones
// (drag, resize, minimise, maximise, close) and run the same world, renderer
// and rules in-page. This is the mode for phones, embedded views, and anyone
// who wants to try Sill before opening real windows.

import { World } from './world.js';
import { Overlay } from './overlay.js';
import { LEVELS } from './levels.js';
import { el, levelsMenu, helpSheet, completeCard, hintToast, recordWin, saveProgress, fmtTime } from './ui.js';
import { Sound } from './sound.js';

const TITLE = 28;
const SILL_HIT = 22;

export function startDesk({ renderer, progress, canReal, onReal }) {
  document.body.classList.add('mode-desk');
  const root = el('div', 'desk');
  const wall = el('canvas', 'desk-wall');
  const layer = el('div', 'desk-windows');
  const ui = el('div', 'desk-ui');
  const bar = el('div', 'taskbar');
  root.append(wall, layer, ui, bar);
  document.body.appendChild(root);

  bar.innerHTML = `
    <div class="tb-left">
      <div class="tb-logo">sill</div>
      <button class="tb-btn tb-new" title="Open another window">+ Window</button>
      <div class="tb-chips"></div>
    </div>
    <div class="tb-mid"><span class="tb-level"></span><span class="tb-pots"></span></div>
    <div class="tb-right">
      ${canReal ? '<button class="tb-btn tb-real" title="Play with real browser windows">Real windows</button>' : ''}
      <button class="tb-btn tb-levels" data-pop>Levels</button>
      <button class="tb-btn tb-help" data-pop aria-label="How it works">?</button>
      <button class="tb-btn tb-sound" aria-label="Sound">♪</button>
    </div>`;
  const chips = bar.querySelector('.tb-chips');
  const tbLevel = bar.querySelector('.tb-level');
  const tbPots = bar.querySelector('.tb-pots');

  const sound = new Sound();
  const world = new World();
  const overlay = new Overlay();
  let S = deskRect();
  world.setScreen(S);

  const wins = [];
  let nextN = 1;
  let level = null;
  let completeShown = false;
  let lastSnap = null;
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  const params = new URLSearchParams(location.search);

  function deskRect() {
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar')) || 52;
    return { x: 0, y: 0, w: window.innerWidth, h: Math.max(200, window.innerHeight - bar) };
  }

  function load(index) {
    world.loadLevel(index);
    level = world.levelMessage();
    renderer.setLevel(level);
    overlay.setLevel(level);
    progress.current = index;
    saveProgress(progress);
    completeShown = false;
    ui.querySelectorAll('.card-complete').forEach((c) => c.remove());
    tbLevel.textContent = `${level.free ? '∞' : index + 1} · ${level.name}`;
    hintToast(ui, index, level);
    drawWall();
  }

  // ----- windows ------------------------------------------------------------

  function defaultSize() {
    const w = Math.round(Math.max(170, Math.min(520, S.w * 0.3)));
    const h = Math.round(Math.max(150, Math.min(420, S.h * 0.34)));
    return { w, h };
  }

  function addWindow(x, y, w, h) {
    const n = nextN++;
    const win = { id: `desk-${n}`, n, x, y, w, h, min: false, prev: null, sill: { open: false, hover: false, x: 0 }, drops: 0 };
    const node = el('div', 'fw');
    node.innerHTML = `
      <div class="fw-bar">
        <span class="fw-dots">
          <button class="fw-dot close" aria-label="Close"></button>
          <button class="fw-dot min" aria-label="Minimise"></button>
          <button class="fw-dot max" aria-label="Maximise"></button>
        </span>
        <span class="fw-title">Window ${n}</span>
      </div>
      <canvas class="fw-view"></canvas>
      <div class="fw-grip" aria-hidden="true"></div>`;
    win.el = node;
    win.title = node.querySelector('.fw-title');
    win.canvas = node.querySelector('.fw-view');
    win.ctx = win.canvas.getContext('2d');
    layer.appendChild(node);
    wins.push(win);
    wire(win);
    clampWin(win);
    layout(win);
    return win;
  }

  function contentRect(win) {
    return { x: win.x, y: win.y + TITLE, w: win.w, h: win.h - TITLE };
  }

  function layout(win) {
    const s = win.el.style;
    s.left = `${win.x}px`; s.top = `${win.y}px`; s.width = `${win.w}px`; s.height = `${win.h}px`;
    win.el.classList.toggle('minimised', win.min);
    const cw = Math.round(win.w * dpr), ch = Math.round((win.h - TITLE) * dpr);
    if (win.canvas.width !== cw || win.canvas.height !== ch) { win.canvas.width = cw; win.canvas.height = ch; }
  }

  function clampWin(win) {
    win.w = Math.max(130, Math.min(win.w, S.w));
    win.h = Math.max(TITLE + 70, Math.min(win.h, S.h));
    win.x = Math.max(-win.w + 60, Math.min(win.x, S.w - 60));
    win.y = Math.max(0, Math.min(win.y, S.h - TITLE));
  }

  function front(win) {
    if (layer.lastChild !== win.el) layer.appendChild(win.el);
    wins.splice(wins.indexOf(win), 1);
    wins.push(win);
  }

  function closeWin(win) {
    win.el.remove();
    wins.splice(wins.indexOf(win), 1);
    world.removePane(win.id);
    renderChips();
    sound.whoosh();
  }

  function minimise(win, on) {
    win.min = on;
    win.sill.open = false;
    layout(win);
    renderChips();
    if (on) sound.whoosh();
  }

  function renderChips() {
    chips.innerHTML = '';
    for (const w of wins) {
      if (!w.min) continue;
      const c = el('button', 'tb-chip', `Window ${w.n}`);
      c.addEventListener('click', () => { minimise(w, false); front(w); });
      chips.appendChild(c);
    }
  }

  function wire(win) {
    const node = win.el;
    node.addEventListener('pointerdown', () => front(win), true);
    node.querySelector('.close').addEventListener('click', () => closeWin(win));
    node.querySelector('.min').addEventListener('click', () => minimise(win, true));
    node.querySelector('.max').addEventListener('click', () => toggleMax(win));
    node.querySelector('.fw-bar').addEventListener('dblclick', (e) => { if (!e.target.closest('.fw-dot')) toggleMax(win); });

    drag(node.querySelector('.fw-bar'), (e) => !e.target.closest('.fw-dot'), (dx, dy) => {
      win.x += dx; win.y += dy; win.prev = null; clampWin(win); layout(win);
    });
    drag(node.querySelector('.fw-grip'), () => true, (dx, dy) => {
      win.w += dx; win.h += dy; win.prev = null; clampWin(win); layout(win);
    });

    const cv = win.canvas;
    let stirring = false, lx = 0, ly = 0;
    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r.height]; };
    cv.addEventListener('pointerdown', (e) => {
      sound.unlock();
      const [x, y, h] = local(e);
      cv.setPointerCapture(e.pointerId);
      if (y > h - SILL_HIT) { win.sill.open = true; win.sill.x = x; sound.gurgle(true); }
      else { stirring = true; lx = x; ly = y; }
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y, h] = local(e);
      win.sill.hover = y > h - SILL_HIT;
      win.sill.x = win.sill.open || win.sill.hover ? x : win.sill.x;
      if (stirring) {
        const r = contentRect(win);
        world.poke(r.x + x, r.y + y, x - lx, y - ly);
        lx = x; ly = y;
      }
    });
    const end = () => { if (win.sill.open) sound.gurgle(false); stirring = false; win.sill.open = false; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { win.sill.hover = false; });
  }

  function toggleMax(win) {
    if (win.prev) {
      Object.assign(win, win.prev); win.prev = null;
    } else {
      win.prev = { x: win.x, y: win.y, w: win.w, h: win.h };
      win.x = 0; win.y = 0; win.w = S.w; win.h = S.h;
    }
    layout(win);
  }

  function drag(handle, accept, onMove) {
    handle.addEventListener('pointerdown', (e) => {
      if (!accept(e)) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      let lx = e.clientX, ly = e.clientY;
      const move = (ev) => { onMove(ev.clientX - lx, ev.clientY - ly); lx = ev.clientX; ly = ev.clientY; };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function spawn() {
    const { w, h } = defaultSize();
    const k = wins.length % 6;
    const x = Math.round(S.w * 0.5 - w / 2 + (k - 2.5) * 26);
    const y = Math.round(S.h * 0.32 - h / 2 + (k - 2.5) * 22);
    const win = addWindow(x, y, w, h);
    front(win);
    sound.unlock();
    sound.pop();
    return win;
  }

  function startLayout() {
    for (const w of [...wins]) closeWin(w);
    nextN = 1;
    const { w, h } = defaultSize();
    if (params.has('layout')) {
      for (const r of params.get('layout').split(';')) {
        const [x, y, ww, hh] = r.split(',').map(Number);
        addWindow(x * S.w, y * S.h, ww * S.w, hh * S.h);
      }
      return;
    }
    addWindow(Math.round(S.w * 0.36), Math.round(Math.max(S.h * 0.08, Math.min(S.h * 0.3, 130))), w, h);
    addWindow(Math.round(S.w * 0.54), Math.round(S.h * 0.5), w, h);
  }

  // ----- wallpaper: faint marks where things are behind the desktop ----------

  function drawWall() {
    const w = S.w, h = window.innerHeight;
    wall.width = Math.round(w * dpr); wall.height = Math.round(h * dpr);
    wall.style.width = `${w}px`; wall.style.height = `${h}px`;
    const c = wall.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (!level) return;
    c.strokeStyle = 'rgba(220,235,255,0.16)';
    c.setLineDash([4, 5]);
    c.lineWidth = 1.2;
    for (const r of level.rocks) {
      if (r.ay > S.h + 20 && r.by > S.h + 20) continue;
      capsulePath(c, r);
      c.stroke();
    }
    c.setLineDash([]);
    for (const hz of level.heat) {
      const g = c.createRadialGradient(hz.x, hz.y, 0, hz.x, hz.y, hz.r);
      g.addColorStop(0, 'rgba(255,140,60,0.16)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(hz.x, hz.y, hz.r, 0, Math.PI * 2); c.fill();
    }
    c.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    c.textAlign = 'center';
    for (const s of level.springs) {
      c.strokeStyle = 'rgba(127,227,255,0.55)';
      c.setLineDash([2, 4]);
      c.beginPath(); c.arc(s.x, s.y, 16, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.fillStyle = 'rgba(127,227,255,0.6)';
      c.fillText('spring', s.x, s.y - 24);
    }
    for (const p of level.pots) {
      c.strokeStyle = 'rgba(255,200,170,0.5)';
      c.setLineDash([3, 4]);
      c.strokeRect(p.x, p.y, p.w, p.h);
      c.setLineDash([]);
      c.fillStyle = 'rgba(255,210,180,0.6)';
      c.fillText('pot', p.cx, p.y - 8);
    }
  }

  // ----- loop -----------------------------------------------------------------

  let acc = 0;
  let last = performance.now();
  let time = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 3) {
      for (const w of wins) {
        const r = contentRect(w);
        const drain = w.sill.open ? { open: true, x: r.x + w.sill.x } : null;
        world.setPane(w.id, { ...r, visible: !w.min, drain }, now);
      }
      world.step(now);
      acc -= 1 / 60;
      steps++;
    }
    if (steps === 3) acc = 0;
    time += dt;
    if (steps > 0) {
      lastSnap = world.snapshot();
      overlay.ingest(lastSnap.events, time);
      handleEvents(lastSnap.events);
    }
    overlay.update(lastSnap, dt);
    renderer.pace(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function draw() {
    const snap = lastSnap;
    const counts = new Map();
    if (snap) for (let i = 0; i < snap.n; i++) counts.set(snap.home[i], (counts.get(snap.home[i]) || 0) + 1);
    const keys = new Map();
    if (snap) for (const p of snap.panes) keys.set(p.id, p.key);
    for (const w of wins) {
      if (w.min) continue;
      const r = contentRect(w);
      const ctx = w.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      renderer.draw(ctx, w.canvas.width, w.canvas.height, r.x, r.y, r.w, r.h, snap, time, null);
      overlay.draw(ctx, dpr, r.x, r.y, r.w, r.h, snap, time, { sill: w.sill, arrows: true });
      const drops = counts.get(keys.get(w.id)) || 0;
      if (drops !== w.drops) {
        w.drops = drops;
        w.title.textContent = drops ? `Window ${w.n} · ${drops} drops` : `Window ${w.n}`;
      }
    }
    if (snap && level) {
      tbPots.innerHTML = level.pots.map((p, i) => {
        const f = Math.min(1, snap.fills[i] / p.need);
        return `<span class="tb-pot${f >= 1 ? ' full' : ''}"><i style="width:${Math.round(f * 100)}%"></i></span>`;
      }).join('');
    }
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.e === 'bloom') sound.bloom(ev.pot);
      if (ev.e === 'complete' && !completeShown) {
        completeShown = true;
        progress = recordWin(progress, ev.index, ev.time);
        sound.fanfare();
        const isLast = ev.index >= LEVELS.length - 2;
        setTimeout(() => {
          completeCard(ui, {
            name: level.name, seconds: ev.time, spilled: lastSnap.stats.spilled, steam: lastSnap.stats.steam, isLast,
            low: level.pots.some((p) => p.y < S.h * 0.55),
            compact: S.w < 600,
            onNext: () => { load(Math.min(LEVELS.length - 1, ev.index + 1)); startLayout(); },
            onReplay: () => { load(ev.index); startLayout(); },
          });
        }, 2200);
      }
    }
  }

  // ----- chrome -----------------------------------------------------------------

  bar.querySelector('.tb-new').addEventListener('click', spawn);
  bar.querySelector('.tb-levels').addEventListener('click', (e) => levelsMenu(e.currentTarget, progress, progress.current, (i) => { load(i); startLayout(); }));
  bar.querySelector('.tb-help').addEventListener('click', (e) => helpSheet(e.currentTarget, 'desk'));
  const sb = bar.querySelector('.tb-sound');
  sb.classList.toggle('off', sound.muted);
  sb.addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.muted); sb.classList.toggle('off', sound.muted); });
  bar.querySelector('.tb-real')?.addEventListener('click', onReal);

  let spaceDown = false;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || e.target.closest?.('input,textarea')) return;
    e.preventDefault();
    const top = [...wins].reverse().find((w) => !w.min);
    if (!top) return;
    spaceDown = true;
    top.sill.open = true;
    if (!top.sill.hover) top.sill.x = top.w / 2;
    sound.unlock(); sound.gurgle(true);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || !spaceDown) return;
    spaceDown = false;
    for (const w of wins) w.sill.open = false;
    sound.gurgle(false);
  });

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const n = deskRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const big = Math.abs(n.w - S.w) / S.w > 0.12 || Math.abs(n.h - S.h) / S.h > 0.12;
      S = n;
      if (big) { world.setScreen(S); load(progress.current); startLayout(); }
      for (const w of wins) { clampWin(w); layout(w); }
      drawWall();
    }, 150);
  });

  load(Math.min(progress.current, progress.unlocked));
  startLayout();
  requestAnimationFrame(frame);

  // Test hook: lets scripts drive windows the way a hand would.
  window.__sill = {
    mode: 'desk', world, wins,
    move(n, x, y, w, h) {
      const win = wins.find((k) => k.n === n);
      if (!win) return;
      Object.assign(win, { x, y }, w ? { w, h } : {});
      layout(win);
    },
    level: (i) => { load(i); startLayout(); },
    spawn: (x, y, w, h) => addWindow(x, y, w, h).n,
    minimise: (n, on) => { const win = wins.find((k) => k.n === n); if (win) minimise(win, on); },
    drain: (n, on, x) => { const win = wins.find((k) => k.n === n); if (win) { win.sill.open = on; win.sill.x = x ?? win.w / 2; } },
    hideHint: () => ui.querySelectorAll('.hint').forEach((h) => h.remove()),
    snap: () => lastSnap,
  };
}

function capsulePath(c, r) {
  const dx = r.bx - r.ax, dy = r.by - r.ay;
  const L = Math.hypot(dx, dy) || 1e-3;
  const a = Math.atan2(dy, dx);
  const nx = -dy / L * r.r, ny = dx / L * r.r;
  c.beginPath();
  c.moveTo(r.ax + nx, r.ay + ny);
  c.lineTo(r.bx + nx, r.by + ny);
  c.arc(r.bx, r.by, r.r, a + Math.PI / 2, a - Math.PI / 2, true);
  c.lineTo(r.ax - nx, r.ay - ny);
  c.arc(r.ax, r.ay, r.r, a - Math.PI / 2, a + Math.PI / 2, true);
  c.closePath();
}

export { fmtTime };
