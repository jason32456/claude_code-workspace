import { analyse } from './engine.js';
import { readEnvelope } from './links.js';
import { h, confirmDialog, announce } from './ui/dom.js';
import { demoEvent, emptyEvent, loadState, saveState, clearState, loadTheme, saveTheme, validatePeople, sanitiseEvent, uid } from './ui/store.js';
import { createPeopleView } from './ui/people.js';
import { createRulesView } from './ui/rules.js';
import { createHatView } from './ui/handout.js';
import { hatIcon } from './ui/hat.js';

const params = new URLSearchParams(location.search);
const STEPS = [
  ['people', 'People'],
  ['rules', 'Rules'],
  ['hat', 'Hat'],
];

const stored = params.has('demo') ? null : loadState();
let event = stored?.event ?? demoEvent();
let step = STEPS.some(([k]) => k === params.get('step')) ? params.get('step') : stored?.step ?? 'people';
let cache = { key: '', value: null };

const save = () => saveState(event, step);

function analysis() {
  const key = JSON.stringify([event.mode, event.people.map((p) => [p.id, p.name, p.group]), event.bans]);
  if (cache.key !== key) cache = { key, value: analyse(event) };
  return cache.value;
}

async function commit(apply, revert) {
  if (event.draw) {
    const ok = await confirmDialog({
      title: 'Throw away the draw?',
      message: 'A draw already exists. Changing the people or the rules discards it, and links you already sent will stop matching.',
      confirm: 'Discard and edit',
      danger: true,
    });
    if (!ok) {
      revert?.();
      return false;
    }
  }
  event.draw = null;
  apply();
  save();
  renderSteps();
  return true;
}

const ctx = {
  event: () => event,
  commit,
  save,
  analysis,
  goto: (s, flag) => goto(s, flag),
  refreshHeader: () => renderSteps(),
};

const views = { people: createPeopleView(ctx), rules: createRulesView(ctx), hat: createHatView(ctx) };
const stage = document.getElementById('stage');
for (const [k] of STEPS) {
  views[k].el.hidden = true;
  views[k].el.dataset.step = k;
  stage.append(views[k].el);
}

const stepsEl = document.getElementById('steps');
function renderSteps() {
  stepsEl.replaceChildren(
    ...STEPS.map(([k, label], i) => {
      const done = (k === 'hat' && event.draw) || (k !== 'hat' && STEPS.findIndex(([x]) => x === step) > i);
      return h(
        'li',
        null,
        h('button', { type: 'button', class: `step${k === step ? ' current' : ''}${done ? ' done' : ''}`, 'aria-current': k === step ? 'step' : null, onclick: () => goto(k) }, h('span', { class: 'num', 'aria-hidden': 'true', text: done && k !== step ? '✓' : String(i + 1) }), h('span', { text: label }))
      );
    })
  );
}

function pruneBlank() {
  const keep = event.people.filter((p) => p.name.trim());
  if (keep.length !== event.people.length) {
    const ids = new Set(keep.map((p) => p.id));
    event.people = keep;
    event.bans = event.bans.filter((b) => ids.has(b.from) && ids.has(b.to));
  }
  for (const p of event.people) p.name = p.name.trim();
}

function goto(next, flag = false) {
  if (next !== 'people' && !views.hat.busy) {
    pruneBlank();
    if (!validatePeople(event).ok) {
      next = 'people';
      flag = true;
    }
  }
  step = next;
  for (const [k] of STEPS) views[k].el.hidden = k !== step;
  document.getElementById('event-title').value = event.title;
  views[step].show(flag);
  renderSteps();
  save();
  if (flag) announce('Fix the people list first.');
  window.scrollTo(0, 0);
}

function setEvent(ev, to = 'people') {
  event = ev;
  cache = { key: '', value: null };
  goto(to);
}

// Header
const titleInput = document.getElementById('event-title');
titleInput.addEventListener('input', () => {
  event.title = titleInput.value;
  save();
});

const themeBtn = document.getElementById('theme-toggle');
const currentTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function syncThemeBtn() {
  const dark = currentTheme() === 'dark';
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  themeBtn.dataset.mode = dark ? 'dark' : 'light';
}
themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  saveTheme(next);
  syncThemeBtn();
  views.rules.repaint();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  syncThemeBtn();
  views.rules.repaint();
});
const forced = params.get('theme');
if (forced === 'dark' || forced === 'light') document.documentElement.dataset.theme = forced;
else if (loadTheme()) document.documentElement.dataset.theme = loadTheme();
syncThemeBtn();
document.querySelector('.brand-icon').append(hatIcon());

// Menu
const menuBtn = document.getElementById('menu-btn');
const menu = document.getElementById('menu-panel');
const envFile = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
document.body.append(envFile);

const closeMenu = (refocus = false) => {
  menu.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
  if (refocus) menuBtn.focus();
};
const hasWork = () => event.draw || event.people.some((p) => p.name.trim());
const items = [
  ['New event', async () => {
    if (hasWork() && !(await confirmDialog({ title: 'Start a new event?', message: 'The current event is removed from this browser.', confirm: 'Start new', danger: true }))) return;
    setEvent(emptyEvent());
  }],
  ['Load the demo', async () => {
    if (hasWork() && !(await confirmDialog({ title: 'Load the demo group?', message: 'The current event is replaced by eight demo people.', confirm: 'Load demo', danger: true }))) return;
    setEvent(demoEvent());
  }],
  ['Import envelope…', () => envFile.click()],
  ['Reset everything', async () => {
    if (!(await confirmDialog({ title: 'Reset Hatful?', message: 'This deletes the saved event and starts again from the demo.', confirm: 'Reset', danger: true }))) return;
    clearState();
    setEvent(demoEvent());
  }],
];
menu.replaceChildren(...items.map(([label, fn]) => h('button', { type: 'button', role: 'menuitem', class: 'menu-item', text: label, onclick: () => { closeMenu(); fn(); } })));
menuBtn.addEventListener('click', () => {
  const open = menu.hidden;
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('button').focus();
});
menu.addEventListener('keydown', (e) => {
  const btns = [...menu.querySelectorAll('button')];
  const i = btns.indexOf(document.activeElement);
  if (e.key === 'Escape') closeMenu(true);
  else if (e.key === 'ArrowDown') (e.preventDefault(), btns[(i + 1) % btns.length].focus());
  else if (e.key === 'ArrowUp') (e.preventDefault(), btns[(i + btns.length - 1) % btns.length].focus());
  else if (e.key === 'Tab') closeMenu();
});
document.addEventListener('click', (e) => {
  if (!menu.hidden && !e.target.closest('.menu')) closeMenu();
});

envFile.addEventListener('change', async () => {
  const file = envFile.files[0];
  envFile.value = '';
  if (!file) return;
  try {
    const env = readEnvelope(await file.text());
    const ok = await confirmDialog({ title: 'Load this envelope?', message: `"${env.event.title || 'Untitled'}" with ${env.event.people.length} people replaces the current event. The hat stays closed until you open it.`, confirm: 'Load it' });
    if (!ok) return;
    const ev = sanitiseEvent({ ...env.event, id: uid(), usePin: false, draw: { ...env.draw, pins: {}, sent: {}, opened: false } });
    setEvent(ev, 'hat');
  } catch (e) {
    await confirmDialog({ title: 'Could not load that file', message: e.message || 'This is not a Hatful envelope.', confirm: 'OK', cancel: 'Close' });
  }
});

goto(step);
