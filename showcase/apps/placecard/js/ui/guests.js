const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const shortTable = (name) => {
  const m = name.match(/^table\s+(\S+)/i);
  return m ? `T${m[1]}` : name.split(/\s+/)[0];
};

export function whereLabel(app, g) {
  const s = app.ex[g].seat;
  if (s < 0) return null;
  const t = app.plan.tables[app.P.seatTable[s]];
  return { short: shortTable(t.name), long: `${t.name}, seat ${app.P.seatLocal[s] + 1}` };
}

export function renderGuests(app) {
  const { plan, P, ex } = app;
  const q = app.search.trim().toLowerCase();
  const keep = (g) => {
    const guest = P.guests[g];
    if (q && !(`${guest.name} ${guest.tag} ${guest.diet}`.toLowerCase().includes(q))) return false;
    if (app.filter === 'unhappy') return ex[g].hardBroken || ex[g].happiness < 0.7;
    if (app.filter === 'unseated') return ex[g].seat < 0;
    return true;
  };

  const groups = [];
  const byParty = new Map();
  plan.guests.forEach((guest, g) => {
    if (guest.party) {
      if (!byParty.has(guest.party)) { byParty.set(guest.party, []); groups.push(byParty.get(guest.party)); }
      byParty.get(guest.party).push(g);
    } else groups.push([g]);
  });

  let html = '';
  let lastTag = null, shown = 0;
  for (const members of groups) {
    const vis = members.filter(keep);
    if (!vis.length) continue;
    const tag = P.guests[members[0]].tag || '';
    if (tag !== lastTag && !q && app.filter === 'all') {
      html += `<li class="party-tag">${esc(tag || 'No group')}</li>`;
      lastTag = tag;
    }
    html += `<li class="party">`;
    for (const g of vis) {
      const guest = P.guests[g];
      const w = whereLabel(app, g);
      const sel = app.sel?.guest === guest.id ? ' sel' : '';
      const dot = w == null ? 'dot none' : ex[g].hardBroken ? 'dot broken' : 'dot';
      html += `<div class="guest-row${sel}" data-guest="${esc(guest.id)}">`
        + `<i class="${dot}" style="--h:${ex[g].happiness.toFixed(2)}"></i>`
        + `<span class="nm">${esc(guest.name)}${plan.locks[guest.id] ? ' <span class="muted" title="Locked">⌂</span>' : ''}</span>`
        + `<span class="where${w ? '' : ' none'}">${w ? esc(w.short) : 'unseated'}</span></div>`;
      shown++;
    }
    html += `</li>`;
  }
  if (!shown) html = `<li class="muted" style="padding:14px">${plan.guests.length ? 'No guests match.' : 'No guests yet — use “+ Guests”, or File → Load the demo wedding.'}</li>`;
  document.getElementById('guest-list').innerHTML = html;
  const seated = ex.filter((r) => r.seat >= 0).length;
  document.getElementById('guest-count').textContent = `${seated}/${plan.guests.length} seated`;
}
