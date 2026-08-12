/**
 * Unit tests for the matching engine.
 * Run with: node --experimental-vm-modules tests/engine.test.js
 * (or just: node tests/engine.test.js since we use dynamic import tricks below)
 */

import { OrderBook } from '../engine.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function assertEq(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) console.error(`    expected: ${JSON.stringify(b)}\n    got:      ${JSON.stringify(a)}`);
  assert(ok, msg);
}

function section(name) { console.log(`\n${name}`); }

// ── Basic limit order resting ────────────────────────────────────────────────
section('Resting orders');
{
  const book = new OrderBook();
  book.submit({ side: 'buy', price: 100, qty: 10 });
  book.submit({ side: 'sell', price: 101, qty: 5 });
  const snap = book.snapshot();
  assertEq(snap.bestBid, 100, 'best bid = 100');
  assertEq(snap.bestAsk, 101, 'best ask = 101');
  assertEq(snap.bids[0].qty, 10, 'bid qty = 10');
  assertEq(snap.asks[0].qty, 5, 'ask qty = 5');
  assertEq(book.orderCount, 2, 'two resting orders');
}

// ── Full fill ────────────────────────────────────────────────────────────────
section('Full fill');
{
  const book = new OrderBook();
  book.submit({ side: 'buy', price: 100, qty: 10 });
  const { trades } = book.submit({ side: 'sell', price: 100, qty: 10 });
  assertEq(trades.length, 1, 'one trade');
  assertEq(trades[0].qty, 10, 'trade qty = 10');
  assertEq(trades[0].price, 100, 'trade price = maker price (100)');
  assertEq(book.orderCount, 0, 'no resting orders after full fill');
  assertEq(book.snapshot().bestBid, null, 'no bid remains');
}

// ── Partial fill — taker smaller than maker ───────────────────────────────────
section('Partial fill (taker < maker)');
{
  const book = new OrderBook();
  book.submit({ side: 'buy', price: 100, qty: 20 });
  const { trades } = book.submit({ side: 'sell', price: 100, qty: 7 });
  assertEq(trades.length, 1, 'one trade');
  assertEq(trades[0].qty, 7, 'trade qty = 7');
  assertEq(book.snapshot().bids[0].qty, 13, 'remaining bid qty = 13');
  assertEq(book.orderCount, 1, 'maker still resting');
}

// ── Partial fill — maker smaller than taker (spread across levels) ────────────
section('Partial fill (taker > one level, sweeps multiple levels)');
{
  const book = new OrderBook();
  book.submit({ side: 'sell', price: 101, qty: 5 });
  book.submit({ side: 'sell', price: 102, qty: 5 });
  const { trades } = book.submit({ side: 'buy', price: 103, qty: 12 });
  assertEq(trades.length, 2, 'two trades (two levels hit)');
  assertEq(trades[0].price, 101, 'first fill at 101');
  assertEq(trades[1].price, 102, 'second fill at 102');
  assertEq(book.snapshot().bids[0].qty, 2, 'remainder rests as bid qty=2');
}

// ── Price improvement ─────────────────────────────────────────────────────────
section('Price improvement');
{
  const book = new OrderBook();
  book.submit({ side: 'sell', price: 99, qty: 5 }); // resting ask at 99
  // buyer places limit at 105 — should get price improvement (fill at 99 not 105)
  const { trades } = book.submit({ side: 'buy', price: 105, qty: 5 });
  assertEq(trades[0].price, 99, 'trade at maker price 99, not taker price 105');
}

// ── Price-time priority ───────────────────────────────────────────────────────
section('Price-time priority within a level');
{
  const book = new OrderBook();
  // Three sells at same price — first in should be first filled
  book.submit({ side: 'sell', price: 100, qty: 3, agentId: 'A' });
  book.submit({ side: 'sell', price: 100, qty: 3, agentId: 'B' });
  book.submit({ side: 'sell', price: 100, qty: 3, agentId: 'C' });
  const { trades } = book.submit({ side: 'buy', price: 100, qty: 4 });
  assertEq(trades[0].makerId, 'A', 'first fill from agent A');
  assertEq(trades[0].qty, 3, 'agent A fully filled');
  assertEq(trades[1].makerId, 'B', 'second fill from agent B');
  assertEq(trades[1].qty, 1, 'agent B partially filled');
}

// ── Market order ──────────────────────────────────────────────────────────────
section('Market order');
{
  const book = new OrderBook();
  book.submit({ side: 'sell', price: 100, qty: 5 });
  book.submit({ side: 'sell', price: 101, qty: 5 });
  const { trades } = book.submit({ side: 'buy', price: null, qty: 7, type: 'market' });
  assertEq(trades.length, 2, 'two trades');
  assertEq(trades[0].price, 100, 'first fill at 100');
  assertEq(trades[1].price, 101, 'second fill at 101');
  assertEq(trades[1].qty, 2, 'second fill qty = 2');
  assertEq(book.snapshot().bestAsk, 101, 'ask at 100 consumed; best ask now 101');
  assertEq(book.orderCount, 1, 'remaining ask at 101 stays');
}

// ── Market order sweeps entire book ──────────────────────────────────────────
section('Market order sweeps entire book');
{
  const book = new OrderBook();
  book.submit({ side: 'sell', price: 100, qty: 3 });
  const { trades } = book.submit({ side: 'buy', price: null, qty: 10, type: 'market' });
  assertEq(trades[0].qty, 3, 'fills what exists');
  assertEq(book.snapshot().bestAsk, null, 'book is empty');
  assertEq(book.orderCount, 0, 'no resting orders (remainder cancelled)');
}

// ── Cancel ────────────────────────────────────────────────────────────────────
section('Cancel');
{
  const book = new OrderBook();
  const { id } = book.submit({ side: 'buy', price: 100, qty: 10 });
  assert(book.cancel(id), 'cancel returns true');
  assertEq(book.snapshot().bestBid, null, 'bid removed');
  assertEq(book.orderCount, 0, 'no resting orders');
  assert(!book.cancel(id), 'cancelling again returns false');
}

// ── Multiple levels — best() always correct ───────────────────────────────────
section('Best always reflects top of book after removals');
{
  const book = new OrderBook();
  const r1 = book.submit({ side: 'sell', price: 100, qty: 5 });
  const r2 = book.submit({ side: 'sell', price: 99, qty: 5 });
  assertEq(book.snapshot().bestAsk, 99, 'best ask = 99 (lower wins)');
  book.cancel(r2.id);
  assertEq(book.snapshot().bestAsk, 100, 'best ask = 100 after cancel of 99');
}

// ── Bid ordering (highest bid first) ─────────────────────────────────────────
section('Bid ordering');
{
  const book = new OrderBook();
  book.submit({ side: 'buy', price: 98, qty: 1 });
  book.submit({ side: 'buy', price: 100, qty: 1 });
  book.submit({ side: 'buy', price: 99, qty: 1 });
  const snap = book.snapshot();
  assertEq(snap.bids.map(b => b.price), [100, 99, 98], 'bids sorted desc');
}

// ── No self-cross (passive order must not cross) ─────────────────────────────
section('Non-crossing orders rest without trading');
{
  const book = new OrderBook();
  book.submit({ side: 'buy', price: 99, qty: 5 });
  const { trades } = book.submit({ side: 'sell', price: 100, qty: 5 });
  assertEq(trades.length, 0, 'no trade when bid < ask');
  assertEq(book.orderCount, 2, 'both orders resting');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
