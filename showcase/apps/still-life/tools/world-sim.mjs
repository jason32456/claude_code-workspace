// Headless checks for the World: node tools/world-sim.mjs  (exits non-zero on failure)
import { createWorld } from '../js/world.js';
import { LEVELS } from '../js/levels.js';
import { bodyX, bodyY } from '../js/world-body.js';
import { createBot } from './world-bot.mjs';

const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};
const section = (title) => console.log(`\n${title}`);

const fresh = (level, skipIntro = true) => createWorld({ storage: false, startLevel: level, skipIntro });

// ---------------------------------------------------------------- scene validity
const maskSums = new Map();
const sumOf = (mask) => mask.data.reduce((a, b) => a + b, 0);

function sceneProblem(scene) {
  const ids = new Set();
  const isInt = (v) => Number.isInteger(v);
  if (!scene.ground || !isInt(scene.ground.u) || !isInt(scene.ground.v)) return 'ground offsets not integer';
  if (scene.palette && scene.palette.length !== 2) return 'palette must have two colours';
  for (const item of scene.items) {
    if (typeof item.id !== 'string') return 'item without id';
    if (ids.has(item.id)) return `duplicate id ${item.id}`;
    ids.add(item.id);
    const { mask } = item;
    if (!mask || mask.data.length !== mask.w * mask.h) return `${item.id}: bad mask`;
    if (!isInt(item.x) || !isInt(item.y)) return `${item.id}: x/y not integer (${item.x}, ${item.y})`;
    if (item.u !== undefined && !isInt(item.u)) return `${item.id}: u not integer`;
    if (item.v !== undefined && !isInt(item.v)) return `${item.id}: v not integer`;
    if (item.simmer !== undefined && !(item.simmer >= 0 && item.simmer <= 1)) return `${item.id}: bad simmer`;
    const sum = sumOf(mask);
    if (!maskSums.has(mask)) maskSums.set(mask, sum);
    else if (maskSums.get(mask) !== sum) return `${item.id}: mask was mutated`;
  }
  return null;
}

function playLevels(from, to, mode, { maxTicks = 40000, checkScenes = false } = {}) {
  const world = fresh(from, false);
  const bots = {};
  const botFor = (lv) => {
    const m = typeof mode === 'function' ? mode(lv) : mode;
    return (bots[m] ||= createBot(world, m));
  };
  const bot = () => botFor(world.debug.rt.levelIndex + 1)();
  bot.stats = { get dashes() { return Object.values(bots).reduce((n, b) => n + b.stats.dashes, 0); } };
  const results = [];
  let level = from;
  let ticks = 0;
  let levelTicks = 0;
  let problem = null;
  let deathsAtStart = 0;
  while (level <= to && ticks < maxTicks) {
    world.step(bot());
    ticks++;
    levelTicks++;
    if (checkScenes && !problem) problem = sceneProblem(world.scene());
    const { rt } = world.debug;
    const reached = rt.state === 'end' ? LEVELS.length + 1 : rt.levelIndex + 1;
    if (reached > level) {
      results.push({ level, ticks: levelTicks, deaths: rt.deaths - deathsAtStart });
      deathsAtStart = rt.deaths;
      level = reached;
      levelTicks = 0;
    }
  }
  return { results, problem, finished: level > to, world, bot };
}

// ---------------------------------------------------------------- the checks
section('(a) scene validity over a long scripted run');
{
  const run = playLevels(1, LEVELS.length, (level) => (level <= 5 ? 'freeze' : 'stealth'), { checkScenes: true });
  check(!run.problem, `every scene valid (integers, unique ids, masks untouched)${run.problem ? `: ${run.problem}` : ''}`);
  check(run.finished, `scripted bots walked all ${LEVELS.length} levels through the end screen`);
  const world = run.world;
  for (let i = 0; i < 400 && !sceneProblem(world.scene()); i++) world.step({ dx: Math.sin(i), dy: Math.cos(i) });
  check(!sceneProblem(world.scene()), 'end screen scene valid');
  world.step({ dx: NaN, dy: undefined });
  world.step();
  world.step(null);
  check(!sceneProblem(world.scene()), 'step() tolerates missing / NaN input');
}

section('(b) the law');
{
  const world = fresh(1);
  const trace = [];
  for (let i = 0; i < 90; i++) {
    world.step({ dx: i < 30 ? 1 : 0, dy: 0 });
    const p = world.scene().items.find((it) => it.id === 'player');
    trace.push([p.x, p.y]);
  }
  const stillTail = trace.slice(32).every(([x, y]) => x === trace[32][0] && y === trace[32][1]);
  check(trace[29][0] > trace[0][0], 'player moves when pushed');
  check(stillTail && !world.debug.rt.player.visible, 'zero input on still ground: emitted position never changes, and the player is not visible');
}
{
  const world = fresh(6);
  const { rt } = world.debug;
  rt.player.ox = 60;
  rt.player.oy = 95;
  let prev = null;
  let exact = 0;
  let samples = 0;
  let everVisible = false;
  for (let i = 0; i < 120; i++) {
    world.step({});
    const scene = world.scene();
    const p = scene.items.find((it) => it.id === 'player');
    const river = scene.items.find((it) => it.id === 'river-0');
    if (prev) {
      samples++;
      if (p.x - prev.p.x === river.u - prev.r.u && p.y - prev.p.y === river.v - prev.r.v) exact++;
    }
    if (rt.player.visible) everVisible = true;
    prev = { p, r: river };
  }
  check(exact === samples && samples > 0, `river, zero input: player displacement equals the river's texture displacement on all ${samples} ticks`);
  check(!everVisible, 'a drifting player is never visible');
  const before = rt.player.ox;
  for (let i = 0; i < 20; i++) world.step({ dx: 0, dy: 1 });
  check(world.debug.rt.player.visible || rt.player.ox === before, 'steering inside a river is visible');
}
{
  const world = fresh(7);
  const { rt } = world.debug;
  rt.player.ox = 40;
  rt.player.oy = 40;
  let prev = null;
  let exact = 0;
  let samples = 0;
  for (let i = 0; i < 150; i++) {
    world.step({});
    const scene = world.scene();
    const p = scene.items.find((it) => it.id === 'player');
    if (prev) {
      samples++;
      if (p.x - prev.p.x === scene.ground.u - prev.g.u && p.y - prev.p.y === scene.ground.v - prev.g.v) exact++;
    }
    prev = { p, g: scene.ground };
  }
  check(exact === samples && samples > 0 && prev.g.u > 0, 'drifting ground, zero input: player carried by exactly the ground displacement');
  const held = fresh(7);
  held.debug.rt.player.ox = 40;
  held.debug.rt.player.oy = 40;
  let visibleTicks = 0;
  for (let i = 0; i < 100; i++) {
    held.step({ dx: -0.46, dy: 0 });
    if (held.debug.rt.player.visible) visibleTicks++;
  }
  check(visibleTicks > 60, `holding position against the current is visible (${visibleTicks}/100 ticks)`);
}

section('(c) a listening seeker is still');
{
  const world = fresh(3);
  const { rt } = world.debug;
  let listenTicks = 0;
  let moved = 0;
  let prev = null;
  for (let i = 0; i < 4000; i++) {
    world.step({});
    if (rt.state === 'caught') break;
    const items = world.scene().items.filter((it) => it.id.startsWith('seeker-'));
    if (prev) {
      items.forEach((it, k) => {
        if (prev.states[k] === 'listen' && rt.seekers[k].state === 'listen') {
          listenTicks++;
          if (it.x !== prev.items[k].x || it.y !== prev.items[k].y) moved++;
        }
      });
    }
    prev = { items, states: rt.seekers.map((s) => s.state) };
  }
  check(listenTicks > 300 && moved === 0, `emitted position constant across ${listenTicks} listening ticks`);
}

section('(d) every level can be cleared by a scripted bot');
for (const mode of ['freeze', 'stealth']) {
  for (let level = mode === 'freeze' ? 1 : 6; level <= (mode === 'freeze' ? 5 : LEVELS.length); level++) {
    const run = playLevels(level, level, mode, { maxTicks: 30000 });
    const r = run.results[0];
    const dashes = run.bot.stats ? run.bot.stats.dashes : 0;
    check(run.finished, `level ${level} ${LEVELS[level - 1].name.padEnd(14)} ${mode.padEnd(7)} ${r ? `${(r.ticks / 60).toFixed(0)}s, ${r.deaths} deaths${mode === 'freeze' ? `, ${dashes} dash decisions` : ''}` : 'did not finish'}`);
  }
}

section('(e) a bot that never stops moving gets caught');
for (let level = 2; level <= LEVELS.length; level++) {
  const delays = [0, 70, 140, 230, 310, 420, 555, 640];
  let caught = 0;
  let sum = 0;
  for (const delay of delays) {
    const world = fresh(level, true);
    const bot = createBot(world, 'naive');
    for (let i = 0; i < delay; i++) world.step({});
    for (let i = 0; i < 6000; i++) {
      world.step(bot());
      const { state } = world.debug.rt;
      if (state === 'caught') { caught++; sum += i; break; }
      if (state === 'cleared') break;
    }
  }
  check(caught >= 3, `level ${level} ${LEVELS[level - 1].name.padEnd(14)} caught in ${caught}/${delays.length} runs${caught ? `, after ${(sum / caught / 60).toFixed(1)}s on average` : ''}`);
}

section('(f) seekers never stay stuck');
for (let level = 2; level <= LEVELS.length; level++) {
  const world = fresh(level, true);
  const { rt } = world.debug;
  const lv = world.debug.level();
  const anchored = lv.seekers.map((s) => s.route.length === 1);
  const anchor = rt.seekers.map(() => ({ x: 0, y: 0, t: 0 }));
  let worst = 0;
  let hunts = 0;
  const stirrer = (i) => ({ dx: Math.sin(i / 37) > 0.4 ? Math.cos(i / 91) : 0, dy: Math.sin(i / 37) > 0.4 ? Math.sin(i / 53) : 0 });
  for (let i = 0; i < 9000; i++) {
    world.step(stirrer(i));
    if (rt.state !== 'play') {
      if (rt.state === 'intro' || rt.state === 'caught') anchor.forEach((a) => { a.t = 0; });
      continue;
    }
    rt.seekers.forEach((s, k) => {
      if (s.state === 'hunt') hunts++;
      const a = anchor[k];
      const away = Math.hypot(bodyX(s) - a.x, bodyY(s) - a.y);
      if (s.state === 'listen' || anchored[k] || away > 3) {
        a.x = bodyX(s);
        a.y = bodyY(s);
        a.t = 0;
      } else if (++a.t > worst) worst = a.t;
    });
  }
  check(worst < 150, `level ${level} ${LEVELS[level - 1].name.padEnd(14)} longest stall while walking: ${worst} ticks (${hunts} hunting ticks exercised)`);
}

section('glass, knocks, breath');
{
  const world = fresh(4);
  const { rt } = world.debug;
  const lv = world.debug.level();
  const piece = lv.glass[0];
  rt.player.ox = piece.x - 12;
  rt.player.oy = piece.y + 95;
  rt.seekers[0].ox = rt.player.ox - 50;
  rt.seekers[0].oy = rt.player.oy;
  const xs = new Set();
  for (let i = 0; i < 40; i++) {
    world.step({ dx: 1, dy: 0 });
    xs.add(world.scene().items.find((it) => it.id === piece.id).x);
  }
  check(xs.size > 1, 'pushing into glass makes the wall shiver into view');
  check(rt.seekers[0].state === 'investigate' || rt.seekers[0].state === 'listen' || rt.seekers[0].state === 'hunt', `a seeker in earshot reacts to the knock (state ${rt.seekers[0].state})`);
  let knocks = 0;
  const starts = new Set();
  for (let i = 0; i < 120; i++) {
    world.step({ dx: 1, dy: 0 });
    starts.add(rt.glass[0].start);
  }
  knocks = starts.size;
  check(knocks <= 3, `knocks are rate-limited (${knocks} in 2 s of constant pushing)`);
}
{
  const world = createWorld({ storage: false, startLevel: 4 });
  const lv = world.debug.level();
  const piece = lv.glass[0];
  const seen = new Set();
  const player = new Set();
  for (let i = 0; i < 300; i++) {
    world.step({});
    const scene = world.scene();
    seen.add(scene.items.find((it) => it.id === piece.id).x);
    player.add(`${scene.items.find((it) => it.id === 'player').x}`);
  }
  check(seen.size > 1 && player.size === 1, 'the breath shivers the glass while the player stays hidden');
}

section('persistence');
{
  const world = createWorld();
  for (let i = 0; i < 5; i++) world.step({});
  check(world.info().state === 'title', 'createWorld() with default storage works where localStorage does not exist');
  const info = fresh(5, false).info();
  check(info.level === 5 && info.title === 'GATHER' && info.levelCount === LEVELS.length, 'info() reports level and title');
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
