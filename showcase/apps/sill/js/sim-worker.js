// SharedWorker: the one authoritative world shared by every Sill window on this
// origin. It steps on its own clock, so no window's requestAnimationFrame (which
// stops when a window is hidden) can stall the water.

import { World } from './world.js';

const ports = new Set();
let world = null;
let timer = 0;
let last = 0;
let acc = 0;

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);
  port.onmessage = (m) => {
    try { onMessage(port, m.data); } catch (err) { port.postMessage({ t: 'error', message: String(err && err.stack || err) }); }
  };
  port.start();
};

function onMessage(port, msg) {
  const now = performance.now();
  switch (msg.t) {
    case 'hello':
      if (!world) {
        world = new World();
        world.setScreen(msg.screen);
        world.loadLevel(msg.level | 0);
        start();
      }
      port.postMessage(world.levelMessage());
      break;
    case 'pane':
      if (world) world.setPane(msg.id, msg, now);
      break;
    case 'bye':
      if (world) world.removePane(msg.id);
      ports.delete(port);
      break;
    case 'poke':
      if (world) world.poke(msg.x, msg.y, msg.dx, msg.dy);
      break;
    case 'level':
      if (!world) return;
      world.setScreen(msg.screen);
      world.loadLevel(msg.index | 0);
      broadcast(world.levelMessage());
      break;
  }
}

function start() {
  last = performance.now();
  timer = setInterval(tick, 8);
}

function tick() {
  const now = performance.now();
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  let steps = 0;
  while (acc >= 1 / 60 && steps < 3) {
    world.step(now);
    acc -= 1 / 60;
    steps++;
  }
  if (steps === 3) acc = 0;
  if (!steps) return;
  const s = world.snapshot();
  // Slices, not views: cloning a view would copy the whole backing buffer.
  broadcast({
    t: 'world', seq: s.seq, n: s.n, time: s.time, version: s.version,
    pos: s.pos.slice(0, s.n * 2), home: s.home.slice(0, s.n), speed: s.speed.slice(0, s.n),
    panes: s.panes, fills: s.fills, bloomAt: s.bloomAt, springOn: s.springOn, stats: s.stats, events: s.events,
  });
}

function broadcast(msg) {
  for (const p of ports) p.postMessage(msg);
}
