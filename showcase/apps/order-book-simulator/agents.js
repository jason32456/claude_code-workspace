/**
 * Agent policies for the market simulator.
 * Each agent receives a market snapshot and emits order actions.
 */

export class MarketMaker {
  constructor(id, { spread = 2, size = 5, maxInventory = 50, rng } = {}) {
    this.id = id;
    this.type = 'maker';
    this.spread = spread;
    this.size = size;
    this.maxInventory = maxInventory;
    this.inventory = 0;
    this.pnl = 0;
    this._rng = rng;
    this._bidId = null;
    this._askId = null;
    this._lastMid = null;
  }

  act(snapshot, book, tick) {
    const { bestBid, bestAsk } = snapshot;
    if (bestBid == null && bestAsk == null) return [];
    const mid = bestBid != null && bestAsk != null
      ? (bestBid + bestAsk) / 2
      : (bestBid ?? bestAsk);

    if (mid == null) return [];

    const actions = [];

    // Cancel stale quotes if mid moved significantly
    const midMoved = this._lastMid == null || Math.abs(mid - this._lastMid) >= 0.5;
    if (midMoved) {
      if (this._bidId != null) { actions.push({ type: 'cancel', orderId: this._bidId }); this._bidId = null; }
      if (this._askId != null) { actions.push({ type: 'cancel', orderId: this._askId }); this._askId = null; }
    }

    if (this._bidId != null && this._askId != null) return actions;

    // Inventory skew: lean quotes against position to mean-revert
    const skew = (this.inventory / this.maxInventory) * (this.spread * 0.5);
    const halfSpread = this.spread / 2;
    const bidPrice = Math.round((mid - halfSpread - skew) * 100) / 100;
    const askPrice = Math.round((mid + halfSpread - skew) * 100) / 100;

    if (bidPrice <= 0 || askPrice <= bidPrice) return actions;

    if (this._bidId == null) {
      actions.push({ type: 'submit', order: { side: 'buy', price: bidPrice, qty: this.size, agentId: this.id } });
    }
    if (this._askId == null) {
      actions.push({ type: 'submit', order: { side: 'sell', price: askPrice, qty: this.size, agentId: this.id } });
    }
    this._lastMid = mid;
    return actions;
  }

  onFill(trade, side) {
    const delta = side === 'buy' ? trade.qty : -trade.qty;
    this.inventory += delta;
    this.pnl -= delta * trade.price;
  }

  onOrderId(tempRef, id, side) {
    if (side === 'buy') this._bidId = id;
    else this._askId = id;
  }

  onCancel(orderId) {
    if (this._bidId === orderId) this._bidId = null;
    if (this._askId === orderId) this._askId = null;
  }
}

export class NoiseTrader {
  constructor(id, { orderInterval = 5, size = 3, rng } = {}) {
    this.id = id;
    this.type = 'noise';
    this.orderInterval = orderInterval;
    this.size = size;
    this.inventory = 0;
    this.pnl = 0;
    this._rng = rng;
    this._nextTick = 0;
  }

  act(snapshot, book, tick) {
    if (tick < this._nextTick) return [];
    this._nextTick = tick + Math.floor(this._rng() * this.orderInterval * 2) + 1;

    const { bestBid, bestAsk } = snapshot;
    if (bestBid == null || bestAsk == null) return [];

    const side = this._rng() < 0.5 ? 'buy' : 'sell';
    const spread = bestAsk - bestBid;
    // Sometimes place a marketable limit, sometimes a passive one
    let price;
    if (this._rng() < 0.3) {
      price = side === 'buy' ? bestAsk : bestBid; // crosses
    } else {
      const offset = Math.round(this._rng() * spread * 2);
      price = side === 'buy' ? bestBid - offset : bestAsk + offset;
    }
    if (price <= 0) return [];

    return [{ type: 'submit', order: { side, price, qty: this.size, agentId: this.id } }];
  }

  onFill(trade, side) {
    const delta = side === 'buy' ? trade.qty : -trade.qty;
    this.inventory += delta;
    this.pnl -= delta * trade.price;
  }
}

export class MomentumTrader {
  constructor(id, { lookback = 10, threshold = 0.5, size = 4, rng } = {}) {
    this.id = id;
    this.type = 'momentum';
    this.lookback = lookback;
    this.threshold = threshold;
    this.size = size;
    this.inventory = 0;
    this.pnl = 0;
    this._rng = rng;
    this._prices = [];
    this._cooldown = 0;
  }

  act(snapshot, book, tick) {
    const { bestBid, bestAsk } = snapshot;
    if (bestBid == null || bestAsk == null) return [];
    const mid = (bestBid + bestAsk) / 2;
    this._prices.push(mid);
    if (this._prices.length > this.lookback + 1) this._prices.shift();
    if (this._prices.length < this.lookback) return [];
    if (tick < this._cooldown) return [];

    const oldest = this._prices[0];
    const move = mid - oldest;
    if (Math.abs(move) < this.threshold) return [];

    this._cooldown = tick + 8;
    const side = move > 0 ? 'buy' : 'sell';
    // Chase with a marketable limit
    const price = side === 'buy' ? bestAsk + 1 : bestBid - 1;
    if (price <= 0) return [];
    return [{ type: 'submit', order: { side, price, qty: this.size, agentId: this.id } }];
  }

  onFill(trade, side) {
    const delta = side === 'buy' ? trade.qty : -trade.qty;
    this.inventory += delta;
    this.pnl -= delta * trade.price;
  }
}

export class MeanReversionTrader {
  constructor(id, { window = 20, threshold = 1.5, size = 4, rng } = {}) {
    this.id = id;
    this.type = 'reversion';
    this.window = window;
    this.threshold = threshold;
    this.size = size;
    this.inventory = 0;
    this.pnl = 0;
    this._rng = rng;
    this._prices = [];
    this._cooldown = 0;
  }

  act(snapshot, book, tick) {
    const { bestBid, bestAsk } = snapshot;
    if (bestBid == null || bestAsk == null) return [];
    const mid = (bestBid + bestAsk) / 2;
    this._prices.push(mid);
    if (this._prices.length > this.window) this._prices.shift();
    if (this._prices.length < this.window) return [];
    if (tick < this._cooldown) return [];

    const avg = this._prices.reduce((a, b) => a + b, 0) / this._prices.length;
    const dev = mid - avg;
    if (Math.abs(dev) < this.threshold) return [];

    this._cooldown = tick + 10;
    // Fade the move: buy when below avg, sell when above
    const side = dev < 0 ? 'buy' : 'sell';
    const price = side === 'buy' ? bestAsk : bestBid;
    if (price <= 0) return [];
    return [{ type: 'submit', order: { side, price, qty: this.size, agentId: this.id } }];
  }

  onFill(trade, side) {
    const delta = side === 'buy' ? trade.qty : -trade.qty;
    this.inventory += delta;
    this.pnl -= delta * trade.price;
  }
}

export class ValueTrader {
  constructor(id, { fairValue = 100, sensitivity = 0.5, size = 6, rng } = {}) {
    this.id = id;
    this.type = 'value';
    this.fairValue = fairValue;
    this.sensitivity = sensitivity;
    this.size = size;
    this.inventory = 0;
    this.pnl = 0;
    this._rng = rng;
    this._cooldown = 0;
  }

  setFairValue(v) { this.fairValue = v; }

  act(snapshot, book, tick) {
    const { bestBid, bestAsk } = snapshot;
    if (bestBid == null || bestAsk == null) return [];
    if (tick < this._cooldown) return [];
    const mid = (bestBid + bestAsk) / 2;
    const diff = this.fairValue - mid;
    if (Math.abs(diff) < this.sensitivity) return [];

    this._cooldown = tick + 6;
    const side = diff > 0 ? 'buy' : 'sell'; // buy cheap, sell dear
    const price = side === 'buy' ? bestAsk : bestBid;
    if (price <= 0) return [];
    return [{ type: 'submit', order: { side, price, qty: this.size, agentId: this.id } }];
  }

  onFill(trade, side) {
    const delta = side === 'buy' ? trade.qty : -trade.qty;
    this.inventory += delta;
    this.pnl -= delta * trade.price;
  }
}
