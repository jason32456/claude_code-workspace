export class TradeTape {
  constructor(container) {
    this._el = container;
    this._el.className = 'trade-tape';
    this._lastPrice = null;
  }

  push(trades) {
    if (!trades || trades.length === 0) return;
    const fragment = document.createDocumentFragment();
    for (const t of trades) {
      const div = document.createElement('div');
      const dir = t.takerSide === 'buy' ? 'buy' : 'sell';
      const arrow = dir === 'buy' ? '▲' : '▼';
      const move = this._lastPrice != null
        ? t.price > this._lastPrice ? 'up' : t.price < this._lastPrice ? 'dn' : ''
        : '';
      div.className = `tape-row ${dir} ${move}`;
      div.innerHTML =
        `<span class="tape-price ${dir}">${arrow} ${t.price.toFixed(2)}</span>` +
        `<span class="tape-qty">${t.qty}</span>` +
        `<span class="tape-side">${dir.toUpperCase()}</span>`;
      fragment.prepend(div);
      this._lastPrice = t.price;
    }
    this._el.prepend(fragment);
    // Keep tape bounded
    while (this._el.children.length > 80) this._el.removeChild(this._el.lastChild);
  }
}
