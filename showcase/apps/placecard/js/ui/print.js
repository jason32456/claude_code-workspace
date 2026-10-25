const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const surname = (n) => n.trim().split(/\s+/).slice(-1)[0];

export function buildPrint(app, kind) {
  const { plan, P, occ } = app;
  const seatOf = new Map();
  for (let s = 0; s < P.S; s++) if (occ[s] >= 0) seatOf.set(occ[s], s);
  const tableName = (g) => (seatOf.has(g) ? plan.tables[P.seatTable[seatOf.get(g)]].name : 'Unseated');
  let html = '';

  if (kind === 'escort') {
    const order = P.guests.map((_, g) => g).sort((a, b) =>
      surname(P.guests[a].name).localeCompare(surname(P.guests[b].name)) || P.guests[a].name.localeCompare(P.guests[b].name));
    html = `<h1>${esc(plan.name)} — find your table</h1><div class="escort-grid">`
      + order.map((g) => `<div class="escort"><div class="n">${esc(P.guests[g].name)}</div><div class="t">${esc(tableName(g))}</div></div>`).join('')
      + `</div>`;
  } else if (kind === 'rosters') {
    html = `<h1>${esc(plan.name)} — table rosters</h1><div class="rosters">`
      + plan.tables.map((t, ti) => {
        const items = P.tableSeats[ti].map((s) => occ[s]).filter((g) => g >= 0)
          .map((g) => `<li>${esc(P.guests[g].name)}${P.guests[g].diet ? ` <span class="d">(${esc(P.guests[g].diet)})</span>` : ''}</li>`).join('');
        return `<div class="roster-card"><h2>${esc(t.name)}</h2><ol>${items || '<li>—</li>'}</ol></div>`;
      }).join('')
      + `</div>`;
  } else {
    const seated = [];
    plan.tables.forEach((t, ti) => P.tableSeats[ti].forEach((s) => { if (occ[s] >= 0) seated.push(occ[s]); }));
    const card = (g) => {
      const guest = P.guests[g];
      const inner = `<div class="n">${esc(guest.name)}</div>${guest.diet ? `<div class="d">${esc(guest.diet)}</div>` : ''}<div class="t">${esc(tableName(g))}</div>`;
      return `<div class="tent"><div class="flip">${inner}</div><div>${inner}</div></div>`;
    };
    html = `<div class="tents">${seated.map(card).join('')}</div>`;
  }
  document.getElementById('print-root').innerHTML = html;
}
