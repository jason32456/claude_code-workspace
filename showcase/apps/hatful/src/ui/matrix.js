import { h, isDark } from './dom.js';

const pctText = (p) => (p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

export function createMatrix({ onToggle, onReadout }) {
  const table = h('table', { class: 'matrix', role: 'grid', 'aria-label': 'Who may give to whom' });
  const wrap = h('div', { class: 'matrix-scroll', tabindex: '-1' }, table);
  let sig = '';
  let cells = [];
  let active = [0, 0];
  let model = null;

  const labelOf = (c) => {
    const { giver, receiver, state, p } = c;
    if (state === 'self') return `${giver} to ${receiver}: not possible, same person`;
    if (state === 'house') return `${giver} to ${receiver}: not possible, same household`;
    if (state === 'banned') return `${giver} to ${receiver}: banned. Press space to allow`;
    const pct = p === null ? '' : `${Math.round(p * 100)} percent, `;
    return `${giver} to ${receiver}, ${pct}allowed. Press space to ban`;
  };

  function readoutFor(c) {
    if (c.state === 'self') return `${c.giver} cannot give to themselves.`;
    if (c.state === 'house') return `${c.giver} and ${c.receiver} share a household, so this pair is locked.`;
    if (c.state === 'banned') return `${c.giver} → ${c.receiver} is banned. Click to allow it again.`;
    if (c.p === null) return `${c.giver} → ${c.receiver} is allowed.`;
    return `${c.giver} → ${c.receiver}: ${pctText(c.p)} of possible draws. Click to ban.`;
  }

  function focusCell(i, j, move = true) {
    const n = cells.length;
    i = Math.max(0, Math.min(n - 1, i));
    j = Math.max(0, Math.min(n - 1, j));
    const prev = cells[active[0]]?.[active[1]];
    if (prev) prev.td.tabIndex = -1;
    active = [i, j];
    const c = cells[i][j];
    c.td.tabIndex = 0;
    if (move) c.td.focus();
  }

  function build(m) {
    const { names, ids, colours, event } = m;
    const n = ids.length;
    cells = [];
    const head = h('tr', null, h('td', { class: 'corner' }, h('span', { class: 'sr-only', text: 'Giver, down. Receiver, across.' })));
    ids.forEach((id, j) => {
      head.append(
        h(
          'th',
          { scope: 'col', class: 'col-head', 'data-col': j, style: { '--hh': colours.get(event.people[j].group) || 'transparent' } },
          h('span', { class: 'vname', text: names[j] })
        )
      );
    });
    const body = [];
    for (let i = 0; i < n; i++) {
      const tr = h('tr');
      tr.append(
        h(
          'th',
          { scope: 'row', class: 'row-head', 'data-row': i, style: { '--hh': colours.get(event.people[i].group) || 'transparent' } },
          h('span', { class: 'rname', text: names[i] })
        )
      );
      const row = [];
      for (let j = 0; j < n; j++) {
        const td = h('td', { class: 'cell', role: 'gridcell', tabindex: '-1', 'data-i': i, 'data-j': j });
        row.push({ td, giver: names[i], receiver: names[j], state: 'allowed', p: null });
        tr.append(td);
      }
      cells.push(row);
      body.push(tr);
    }
    table.replaceChildren(h('thead', null, head), h('tbody', null, body));
    const size = n <= 10 ? 46 : n <= 16 ? 38 : 32;
    table.style.setProperty('--cell', `${size}px`);
    table.classList.toggle('show-pct', n <= 10);
    active = [Math.min(active[0], n - 1), Math.min(active[1], n - 1)];
    focusCell(active[0], active[1], false);
  }

  function paint() {
    const { event, ids, analysis, colours } = model;
    const n = ids.length;
    const banned = new Set(event.bans.map((b) => `${b.from}|${b.to}`));
    const marg = analysis.feasible ? analysis.marginals : null;
    let max = 0;
    if (marg) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (analysis.allowed[i][j]) max = Math.max(max, marg[i][j]);
    const hotAt = isDark() ? 0.62 : 0.8;
    const hallG = new Set(analysis.hall?.givers || []);
    const hallR = new Set(analysis.hall?.receivers || []);
    const ths = table.querySelectorAll('th');
    ths.forEach((th) => {
      const row = th.dataset.row;
      const col = th.dataset.col;
      if (row !== undefined) th.classList.toggle('hall', hallG.has(ids[row]));
      if (col !== undefined) th.classList.toggle('hall-r', hallR.has(ids[col]));
    });
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const c = cells[i][j];
        const gi = event.people[i].group;
        let state = 'allowed';
        if (i === j) state = 'self';
        else if (gi && gi === event.people[j].group) state = 'house';
        else if (banned.has(`${ids[i]}|${ids[j]}`)) state = 'banned';
        c.state = state;
        c.p = state === 'allowed' && marg ? marg[i][j] : null;
        const td = c.td;
        td.className = `cell ${state}`;
        td.style.removeProperty('--p');
        td.style.removeProperty('--hh');
        td.textContent = '';
        if (state === 'allowed' && c.p !== null) {
          const norm = max > 0 ? c.p / max : 0;
          td.style.setProperty('--p', norm.toFixed(3));
          if (norm >= hotAt) td.classList.add('hot');
          td.append(h('span', { class: 'pct', text: pctText(c.p) }));
        } else if (state === 'banned') td.append(h('span', { class: 'x', text: '✕', 'aria-hidden': 'true' }));
        else if (state === 'house') {
          td.style.setProperty('--hh', colours.get(gi));
          td.append(h('span', { class: 'lock', 'aria-hidden': 'true' }));
        }
        if (hallG.has(ids[i]) && hallR.has(ids[j])) td.classList.add('hall-cell');
        else if (hallG.has(ids[i])) td.classList.add('hall-row');
        td.setAttribute('aria-label', labelOf(c));
        td.setAttribute('aria-readonly', state === 'self' || state === 'house' ? 'true' : 'false');
      }
    }
  }

  table.addEventListener('click', (e) => {
    const td = e.target.closest('td.cell');
    if (!td) return;
    const i = +td.dataset.i;
    const j = +td.dataset.j;
    focusCell(i, j, false);
    toggle(i, j);
  });
  table.addEventListener('keydown', (e) => {
    const td = e.target.closest('td.cell');
    if (!td) return;
    const i = +td.dataset.i;
    const j = +td.dataset.j;
    const n = cells.length;
    const moves = {
      ArrowUp: [i - 1, j],
      ArrowDown: [i + 1, j],
      ArrowLeft: [i, j - 1],
      ArrowRight: [i, j + 1],
      Home: [i, 0],
      End: [i, n - 1],
      PageUp: [0, j],
      PageDown: [n - 1, j],
    };
    if (moves[e.key]) {
      e.preventDefault();
      focusCell(...moves[e.key]);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle(i, j);
    }
  });
  const tell = (e) => {
    const td = e.target.closest?.('td.cell');
    if (td) onReadout(readoutFor(cells[+td.dataset.i][+td.dataset.j]));
  };
  table.addEventListener('focusin', tell);
  table.addEventListener('mouseover', tell);
  table.addEventListener('mouseleave', () => onReadout(''));

  function toggle(i, j) {
    const c = cells[i][j];
    if (c.state !== 'allowed' && c.state !== 'banned') return;
    onToggle(model.ids[i], model.ids[j], c.state === 'banned');
  }

  return {
    el: wrap,
    update(event, analysis, colours) {
      const ids = event.people.map((p) => p.id);
      const names = event.people.map((p) => p.name);
      model = { event, ids, names, analysis, colours };
      const next = ids.join(',') + '|' + names.join('\u0001') + '|' + event.people.map((p) => p.group || '').join('\u0001');
      if (next !== sig) {
        sig = next;
        build(model);
      }
      paint();
    },
    focus() {
      const [i, j] = active;
      cells[i]?.[j]?.td.focus();
    },
    refocusActive() {
      const [i, j] = active;
      if (cells[i]?.[j]) focusCell(i, j);
    },
    repaint() {
      if (model) paint();
    },
  };
}
