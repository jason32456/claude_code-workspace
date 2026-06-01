import { Simulation } from './simulation.js';
import { DepthLadder } from './ui/depth-ladder.js';
import { TradeTape } from './ui/trade-tape.js';
import { PriceChart } from './ui/price-chart.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const ladder = new DepthLadder($('ladder'));
const tape = new TradeTape($('tape'));
const chart = new PriceChart($('chart'));

// ── Stats ────────────────────────────────────────────────────────────────────
function updateStats(snap, sim) {
  const mid = snap.bestBid != null && snap.bestAsk != null
    ? ((snap.bestBid + snap.bestAsk) / 2).toFixed(2)
    : '—';
  const spread = snap.bestBid != null && snap.bestAsk != null
    ? (snap.bestAsk - snap.bestBid).toFixed(2)
    : '—';
  $('stat-mid').textContent = mid;
  $('stat-spread').textContent = spread;
  $('stat-last').textContent = sim.priceHistory.length
    ? sim.priceHistory[sim.priceHistory.length - 1].price.toFixed(2)
    : '—';
  $('stat-vol').textContent = sim.volumeTotal.toLocaleString();
  $('stat-orders').textContent = sim.book.orderCount;
  $('stat-tick').textContent = sim.tick;
}

// ── Agent leaderboard ─────────────────────────────────────────────────────────
let _lbThrottle = 0;
function updateLeaderboard(sim) {
  if (Date.now() - _lbThrottle < 500) return;
  _lbThrottle = Date.now();
  const stats = sim.agentStats;
  const sorted = [...stats].sort((a, b) => b.pnl - a.pnl).slice(0, 10);
  $('leaderboard').innerHTML = sorted.map(a =>
    `<div class="lb-row">
      <span class="lb-id">${a.id}</span>
      <span class="lb-type">${a.type}</span>
      <span class="lb-inv ${a.inventory > 0 ? 'pos' : a.inventory < 0 ? 'neg' : ''}">${a.inventory > 0 ? '+' : ''}${a.inventory}</span>
      <span class="lb-pnl ${a.pnl >= 0 ? 'pos' : 'neg'}">${a.pnl >= 0 ? '+' : ''}${a.pnl.toFixed(1)}</span>
    </div>`
  ).join('');
}

// ── Manual order entry ─────────────────────────────────────────────────────────
let _manualFills = [];
function setupManualEntry(sim) {
  $('order-submit').onclick = () => {
    const side = $('order-side').value;
    const type = $('order-type').value;
    const priceStr = $('order-price').value.trim();
    const qty = parseInt($('order-qty').value, 10);
    if (!qty || qty <= 0) { alert('Enter a valid quantity'); return; }
    const price = type === 'market' ? null : parseFloat(priceStr);
    if (type === 'limit' && (isNaN(price) || price <= 0)) { alert('Enter a valid price'); return; }
    const { trades } = sim.book.submit({ side, price, qty, type, agentId: 'MANUAL' });
    _manualFills.push(...trades);
    if (trades.length === 0) {
      showFillMessage(`Resting ${type} ${side} order @ ${price ?? 'MKT'} × ${qty}`);
    } else {
      const total = trades.reduce((s, t) => s + t.qty, 0);
      const avgPx = trades.reduce((s, t) => s + t.price * t.qty, 0) / total;
      showFillMessage(`Filled ${total} @ avg ${avgPx.toFixed(2)}`);
    }
  };

  $('order-type').onchange = () => {
    $('order-price').disabled = $('order-type').value === 'market';
  };
}

function showFillMessage(msg) {
  const el = $('fill-msg');
  el.textContent = msg;
  el.style.opacity = 1;
  setTimeout(() => { el.style.opacity = 0; }, 2500);
}

// ── Simulation setup ──────────────────────────────────────────────────────────
let sim = new Simulation();

sim.onTick = (snapshot, trades) => {
  ladder.render(snapshot);
  tape.push(trades);
  chart.render(sim.priceHistory, sim.trueValue);
  updateStats(snapshot, sim);
  updateLeaderboard(sim);
};

// ── Controls ─────────────────────────────────────────────────────────────────
$('btn-play').onclick = () => {
  sim.start();
  $('btn-play').disabled = true;
  $('btn-pause').disabled = false;
};

$('btn-pause').onclick = () => {
  sim.stop();
  $('btn-play').disabled = false;
  $('btn-pause').disabled = true;
};

$('btn-reset').onclick = () => {
  const seed = parseInt($('ctrl-seed').value, 10) || 42;
  sim.reset({ seed, ...readAgentCounts() });
  $('btn-play').disabled = false;
  $('btn-pause').disabled = true;
  ladder.render({ bids: [], asks: [], bestBid: null, bestAsk: null });
  $('tape').innerHTML = '';
};

$('ctrl-speed').oninput = () => {
  const labels = [200, 100, 50, 25, 10];
  sim.setSpeed(labels[$('ctrl-speed').value] ?? 50);
  $('speed-label').textContent = ['0.5×', '1×', '2×', '4×', '10×'][$('ctrl-speed').value] ?? '2×';
};

function readAgentCounts() {
  return {
    numMakers:    parseInt($('ctrl-makers').value, 10) || 3,
    numNoise:     parseInt($('ctrl-noise').value, 10) || 5,
    numMomentum:  parseInt($('ctrl-momentum').value, 10) || 2,
    numReversion: parseInt($('ctrl-reversion').value, 10) || 2,
    numValue:     parseInt($('ctrl-value').value, 10) || 2,
  };
}

$('btn-apply-agents').onclick = () => {
  sim.rebuildAgents(readAgentCounts());
};

setupManualEntry(sim);

// Auto-start
sim.start();
$('btn-play').disabled = true;
$('btn-pause').disabled = false;
