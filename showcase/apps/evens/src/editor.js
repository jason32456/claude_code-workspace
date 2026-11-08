import { h, $ } from './dom.js';
import { CURRENCIES, parseMinor, toDecimalString, format, exp } from './money.js';
import { MODES, MODE_LABEL, validate, baseEffect } from './split.js';
import { CATEGORIES } from './ledger.js';

const num = (t) => {
  const s = String(t ?? '').trim().replace(',', '.');
  if (!s) return 0;
  return /^\d*\.?\d*$/.test(s) ? Number(s) : NaN;
};
const today = () => new Date().toISOString().slice(0, 10);

function draftFrom(ex, group) {
  const ids = group.members.map((m) => m.id);
  const cur = ex?.currency || group.base;
  const dec = (v) => (v == null ? '' : toDecimalString(v, cur));
  const d = {
    id: ex?.id, kind: ex?.kind || 'expense', title: ex?.title || '', amountText: ex ? dec(ex.amount) : '',
    currency: cur, rateText: ex && cur !== group.base ? String(ex.rate) : '', date: ex?.date || today(),
    category: ex?.category || 'food', payer: ex?.payers?.[0]?.id || ids[0], multi: (ex?.payers?.length || 0) > 1,
    payerAmt: {}, mode: ex?.split?.mode || 'equal', eqIds: new Set(ids), weights: {}, pcts: {}, exact: {},
    items: [{ name: '', priceText: '', ids: new Set() }], taxText: '', tipText: '',
    from: ids[0], to: ids[1] || ids[0],
  };
  if (!ex) return d;
  for (const p of ex.payers) d.payerAmt[p.id] = dec(p.amount);
  const s = ex.split;
  if (ex.kind === 'transfer') {
    d.from = ex.payers[0].id;
    d.to = Object.keys(s.amounts || {})[0] || d.to;
    return d;
  }
  if (s.mode === 'equal') d.eqIds = new Set(s.ids);
  if (s.mode === 'shares') for (const [id, v] of Object.entries(s.weights)) d.weights[id] = String(v);
  if (s.mode === 'percent') for (const [id, v] of Object.entries(s.weights)) d.pcts[id] = String(v);
  if (s.mode === 'exact') for (const [id, v] of Object.entries(s.amounts)) d.exact[id] = dec(v);
  if (s.mode === 'items') {
    d.items = s.items.map((it) => ({ name: it.name, priceText: dec(it.price), ids: new Set(it.ids) }));
    d.taxText = s.tax ? dec(s.tax) : '';
    d.tipText = s.tip ? dec(s.tip) : '';
  }
  return d;
}

function toExpense(d, group) {
  const ids = group.members.map((m) => m.id);
  const cur = d.currency;
  const pm = (t) => (String(t ?? '').trim() === '' ? 0 : parseMinor(t, cur));
  const rate = cur === group.base ? 1 : num(d.rateText);
  const base = { id: d.id, kind: d.kind, date: d.date || today(), currency: cur, rate, category: d.category };
  if (d.kind === 'transfer') {
    const amount = parseMinor(d.amountText, cur);
    return { ...base, category: 'other', title: d.title.trim() || 'Payment',
      amount, payers: [{ id: d.from, amount }], split: { mode: 'exact', amounts: { [d.to]: amount } } };
  }
  let amount = parseMinor(d.amountText, cur);
  let split;
  const pick = (o, f) => Object.fromEntries(ids.filter((id) => String(o[id] ?? '').trim() !== '').map((id) => [id, f(o[id])]));
  if (d.mode === 'equal') split = { mode: 'equal', ids: ids.filter((id) => d.eqIds.has(id)) };
  if (d.mode === 'shares') split = { mode: 'shares', weights: pick(d.weights, num) };
  if (d.mode === 'percent') split = { mode: 'percent', weights: pick(d.pcts, num) };
  if (d.mode === 'exact') split = { mode: 'exact', amounts: pick(d.exact, pm) };
  if (d.mode === 'items') {
    const items = d.items.filter((it) => it.name.trim() || it.priceText.trim() || it.ids.size)
      .map((it) => ({ name: it.name.trim() || 'Item', price: pm(it.priceText), ids: ids.filter((id) => it.ids.has(id)) }));
    split = { mode: 'items', items, tax: pm(d.taxText), tip: pm(d.tipText) };
    amount = items.reduce((a, it) => a + it.price, 0) + split.tax + split.tip;
  }
  const payers = d.multi
    ? ids.filter((id) => String(d.payerAmt[id] ?? '').trim() !== '').map((id) => ({ id, amount: pm(d.payerAmt[id]) })).filter((p) => p.amount !== 0)
    : [{ id: d.payer, amount }];
  return { ...base, title: d.title.trim() || 'Untitled', amount, payers, split };
}

function check(ex, d, group) {
  if (d.kind === 'transfer' && d.from === d.to) return 'Pick two different people';
  if (!(ex.currency === group.base || ex.rate > 0)) return `Enter how many ${group.base} one ${ex.currency} is worth`;
  if (d.kind === 'expense' && d.multi && ex.payers.some((p) => !Number.isInteger(p.amount) || p.amount < 0)) return 'Payer amounts must be numbers';
  return validate(ex, group.members.map((m) => m.id));
}

export function openEditor(group, ex, { onSave, onDelete, kind }) {
  const dlg = $('#editor');
  const d = draftFrom(ex, group);
  if (!ex && kind) d.kind = kind;
  const members = group.members;

  const chip = (m, on, onclick, extra) => h('button', {
    type: 'button', class: 'chip' + (on ? ' on' : ''), style: { '--c': m.color }, 'aria-pressed': on ? 'true' : 'false', onclick,
  }, h('span', { class: 'dot' }), m.name, extra);

  const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint && h('span', { class: 'hint' }, hint));

  const inp = (key, attrs = {}, obj = d) => h('input', {
    ...attrs, value: obj[key] ?? '', oninput: (e) => { obj[key] = e.target.value; refresh(); },
  });

  const preview = h('div', { class: 'preview', 'aria-live': 'polite' });
  const errBox = h('p', { class: 'err' });
  const saveBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Save');
  let amountInput;

  function refresh() {
    const x = toExpense(d, group);
    if (d.mode === 'items' && d.kind === 'expense' && amountInput) {
      amountInput.value = Number.isInteger(x.amount) && x.amount > 0 ? toDecimalString(x.amount, d.currency) : '';
    }
    const err = check(x, d, group);
    errBox.textContent = err || '';
    saveBtn.disabled = !!err;
    preview.replaceChildren();
    if (err) return;
    const eff = baseEffect(x, members.map((m) => m.id), group.base);
    const conv = x.currency !== group.base ? h('p', { class: 'muted small' },
      `${format(x.amount, x.currency)} × ${x.rate} = ${format(eff.total, group.base)}`) : null;
    preview.append(conv, h('ul', { class: 'share-list' }, members.filter((m) => eff.owed[m.id] || eff.paid[m.id]).map((m) =>
      h('li', {}, h('span', { class: 'dot', style: { background: m.color } }), h('span', { class: 'who' }, m.name),
        eff.paid[m.id] ? h('span', { class: 'paid' }, d.kind === 'transfer' ? 'sends ' : 'paid ', format(eff.paid[m.id], group.base)) : null,
        h('span', { class: 'owe' }, eff.owed[m.id] ? (d.kind === 'transfer' ? 'gets ' : 'share ') + format(eff.owed[m.id], group.base) : '')))));
  }

  function splitPanel() {
    const cur = d.currency;
    const step = 1 / 10 ** exp(cur);
    const perPerson = (obj, ph, suffix) => h('div', { class: 'grid-inputs' }, members.map((m) =>
      h('label', { class: 'pp' }, h('span', { class: 'dot', style: { background: m.color } }), h('span', { class: 'who' }, m.name),
        h('input', { inputmode: 'decimal', placeholder: ph, value: obj[m.id] ?? '', 'aria-label': `${m.name} ${suffix}`,
          oninput: (e) => { obj[m.id] = e.target.value; refresh(); } }), h('span', { class: 'unit' }, suffix))));
    if (d.mode === 'equal') {
      return h('div', {},
        h('div', { class: 'chips' }, members.map((m) => chip(m, d.eqIds.has(m.id), () => {
          d.eqIds.has(m.id) ? d.eqIds.delete(m.id) : d.eqIds.add(m.id); render();
        }))),
        h('div', { class: 'row-actions' },
          h('button', { type: 'button', class: 'link', onclick: () => { d.eqIds = new Set(members.map((m) => m.id)); render(); } }, 'Everyone'),
          h('button', { type: 'button', class: 'link', onclick: () => { d.eqIds = new Set(); render(); } }, 'No one')));
    }
    if (d.mode === 'shares') return h('div', {}, h('p', { class: 'hint' }, 'Weights, e.g. 2 for a couple, 0.5 for a half night. Blank = not included.'), perPerson(d.weights, '0', 'shares'));
    if (d.mode === 'percent') return h('div', {}, perPerson(d.pcts, '0', '%'));
    if (d.mode === 'exact') return h('div', {}, perPerson(d.exact, '0.00', cur));
    const rows = d.items.map((it, i) => h('div', { class: 'item' },
      h('div', { class: 'item-top' },
        h('input', { placeholder: 'Item', value: it.name, 'aria-label': 'Item name', oninput: (e) => { it.name = e.target.value; refresh(); } }),
        h('input', { placeholder: '0.00', inputmode: 'decimal', class: 'price', value: it.priceText, 'aria-label': 'Item price', step,
          oninput: (e) => { it.priceText = e.target.value; refresh(); } }),
        h('button', { type: 'button', class: 'icon', 'aria-label': 'Remove line', onclick: () => { d.items.splice(i, 1); if (!d.items.length) d.items.push({ name: '', priceText: '', ids: new Set() }); render(); } }, '×')),
      h('div', { class: 'chips small' }, members.map((m) => chip(m, it.ids.has(m.id), () => { it.ids.has(m.id) ? it.ids.delete(m.id) : it.ids.add(m.id); render(); })))));
    return h('div', { class: 'items' }, rows,
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { d.items.push({ name: '', priceText: '', ids: new Set() }); render(); } }, '+ Add line'),
      h('div', { class: 'two' },
        field('Tax', inp('taxText', { inputmode: 'decimal', placeholder: '0.00' })),
        field('Tip / service', inp('tipText', { inputmode: 'decimal', placeholder: '0.00' }))),
      h('p', { class: 'hint' }, 'Each line is split between the people ticked on it; tax and tip follow each person’s subtotal.'));
  }

  function currencySelect() {
    return h('select', { 'aria-label': 'Currency', onchange: (e) => { d.currency = e.target.value; render(); } },
      Object.keys(CURRENCIES).map((c) => h('option', { value: c, selected: c === d.currency }, c)));
  }

  function rateRow() {
    if (d.currency === group.base) return null;
    return field(`Rate: 1 ${d.currency} = ? ${group.base}`, inp('rateText', { inputmode: 'decimal', placeholder: 'e.g. 1.17' }),
      'Enter the rate from your card statement. Evens never looks rates up.');
  }

  function render() {
    const isT = d.kind === 'transfer';
    const body = h('form', { method: 'dialog', class: 'editor', onsubmit: (e) => {
      e.preventDefault();
      const x = toExpense(d, group);
      if (check(x, d, group)) return;
      dlg.close();
      onSave(x);
    } },
      h('header', { class: 'ed-head' },
        h('div', { class: 'seg', role: 'tablist' },
          ['expense', 'transfer'].map((k) => h('button', { type: 'button', role: 'tab', class: d.kind === k ? 'on' : '', 'aria-selected': d.kind === k ? 'true' : 'false',
            onclick: () => { d.kind = k; render(); } }, k === 'expense' ? 'Expense' : 'Payment'))),
        h('button', { type: 'button', class: 'icon', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')),
      h('div', { class: 'ed-body' },
        isT
          ? [
            h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'From'), h('div', { class: 'chips' }, members.map((m) => chip(m, d.from === m.id, () => { d.from = m.id; render(); })))),
            h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'To'), h('div', { class: 'chips' }, members.map((m) => chip(m, d.to === m.id, () => { d.to = m.id; render(); })))),
            h('div', { class: 'amount-row' }, field('Amount', inp('amountText', { inputmode: 'decimal', placeholder: '0.00', autofocus: true })), currencySelect()),
            rateRow(),
            h('div', { class: 'two' }, field('Note', inp('title', { placeholder: 'Payment' })), field('Date', inp('date', { type: 'date' }))),
          ]
          : [
            field('What for', inp('title', { placeholder: 'Dinner, tickets, rent…', autofocus: !d.id, maxlength: 80 })),
            h('div', { class: 'amount-row' },
              field('Amount', amountInput = inp('amountText', { inputmode: 'decimal', placeholder: '0.00', readonly: d.mode === 'items', class: d.mode === 'items' ? 'auto' : '' }),
                d.mode === 'items' ? 'Worked out from the receipt lines' : null),
              currencySelect()),
            rateRow(),
            h('div', { class: 'two' },
              field('Date', inp('date', { type: 'date' })),
              h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Category'),
                h('select', { onchange: (e) => { d.category = e.target.value; } }, CATEGORIES.map((c) => h('option', { value: c.id, selected: c.id === d.category }, c.icon + ' ' + c.label))))),
            h('div', { class: 'field' },
              h('span', { class: 'lbl' }, 'Paid by', h('button', { type: 'button', class: 'link right', onclick: () => { d.multi = !d.multi; render(); } }, d.multi ? 'One payer' : 'Several payers')),
              d.multi
                ? h('div', { class: 'grid-inputs' }, members.map((m) => h('label', { class: 'pp' }, h('span', { class: 'dot', style: { background: m.color } }), h('span', { class: 'who' }, m.name),
                  h('input', { inputmode: 'decimal', placeholder: '0.00', value: d.payerAmt[m.id] ?? '', 'aria-label': `${m.name} paid`, oninput: (e) => { d.payerAmt[m.id] = e.target.value; refresh(); } }),
                  h('span', { class: 'unit' }, d.currency))))
                : h('div', { class: 'chips' }, members.map((m) => chip(m, d.payer === m.id, () => { d.payer = m.id; render(); })))),
            h('div', { class: 'field' },
              h('span', { class: 'lbl' }, 'Split'),
              h('div', { class: 'seg wrap' }, MODES.map((mo) => h('button', { type: 'button', class: d.mode === mo ? 'on' : '', 'aria-pressed': d.mode === mo ? 'true' : 'false',
                onclick: () => { d.mode = mo; render(); } }, MODE_LABEL[mo]))),
              splitPanel()),
          ],
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Result'), preview, errBox)),
      h('footer', { class: 'ed-foot' },
        d.id ? h('button', { type: 'button', class: 'btn danger', onclick: () => { dlg.close(); onDelete(d.id); } }, 'Delete') : h('span'),
        h('div', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Cancel'),
        saveBtn));
    dlg.replaceChildren(body);
    refresh();
  }

  render();
  if (!dlg.open) dlg.showModal();
}
