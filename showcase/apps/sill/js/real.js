// Real-window mode. This window tells the shared world where it is on the
// monitor every frame and draws whatever part of the world is behind it.

import { Overlay } from './overlay.js';
import { LEVELS } from './levels.js';
import { el, levelsMenu, helpSheet, completeCard, hintToast, recordWin, saveProgress } from './ui.js';
import { Sound } from './sound.js';

const SILL_HIT = 24;

export function startReal({ renderer, progress, isPane, onFail }) {
  document.body.classList.add('mode-real');
  const params = new URLSearchParams(location.search);
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) + '';

  const view = el('canvas', 'real-view');
  const hud = el('div', 'real-hud');
  const ctrl = el('div', 'real-ctrl');
  const mapWrap = el('div', 'real-map');
  const map = el('canvas');
  const ui = el('div', 'real-ui');
  mapWrap.appendChild(map);
  document.body.append(view, hud, ctrl, mapWrap, ui);
  const ctx = view.getContext('2d');

  hud.innerHTML = `<div class="rh-logo">sill</div><div class="rh-level"></div><div class="rh-pots"></div><div class="rh-drops"></div>`;
  ctrl.innerHTML = `
    <button class="tb-btn rc-new" title="Open another window">+ Window</button>
    <button class="tb-btn rc-levels" data-pop>Levels</button>
    <button class="tb-btn rc-help" data-pop aria-label="How it works">?</button>
    <button class="tb-btn rc-sound" aria-label="Sound">♪</button>`;
  const rhLevel = hud.querySelector('.rh-level');
  const rhPots = hud.querySelector('.rh-pots');
  const rhDrops = hud.querySelector('.rh-drops');

  const overlay = new Overlay();
  const sound = new Sound();
  let level = null;
  let snap = null;
  let completeShown = -1;
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  const sill = { open: false, hover: false, x: 0 };

  // ----- where am I on the monitor? -------------------------------------------

  let forced = params.get('rect') ? params.get('rect').split(',').map(Number) : null;
  function readRect() {
    if (forced) return { x: forced[0], y: forced[1], w: forced[2], h: forced[3] };
    const side = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
    const top = Math.max(0, window.outerHeight - window.innerHeight - side);
    return { x: window.screenX + side, y: window.screenY + top, w: window.innerWidth, h: window.innerHeight };
  }
  function screenRect() {
    if (params.get('screen')) {
      const [x, y, w, h] = params.get('screen').split(',').map(Number);
      return { x, y, w, h };
    }
    const s = window.screen;
    return { x: s.availLeft ?? 0, y: s.availTop ?? 0, w: s.availWidth, h: s.availHeight };
  }

  // ----- link to the shared world ------------------------------------------------

  let worker;
  try {
    worker = new SharedWorker(new URL('./sim-worker.js', import.meta.url), { type: 'module', name: 'sill-world' });
  } catch (err) {
    console.error(err);
    onFail?.();
    return;
  }
  worker.onerror = (e) => {
    console.error('[sill] shared world failed to start', e.message || e);
    if (!level) {
      toast('This browser could not start the shared world that real windows need. Try the simulated desktop instead.');
      onFail?.(true);
    }
  };
  const port = worker.port;
  port.onmessage = (e) => onMessage(e.data);
  port.start();
  port.postMessage({ t: 'hello', id, screen: screenRect(), level: Math.min(progress.current, progress.unlocked) });

  function onMessage(msg) {
    if (msg.t === 'level') {
      level = msg;
      renderer.setLevel(level);
      overlay.setLevel(level);
      snap = null;
      completeShown = -1;
      ui.querySelectorAll('.card-complete').forEach((c) => c.remove());
      document.body.classList.remove('done');
      rhLevel.textContent = `${level.free ? '∞' : level.index + 1} · ${level.name}`;
      if (!isPane && window.innerWidth >= 600) hintToast(ui, level.index, level);
      progress.current = level.index;
      saveProgress(progress);
    } else if (msg.t === 'world') {
      if (!level || msg.version !== level.version) return;
      snap = msg;
      overlay.ingest(msg.events, time);
      for (const ev of msg.events) {
        if (ev.e === 'bloom' && document.hasFocus()) sound.bloom(ev.pot);
        if (ev.e === 'complete' && completeShown !== ev.index) {
          completeShown = ev.index;
          progress = recordWin(progress, ev.index, ev.time);
          if (document.hasFocus()) sound.fanfare();
          const isLast = ev.index >= LEVELS.length - 2;
          setTimeout(() => {
            if (completeShown !== ev.index) return;
            document.body.classList.add('done');
            completeCard(ui, {
              name: level.name, seconds: ev.time, spilled: snap.stats.spilled, steam: snap.stats.steam, isLast,
              low: level.pots.some((p) => (p.y - rect.y) / rect.h < 0.55),
              compact: small,
              onNext: () => requestLevel(Math.min(LEVELS.length - 1, ev.index + 1)),
              onReplay: () => requestLevel(ev.index),
            });
          }, 2200);
        }
      }
    } else if (msg.t === 'error') {
      console.error('[sill worker]', msg.message);
    }
  }

  function requestLevel(i) {
    port.postMessage({ t: 'level', index: i, screen: screenRect() });
  }

  // ----- frame ----------------------------------------------------------------------

  let rect = readRect();
  let time = 0;
  let last = performance.now();
  let drops = -1;
  let mapT = 0;

  function sendPane() {
    const visible = document.visibilityState === 'visible';
    port.postMessage({
      t: 'pane', id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, visible,
      drain: sill.open ? { open: true, x: rect.x + sill.x } : null,
    });
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    rect = readRect();
    sendPane();
    resize();
    overlay.update(snap, dt);
    renderer.pace(dt);
    maybeTipMaximised();

    let myKey = -99, used = null;
    if (snap) for (const p of snap.panes) if (p.id === id) { myKey = p.key; used = p; }
    // The world has not seen this frame's rect yet. Water homed here is shifted
    // by the difference, so it stays on the floor while the window is dragged.
    const sx = used ? rect.x - used.x : 0;
    const sy = used ? Math.min(0, rect.y + rect.h - (used.y + used.h)) : 0;
    const shift = (key) => (key === myKey ? [sx, sy] : null);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (level) {
      renderer.draw(ctx, view.width, view.height, rect.x, rect.y, rect.w, rect.h, snap, time, shift);
      overlay.draw(ctx, dpr, rect.x, rect.y, rect.w, rect.h, snap, time, { sill, arrows: true, arrowTop: small ? 48 : 70 });
    }

    let mine = 0;
    if (snap) for (let i = 0; i < snap.n; i++) if (snap.home[i] === myKey) mine++;
    if (mine !== drops) { drops = mine; updateTitle(mine); }

    if (level && snap) {
      rhPots.innerHTML = level.pots.map((p, i) => {
        const f = Math.min(1, snap.fills[i] / p.need);
        return `<span class="tb-pot${f >= 1 ? ' full' : ''}"><i style="width:${Math.round(f * 100)}%"></i></span>`;
      }).join('');
    }
    if ((mapT += dt) > 1 / 20) { mapT = 0; drawMap(myKey); }
    requestAnimationFrame(frame);
  }

  let small = false;
  function resize() {
    small = window.innerWidth < 600 || window.innerHeight < 420;
    document.body.classList.toggle('small', small);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
  }

  // Hidden windows get no animation frames, so they report in on a timer;
  // otherwise the world would hold their water until the 1.5 s timeout.
  setInterval(() => { if (document.visibilityState !== 'visible') { rect = readRect(); sendPane(); } }, 400);
  document.addEventListener('visibilitychange', () => { rect = readRect(); sendPane(); });
  window.addEventListener('pagehide', () => port.postMessage({ t: 'bye', id }));

  // ----- tab title and favicon show what this window is holding --------------------

  const fav = document.querySelector('link[rel=icon]') || document.head.appendChild(el('link'));
  fav.rel = 'icon';
  const fc = document.createElement('canvas');
  fc.width = fc.height = 32;
  let lastBucket = -1;
  function updateTitle(n) {
    document.title = n ? `${n} drops · Sill` : 'Sill';
    rhDrops.textContent = n ? `${n} drops in this window` : 'this window is dry';
    const bucket = Math.min(8, Math.ceil(n / 40));
    if (bucket === lastBucket) return;
    lastBucket = bucket;
    const c = fc.getContext('2d');
    c.clearRect(0, 0, 32, 32);
    c.fillStyle = '#0b1220'; roundRect(c, 1, 1, 30, 30, 7); c.fill();
    c.fillStyle = '#e9edf2'; roundRect(c, 4, 6, 24, 21, 3); c.fill();
    c.fillStyle = '#0b1424'; c.fillRect(6, 10, 20, 15);
    if (bucket) { c.fillStyle = '#4fd1f0'; const h = Math.round(15 * bucket / 8); c.fillRect(6, 25 - h, 20, h); }
    fav.href = fc.toDataURL('image/png');
  }

  // ----- minimap: the whole screen, every window, everything behind them -------------

  function drawMap(myKey) {
    if (!level) return;
    const S = level.screen;
    let x0 = S.x, y0 = S.y, x1 = S.x + S.w, y1 = S.y + S.h;
    const panes = snap ? snap.panes : [];
    for (const p of panes) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); }
    const W = Math.min(200, Math.max(120, window.innerWidth * 0.18));
    const k = W / (x1 - x0);
    const H = (y1 - y0) * k;
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (map.width !== cw || map.height !== ch) { map.width = cw; map.height = ch; map.style.width = `${W}px`; map.style.height = `${H}px`; }
    const c = map.getContext('2d');
    c.setTransform(dpr * k, 0, 0, dpr * k, -x0 * dpr * k, -y0 * dpr * k);
    c.clearRect(x0, y0, x1 - x0, y1 - y0);
    c.fillStyle = 'rgba(8,12,20,0.82)';
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1 / k;
    c.strokeRect(S.x, S.y, S.w, S.h);
    c.fillStyle = 'rgba(150,160,180,0.55)';
    for (const r of level.rocks) {
      c.lineWidth = r.r * 2; c.lineCap = 'round'; c.strokeStyle = 'rgba(120,130,150,0.6)';
      c.beginPath(); c.moveTo(r.ax, r.ay); c.lineTo(r.bx, r.by); c.stroke();
    }
    for (const hz of level.heat) { c.fillStyle = 'rgba(255,120,40,0.25)'; c.beginPath(); c.arc(hz.x, hz.y, hz.r, 0, Math.PI * 2); c.fill(); }
    for (const p of panes) {
      c.fillStyle = p.key === myKey ? 'rgba(127,227,255,0.16)' : 'rgba(255,255,255,0.06)';
      c.fillRect(p.x, p.y, p.w, p.h);
      c.strokeStyle = p.key === myKey ? 'rgba(127,227,255,0.9)' : 'rgba(230,235,245,0.5)';
      c.lineWidth = 1.5 / k;
      c.strokeRect(p.x, p.y, p.w, p.h);
    }
    if (snap) {
      c.fillStyle = '#4fd1f0';
      const s = 2.2 / k;
      for (let i = 0; i < snap.n; i++) c.fillRect(snap.pos[2 * i] - s / 2, snap.pos[2 * i + 1] - s / 2, s, s);
    }
    for (const s of level.springs) { c.fillStyle = '#7fe3ff'; c.beginPath(); c.arc(s.x, s.y, 5 / k, 0, Math.PI * 2); c.fill(); }
    level.pots.forEach((p, i) => {
      const full = snap && snap.fills[i] >= p.need;
      c.fillStyle = full ? '#9dffb8' : '#ff9d7a';
      c.fillRect(p.x, p.y, p.w, p.h);
    });
  }

  // ----- input -----------------------------------------------------------------------

  let stirring = false, lx = 0, ly = 0;
  view.addEventListener('pointerdown', (e) => {
    sound.unlock();
    view.setPointerCapture(e.pointerId);
    if (e.clientY > window.innerHeight - SILL_HIT) { sill.open = true; sill.x = e.clientX; sound.gurgle(true); }
    else { stirring = true; lx = e.clientX; ly = e.clientY; }
  });
  view.addEventListener('pointermove', (e) => {
    sill.hover = e.clientY > window.innerHeight - SILL_HIT;
    if (sill.open || sill.hover) sill.x = e.clientX;
    if (stirring) {
      port.postMessage({ t: 'poke', x: rect.x + e.clientX, y: rect.y + e.clientY, dx: e.clientX - lx, dy: e.clientY - ly });
      lx = e.clientX; ly = e.clientY;
    }
  });
  const end = () => { if (sill.open) sound.gurgle(false); sill.open = false; stirring = false; };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('pointerleave', () => { sill.hover = false; });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    sound.unlock();
    sill.open = true;
    if (!sill.hover) sill.x = window.innerWidth / 2;
    sound.gurgle(true);
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') end(); });
  window.addEventListener('blur', end);

  ctrl.querySelector('.rc-new').addEventListener('click', () => openWindow());
  ctrl.querySelector('.rc-levels').addEventListener('click', (e) => levelsMenu(e.currentTarget, progress, level ? level.index : 0, requestLevel));
  ctrl.querySelector('.rc-help').addEventListener('click', (e) => helpSheet(e.currentTarget, 'real'));
  const sb = ctrl.querySelector('.rc-sound');
  sb.classList.toggle('off', sound.muted);
  sb.addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.muted); sb.classList.toggle('off', sound.muted); });

  function openWindow() {
    sound.unlock();
    const s = window.screen;
    const w = 440, h = 360;
    const sl = s.availLeft ?? 0, st = s.availTop ?? 0;
    let left = window.screenX + window.outerWidth + 16;
    if (left + w > sl + s.availWidth) left = Math.max(sl, window.screenX - w - 16);
    if (left + w > sl + s.availWidth || left < sl) left = sl + Math.round((s.availWidth - w) / 2);
    const top = Math.max(st, Math.min(st + s.availHeight - h - 40, window.screenY + 60));
    const url = new URL(location.href);
    url.search = '?pane=1';
    const win = window.open(url.href, `sill-${Date.now()}`, `popup=yes,width=${w},height=${h},left=${Math.round(left)},top=${Math.round(top)}`);
    if (!win) toast('Your browser blocked the new window. Allow pop-ups for this page, or open this address in another window yourself. Every Sill window on this site shares one world.');
    else sound.pop();
  }

  // A maximised window's floor is the bottom of the monitor, which is below
  // almost everything; say so once per level.
  let tippedFor = -1;
  function maybeTipMaximised() {
    if (!level || tippedFor === level.index || forced) return;
    const S = level.screen;
    if (rect.w * rect.h < 0.8 * S.w * S.h || time < 4) return;
    tippedFor = level.index;
    toast('This window fills the screen, so its floor is the bottom of your monitor. Un-maximise it and drag its bottom edge up to raise the floor, or open a second window with + Window.');
  }

  function toast(text) {
    const t = el('div', 'toast', text);
    ui.appendChild(t);
    setTimeout(() => t.remove(), 7000);
  }

  window.__sill = {
    mode: 'real', id,
    setRect(x, y, w, h) { forced = [x, y, w, h]; },
    drain(on, x) { sill.open = on; sill.x = x ?? window.innerWidth / 2; },
    level: requestLevel,
    snap: () => snap,
    hideHint: () => ui.querySelectorAll('.hint').forEach((h) => h.remove()),
  };

  requestAnimationFrame(frame);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
