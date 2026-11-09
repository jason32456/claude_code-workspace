import { h } from './dom.js';
import { cues } from './schedule.js';
import { clock, countdown, dur } from './time.js';
import { heat } from './timeline.js';

// Live cook mode. Each cue gets an absolute timestamp; "running late" pushes
// every cue that hasn't fired yet. A simulated clock lets the plan be demoed.

let audio;
function chime(urgent) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    for (const [i, f] of (urgent ? [880, 1175, 1568] : [988, 1319]).entries()) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.28, t + i * 0.16 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.9);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.16); o.stop(t + i * 0.16 + 1);
    }
  } catch { /* no audio: the screen still shows the call */ }
}

function say(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    speechSynthesis.speak(u);
  } catch { /* fine */ }
}

export function startCook(host, menu, plan, { onExit, demo }) {
  const serveMin = menu.serveMin;
  const now0 = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let serveAt = today.getTime() + serveMin * 60000;
  if (serveAt + plan.stats.end * 60000 < now0 - 30 * 60000) serveAt += 86400000; // already past: tomorrow
  const list = cues(plan).map((c, i) => ({ ...c, i, at: serveAt + c.t * 60000, fired: false, heard: false }));
  const items = new Map(plan.items.map((it) => [it.id, { ...it, at: serveAt + it.start * 60000, endAt: serveAt + it.end * 60000, handsAt: serveAt + it.handsEnd * 60000 }]));
  const firstAt = list[0]?.at ?? serveAt;

  let speed = demo ? 60 : 1;
  let simBase = demo ? firstAt - 20000 : now0;
  let realBase = performance.now();
  let voice = true;
  let slip = 0;
  let timer = 0, lock = null;
  const sim = () => simBase + (performance.now() - realBase) * speed;
  const setSpeed = (s) => { simBase = sim(); realBase = performance.now(); speed = s; draw(); };

  // Skip calls that are already in the past when cook mode opens live.
  const t = sim();
  for (const c of list) if (c.at < t - 60000) { c.fired = true; c.heard = true; }

  const els = {};
  host.replaceChildren(
    h('div', { class: 'cook-top' },
      h('div', { class: 'cook-clock' }, els.clock = h('span', { class: 'big' }), els.mode = h('span', { class: 'muted small' })),
      els.toServe = h('div', { class: 'to-serve' }),
      h('div', { class: 'cook-ctl' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Clock speed' },
          [[1, 'Live'], [10, '×10'], [60, '×60']].map(([v, l]) => h('button', { 'data-speed': v, onclick: () => {
            if (v === 1 && speed !== 1) { simBase = Date.now(); realBase = performance.now(); speed = 1; draw(); } else setSpeed(v);
          } }, l))),
        els.voice = h('button', { class: 'btn ghost sm', onclick: () => { voice = !voice; draw(); } }),
        h('button', { class: 'btn ghost sm', title: 'Push everything that has not started yet back 5 minutes', onclick: () => {
          const tt = sim();
          slip += 5;
          for (const c of list) if (!c.fired) c.at += 300000;
          for (const it of items.values()) if (it.at > tt) { it.at += 300000; it.endAt += 300000; it.handsAt += 300000; }
          serveAt += 300000;
          draw();
        } }, 'Running late +5'),
        h('button', { class: 'btn sm', onclick: () => exit() }, 'Exit'))),
    h('div', { class: 'cook-grid' },
      h('section', { class: 'now-col' }, h('h3', {}, 'Now'), els.now = h('div', { class: 'now-cards' })),
      h('section', { class: 'next-col' }, h('h3', {}, 'Up next'), els.next = h('ol', { class: 'next' }),
        h('h3', { class: 'mt' }, 'Ovens'), els.ovens = h('div', { class: 'oven-chips' }))),
    h('p', { class: 'cook-help muted small' }, 'Space = Heard · every call chimes until someone taps Heard'),
  );

  function heardOldest() {
    const c = list.find((x) => x.fired && !x.heard);
    if (c) { c.heard = true; draw(); }
  }
  const onKey = (e) => {
    if (e.key === ' ' && !e.target.closest('input,select,textarea')) { e.preventDefault(); heardOldest(); }
    if (e.key === 'Escape') exit();
  };
  document.addEventListener('keydown', onKey);
  try { navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {}); } catch { /* unsupported */ }

  let lastNag = 0;
  function tick() {
    const tt = sim();
    let fresh = null;
    for (const c of list) if (!c.fired && c.at <= tt) { c.fired = true; fresh = c; }
    if (fresh) {
      chime(fresh.kind === 'serve');
      if (voice) say(fresh.call);
      lastNag = performance.now();
    } else if (list.some((c) => c.fired && !c.heard) && performance.now() - lastNag > 30000) {
      chime(false); lastNag = performance.now();
    }
    draw();
  }

  function draw() {
    const tt = sim();
    const nowMin = (tt - today.getTime()) / 60000;
    els.clock.textContent = clock(nowMin) + ':' + String(Math.floor((tt / 1000) % 60)).padStart(2, '0');
    els.mode.textContent = speed === 1 ? 'live' : `demo ×${speed}`;
    host.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === speed));
    els.voice.textContent = voice ? 'Voice on' : 'Voice off';
    const toServe = (serveAt - tt) / 1000;
    els.toServe.replaceChildren(
      toServe > 0 ? h('span', {}, h('b', {}, countdown(toServe)), ` to serve at ${clock((serveAt - today.getTime()) / 60000)}`) : h('b', {}, 'Service!'),
      ...(slip ? [h('span', { class: 'pill bad' }, `+${slip} min late`)] : []));

    // Now: called-but-unheard cues first, then steps in progress.
    const cards = [];
    for (const c of list) if (c.fired && !c.heard) cards.push(callCard(c, tt));
    for (const it of items.values()) if (it.at <= tt && tt < it.endAt) {
      const c = list.find((x) => x.kind === 'step' && x.item.id === it.id);
      if (c && !c.heard) continue;
      cards.push(runCard(it, tt));
    }
    if (!cards.length) {
      const next = list.find((c) => !c.fired);
      cards.push(h('div', { class: 'idle' }, next ? [h('p', {}, 'Nothing needs you right now.'), h('p', { class: 'muted' }, `Next: ${next.text} in ${countdown((next.at - tt) / 1000)}`)] : h('p', {}, 'All done. Enjoy it.')));
    }
    els.now.replaceChildren(...cards);
    els.next.replaceChildren(...list.filter((c) => !c.fired).slice(0, 7).map((c) => h('li', { style: c.item ? { '--c': `var(--d${dishColor(c.item.dish)})` } : {} },
      h('span', { class: 'when' }, countdown((c.at - tt) / 1000)),
      h('span', { class: 'at muted small' }, clock((c.at - today.getTime()) / 60000)),
      h('span', { class: 'what' }, c.text, c.item?.hands ? h('span', { class: 'muted small' }, ` · ${dur(c.item.hands)} hands-on`) : null))));
    els.ovens.replaceChildren(...plan.ovens.map((o, k) => {
      const relMin = (tt - serveAt) / 60000 + 0;
      const block = o.blocks.find((b) => b.start <= relMin && relMin < b.end);
      const ph = o.preheats.find((p) => p.at <= relMin && relMin < p.ready);
      const name = menu.kitchen.ovens[k]?.name || `Oven ${k + 1}`;
      if (ph) return h('div', { class: 'oven-chip', style: { '--h': heat(ph.to) } }, h('b', {}, name), ` ${ph.kind === 'heat' ? 'heating' : 'cooling'} to ${ph.to}° — ready in ${countdown((ph.ready - relMin) * 60)}`);
      if (block) return h('div', { class: 'oven-chip on', style: { '--h': heat(block.temp) } }, h('b', {}, name), ` ${block.temp}°`);
      return h('div', { class: 'oven-chip' }, h('b', {}, name), ' off');
    }));
  }

  const dishColor = (id) => (menu.dishes.find((d) => d.id === id)?.color || 0) % 8;

  function callCard(c, tt) {
    const it = c.item && items.get(c.item.id);
    return h('div', { class: 'call ' + c.kind, style: it ? { '--c': `var(--d${dishColor(it.dish)})` } : {} },
      h('div', { class: 'call-kicker' }, c.kind === 'serve' ? 'Service' : c.kind.startsWith('oven') ? 'Oven' : it.dishName),
      h('div', { class: 'call-text' }, c.kind === 'step' ? it.label : c.text),
      it && h('div', { class: 'muted small' }, it.hands ? `${dur(it.hands)} hands-on` : 'No attention needed', it.equip === 'oven' ? ` · oven ${it.oven + 1} at ${it.temp}°` : it.equip === 'burner' ? ' · on a burner' : '', ` · done at ${clock((it.endAt - today.getTime()) / 60000)}`),
      h('button', { class: 'btn primary heard', onclick: () => { c.heard = true; draw(); } }, 'Heard'));
  }

  function runCard(it, tt) {
    const total = it.endAt - it.at, left = (it.endAt - tt) / 1000;
    const handsLeft = (it.handsAt - tt) / 1000;
    return h('div', { class: 'run', style: { '--c': `var(--d${dishColor(it.dish)})` } },
      h('div', { class: 'run-head' }, h('b', {}, it.dishName), h('span', { class: 'mono' }, countdown(left))),
      h('div', {}, it.label),
      h('div', { class: 'muted small' }, handsLeft > 0 ? `Hands-on for ${countdown(handsLeft)} more` : 'Passive — walk away'),
      h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, ((tt - it.at) / total) * 100)}%` } })));
  }

  function exit() {
    clearInterval(timer);
    document.removeEventListener('keydown', onKey);
    try { speechSynthesis.cancel(); } catch { /* fine */ }
    try { lock?.release(); } catch { /* fine */ }
    host.hidden = true;
    document.body.classList.remove('cooking');
    onExit();
  }

  host.hidden = false;
  document.body.classList.add('cooking');
  draw();
  timer = setInterval(tick, 250);
  return { exit, setSpeed, heardOldest };
}
