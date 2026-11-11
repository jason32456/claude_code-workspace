import { h, dialog, announce } from './dom.js';
import { blankPerson, householdColours, validatePeople, MAX_PEOPLE, uid } from './store.js';

export function parsePasted(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1 && !lines[0].includes('\t') && lines[0].includes(',')) {
    return lines[0].split(',').map((n) => ({ name: n.trim(), group: null, hint: '' })).filter((p) => p.name);
  }
  return lines.map((l) => {
    const [name = '', group = '', hint = ''] = l.split('\t').map((x) => x.trim());
    return { name, group: group || null, hint };
  });
}

export function createPeopleView(ctx) {
  const el = h('div', { class: 'people-view' });
  const list = h('div', { class: 'people-list', role: 'list' });
  const houses = h('datalist', { id: 'households' });
  const problems = h('ul', { class: 'problems', role: 'status' });
  const countEl = h('span', { class: 'count-pill' });
  const next = h('button', { type: 'button', class: 'btn primary big', text: 'Next: set the rules', onclick: () => ctx.goto('rules') });
  let rowSig = '';
  let showProblems = false;
  const rows = new Map();

  const commitField = (input, apply) => {
    const before = input.dataset.was ?? '';
    return ctx.commit(
      () => {
        apply(input.value);
        input.dataset.was = input.value;
      },
      () => {
        input.value = before;
      }
    ).then((ok) => {
      if (ok) refreshMeta();
      else input.focus();
    });
  };

  function addPerson(focus = true) {
    const p = blankPerson();
    ctx.commit(() => ctx.event().people.push(p)).then((ok) => {
      if (!ok) return;
      rebuild();
      if (focus) rows.get(p.id)?.name.focus();
    });
  }

  function removePerson(id) {
    ctx.commit(() => {
      const ev = ctx.event();
      ev.people = ev.people.filter((p) => p.id !== id);
      ev.bans = ev.bans.filter((b) => b.from !== id && b.to !== id);
    }).then((ok) => {
      if (!ok) return;
      rebuild();
      announce('Person removed');
    });
  }

  function buildRow(p, index) {
    const dot = h('span', { class: 'dot' });
    const avatar = h('span', { class: 'avatar', 'aria-hidden': 'true' });
    const name = h('input', {
      class: 'in name', type: 'text', value: p.name, maxlength: 40, placeholder: `Person ${index + 1}`,
      'aria-label': `Name of person ${index + 1}`, autocomplete: 'off', 'data-was': p.name,
      oninput: () => commitField(name, (v) => (find(p.id).name = v)),
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const ids = ctx.event().people.map((x) => x.id);
        const nxt = ids[ids.indexOf(p.id) + 1];
        if (nxt) rows.get(nxt)?.name.focus();
        else addPerson();
      },
    });
    const group = h('input', {
      class: 'in group', type: 'text', value: p.group || '', maxlength: 30, list: 'households', placeholder: 'Household',
      'aria-label': `Household of person ${index + 1}, optional`, autocomplete: 'off', 'data-was': p.group || '',
      onchange: () => {
        const typed = group.value.trim();
        const match = ctx.event().people.find((x) => x.id !== p.id && x.group && x.group.toLowerCase() === typed.toLowerCase());
        group.value = match ? match.group : typed;
        commitField(group, (v) => (find(p.id).group = v.trim() || null));
      },
    });
    const hint = h('input', {
      class: 'in hint', type: 'text', value: p.hint, maxlength: 80, placeholder: 'Hint for whoever draws them',
      'aria-label': `Hint for person ${index + 1}, optional`, autocomplete: 'off', 'data-was': p.hint,
      oninput: () => commitField(hint, (v) => (find(p.id).hint = v)),
    });
    const remove = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove person ${index + 1}`, text: '✕', onclick: () => removePerson(p.id) });
    const row = h('div', { class: 'person', role: 'listitem' }, avatar, name, h('div', { class: 'house' }, dot, group), hint, remove);
    rows.set(p.id, { row, name, group, dot, avatar, remove, hint });
    return row;
  }

  const find = (id) => ctx.event().people.find((x) => x.id === id);

  function rebuild() {
    const ev = ctx.event();
    rows.clear();
    rowSig = ev.people.map((p) => p.id).join(',');
    list.replaceChildren(...ev.people.map(buildRow));
    refreshMeta();
  }

  function refreshMeta() {
    const ev = ctx.event();
    const colours = householdColours(ev);
    const v = validatePeople(ev);
    ev.people.forEach((p, i) => {
      const r = rows.get(p.id);
      if (!r) return;
      const c = p.group ? colours.get(p.group) : null;
      r.dot.style.setProperty('--hh', c || 'transparent');
      r.dot.classList.toggle('on', Boolean(c));
      r.avatar.style.setProperty('--hh', c || 'var(--muted)');
      r.avatar.textContent = (p.name.trim()[0] || String(i + 1)).toUpperCase();
      r.name.setAttribute('aria-invalid', v.dupIds.has(p.id) ? 'true' : 'false');
      r.remove.setAttribute('aria-label', `Remove ${p.name.trim() || `person ${i + 1}`}`);
    });
    houses.replaceChildren(...[...colours.keys()].map((g) => h('option', { value: g })));
    const named = ev.people.filter((p) => p.name.trim()).length;
    countEl.textContent = `${named} ${named === 1 ? 'person' : 'people'}`;
    problems.replaceChildren(...(showProblems || v.dupIds.size ? v.problems : []).map((t) => h('li', { text: t })));
    addBtn.disabled = ev.people.length >= MAX_PEOPLE;
  }

  const addBtn = h('button', { type: 'button', class: 'btn', text: '+ Add person', onclick: () => addPerson() });

  async function pasteMany() {
    const ta = h('textarea', { rows: 8, class: 'in', 'aria-label': 'Names to add', placeholder: 'Maya\nTheo\nPriya' });
    const v = await dialog({
      title: 'Paste a list of people',
      body: [
        h('p', { class: 'muted', text: 'One name per line, or separated by commas. Paste from a spreadsheet to bring a household (column 2) and a hint (column 3) along.' }),
        ta,
      ],
      actions: [{ label: 'Cancel', value: 'no' }, { label: 'Add them', value: 'yes', kind: 'primary' }],
    });
    if (v !== 'yes') return;
    const parsed = parsePasted(ta.value);
    if (!parsed.length) return;
    const ok = await ctx.commit(() => {
      const ev = ctx.event();
      // Drop empty placeholder rows first so pasting into a fresh event does not leave blanks behind.
      ev.people = ev.people.filter((p) => p.name.trim() || p.group || p.hint);
      const have = new Set(ev.people.map((p) => p.name.trim().toLowerCase()));
      let skipped = 0;
      for (const p of parsed) {
        const key = p.name.toLowerCase();
        if (have.has(key) || ev.people.length >= MAX_PEOPLE) {
          skipped++;
          continue;
        }
        have.add(key);
        ev.people.push({ id: uid(), name: p.name.slice(0, 40), group: p.group, hint: p.hint });
      }
      announce(skipped ? `Added people. Skipped ${skipped} duplicates or extras.` : 'Added people.');
    });
    if (ok) rebuild();
  }

  const bindField = (key, label, type = 'text', extra = {}) => {
    const input = h('input', { class: 'in', type, value: ctx.event()[key], 'aria-label': label, ...extra, oninput: () => { ctx.event()[key] = input.value; ctx.save(); } });
    fields[key] = input;
    return input;
  };
  const fields = {};

  el.append(
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Who is in the hat?' }), h('p', { class: 'muted', text: 'Three to thirty people. People in the same household never draw each other.' })), countEl),
      h('div', { class: 'people-cols', 'aria-hidden': 'true' }, h('span'), h('span', { text: 'Name' }), h('span', { text: 'Household' }), h('span', { text: 'Hint' }), h('span')),
      list,
      houses,
      h('div', { class: 'row-actions' }, addBtn, h('button', { type: 'button', class: 'btn', text: 'Paste a list…', onclick: pasteMany })),
      problems
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', { text: 'The occasion' }),
      h('p', { class: 'muted', text: 'Shown to each person on their slip.' }),
      h(
        'div',
        { class: 'fields' },
        h('label', { class: 'field' }, h('span', { text: 'Date' }), bindField('date', 'Event date', 'date')),
        h('label', { class: 'field' }, h('span', { text: 'Budget' }), bindField('budget', 'Budget', 'text', { placeholder: 'e.g. $25', maxlength: 30 })),
        h('label', { class: 'field wide' }, h('span', { text: 'Note for everyone' }), bindField('note', 'Note for everyone', 'text', { placeholder: 'Wrap it, skip the name tag…', maxlength: 160 }))
      )
    ),
    h('div', { class: 'step-foot' }, next)
  );

  return {
    el,
    show(flag = false) {
      showProblems = flag;
      const ev = ctx.event();
      if (rowSig !== ev.people.map((p) => p.id).join(',')) rebuild();
      else refreshMeta();
      for (const k of ['date', 'budget', 'note']) fields[k].value = ev[k];
    },
    rebuild,
  };
}
