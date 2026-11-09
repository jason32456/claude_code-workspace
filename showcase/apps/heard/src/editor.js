import { h } from './dom.js';
import { LIBRARY, DISH_COLORS } from './presets.js';
import { dur } from './time.js';

let n = 0;
export const uid = (p = 's') => p + Date.now().toString(36).slice(-4) + (n++).toString(36) + Math.random().toString(36).slice(2, 5);

function stepper(label, value, min, max, onSet, hint) {
  const out = h('output', {}, value);
  const set = (v) => { v = Math.max(min, Math.min(max, v)); out.value = v; onSet(v); };
  return h('div', { class: 'stepper' },
    h('span', { class: 'st-label' }, label, hint && h('span', { class: 'muted small' }, ' ' + hint)),
    h('div', { class: 'st-ctl' },
      h('button', { class: 'btn ghost xs', 'aria-label': `Fewer ${label}`, disabled: value <= min, onclick: () => set(value - 1) }, '−'),
      out,
      h('button', { class: 'btn ghost xs', 'aria-label': `More ${label}`, disabled: value >= max, onclick: () => set(value + 1) }, '+')));
}

export function renderKitchen(host, menu, change) {
  const k = menu.kitchen;
  host.replaceChildren(
    stepper('Cooks', k.cooks, 1, 4, (v) => change(() => { k.cooks = v; }), 'pairs of hands'),
    stepper('Burners', k.burners, 0, 8, (v) => change(() => { k.burners = v; })),
    stepper('Ovens', k.ovens.length, 0, 3, (v) => change(() => {
      while (k.ovens.length < v) k.ovens.push({ name: k.ovens.length ? `Oven ${k.ovens.length + 1}` : 'Oven', slots: 2 });
      k.ovens.length = v;
    })),
    ...k.ovens.map((o, i) => h('div', { class: 'oven-row' },
      h('input', { value: o.name, 'aria-label': `Name of oven ${i + 1}`, maxlength: 20, onchange: (e) => change(() => { o.name = e.target.value || `Oven ${i + 1}`; }) }),
      stepper('rack slots', o.slots, 1, 6, (v) => change(() => { o.slots = v; })))),
    h('p', { class: 'muted small note' }, 'Ovens heat at ~12 °C/min and cool at ~5 °C/min; Heard leaves that gap whenever an oven changes temperature.'),
  );
}

export function fillLibrary(select) {
  select.replaceChildren(h('option', { value: '' }, '+ Add dish'), ...LIBRARY.map((d, i) => h('option', { value: i }, d.name)));
}

export function addFromLibrary(menu, i) {
  const src = LIBRARY[i];
  const used = new Set(menu.dishes.map((d) => d.color));
  let color = 0;
  while (used.has(color) && color < DISH_COLORS - 1) color++;
  const dish = { id: uid('d'), name: src.name, color, offset: 0, steps: src.steps.map((s) => ({ ...s, id: uid() })) };
  menu.dishes.push(dish);
  return dish;
}

const COURSES = [[-30, 'Starter (−30 min)'], [0, 'Main'], [45, 'Dessert (+45 min)']];

export function renderDishes(host, menu, plan, change, ui) {
  host.replaceChildren();
  const issuesBy = new Map(plan.items.map((i) => [i.id, i]));
  const allSteps = menu.dishes.flatMap((d) => d.steps.map((s, i) => ({ d, s, i })));
  for (const d of menu.dishes) {
    const open = ui.open.has(d.id);
    const late = d.steps.reduce((m, s) => m + (issuesBy.get(s.id)?.late || 0), 0);
    const total = d.steps.reduce((m, s) => m + (+s.dur || 0), 0);
    const courseOpts = COURSES.some(([v]) => v === (d.offset || 0)) ? COURSES : [...COURSES, [d.offset, `Custom (${d.offset > 0 ? '+' : ''}${d.offset} min)`]];
    const card = h('article', { class: 'dish' + (open ? ' open' : ''), style: { '--c': `var(--d${d.color % 8})` }, 'data-dish': d.id },
      h('header', {},
        h('button', { class: 'dot', title: 'Change colour', 'aria-label': 'Change colour', onclick: () => change(() => { d.color = (d.color + 1) % DISH_COLORS; }) }),
        h('input', { class: 'dish-name', value: d.name, maxlength: 32, 'aria-label': 'Dish name', onchange: (e) => change(() => { d.name = e.target.value || 'Dish'; }) }),
        late ? h('span', { class: 'pill bad', title: 'Minutes this dish waits beyond its hold windows' }, `+${late}`) : null,
        h('span', { class: 'muted small nowrap' }, dur(total)),
        h('button', { class: 'btn ghost xs', 'aria-expanded': String(open), 'aria-label': open ? 'Collapse' : 'Edit steps', onclick: () => { open ? ui.open.delete(d.id) : ui.open.add(d.id); ui.rerender(); } }, open ? '▴' : '▾')),
      open && h('div', { class: 'dish-body' },
        h('div', { class: 'dish-meta' },
          h('label', {}, 'Course ', h('select', { onchange: (e) => change(() => { d.offset = +e.target.value; }) },
            courseOpts.map(([v, l]) => h('option', { value: v, selected: (d.offset || 0) === v }, l)))),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn ghost xs danger', onclick: () => change(() => { menu.dishes.splice(menu.dishes.indexOf(d), 1); }) }, 'Remove dish')),
        h('ol', { class: 'steps' }, d.steps.map((s, i) => stepRow(menu, d, s, i, allSteps, issuesBy.get(s.id), change, ui))),
        h('button', { class: 'btn ghost sm add-step', onclick: () => change(() => {
          const id = uid();
          d.steps.push({ id, label: 'New step', dur: 10, hands: 5, equip: 'none', temp: 180, slots: 1, hold: 5 });
          ui.focus = id;
        }) }, '+ Step')),
    );
    host.append(card);
  }
  if (!menu.dishes.length) host.append(h('p', { class: 'muted small empty-menu' }, 'No dishes. Add one above, or load a preset from the top bar.'));
}

function num(label, value, min, max, onSet, attrs = {}) {
  return h('label', { class: 'mini' }, h('span', {}, label),
    h('input', { type: 'number', inputmode: 'numeric', min, max, value, ...attrs, onchange: (e) => onSet(Math.max(min, Math.min(max, Math.round(+e.target.value || 0)))) }));
}

function stepRow(menu, d, s, i, allSteps, item, change, ui) {
  const defaultAfter = i > 0 ? [d.steps[i - 1].id] : [];
  const after = Array.isArray(s.after) ? s.after : defaultAfter;
  const custom = Array.isArray(s.after);
  const nameOf = new Map(allSteps.map(({ d: dd, s: ss }) => [ss.id, dd === d ? ss.label : `${dd.name}: ${ss.label}`]));
  const afterText = after.length ? after.map((id) => nameOf.get(id)).filter(Boolean).join(', ') : 'nothing — can start any time';
  const li = h('li', { class: 'step' + (item?.late ? ' late' : '') + (item?.impossible ? ' impossible' : ''), 'data-step': s.id },
    h('div', { class: 'step-top' },
      h('span', { class: 'idx' }, i + 1),
      h('input', { class: 'step-label', value: s.label, maxlength: 48, 'aria-label': 'Step', onchange: (e) => change(() => { s.label = e.target.value || 'Step'; }) }),
      h('button', { class: 'btn ghost xs', 'aria-label': 'Move up', disabled: i === 0, onclick: () => change(() => { d.steps.splice(i - 1, 0, d.steps.splice(i, 1)[0]); }) }, '↑'),
      h('button', { class: 'btn ghost xs', 'aria-label': 'Delete step', onclick: () => change(() => {
        d.steps.splice(i, 1);
        for (const x of menu.dishes.flatMap((dd) => dd.steps)) if (Array.isArray(x.after)) x.after = x.after.filter((id) => id !== s.id);
      }) }, '×')),
    h('div', { class: 'step-fields' },
      num('min', s.dur, 1, 720, (v) => change(() => { s.dur = v; s.hands = Math.min(s.hands, v); })),
      num('hands-on', s.hands, 0, 720, (v) => change(() => { s.hands = Math.min(v, s.dur); }), { title: 'Minutes of attention at the start of the step' }),
      h('label', { class: 'mini' }, h('span', {}, 'uses'),
        h('select', { onchange: (e) => change(() => { s.equip = e.target.value; if (s.equip === 'oven' && !s.temp) s.temp = 180; }) },
          [['none', 'counter'], ['burner', 'burner'], ['oven', 'oven']].map(([v, l]) => h('option', { value: v, selected: s.equip === v }, l)))),
      s.equip === 'oven' && num('°C', s.temp, 50, 300, (v) => change(() => { s.temp = Math.round(v / 5) * 5; }), { step: 5 }),
      s.equip === 'oven' && num('slots', s.slots || 1, 1, 6, (v) => change(() => { s.slots = v; })),
      num(i === d.steps.length - 1 ? 'can wait' : 'hold', s.hold, 0, 720, (v) => change(() => { s.hold = v; }), { title: i === d.steps.length - 1 ? 'Minutes it can wait before serving' : 'Minutes the result can wait for the next step' })),
    h('details', { class: 'after' },
      h('summary', {}, h('span', { class: 'muted' }, 'after: '), h('span', { class: custom ? 'custom' : '' }, afterText)),
      h('div', { class: 'after-list' },
        allSteps.filter(({ s: x }) => x.id !== s.id).map(({ d: dd, s: x }) => h('label', {},
          h('input', { type: 'checkbox', checked: after.includes(x.id), onchange: (e) => change(() => {
            const cur = new Set(Array.isArray(s.after) ? s.after : defaultAfter);
            e.target.checked ? cur.add(x.id) : cur.delete(x.id);
            s.after = [...cur];
          }) }),
          h('i', { class: 'dotsm', style: { background: `var(--d${dd.color % 8})` } }),
          nameOf.get(x.id))),
        custom && h('button', { class: 'link small', onclick: () => change(() => { delete s.after; }) }, 'Reset to "after the previous step"'))),
    item?.late ? h('div', { class: 'step-warn' }, `Waits ${dur(item.late)} longer than it should`) : null,
    item?.impossible ? h('div', { class: 'step-warn' }, 'This kitchen can’t do this step') : null,
  );
  if (ui.focus === s.id) queueMicrotask(() => { li.querySelector('.step-label')?.select(); ui.focus = null; });
  return li;
}
