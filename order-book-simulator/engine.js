/**
 * Order Book Matching Engine
 *
 * Pure, framework-agnostic module. No side effects beyond returning trade events.
 * Price-time priority: bids sorted desc, asks sorted asc; within a level, FIFO.
 */

export class OrderBook {
  constructor() {
    this._bids = new SortedLevels('bid');
    this._asks = new SortedLevels('ask');
    this._orders = new Map(); // orderId -> { level, order }
    this._nextId = 1;
    this._ts = 0;
    this.trades = [];
  }

  _now() { return ++this._ts; }

  _makeId() { return this._nextId++; }

  /**
   * Submit a limit or market order.
   * order: { side: 'buy'|'sell', price: number|null, qty: number, type?: 'limit'|'market' }
   * Returns array of trade objects.
   */
  submit(order) {
    const o = {
      id: this._makeId(),
      side: order.side,
      price: order.price ?? null,
      qty: order.qty,
      origQty: order.qty,
      type: order.type ?? (order.price == null ? 'market' : 'limit'),
      ts: this._now(),
      agentId: order.agentId ?? null,
    };

    const trades = o.type === 'market'
      ? this._matchMarket(o)
      : this._matchLimit(o);

    for (const t of trades) this.trades.push(t);
    return { id: o.id, trades };
  }

  cancel(orderId) {
    const entry = this._orders.get(orderId);
    if (!entry) return false;
    const { level, order } = entry;
    level.remove(order);
    if (level.isEmpty()) {
      const side = order.side === 'buy' ? this._bids : this._asks;
      side.removeLevel(level.price);
    }
    this._orders.delete(orderId);
    return true;
  }

  /** Cancel-replace: change qty and/or price, losing time priority if price changes. */
  amend(orderId, { qty, price } = {}) {
    const entry = this._orders.get(orderId);
    if (!entry) return false;
    const { order } = entry;
    const priceChanged = price != null && price !== order.price;
    this.cancel(orderId);
    const newOrder = { ...order, qty: qty ?? order.qty, price: price ?? order.price };
    if (!priceChanged) {
      // Keep original ts so it re-joins at the back of its level (lose position on price change)
      this._restOnBook(newOrder);
      this._orders.set(newOrder.id, { level: this._levelFor(newOrder), order: newOrder });
    } else {
      const result = this.submit(newOrder);
      return result;
    }
    return true;
  }

  _levelFor(order) {
    const side = order.side === 'buy' ? this._bids : this._asks;
    return side.getLevel(order.price);
  }

  _matchLimit(order) {
    const opp = order.side === 'buy' ? this._asks : this._bids;
    const trades = [];
    while (order.qty > 0 && !opp.isEmpty() && this._crosses(order, opp.best())) {
      this._fillAgainst(order, opp, trades);
    }
    if (order.qty > 0) this._restOnBook(order);
    return trades;
  }

  _matchMarket(order) {
    const opp = order.side === 'buy' ? this._asks : this._bids;
    const trades = [];
    while (order.qty > 0 && !opp.isEmpty()) {
      this._fillAgainst(order, opp, trades);
    }
    // remaining qty is cancelled (not rested)
    return trades;
  }

  _fillAgainst(taker, oppSide, trades) {
    const level = oppSide.best();
    const resting = level.front();
    const fillQty = Math.min(taker.qty, resting.qty);
    trades.push({
      price: resting.price,        // trade executes at maker's price
      qty: fillQty,
      takerSide: taker.side,
      takerId: taker.agentId,
      makerId: resting.agentId,
      makerOrderId: resting.id,
      takerOrderId: taker.id,
      ts: this._now(),
    });
    taker.qty -= fillQty;
    resting.qty -= fillQty;
    if (resting.qty === 0) {
      level.popFront();
      this._orders.delete(resting.id);
      if (level.isEmpty()) oppSide.removeLevel(level.price);
    }
  }

  _crosses(order, level) {
    return order.side === 'buy'
      ? order.price >= level.price
      : order.price <= level.price;
  }

  _restOnBook(order) {
    const side = order.side === 'buy' ? this._bids : this._asks;
    const level = side.getOrCreateLevel(order.price);
    level.push(order);
    this._orders.set(order.id, { level, order });
  }

  /** Read-only snapshot: array of { price, qty, count } for bids (desc) and asks (asc). */
  snapshot(depth = 20) {
    return {
      bids: this._bids.snapshot(depth),
      asks: this._asks.snapshot(depth),
      bestBid: this._bids.best()?.price ?? null,
      bestAsk: this._asks.best()?.price ?? null,
    };
  }

  get orderCount() { return this._orders.size; }
}

/**
 * Maintains one side of the book: sorted price levels + fast best() access.
 * For bids: prices sorted descending. For asks: ascending.
 */
class SortedLevels {
  constructor(side) {
    this._side = side; // 'bid' | 'ask'
    this._levels = new Map(); // price -> Level
    this._prices = [];        // sorted array of active prices
  }

  _insertPrice(price) {
    // Binary insert to maintain sort order
    let lo = 0, hi = this._prices.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._side === 'bid') {
        if (this._prices[mid] > price) lo = mid + 1;
        else hi = mid;
      } else {
        if (this._prices[mid] < price) lo = mid + 1;
        else hi = mid;
      }
    }
    this._prices.splice(lo, 0, price);
  }

  getOrCreateLevel(price) {
    if (!this._levels.has(price)) {
      this._levels.set(price, new Level(price));
      this._insertPrice(price);
    }
    return this._levels.get(price);
  }

  getLevel(price) { return this._levels.get(price) ?? null; }

  removeLevel(price) {
    this._levels.delete(price);
    const idx = this._prices.indexOf(price);
    if (idx !== -1) this._prices.splice(idx, 1);
  }

  best() { return this._prices.length ? this._levels.get(this._prices[0]) : null; }

  isEmpty() { return this._prices.length === 0; }

  snapshot(depth) {
    return this._prices.slice(0, depth).map(p => this._levels.get(p).summary());
  }
}

/** A single price level: FIFO queue of orders. */
class Level {
  constructor(price) {
    this.price = price;
    this._queue = [];
  }

  push(order) { this._queue.push(order); }

  front() { return this._queue[0] ?? null; }

  popFront() { this._queue.shift(); }

  remove(order) {
    const idx = this._queue.indexOf(order);
    if (idx !== -1) this._queue.splice(idx, 1);
  }

  isEmpty() { return this._queue.length === 0; }

  summary() {
    return {
      price: this.price,
      qty: this._queue.reduce((s, o) => s + o.qty, 0),
      count: this._queue.length,
    };
  }
}
