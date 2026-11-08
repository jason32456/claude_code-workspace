import { h, $, toast } from './dom.js';
import { CURRENCIES, format, exp } from './money.js';
import { compute, naivePlan, explain, catById } from './ledger.js';
import { greedy, optimal, roundPlan, OPTIMAL_LIMIT } from './settle.js';
import { encode, decode, pack, unpack } from './codec.js';
import { load, save, uid } from './store.js';
import { openEditor } from './editor.js';
import { drawGraph, initials } from './graph.js';
import { PALETTE, demoGroup } from './demo.js';

const CAT_COLORS = ['var(--c0)', 'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
const state = load();
const ui = { tab: 'settle', plan: 'optimal', view: 'plan', focus: null, round: 0, mobile: 'expenses', query: '' };

const group = () => state.groups.find((g) => g.id === state.current) || state.groups[0];
const commit = () => { save(state); render(); };
const nameOf = (g, id) => g.members.find((m) => m.id === id)?.name ?? '?';

function plans(g, s) {
  const pairs = s.ids.map((id) => [id, s.balance[id]]);
  const opt = optimal(pairs);
  return { pairs, naive: naivePlan(s), greedy: greedy(pairs), optimal: opt.plan, groups: opt.groups, exact: opt.exact };
}

// ---------- header ----------
function renderHeader(g) {
  const sel = $('#group-select');
  sel.replaceChildren(...state.groups.map((x) => h('option', { value: x.id, selected: x.id === g.id }, x.name)),
    h('option', { value: '__new' }, '+ New group…'));
}

// ---------- people ----------
function renderPeople(g, s) {
  const used = new Set();
  for (const ex of g.expenses) {
    ex.payers.forEach((p) => used.add(p.id));
    const sp = ex.split;
    (sp.ids || []).forEach((id) => used.add(id));
    Object.keys(sp.weights || {}).forEach((id) => used.add(id));
    Object.keys(sp.amounts || {}).forEach((id) => used.add(id));
    (sp.items || []).forEach((it) => it.ids.forEach((id) => used.add(id)));
  }
  const list = $('#people');
  list.replaceChildren(...g.members.map((m) => {
    const b = s.balance[m.id] || 0;
    return h('li', { class: 'person' },
      h('span', { class: 'avatar', style: { background: m.color } }, initials(m.name)),
      h('button', { class: 'pname', title: 'Rename', onclick: () => rename(g, m) }, m.name),
      h('span', { class: 'pbal ' + (b > 0 ? 'pos' : b < 0 ? 'neg' : 'zero') }, b ? format(b, g.base, { sign: true }) : 'square'),
      h('button', {
        class: 'icon', 'aria-label': `Remove ${m.name}`, disabled: used.has(m.id),
        title: used.has(m.id) ? 'In use by an expense — change those first' : 'Remove',
        onclick: () => { g.members = g.members.filter((x) => x.id !== m.id); commit(); },
      }, '×'));
  }));
}

function rename(g, m) {
  const v = prompt('Rename', m.name);
  if (v && v.trim()) { m.name = v.trim().slice(0, 32); commit(); }
}

function addPerson(g, name) {
  const n = name.trim().slice(0, 32);
  if (!n) return;
  const used = new Set(g.members.map((m) => m.color));
  const color = PALETTE.find((c) => !used.has(c)) || PALETTE[g.members.length % PALETTE.length];
  g.members.push({ id: uid(), name: n, color });
  commit();
}

// ---------- expenses ----------
function renderExpenses(g, s) {
  const list = $('#expenses');
  const effects = new Map(s.effects.map((e) => [e.ex.id, e.eff]));
  const bad = new Map(s.invalid.map((i) => [i.ex.id, i.err]));
  const q = ui.query.trim().toLowerCase();
  const rows = g.expenses
    .map((ex, i) => ({ ex, i }))
    .filter(({ ex }) => !q || ex.title.toLowerCase().includes(q))
    .sort((a, b) => (b.ex.date || '').localeCompare(a.ex.date || '') || b.i - a.i);
  $('#exp-count').textContent = g.expenses.length ? `${g.expenses.length}` : '';
  if (!rows.length) {
    list.replaceChildren(h('li', { class: 'empty' }, q ? 'Nothing matches.' : g.members.length < 2 ? 'Add at least two people, then your first expense.' : 'No expenses yet. Add the first one.'));
    return;
  }
  let lastDate = null;
  const out = [];
  for (const { ex } of rows) {
    if (ex.date !== lastDate) {
      lastDate = ex.date;
      out.push(h('li', { class: 'date' }, fmtDate(ex.date)));
    }
    const eff = effects.get(ex.id);
    const cat = catById[ex.category] || catById.other;
    const isT = ex.kind === 'transfer';
    const payerNames = ex.payers.map((p) => nameOf(g, p.id)).join(' + ');
    const sub = isT ? `${payerNames} → ${nameOf(g, Object.keys(ex.split.amounts || {})[0])}` : `${payerNames} paid`;
    out.push(h('li', {},
      h('button', { class: 'exp' + (isT ? ' transfer' : '') + (bad.has(ex.id) ? ' bad' : ''), onclick: () => edit(g, ex) },
        h('span', { class: 'cat', 'aria-hidden': 'true' }, isT ? '⇄' : cat.icon),
        h('span', { class: 'etitle' }, ex.title, h('small', {}, bad.has(ex.id) ? '⚠ ' + bad.get(ex.id) : sub)),
        h('span', { class: 'eamt' }, format(ex.amount, ex.currency),
          ex.currency !== g.base && eff ? h('small', {}, '≈ ' + format(eff.total, g.base)) : null))));
  }
  list.replaceChildren(...out);
}

const fmtDate = (d) => {
  if (!d) return 'Undated';
  const dt = new Date(d + 'T12:00:00');
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

function edit(g, ex, kind) {
  if (g.members.length < 2) { toast('Add at least two people first'); $('#add-person input').focus(); return; }
  openEditor(g, ex, {
    kind,
    onSave: (x) => {
      if (x.id) { const i = g.expenses.findIndex((e) => e.id === x.id); g.expenses[i] = x; }
      else g.expenses.push({ ...x, id: uid() });
      commit();
      toast(x.id ? 'Saved' : x.kind === 'transfer' ? 'Payment recorded' : 'Expense added');
    },
    onDelete: (id) => {
      const i = g.expenses.findIndex((e) => e.id === id);
      const [gone] = g.expenses.splice(i, 1);
      commit();
      toast(`Deleted “${gone.title}”`, { label: 'Undo', run: () => { g.expenses.splice(i, 0, gone); commit(); } });
    },
  });
}

// ---------- settle ----------
function renderSettle(g, s, P) {
  const host = $('#tab-settle');
  const counts = { naive: P.naive.length, greedy: P.greedy.length, optimal: P.optimal.length };
  const step = ui.round ? ui.round * 10 ** exp(g.base) : 0;
  const chosen = roundPlan(P[ui.plan], step);
  const owed = s.ids.reduce((a, id) => a + Math.max(0, s.balance[id]), 0);
  const settled = owed === 0;

  const svg = $('#graph') || h('svg:svg', { id: 'graph', role: 'img', 'aria-label': 'Debt graph' });
  const describe = {
    naive: 'Square up every expense on its own, then cancel debts that run both ways between two people.',
    greedy: 'Match the person who owes most with the person owed most, over and over.',
    optimal: P.exact
      ? `Fewest possible transfers: split the group into the most sub-groups that each sum to zero (${(P.groups || []).length} here), then settle each one with size − 1 transfers.`
      : `More than ${OPTIMAL_LIMIT} people have a balance, so this falls back to greedy.`,
  };

  const strip = h('div', { class: 'strip' },
    h('div', {}, h('span', { class: 'k' }, 'Spent'), h('span', { class: 'v' }, format(s.spend, g.base))),
    h('div', {}, h('span', { class: 'k' }, 'Owed'), h('span', { class: 'v' }, format(owed, g.base))),
    h('div', {}, h('span', { class: 'k' }, 'Transfers'), h('span', { class: 'v big' }, settled ? '0' : String(counts.optimal))));

  const algo = h('div', { class: 'algos', role: 'radiogroup', 'aria-label': 'Settlement method' },
    ['naive', 'greedy', 'optimal'].map((k) => h('button', {
      role: 'radio', 'aria-checked': ui.plan === k ? 'true' : 'false', class: 'algo' + (ui.plan === k ? ' on' : ''),
      onclick: () => { ui.plan = k; ui.view = 'plan'; render(); },
    }, h('span', { class: 'n' }, String(counts[k])), h('span', { class: 'l' }, { naive: 'Naive', greedy: 'Greedy', optimal: 'Optimal' }[k]),
      k === 'optimal' && counts.optimal < counts.greedy ? h('span', { class: 'badge' }, `−${counts.greedy - counts.optimal} vs greedy`) : null)));

  const viewToggle = h('div', { class: 'seg small' },
    h('button', { class: ui.view === 'debts' ? 'on' : '', 'aria-pressed': ui.view === 'debts' ? 'true' : 'false', onclick: () => { ui.view = 'debts'; render(); } }, 'Who owes whom'),
    h('button', { class: ui.view === 'plan' ? 'on' : '', 'aria-pressed': ui.view === 'plan' ? 'true' : 'false', onclick: () => { ui.view = 'plan'; render(); } }, 'Settle-up plan'));

  const roundSel = h('label', { class: 'inline' }, 'Round to ',
    h('select', { onchange: (e) => { ui.round = Number(e.target.value); render(); } },
      [0, 1, 5, 10].map((v) => h('option', { value: v, selected: ui.round === v }, v ? `${CURRENCIES[g.base]?.symbol ?? ''}${v}` : 'exact'))));

  const list = settled
    ? h('div', { class: 'done' }, h('div', { class: 'stamp' }, 'All square'), h('p', {}, 'Nobody owes anybody anything.'))
    : h('ol', { class: 'transfers' }, chosen.plan.map((t) => h('li', {},
      h('span', { class: 'avatar sm', style: { background: g.members.find((m) => m.id === t.from)?.color } }, initials(nameOf(g, t.from))),
      h('span', { class: 'tline' }, h('b', {}, nameOf(g, t.from)), h('span', { class: 'arrow' }, ' pays '), h('b', {}, nameOf(g, t.to))),
      h('span', { class: 'tamt' }, format(t.amount, g.base), t.exactAmount != null && t.exactAmount !== t.amount ? h('small', {}, 'exact ' + format(t.exactAmount, g.base)) : null),
      h('button', { class: 'btn sm', onclick: () => markPaid(g, t) }, 'Mark paid'))));

  const residue = Object.entries(chosen.residue).filter(([, v]) => v);
  const residueNote = residue.length ? h('p', { class: 'note' }, 'Rounding leaves: ',
    residue.map(([id, v], i) => [i ? ', ' : '', `${nameOf(g, id)} ${format(v, g.base, { sign: true })}`]), '. Small enough to shrug off, but it’s shown so nothing is hidden.') : null;

  host.replaceChildren(strip,
    h('div', { class: 'card graph-card' },
      h('div', { class: 'card-head' }, viewToggle, h('span', { class: 'muted small' }, 'Click a person to trace their money')),
      algo,
      svg,
      h('p', { class: 'muted small cap' }, ui.view === 'debts'
        ? `${counts.naive} debts between pairs, before any simplification.`
        : `${chosen.plan.length} transfer${chosen.plan.length === 1 ? '' : 's'}. ${describe[ui.plan]}`)),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', {}, 'Settle up'), h('div', { class: 'tools' }, roundSel,
        h('button', { class: 'btn ghost sm', onclick: () => copySummary(g, s, chosen.plan), disabled: settled }, 'Copy summary'))),
      list, residueNote));

  drawGraph(svg, {
    members: g.members, balance: s.balance, base: g.base, focus: ui.focus,
    edges: settled ? [] : ui.view === 'debts' ? P.naive : chosen.plan,
    onPick: (id) => { ui.focus = ui.focus === id ? null : id; render(); },
  });
}

function markPaid(g, t) {
  const tr = { id: uid(), kind: 'transfer', title: `Settle-up: ${nameOf(g, t.from)} → ${nameOf(g, t.to)}`, date: new Date().toISOString().slice(0, 10),
    amount: t.amount, currency: g.base, rate: 1, category: 'other', payers: [{ id: t.from, amount: t.amount }], split: { mode: 'exact', amounts: { [t.to]: t.amount } } };
  g.expenses.push(tr);
  commit();
  toast(`${nameOf(g, t.from)} paid ${nameOf(g, t.to)} ${format(t.amount, g.base)}`, { label: 'Undo', run: () => { g.expenses = g.expenses.filter((e) => e.id !== tr.id); commit(); } });
}

async function copySummary(g, s, plan) {
  const lines = [`${g.name} — settle up (${format(s.spend, g.base)} spent)`, ...plan.map((t) => `• ${nameOf(g, t.from)} → ${nameOf(g, t.to)}: ${format(t.amount, g.base)}`), '', 'Worked out with Evens'];
  await copy(lines.join('\n'), 'Summary copied');
}

async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt('Copy this:', text); }
}

// ---------- balances ----------
function renderBalances(g, s) {
  const host = $('#tab-balances');
  const max = Math.max(1, ...s.ids.map((id) => Math.abs(s.balance[id])));
  const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  host.replaceChildren(
    h('div', { class: 'card' }, h('h3', {}, 'Balances'),
      h('p', { class: 'muted small' }, 'Paid minus share. Bars to the right are owed money; to the left, owe it.'),
      h('ul', { class: 'bars' }, g.members.map((m) => {
        const b = s.balance[m.id];
        const w = (Math.abs(b) / max) * 50;
        return h('li', { onclick: () => { ui.focus = m.id; ui.tab = 'explain'; render(); }, title: 'Explain' },
          h('span', { class: 'who' }, h('span', { class: 'dot', style: { background: m.color } }), m.name),
          h('span', { class: 'track' }, h('span', { class: 'mid' }), b ? h('span', { class: 'bar ' + (b > 0 ? 'pos' : 'neg'), style: b > 0 ? { left: '50%', width: w + '%' } : { right: '50%', width: w + '%' } }) : null),
          h('span', { class: 'amt ' + (b > 0 ? 'pos' : b < 0 ? 'neg' : 'zero') }, b ? format(b, g.base, { sign: true }) : 'square'));
      }))),
    h('div', { class: 'card' }, h('h3', {}, 'Paid vs share'),
      h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Paid'), h('th', {}, 'Share'), h('th', {}, 'Balance'))),
        h('tbody', {}, g.members.map((m) => h('tr', {}, h('td', {}, m.name), h('td', {}, format(s.paid[m.id], g.base)), h('td', {}, format(s.consumed[m.id], g.base)),
          h('td', { class: s.balance[m.id] > 0 ? 'pos' : s.balance[m.id] < 0 ? 'neg' : '' }, format(s.balance[m.id], g.base, { sign: true }))))),
        h('tfoot', {}, h('tr', {}, h('td', {}, 'Total'), h('td', {}, format(s.spend, g.base)), h('td', {}, format(s.spend, g.base)),
          h('td', {}, format(s.ids.reduce((a, id) => a + s.balance[id], 0), g.base)))))),
    cats.length ? h('div', { class: 'card' }, h('h3', {}, 'Where it went'),
      h('div', { class: 'stack' }, cats.map(([c, v], i) => h('span', { style: { flex: String(v), background: CAT_COLORS[i % CAT_COLORS.length] }, title: `${catById[c]?.label}: ${format(v, g.base)}` }))),
      h('ul', { class: 'legend' }, cats.map(([c, v], i) => h('li', {}, h('span', { class: 'sw', style: { background: CAT_COLORS[i % CAT_COLORS.length] } }), `${catById[c]?.icon} ${catById[c]?.label}`,
        h('b', {}, format(v, g.base)), h('span', { class: 'muted' }, ` ${((v / s.spend) * 100).toFixed(0)}%`))))) : null);
}

// ---------- explain ----------
function renderExplain(g, s) {
  const host = $('#tab-explain');
  const id = g.members.some((m) => m.id === ui.focus) ? ui.focus : g.members[0]?.id;
  if (!id) { host.replaceChildren(h('p', { class: 'muted' }, 'No one here yet.')); return; }
  const rows = explain(g, s, id);
  const b = s.balance[id];
  host.replaceChildren(h('div', { class: 'card' },
    h('h3', {}, 'Why does ', nameOf(g, id), b < 0 ? ' owe ' : b > 0 ? ' get ' : ' end up at ', format(Math.abs(b), g.base), '?'),
    h('div', { class: 'chips' }, g.members.map((m) => h('button', { class: 'chip' + (m.id === id ? ' on' : ''), style: { '--c': m.color },
      onclick: () => { ui.focus = m.id; render(); } }, h('span', { class: 'dot' }), m.name))),
    rows.length ? h('table', { class: 'tbl ledger' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Expense'), h('th', {}, 'Paid'), h('th', {}, 'Share'), h('th', {}, 'Running'))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('td', {}, h('div', {}, r.ex.title), h('small', { class: 'muted' }, r.how, r.ex.currency !== g.base ? ` · ${format(r.ex.amount, r.ex.currency)} @ ${r.ex.rate}` : '')),
        h('td', {}, r.paid ? format(r.paid, g.base) : ''),
        h('td', {}, r.owed ? format(r.owed, g.base) : ''),
        h('td', { class: r.run > 0 ? 'pos' : r.run < 0 ? 'neg' : '' }, format(r.run, g.base, { sign: true }))))),
      h('tfoot', {}, h('tr', {}, h('td', {}, 'Balance'), h('td', {}), h('td', {}), h('td', { class: b > 0 ? 'pos' : b < 0 ? 'neg' : '' }, format(b, g.base, { sign: true })))))
      : h('p', { class: 'muted' }, `${nameOf(g, id)} isn’t in any expense yet.`)));
}

// ---------- groups, share, import ----------
function newGroupDialog() {
  const dlg = $('#editor');
  const f = { name: '', base: group()?.base || 'EUR', people: '' };
  dlg.replaceChildren(h('form', { class: 'editor', onsubmit: (e) => {
    e.preventDefault();
    const names = f.people.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
    const g = { id: uid(), name: f.name.trim() || 'New group', base: f.base, members: names.map((n, i) => ({ id: uid(), name: n.slice(0, 32), color: PALETTE[i % PALETTE.length] })), expenses: [] };
    state.groups.push(g); state.current = g.id; dlg.close(); commit();
  } },
    h('header', { class: 'ed-head' }, h('h2', {}, 'New group'), h('button', { type: 'button', class: 'icon', 'aria-label': 'Close', onclick: () => { dlg.close(); render(); } }, '×')),
    h('div', { class: 'ed-body' },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Name'), h('input', { placeholder: 'Flat 4B, Ski week…', autofocus: true, oninput: (e) => (f.name = e.target.value) })),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Currency'), h('select', { onchange: (e) => (f.base = e.target.value) },
        Object.entries(CURRENCIES).map(([c, v]) => h('option', { value: c, selected: c === f.base }, `${c} — ${v.name}`)))),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'People'), h('textarea', { rows: 3, placeholder: 'Ana, Ben, Chloé', oninput: (e) => (f.people = e.target.value) }),
        h('span', { class: 'hint' }, 'Comma-separated. You can add more later.'))),
    h('footer', { class: 'ed-foot' }, h('div', { class: 'spacer' }), h('button', { type: 'button', class: 'btn ghost', onclick: () => { dlg.close(); render(); } }, 'Cancel'), h('button', { class: 'btn primary' }, 'Create'))));
  dlg.showModal();
}

async function share(g) {
  const code = await encode(g);
  const url = location.href.split('#')[0] + '#g=' + code;
  await copy(url, 'Share link copied — it carries the whole group, no server involved');
}

async function importHash() {
  const m = location.hash.match(/^#g=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const ids = [];
    const g = await decode(m[1], (i) => (ids[i] = uid()));
    g.id = uid();
    g.expenses.forEach((e) => (e.id = uid()));
    g.name = g.name.slice(0, 60) + ' (shared)';
    state.groups.push(g);
    state.current = g.id;
    commit();
    toast(`Opened “${g.name}” as a copy`);
  } catch (e) {
    toast('That share link couldn’t be read');
  }
}

function moreMenu(g) {
  const dlg = $('#editor');
  const close = () => dlg.close();
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const o = JSON.parse(await file.text());
      const ng = unpack(o, () => uid());
      ng.id = uid(); ng.expenses.forEach((x) => (x.id = uid()));
      state.groups.push(ng); state.current = ng.id; close(); commit(); toast(`Imported “${ng.name}”`);
    } catch { toast('Not an Evens backup'); }
  } });
  dlg.replaceChildren(h('div', { class: 'editor menu' },
    h('header', { class: 'ed-head' }, h('h2', {}, g.name), h('button', { type: 'button', class: 'icon', 'aria-label': 'Close', onclick: close }, '×')),
    h('div', { class: 'ed-body' },
      h('button', { class: 'btn ghost wide', onclick: () => { const v = prompt('Group name', g.name); if (v?.trim()) { g.name = v.trim().slice(0, 60); commit(); } close(); } }, 'Rename group'),
      h('button', { class: 'btn ghost wide', onclick: () => {
        const blob = new Blob([JSON.stringify(pack(g), null, 1)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: g.name.replace(/[^\w-]+/g, '-').toLowerCase() + '.evens.json' });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); close();
      } }, 'Export backup (.json)'),
      h('button', { class: 'btn ghost wide', onclick: () => fileInput.click() }, 'Import backup…'), fileInput,
      h('button', { class: 'btn ghost wide', onclick: () => { const d = demoGroup(uid); state.groups.push(d); state.current = d.id; close(); commit(); } }, 'Add the demo trip again'),
      h('button', { class: 'btn danger wide', onclick: () => {
        if (!confirm(`Delete “${g.name}” and all its expenses?`)) return;
        state.groups = state.groups.filter((x) => x.id !== g.id);
        if (!state.groups.length) { const d = demoGroup(uid); state.groups.push(d); }
        state.current = state.groups[0].id; close(); commit();
      } }, 'Delete group'))));
  dlg.showModal();
}

// ---------- main render ----------
function render() {
  const g = group();
  state.current = g.id;
  const s = compute(g);
  const P = plans(g, s);
  if (ui.focus && !g.members.some((m) => m.id === ui.focus)) ui.focus = null;
  document.title = `${g.name} · Evens`;
  renderHeader(g);
  $('#base-label').textContent = `${g.members.length} people · ${g.base}`;
  renderPeople(g, s);
  renderExpenses(g, s);
  for (const t of ['settle', 'balances', 'explain']) {
    $(`#tab-${t}`).hidden = ui.tab !== t;
    const b = $(`[data-tab="${t}"]`);
    b.classList.toggle('on', ui.tab === t);
    b.setAttribute('aria-selected', ui.tab === t ? 'true' : 'false');
  }
  document.body.dataset.mobile = ui.mobile;
  document.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === ui.mobile));
  if (ui.tab === 'settle') renderSettle(g, s, P);
  if (ui.tab === 'balances') renderBalances(g, s);
  if (ui.tab === 'explain') renderExplain(g, s);
}

function wire() {
  $('#group-select').addEventListener('change', (e) => {
    if (e.target.value === '__new') return newGroupDialog();
    state.current = e.target.value; ui.focus = null; commit();
  });
  $('#btn-share').addEventListener('click', () => share(group()));
  $('#btn-more').addEventListener('click', () => moreMenu(group()));
  $('#btn-add').addEventListener('click', () => edit(group(), null, 'expense'));
  $('#btn-pay').addEventListener('click', () => edit(group(), null, 'transfer'));
  $('#add-person').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = e.target.querySelector('input');
    addPerson(group(), inp.value);
    inp.value = '';
    $('#add-person input').focus();
  });
  $('#search').addEventListener('input', (e) => { ui.query = e.target.value; renderExpenses(group(), compute(group())); });
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { ui.tab = b.dataset.tab; render(); }));
  document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    ui.mobile = b.dataset.m;
    if (b.dataset.m !== 'expenses') ui.tab = b.dataset.m;
    render();
  }));
  $('#editor').addEventListener('close', () => render());
  window.addEventListener('hashchange', importHash);
  document.addEventListener('keydown', (e) => {
    if ($('#editor').open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'n') { e.preventDefault(); edit(group(), null, 'expense'); }
    if (e.key === 'p') { e.preventDefault(); edit(group(), null, 'transfer'); }
  });
}

wire();
render();
importHash();
