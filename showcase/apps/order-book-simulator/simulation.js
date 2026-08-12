/**
 * Simulation loop: wires agents to the engine, drives time, manages state.
 */
import { OrderBook } from './engine.js';
import { MarketMaker, NoiseTrader, MomentumTrader, MeanReversionTrader, ValueTrader } from './agents.js';

/** Mulberry32 — fast, good-quality seeded PRNG returning [0,1) */
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let z = Math.imul(s ^ s >>> 15, 1 | s);
    z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}

export class Simulation {
  constructor(config = {}) {
    this.config = {
      seed: 42,
      initialPrice: 100,
      tickIntervalMs: 50,
      numMakers: 3,
      numNoise: 5,
      numMomentum: 2,
      numReversion: 2,
      numValue: 2,
      trueValueDrift: 0.02,    // per-tick random walk of the true price
      ...config,
    };
    this._running = false;
    this._timerId = null;
    this.tick = 0;
    this._priceHistory = [];   // { tick, price } for chart
    this._volumeTotal = 0;
    this.onTick = null;        // callback(snapshot, trades)
    this._reset();
  }

  _reset() {
    const rng = makePRNG(this.config.seed);
    this._rng = rng;
    this.book = new OrderBook();
    this.tick = 0;
    this._priceHistory = [];
    this._volumeTotal = 0;
    this._trueValue = this.config.initialPrice;
    this._agents = [];
    this._agentMap = new Map(); // id -> agent

    // Seed the book with some resting orders so agents have a market to reference
    const p = this.config.initialPrice;
    for (let i = 1; i <= 5; i++) {
      this.book.submit({ side: 'buy', price: p - i, qty: 10 });
      this.book.submit({ side: 'sell', price: p + i, qty: 10 });
    }

    this._buildAgents();
  }

  _buildAgents() {
    const { numMakers, numNoise, numMomentum, numReversion, numValue } = this.config;
    let id = 1;
    const mk = (ctor, n, opts) => {
      for (let i = 0; i < n; i++) {
        const a = new ctor(`${ctor.name[0]}${id++}`, { ...opts, rng: this._rng });
        this._agents.push(a);
        this._agentMap.set(a.id, a);
      }
    };
    mk(MarketMaker, numMakers, { spread: 2 + this._rng() * 2, size: 5 });
    mk(NoiseTrader, numNoise, { orderInterval: 4 + Math.floor(this._rng() * 6), size: 3 });
    mk(MomentumTrader, numMomentum, { lookback: 8 + Math.floor(this._rng() * 8), threshold: 0.4 });
    mk(MeanReversionTrader, numReversion, { window: 15 + Math.floor(this._rng() * 10), threshold: 1.0 });
    mk(ValueTrader, numValue, { fairValue: this._trueValue, sensitivity: 0.3, size: 6 });
  }

  start() {
    if (this._running) return;
    this._running = true;
    const step = () => {
      if (!this._running) return;
      this._step();
      this._timerId = setTimeout(step, this.config.tickIntervalMs);
    };
    step();
  }

  stop() {
    this._running = false;
    if (this._timerId != null) { clearTimeout(this._timerId); this._timerId = null; }
  }

  reset(newConfig = {}) {
    this.stop();
    this.config = { ...this.config, ...newConfig };
    this._reset();
  }

  setSpeed(tickIntervalMs) {
    this.config.tickIntervalMs = tickIntervalMs;
  }

  rebuildAgents(newConfig = {}) {
    // Cancel all maker quotes
    for (const a of this._agents) {
      if (a._bidId != null) { this.book.cancel(a._bidId); }
      if (a._askId != null) { this.book.cancel(a._askId); }
    }
    this.config = { ...this.config, ...newConfig };
    this._agents = [];
    this._agentMap = new Map();
    this._buildAgents();
  }

  _step() {
    this.tick++;

    // Drift the true value with a random walk
    this._trueValue += (this._rng() - 0.5) * this.config.trueValueDrift * 2;
    this._trueValue = Math.max(10, this._trueValue);
    for (const a of this._agents) {
      if (a.type === 'value') a.setFairValue(this._trueValue);
    }

    const snapshot = this.book.snapshot();
    const newTrades = [];

    for (const agent of this._agents) {
      const actions = agent.act(snapshot, this.book, this.tick);
      for (const action of actions) {
        if (action.type === 'cancel') {
          this.book.cancel(action.orderId);
          agent.onCancel?.(action.orderId);
        } else if (action.type === 'submit') {
          const result = this.book.submit(action.order);
          // Let maker track its resting order IDs
          if (agent.onOrderId && result.trades.length === 0) {
            agent.onOrderId(null, result.id, action.order.side);
          }
          // Notify fills to taker
          for (const t of result.trades) {
            agent.onFill?.(t, action.order.side);
            // Notify maker
            const maker = this._agentMap.get(t.makerId);
            if (maker && maker !== agent) {
              const makerSide = action.order.side === 'buy' ? 'sell' : 'buy';
              maker.onFill?.(t, makerSide);
              maker.onCancel?.(t.makerOrderId);
            }
            newTrades.push(t);
          }
        }
      }
    }

    // Record last trade price for chart
    if (newTrades.length > 0) {
      const lastPrice = newTrades[newTrades.length - 1].price;
      this._priceHistory.push({ tick: this.tick, price: lastPrice });
      if (this._priceHistory.length > 2000) this._priceHistory.shift();
      this._volumeTotal += newTrades.reduce((s, t) => s + t.qty, 0);
    }

    this.onTick?.(this.book.snapshot(), newTrades);
  }

  get priceHistory() { return this._priceHistory; }
  get volumeTotal() { return this._volumeTotal; }
  get trueValue() { return this._trueValue; }

  get agentStats() {
    return this._agents.map(a => ({
      id: a.id,
      type: a.type,
      inventory: a.inventory ?? 0,
      pnl: a.pnl != null ? a.pnl + (a.inventory ?? 0) * this._lastMid : 0,
    }));
  }

  get _lastMid() {
    if (this._priceHistory.length === 0) return this._trueValue;
    return this._priceHistory[this._priceHistory.length - 1].price;
  }

  get recentTrades() {
    return this.book.trades.slice(-200);
  }
}
