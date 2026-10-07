// UI shared by both modes: progress storage, the levels menu, the completion
// card, the help sheet and the hint toast.

import { LEVELS } from './levels.js';

const KEY = 'sill.progress.v1';

export function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p.unlocked === 'number') return { unlocked: p.unlocked, current: p.current | 0, best: p.best || {} };
  } catch {}
  return { unlocked: 0, current: 0, best: {} };
}

export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

// Merges a finished level into progress and returns the new progress.
export function recordWin(progress, index, seconds) {
  const id = LEVELS[index].id;
  const best = { ...progress.best };
  if (!(id in best) || seconds < best[id]) best[id] = Math.round(seconds * 10) / 10;
  const p = { unlocked: Math.max(progress.unlocked, Math.min(LEVELS.length - 1, index + 1)), current: progress.current, best };
  saveProgress(p);
  return p;
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

let openPop = null;
export function closePopover() {
  if (openPop) { openPop.remove(); openPop = null; }
}
document.addEventListener('pointerdown', (e) => {
  if (openPop && !openPop.contains(e.target) && !e.target.closest('[data-pop]')) closePopover();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopover(); });

export function levelsMenu(anchor, progress, current, onPick) {
  closePopover();
  const pop = el('div', 'pop pop-levels');
  pop.appendChild(el('div', 'pop-title', 'Levels'));
  LEVELS.forEach((lv, i) => {
    const locked = i > progress.unlocked;
    const best = progress.best[lv.id];
    const b = el('button', 'pop-level' + (i === current ? ' on' : '') + (locked ? ' locked' : ''));
    const tag = locked ? (lv.free ? 'finish all' : 'locked') : best != null ? fmtTime(best) : '';
    b.innerHTML = `<span class="n">${lv.free ? '∞' : i + 1}</span><span class="t">${lv.name}</span><span class="b">${tag}</span>`;
    b.disabled = locked;
    b.addEventListener('click', () => { closePopover(); onPick(i); });
    pop.appendChild(b);
  });
  place(pop, anchor);
}

export function helpSheet(anchor, mode) {
  closePopover();
  const pop = el('div', 'pop pop-help');
  pop.innerHTML = `
    <div class="pop-title">How the water works</div>
    <ul>
      <li><b>${mode === 'real' ? 'Your windows' : 'The windows'} are the only containers.</b> Water rests on their floor. Their tops are open.</li>
      <li><b>Overlap windows</b> to join them: water flows across the overlap.</li>
      <li><b>Drag a window up</b> to lift the water in it. Gravity can only take it down.</li>
      <li><b>Hold the bottom strip</b> of a window (or Space) to open its sill and pour.</li>
      <li><b>${mode === 'real' ? 'Minimise or close' : 'Minimise or close'}</b> a window and whatever it held falls.</li>
      <li><b>Drag inside the water</b> to stir it.</li>
      <li>The spring only runs while a window is over it.</li>
    </ul>
    <div class="pop-foot">${mode === 'real' ? '<a href="?mode=desk">Switch to the simulated desktop</a>' : 'Real windows work in desktop Chrome, Edge, Firefox and Safari.'}</div>`;
  place(pop, anchor);
}

function place(pop, anchor) {
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = Math.min(window.innerWidth - pw - 8, Math.max(8, r.right - pw));
  let y = r.bottom + 8;
  if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 8);
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  openPop = pop;
}

export function completeCard(host, { name, seconds, spilled, steam, isLast, onNext, onReplay, low, compact }) {
  const card = el('div', 'card-complete' + (compact ? ' compact' : low ? ' low' : ' high'));
  if (compact) {
    card.innerHTML = `<span class="cc-kicker">Bloomed</span><span class="cc-mini">${fmtTime(seconds)}</span><button class="btn" data-a="next">${isLast ? 'Garden' : 'Next'}</button><button class="btn ghost" data-a="replay" hidden></button>`;
  } else card.innerHTML = `
    <div class="cc-kicker">Bloomed</div>
    <div class="cc-name">${name}</div>
    <div class="cc-stats"><span>${fmtTime(seconds)}</span><span>${spilled} spilled</span>${steam ? `<span>${steam} steamed</span>` : ''}</div>
    <div class="cc-actions">
      <button class="btn ghost" data-a="replay">Replay</button>
      <button class="btn" data-a="next">${isLast ? 'Free Garden' : 'Next level'}</button>
    </div>`;
  card.querySelector('[data-a=next]').addEventListener('click', () => { card.remove(); onNext(); });
  card.querySelector('[data-a=replay]').addEventListener('click', () => { card.remove(); onReplay(); });
  host.appendChild(card);
  return card;
}

export function hintToast(host, index, lv) {
  host.querySelectorAll('.hint').forEach((h) => h.remove());
  const h = el('div', 'hint');
  h.innerHTML = `<div class="hint-k">${lv.free ? 'Free Garden' : `Level ${index + 1}`} · ${lv.name}</div><div class="hint-t">${lv.hint}</div><button class="hint-x" aria-label="Dismiss">×</button>`;
  h.querySelector('.hint-x').addEventListener('click', () => h.remove());
  host.appendChild(h);
  return h;
}
