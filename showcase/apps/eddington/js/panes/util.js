export function table(cols, rows) {
  const head = cols.map((c) => `<th>${c}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
export function cards(list) {
  return `<div class="cards">${list.map((c) => `<div class="card">
    <div class="k">${c.k}</div><div class="v ${c.cls || ''}">${c.v}</div><div class="d">${c.d}</div></div>`).join('')}</div>`;
}
export const arcsec = (rad) => rad * (180 / Math.PI) * 3600;
export const deg = (rad) => rad * 180 / Math.PI;
export function sig(x, n = 6) {
  if (!isFinite(x)) return '—';
  return Number(x.toPrecision(n)).toString();
}
