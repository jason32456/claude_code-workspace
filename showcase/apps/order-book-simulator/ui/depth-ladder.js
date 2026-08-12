export class DepthLadder {
  constructor(container) {
    this._el = container;
    this._el.innerHTML = '';
    this._el.className = 'depth-ladder';
    this._lastSnap = null;
  }

  render(snapshot) {
    const { bids, asks } = snapshot;
    if (!bids || !asks) return;

    const maxQty = Math.max(1, ...bids.map(b => b.qty), ...asks.map(a => a.qty));

    // Build asks reversed (lowest ask at bottom, closest to spread)
    const asksRows = [...asks].reverse().map(level => this._row(level, 'ask', maxQty));
    const spreadRow = this._spreadRow(snapshot);
    const bidsRows = bids.map(level => this._row(level, 'bid', maxQty));

    this._el.innerHTML =
      `<div class="ladder-header"><span>Price</span><span>Size</span></div>` +
      asksRows.join('') +
      spreadRow +
      bidsRows.join('');
  }

  _row(level, side, maxQty) {
    const pct = Math.round((level.qty / maxQty) * 100);
    const bg = side === 'ask'
      ? `linear-gradient(to left, rgba(239,68,68,0.25) ${pct}%, transparent ${pct}%)`
      : `linear-gradient(to left, rgba(34,197,94,0.25) ${pct}%, transparent ${pct}%)`;
    return `<div class="ladder-row ${side}" style="background:${bg}">
      <span class="price ${side}">${level.price.toFixed(2)}</span>
      <span class="qty">${level.qty}</span>
    </div>`;
  }

  _spreadRow({ bestBid, bestAsk }) {
    if (bestBid == null || bestAsk == null) return '<div class="ladder-spread">—</div>';
    const spread = (bestAsk - bestBid).toFixed(2);
    const mid = ((bestBid + bestAsk) / 2).toFixed(2);
    return `<div class="ladder-spread">mid ${mid} · spread ${spread}</div>`;
  }
}
