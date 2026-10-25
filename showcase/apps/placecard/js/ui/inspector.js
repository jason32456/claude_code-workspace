import { WISHES } from '../core/plan.js';
import { whereLabel } from './guests.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (h) => `${Math.round(h * 100)}%`;
const pts = (x) => (Math.round(x * 10) / 10).toLocaleString();

export const costKey = (type, a, b) => `${type}|${a < b ? a : b}|${a < b ? b : a}`;

export function renderInspector(app) {
  const el = document.getElementById('inspector');
  if (app.sel?.guest && app.P.gIndex.has(app.sel.guest)) el.innerHTML = guestView(app, app.P.gIndex.get(app.sel.guest));
  else if (app.sel?.table && app.P.tIndex.has(app.sel.table)) el.innerHTML = tableView(app, app.P.tIndex.get(app.sel.table));
  else el.innerHTML = summaryView(app);
  bind(app, el);
}

function reason(app, g, it) {
  const where = whereLabel(app, it.other);
  const there = where ? where.long.replace(/, seat.*/, '') : 'unseated';
  switch (it.type) {
    case 'party': return it.ok ? (it.near ? 'beside you' : 'same table, not beside you') : `split up — they are at ${there}`;
    case 'next': return it.ok ? 'beside you' : it.near ? (it.across ? 'across the table, not beside' : 'same table, not beside') : `at ${there}`;
    case 'must': case 'prefer': return it.ok ? `both at ${there}` : `at ${there}`;
    case 'apart': case 'never': return it.ok ? `at ${there}` : 'at your table';
  }
  return '';
}

function costBlock(app, g, it) {
  const key = costKey(it.type, app.P.guests[g].id, app.P.guests[it.other].id);
  const r = app.whatif.get(key);
  if (!r) return `<button class="link cost-btn" data-cost="${esc(key)}">What would it cost?</button>`;
  if (r === 'pending') return `<div class="cost">Re-solving with this wish made mandatory…</div>`;
  const name = (i) => esc(app.P.guests[i].name);
  const list = (arr) => arr.slice(0, 6).map((w) => `<li>${name(w.a)} — ${esc(w.label)} ${name(w.b)}</li>`).join('') + (arr.length > 6 ? `<li>…and ${arr.length - 6} more</li>` : '');
  if (!r.feasible) {
    const locked = [g, it.other].filter((i) => app.P.lockTable[i] >= 0).map((i) => `${name(i)} is locked to ${esc(app.plan.tables[app.P.lockTable[i]].name)}`);
    return `<div class="cost no"><b>Not possible without breaking a hard rule.</b>`
      + (locked.length ? `<br>${locked.join('; ')}.` : '')
      + `<br><span class="muted">The best attempt broke ${r.hardAfter} hard rule${r.hardAfter === 1 ? '' : 's'}.</span>`
      + `<div class="acts"><button class="ghost small" data-dismiss="${esc(key)}">Dismiss</button></div></div>`;
  }
  const head = r.cost > 0.05 ? `Possible. It costs <b>${pts(r.cost)} points</b>.`
    : r.cost < -0.05 ? `Possible, and it <b>gains ${pts(-r.cost)} points</b>. The last solve missed it.`
    : `Possible at <b>no cost</b>.`;
  const ct = r.changedTable.length;
  const moves = ct ? `${ct} guest${ct === 1 ? '' : 's'} change table${r.moved.length > ct ? `, ${r.moved.length - ct} more swap seats` : ''}.` : `${r.moved.length} guest${r.moved.length === 1 ? '' : 's'} swap seats.`;
  return `<div class="cost">${head} ${moves}`
    + (r.lost.length ? `<br>Given up:<ul>${list(r.lost)}</ul>` : '')
    + (r.gained.length ? `Also gained:<ul>${list(r.gained)}</ul>` : '')
    + `<div class="acts"><button class="primary small" data-apply="${esc(key)}">Use this seating</button>`
    + `<button class="ghost small" data-dismiss="${esc(key)}">Dismiss</button></div></div>`;
}

function guestView(app, g) {
  const { P, ex, plan } = app;
  const guest = P.guests[g];
  const row = ex[g];
  const w = whereLabel(app, g);
  const lock = plan.locks[guest.id];
  const lockMode = lock?.seat ? 'seat' : lock?.table ? 'table' : 'none';
  const members = guest.party ? plan.guests.filter((x) => x.party === guest.party && x.id !== guest.id) : [];
  const tags = [...new Set(plan.guests.map((x) => x.tag).filter(Boolean))];

  let wishes = '';
  for (const it of row.items) {
    const label = it.type === 'party' ? 'Same party as' : WISHES[it.type].label;
    const del = it.type === 'party' ? '' : `<button class="x" title="Remove wish" data-del-wish="${esc(it.wishId)}">×</button>`;
    wishes += `<li><div class="wish-top"><span class="mark ${it.ok ? 'ok' : 'no'}">${it.ok ? '✓' : '✗'}</span>`
      + `<span>${esc(label)} <button class="link" data-goto="${esc(P.guests[it.other].id)}">${esc(P.guests[it.other].name)}</button>`
      + `${it.hard ? '<span class="tag-hard">hard</span>' : ''}<span class="why">${esc(reason(app, g, it))}</span></span>${del}</div>`
      + (!it.ok && !it.hard && w ? costBlock(app, g, it) : '')
      + `</li>`;
  }
  if (row.isolated) wishes += `<li><div class="wish-top"><span class="mark no">✗</span><span>Knows someone at the table<span class="why">has ties to other guests, but none at this table</span></span></div></li>`;
  if (!wishes) wishes = `<li class="muted">No wishes yet. Anyone with no wishes is happy anywhere.</li>`;

  return `
    <h3>${esc(guest.name)}</h3>
    <p class="sub">${w ? esc(w.long) : '<span class="danger">Not seated</span>'}${guest.tag ? ' · ' + esc(guest.tag) : ''}</p>
    <div class="happy-bar" style="--h:${row.happiness}"><i style="width:${pct(row.happiness)}"></i></div>
    <p class="muted" style="margin:0">${pct(row.happiness)} of their wishes met${row.hardBroken ? ' · <span class="danger">a hard rule is broken</span>' : ''}</p>

    <h4>Wishes</h4>
    <ul class="wishes">${wishes}</ul>
    <div class="add-wish">
      <select id="wish-type">${Object.entries(WISHES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>
      <input id="wish-other" list="guest-names" placeholder="Guest name…" autocomplete="off">
      <button class="ghost small" id="wish-add">Add</button>
    </div>
    <datalist id="guest-names">${plan.guests.filter((x) => x.id !== guest.id).map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist>

    <h4>Lock</h4>
    <div class="seg locks" role="group">
      ${['none', 'table', 'seat'].map((m) => `<button data-lock="${m}" class="${lockMode === m ? 'on' : ''}" ${m !== 'none' && !w ? 'disabled' : ''}>${m === 'none' ? 'Free' : m === 'table' ? 'This table' : 'This seat'}</button>`).join('')}
    </div>

    <h4>Details</h4>
    <div class="field"><label for="f-name">Name</label><input id="f-name" value="${esc(guest.name)}"></div>
    <div class="field"><label for="f-tag">Group</label><input id="f-tag" list="tag-list" value="${esc(guest.tag || '')}"></div>
    <datalist id="tag-list">${tags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
    <div class="field"><label for="f-diet">Dietary</label><input id="f-diet" value="${esc(guest.diet || '')}" placeholder="shown on the place card"></div>
    <div class="field"><label>Party</label><span>${members.length ? members.map((m) => `<button class="link" data-goto="${esc(m.id)}">${esc(m.name)}</button>`).join(', ') : '<span class="muted">on their own</span>'}</span></div>
    <div class="row-btns">
      ${members.length ? '<button class="ghost small" id="leave-party">Leave party</button>' : ''}
      ${w ? '<button class="ghost small" id="unseat">Unseat</button>' : ''}
      <button class="ghost small danger" id="del-guest">Delete guest</button>
      <button class="ghost small" id="deselect">Done</button>
    </div>`;
}

function tableView(app, t) {
  const { plan, P, occ } = app;
  const table = plan.tables[t];
  const roster = P.tableSeats[t].map((s, i) => {
    const g = occ[s];
    return `<li>${i + 1}. ${g >= 0 ? `<button class="link" data-goto="${esc(P.guests[g].id)}">${esc(P.guests[g].name)}</button>` : '<span class="muted">empty</span>'}</li>`;
  }).join('');
  return `
    <h3>${esc(table.name)}</h3>
    <p class="sub">${P.tableSeats[t].filter((s) => occ[s] >= 0).length} of ${table.seats} seats filled</p>
    <div class="field"><label for="t-name">Name</label><input id="t-name" value="${esc(table.name)}"></div>
    <div class="field"><label for="t-shape">Shape</label><select id="t-shape">
      ${[['round', 'Round'], ['long', 'Long (two sides)'], ['head', 'Head (one side)']].map(([v, l]) => `<option value="${v}" ${table.shape === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select></div>
    <div class="field"><label for="t-seats">Seats</label><input id="t-seats" type="number" min="1" max="30" value="${table.seats}"></div>
    <div class="field"><label for="t-rot">Rotation</label><select id="t-rot">
      ${[0, 90, 180, 270].map((r) => `<option value="${r}" ${(table.rot || 0) === r ? 'selected' : ''}>${r}°</option>`).join('')}
    </select></div>
    <h4>Seated here</h4>
    <ol class="roster" style="list-style:none">${roster}</ol>
    <div class="row-btns">
      <button class="ghost small" id="clear-table">Unseat everyone</button>
      <button class="ghost small danger" id="del-table">Delete table</button>
      <button class="ghost small" id="deselect">Done</button>
    </div>`;
}

function summaryView(app) {
  const { plan, P, ex, findings, hard } = app;
  const seated = ex.filter((r) => r.seat >= 0);
  const avg = seated.length ? seated.reduce((s, r) => s + r.happiness, 0) / seated.length : 0;
  const unhappy = ex.map((r, g) => ({ r, g })).filter((x) => x.r.seat >= 0 && x.r.want > 0)
    .sort((a, b) => a.r.happiness - b.r.happiness).slice(0, 6).filter((x) => x.r.happiness < 1);
  const s = plan.settings;
  const name = (i) => esc(P.guests[i].name);

  const hardList = hard.filter((v) => v.kind !== 'unseated').slice(0, 8).map((v) =>
    `<div class="finding error"><b>${name(v.a)} &amp; ${name(v.b)}</b><span>${v.kind === 'never' ? 'are at the same table but must never be' : v.kind === 'party' ? 'came together but are at different tables' : 'must sit together but are apart'}</span></div>`).join('');
  const unseated = hard.filter((v) => v.kind === 'unseated').length;

  const lintHtml = findings.length
    ? findings.map((f) => `<div class="finding ${f.level}"><b>${esc(f.title)}</b><span>${esc(f.detail)}</span></div>`).join('')
    : `<div class="finding ok"><b>No impossibilities found</b><span>Every hard rule can be met with these tables, as far as the checks can prove.</span></div>`;

  return `
    <h3>The room</h3>
    <p class="sub">${plan.guests.length} guests · ${plan.tables.length} tables · ${P.S} seats</p>
    <div class="stats">
      <div class="stat ${hard.length ? 'bad' : 'good'}"><b>${hard.length - unseated}</b><span>hard rules broken</span></div>
      <div class="stat ${unseated ? 'bad' : ''}"><b>${unseated}</b><span>unseated</span></div>
      <div class="stat"><b>${pct(avg)}</b><span>average happiness</span></div>
      <div class="stat"><b>${pts(app.soft)}</b><span>score (higher is better)</span></div>
    </div>
    ${hardList ? `<h4>Broken hard rules</h4>${hardList}` : ''}
    <h4>Pre-flight check</h4>
    ${lintHtml}
    <h4>Least happy</h4>
    ${unhappy.length ? `<ul class="unhappy-list">${unhappy.map((x) => `<li><button class="link" data-goto="${esc(P.guests[x.g].id)}">${name(x.g)}</button><span>${pct(x.r.happiness)}</span></li>`).join('')}</ul>` : '<p class="muted">Everyone with a wish has it met.</p>'}
    <h4>Weights</h4>
    <div class="field"><label>Alone</label><div class="range"><input type="range" id="s-iso" min="0" max="30" step="1" value="${s.isolation}"><span>−${s.isolation}</span></div></div>
    <p class="muted" style="margin:-2px 0 8px;font-size:12px">The penalty when someone who knows other guests knows nobody at their table.</p>
    <div class="field"><label>Groups</label><div class="range"><input type="range" id="s-group" min="0" max="3" step="0.1" value="${s.groupBonus}"><span>+${s.groupBonus}</span></div></div>
    <p class="muted" style="margin:-2px 0 8px;font-size:12px">The bonus for each pair from the same group (e.g. “College”) at one table.</p>
    <p class="muted" style="font-size:12px;margin-top:16px">Click a guest or a table to edit it. In “Arrange tables” mode, drag tables around the room.</p>`;
}

function bind(app, el) {
  const on = (sel, ev, fn) => el.querySelectorAll(sel).forEach((n) => n.addEventListener(ev, fn));
  on('[data-goto]', 'click', (e) => app.select({ guest: e.currentTarget.dataset.goto }));
  on('#deselect', 'click', () => app.select(null));

  const gid = app.sel?.guest;
  if (gid) {
    on('#f-name', 'change', (e) => app.updateGuest(gid, { name: e.target.value.trim() || 'Guest' }));
    on('#f-tag', 'change', (e) => app.updateGuest(gid, { tag: e.target.value.trim() }));
    on('#f-diet', 'change', (e) => app.updateGuest(gid, { diet: e.target.value.trim() }));
    on('[data-lock]', 'click', (e) => app.setLock(gid, e.currentTarget.dataset.lock));
    on('[data-del-wish]', 'click', (e) => app.removeWish(e.currentTarget.dataset.delWish));
    on('#leave-party', 'click', () => app.leaveParty(gid));
    on('#unseat', 'click', () => app.unseat(gid));
    on('#del-guest', 'click', () => app.removeGuest(gid));
    const add = () => {
      const name = el.querySelector('#wish-other').value.trim().toLowerCase();
      const other = app.plan.guests.find((x) => x.name.toLowerCase() === name && x.id !== gid);
      if (!other) { app.toast('Pick a guest from the list.'); return; }
      app.addWish(gid, other.id, el.querySelector('#wish-type').value);
    };
    on('#wish-add', 'click', add);
    on('#wish-other', 'keydown', (e) => { if (e.key === 'Enter') add(); });
  }
  on('[data-cost]', 'click', (e) => app.askCost(e.currentTarget.dataset.cost));
  on('[data-apply]', 'click', (e) => app.applyCost(e.currentTarget.dataset.apply));
  on('[data-dismiss]', 'click', (e) => app.dismissCost(e.currentTarget.dataset.dismiss));

  const tid = app.sel?.table;
  if (tid) {
    on('#t-name', 'change', (e) => app.updateTable(tid, { name: e.target.value.trim() || 'Table' }));
    on('#t-shape', 'change', (e) => app.updateTable(tid, { shape: e.target.value }));
    on('#t-seats', 'change', (e) => app.updateTable(tid, { seats: Math.max(1, Math.min(30, Math.round(+e.target.value) || 1)) }));
    on('#t-rot', 'change', (e) => app.updateTable(tid, { rot: +e.target.value }));
    on('#clear-table', 'click', () => app.clearTable(tid));
    on('#del-table', 'click', () => app.removeTable(tid));
  }
  on('#s-iso', 'change', (e) => app.updateSettings({ isolation: +e.target.value }));
  on('#s-group', 'change', (e) => app.updateSettings({ groupBonus: +e.target.value }));
}
