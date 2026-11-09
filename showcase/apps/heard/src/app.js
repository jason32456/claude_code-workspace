import { h, $, toast } from './dom.js';
import { plan as makePlan, whatIf, cues, REASONS } from './schedule.js';
import { PRESETS } from './presets.js';
import { renderKitchen, renderDishes, fillLibrary, addFromLibrary } from './editor.js';
import { renderTimeline, tipFor } from './timeline.js';
import { startCook } from './cook.js';
import { encode, decode } from './codec.js';
import { clock, parseClock, dur } from './time.js';

const KEY = 'heard:v1';
const clone = (x) => JSON.parse(JSON.stringify(x));
const fromPreset = (pr) => ({ name: pr.name, serve: pr.serve, kitchen: clone(pr.kitchen), dishes: clone(pr.dishes) });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.menu?.dishes && s.menu.kitchen) return s;
    }
  } catch { /* storage blocked or corrupt */ }
  return { menu: fromPreset(PRESETS[0]), tab: 'timeline' };
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };

const state = load();
const ui = { open: new Set(), focus: null, rerender: () => render() };
let current = null;
let cooking = null;

const tip = {
  el: $('#tip'),
  show(e, rows) { this.el.replaceChildren(...rows); this.el.hidden = false; this.move(e); },
  move(e) {
    const r = this.el.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    this.el.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  },
  hide() { this.el.hidden = true; },
};

function menuWithClock() {
  return { ...state.menu, serveMin: parseClock(state.menu.serve) };
}

function replan() {
  const m = menuWithClock();
  const p = makePlan(m, m.kitchen);
  current = { menu: m, plan: p, help: null };
  return current;
}

let helpTimer = 0;
function scheduleHelp() {
  clearTimeout(helpTimer);
  helpTimer = setTimeout(() => {
    if (!current) return;
    const c = current;
    c.help = whatIf(c.menu, c.menu.kitchen, c.plan);
    if (c === current && state.tab === 'insights') renderInsights();
  }, 250);
}

let changeTimer = 0;
function change(fn) {
  fn();
  save();
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => render(), 0);
}

function nowRel(menu) {
  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  let rel = now - menu.serveMin;
  if (rel > 720) rel -= 1440;
  if (rel < -1080) rel += 1440;
  return rel;
}

function render() {
  const { menu, plan } = replan();
  $('#menu-name').value = menu.name;
  $('#serve').value = menu.serve;
  $('#dish-count').textContent = menu.dishes.length;
  renderKitchen($('#kitchen'), state.menu, change);
  renderDishes($('#dishes'), state.menu, plan, change, ui);
  renderStats();
  renderTab();
  const n = plan.issues.length;
  $('#issue-badge').hidden = !n;
  $('#issue-badge').textContent = n;
  scheduleHelp();
}

function renderStats() {
  const { menu, plan } = current;
  const late = plan.score.viol;
  const switches = plan.score.switches;
  const busiest = Math.max(0, ...plan.stats.cooks.map((c) => c.busy));
  const span = plan.stats.span;
  const tiles = [
    ['Start at', clock(menu.serveMin + plan.stats.start), plan.items.length ? `${dur(span)} before serving` : '—'],
    ['Hands-on', dur(busiest), plan.stats.cooks.length > 1 ? `busiest of ${plan.stats.cooks.length} cooks` : `of ${dur(span)}`],
    ['Longest break', dur(Math.max(0, ...plan.stats.cooks.map((c) => c.longestIdle))), 'time to sit down'],
    ['Oven changes', String(switches), switches ? 'temperature switches' : 'one temperature per oven'],
    ['Held too long', late ? `${late} min` : 'None', late ? `${plan.issues.filter((i) => i.kind === 'hold').length} step(s) — see Insights` : 'everything lands hot', late ? 'bad' : 'good'],
  ];
  $('#stats').replaceChildren(...tiles.map(([k, v, s, cls]) => h('div', { class: 'stat ' + (cls || '') }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 's' }, s))));
}

function renderTab() {
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  for (const t of ['timeline', 'sheet', 'insights']) $(`#tab-${t}`).hidden = state.tab !== t;
  if (state.tab === 'timeline') renderTimeline($('#tab-timeline'), current.menu, current.plan, { onPick: pick, tip, nowMin: nowRel(current.menu) });
  if (state.tab === 'sheet') renderSheet();
  if (state.tab === 'insights') renderInsights();
}

function pick(stepId) {
  const d = state.menu.dishes.find((x) => x.steps.some((s) => s.id === stepId));
  if (!d) return;
  ui.open.add(d.id);
  render();
  if (document.body.dataset.mobile !== 'menu' && innerWidth < 900) setMobile('menu');
  const li = document.querySelector(`.step[data-step="${CSS.escape(stepId)}"]`);
  li?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  li?.classList.add('flash');
  setTimeout(() => li?.classList.remove('flash'), 1400);
}

function renderSheet() {
  const { menu, plan } = current;
  const host = $('#tab-sheet');
  const list = cues(plan);
  const groups = [];
  for (const c of list) {
    const last = groups[groups.length - 1];
    if (last && last.t === c.t) last.cues.push(c); else groups.push({ t: c.t, cues: [c] });
  }
  host.replaceChildren(
    h('div', { class: 'sheet-head' },
      h('div', {}, h('h2', {}, menu.name), h('p', { class: 'muted small' }, `Serve at ${clock(menu.serveMin)} · ${menu.kitchen.cooks} cook${menu.kitchen.cooks > 1 ? 's' : ''}, ${menu.kitchen.burners} burners, ${menu.kitchen.ovens.length} oven${menu.kitchen.ovens.length === 1 ? '' : 's'}`)),
      h('button', { class: 'btn ghost sm noprint', onclick: () => print() }, 'Print')),
    plan.items.length ? h('ol', { class: 'sheet' }, groups.map((g) => h('li', {},
      h('time', {}, clock(menu.serveMin + g.t)),
      h('div', { class: 'acts' }, g.cues.map((c) => {
        const it = c.item;
        const dish = it && menu.dishes.find((d) => d.id === it.dish);
        return h('label', { class: 'act ' + c.kind, style: dish ? { '--c': `var(--d${dish.color % 8})` } : {} },
          h('input', { type: 'checkbox', class: 'noprint-box' }),
          h('span', {}, it ? [h('b', {}, it.dishName), ' — ', it.label] : h('b', {}, c.text),
            it && h('span', { class: 'muted small' }, ` (${dur(it.end - it.start)}${it.hands ? `, ${dur(it.hands)} hands-on` : ', passive'}${it.equip === 'oven' ? `, oven ${it.oven + 1} ${it.temp}°` : ''}${it.cook >= 0 && menu.kitchen.cooks > 1 ? `, cook ${it.cook + 1}` : ''})`),
            it?.late ? h('span', { class: 'pill bad' }, `waits +${it.late}`) : null));
      }))))) : h('p', { class: 'muted' }, 'Nothing to do yet.'),
  );
}

function sentence(issue, menu) {
  const it = issue.item;
  if (issue.kind === 'impossible') return [h('b', {}, `${it.dishName}: ${it.label}`), ` can’t be done here — ${REASONS[issue.reason] || 'no room'}.`];
  const next = it.final ? 'serving' : 'the next step';
  return [h('b', {}, `${it.dishName}: ${it.label}`), ` finishes at ${clock(menu.serveMin + it.end)} and waits ${dur(it.late)} longer than its ${dur(it.hold)} hold before ${next}, because ${REASONS[issue.reason] || 'the kitchen was full'} when it should have been running.`];
}

function renderInsights() {
  const { menu, plan, help } = current;
  const host = $('#tab-insights');
  const cards = [];
  cards.push(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, plan.issues.length ? 'What doesn’t fit' : 'Everything fits')),
    plan.issues.length
      ? h('ul', { class: 'issues' }, plan.issues.map((x) => h('li', { onclick: () => pick(x.step) }, sentence(x, menu))))
      : h('p', { class: 'muted' }, 'Every step finishes inside its hold window, and every dish is ready for its course on time.')));
  cards.push(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'What would help'), h('span', { class: 'muted small' }, 'one extra of each, re-planned')),
    help == null ? h('p', { class: 'muted' }, 'Trying alternatives…')
      : help.length ? h('ul', { class: 'helps' }, help.map((x) => h('li', {},
        h('div', {}, h('b', {}, x.label), h('span', { class: 'muted small' }, ' — ',
          [x.fixed > 0 && `${dur(x.fixed)} less waiting`, x.saved > 0 && `starts ${dur(x.saved)} later`, x.saved < 0 && `starts ${dur(-x.saved)} earlier`, x.impossibleFixed > 0 && `${x.impossibleFixed} impossible step(s) fixed`].filter(Boolean).join(', '))),
        h('button', { class: 'btn ghost xs', onclick: () => change(() => { state.menu.kitchen = clone(x.kitchen); }) }, 'Apply'))))
      : h('p', { class: 'muted' }, 'Nothing extra would make this plan meaningfully better. Your kitchen is enough.')));
  const span = Math.max(1, plan.stats.span + plan.stats.end);
  cards.push(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Load')),
    h('div', { class: 'loads' },
      plan.stats.cooks.map((c, k) => loadRow(`Cook ${k + 1}`, c.busy / span, `${dur(c.busy)} hands-on`)),
      menu.kitchen.burners ? loadRow('Burners', plan.items.filter((i) => i.equip === 'burner').reduce((n, i) => n + i.end - i.start, 0) / (span * menu.kitchen.burners), `${plan.burnerLanes} of ${menu.kitchen.burners} at peak`) : null,
      plan.ovens.map((o, k) => loadRow(menu.kitchen.ovens[k]?.name || `Oven ${k + 1}`, o.blocks.reduce((n, b) => n + b.end - b.start, 0) / span, o.blocks.length ? o.blocks.map((b) => `${b.temp}°`).join(' → ') : 'unused'))),
    h('p', { class: 'muted small' }, 'How it plans: every step is placed as late as the steps after it allow, starting from serving and working backwards. A step that finds the cook, a burner or the oven taken slides earlier. Several hundred orderings are tried, and the one with the least waiting wins. The same menu always gives the same plan.')));
  host.replaceChildren(...cards);
}

function loadRow(label, frac, note) {
  return h('div', { class: 'load' }, h('span', {}, label), h('div', { class: 'meter' }, h('i', { style: { width: `${Math.min(100, Math.round(frac * 100))}%` } })), h('span', { class: 'muted small' }, note));
}

function setMobile(m) {
  document.body.dataset.mobile = m;
  document.querySelectorAll('.mobile-tabs button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.m === m)));
  if (m !== 'menu') { state.tab = m; renderTab(); }
}

// ---- wiring ----
const presetSel = $('#preset');
presetSel.replaceChildren(h('option', { value: '' }, 'Load preset…'), ...PRESETS.map((p) => h('option', { value: p.key }, p.name)));
presetSel.addEventListener('change', () => {
  const pr = PRESETS.find((p) => p.key === presetSel.value);
  presetSel.value = '';
  if (!pr) return;
  const prev = clone(state.menu);
  change(() => { state.menu = fromPreset(pr); ui.open.clear(); });
  toast(`Loaded ${pr.name}. ${pr.blurb}`, { label: 'Undo', run: () => change(() => { state.menu = prev; }) });
});
const lib = $('#add-dish');
fillLibrary(lib);
lib.addEventListener('change', () => {
  if (lib.value === '') return;
  const i = +lib.value;
  lib.value = '';
  change(() => { const d = addFromLibrary(state.menu, i); ui.open.add(d.id); });
});
$('#menu-name').addEventListener('change', (e) => change(() => { state.menu.name = e.target.value || 'Dinner'; }));
$('#serve').addEventListener('change', (e) => { if (e.target.value) change(() => { state.menu.serve = e.target.value.slice(0, 5); }); });
document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; save(); renderTab(); }));
document.querySelectorAll('.mobile-tabs button').forEach((b) => b.addEventListener('click', () => setMobile(b.dataset.m)));

$('#btn-share').addEventListener('click', async () => {
  try {
    const code = await encode(state.menu);
    const url = `${location.origin}${location.pathname}#m=${code}`;
    history.replaceState(null, '', `#m=${code}`);
    await navigator.clipboard.writeText(url);
    toast('Link copied — it carries the whole menu and kitchen.');
  } catch {
    toast('Link is in the address bar — copy it from there.');
  }
});

const themeBtn = $('#btn-theme');
const applyTheme = () => { if (state.theme) document.documentElement.dataset.theme = state.theme; else delete document.documentElement.dataset.theme; };
themeBtn.addEventListener('click', () => {
  const dark = state.theme ? state.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  state.theme = dark ? 'light' : 'dark';
  save(); applyTheme(); renderTab();
});
applyTheme();

function cook(demo) {
  if (!current.plan.items.length) return toast('Add a dish first.');
  cooking = startCook($('#cook'), current.menu, current.plan, { demo, onExit: () => { cooking = null; renderTab(); } });
}
$('#btn-cook').addEventListener('click', () => {
  const m = current.menu, p = current.plan;
  const rel = nowRel(m);
  // If the first call is hours away, offer the demo clock instead of a blank screen.
  if (rel < p.stats.start - 10 || rel > p.stats.end + 30) {
    const card = h('div', { class: 'choose' },
      h('h3', {}, 'Start cooking'),
      h('p', {}, rel < p.stats.start ? `Your first call is at ${clock(m.serveMin + p.stats.start)}, in ${dur(p.stats.start - rel)}.` : `Serving time ${clock(m.serveMin)} has passed.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => { dlg.close(); cook(true); } }, 'Demo at ×60'),
        rel < p.stats.start && h('button', { class: 'btn ghost', onclick: () => { dlg.close(); cook(false); } }, 'Wait for it live'),
        h('button', { class: 'btn ghost', onclick: () => {
          dlg.close();
          const d = new Date();
          const serve = Math.ceil((d.getHours() * 60 + d.getMinutes() - p.stats.start + 2) / 5) * 5;
          change(() => { state.menu.serve = clock(serve); });
          toast(`Serve time moved to ${clock(serve)} so you can start now.`);
          setTimeout(() => cook(false), 50);
        } }, 'Start now, eat later')));
    const dlg = h('dialog', { class: 'dlg', onclose: () => dlg.remove() }, card);
    document.body.append(dlg);
    dlg.showModal();
    return;
  }
  cook(false);
});

addEventListener('resize', () => { if (state.tab === 'timeline' && !cooking) renderTab(); });
setInterval(() => { if (!cooking && state.tab === 'timeline' && !document.hidden) renderTab(); }, 60000);
document.addEventListener('keydown', (e) => {
  if (cooking || e.target.closest('input,select,textarea,dialog')) return;
  if (e.key === 'c') $('#btn-cook').click();
  if (e.key === '1') { state.tab = 'timeline'; renderTab(); }
  if (e.key === '2') { state.tab = 'sheet'; renderTab(); }
  if (e.key === '3') { state.tab = 'insights'; renderTab(); }
});

async function boot() {
  const m = /#m=([\w-]+)/.exec(location.hash);
  if (m) {
    try {
      const menu = await decode(m[1]);
      state.menu = menu;
      save();
      toast(`Opened shared menu “${menu.name}”.`);
    } catch (err) { toast(`Couldn’t open that link: ${err.message}`); }
  }
  render();
  setMobile(innerWidth < 900 ? (state.tab || 'timeline') : document.body.dataset.mobile);
  window.__heard = { state, get current() { return current; }, cook, setTab: (t) => { state.tab = t; renderTab(); }, pick, tipFor };
}
boot();
