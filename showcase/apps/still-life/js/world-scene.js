import { rectMask, textMask } from './shape.js';
import { BREATH, SIMMER, TIMING } from './world-config.js';
import {
  breathTrigger, flowOffset, introLayout, ringOffset, shiverOffset,
} from './world-flow.js';
import { CARRIER_RADIUS, MASKS } from './world-level.js';

const TITLE_RANGE = 24;
const FALLBACK_PALETTE = ['#14130f', '#e9e4d8'];

const screenMasks = new Map();
function screenMask(cols, rows) {
  const key = `${cols}x${rows}`;
  if (!screenMasks.has(key)) screenMasks.set(key, rectMask(cols, rows));
  return screenMasks.get(key);
}

const centred = (mask, cols) => (cols - mask.w) >> 1;

function flowText(id, mask, cols, y, clock) {
  return { id, mask, x: centred(mask, cols), y, u: clock, v: 0 };
}

function titleScreen(rt, cols) {
  const mask = textMask('STILL LIFE', { height: 30 });
  const t = rt.stateTick % (TITLE_RANGE * 2);
  const wobble = t < TITLE_RANGE ? t : TITLE_RANGE * 2 - t;
  return [
    { id: 'title', mask, x: centred(mask, cols) - TITLE_RANGE / 2 + wobble, y: 52 },
    flowText('begin', textMask('MOVE TO BEGIN', { height: 16 }), cols, 118, rt.clock),
  ];
}

function endScreen(rt, cols) {
  return [
    flowText('end-1', textMask('EVERY FRAME WAS NOISE', { height: 18 }), cols, 40, rt.clock),
    flowText('end-2', textMask(`DEATHS ${rt.deaths}`, { height: 16 }), cols, 84, rt.clock),
    flowText('end-3', textMask('MOVE TO BEGIN AGAIN', { height: 16 }), cols, 130, rt.clock),
  ];
}

function gateItem(rt, lv, shiver) {
  const open = rt.gateOpen;
  const [u, v] = open ? ringOffset(rt.clock) : [0, 0];
  const r = CARRIER_RADIUS.gate;
  return { id: 'gate', mask: MASKS.gate, x: lv.gate.x - r + shiver, y: lv.gate.y - r, u, v };
}

function levelItems(rt, lv, cols) {
  const intro = rt.state === 'intro';
  const layout = introLayout(rt.retry);
  const breath = intro ? rt.stateTick - layout.breathStart : -1;
  const glimpse = (centreX) => (breath >= 0 ? shiverOffset(breath - breathTrigger(centreX, cols), BREATH.shiverTicks) : 0);
  const items = [];

  lv.rivers.forEach((river) => {
    items.push({
      id: river.id, mask: river.mask, x: river.x, y: river.y,
      u: flowOffset(rt.clock, river.vx), v: flowOffset(rt.clock, river.vy),
    });
  });

  lv.texts.forEach((text) => {
    if (text.when === 'afterStill' && !rt.stillHint) return;
    items.push({ id: text.id, mask: text.mask, x: text.x, y: text.y, u: rt.clock, v: 0 });
  });

  if (lv.walls) items.push({ id: 'walls', mask: lv.walls.mask, x: lv.walls.x, y: lv.walls.y, simmer: SIMMER.walls });

  lv.glass.forEach((piece, i) => {
    const bump = shiverOffset(rt.clock - rt.glass[i].start, rt.glass[i].length);
    items.push({ id: piece.id, mask: piece.mask, x: piece.x + bump + glimpse(piece.cx), y: piece.y });
  });

  if (lv.gate) items.push(gateItem(rt, lv, rt.gateOpen ? 0 : glimpse(lv.gate.x)));

  lv.sparks.forEach((spark, i) => {
    if (rt.sparkTaken[i]) return;
    const r = CARRIER_RADIUS.spark;
    items.push({ id: `spark-${i}`, mask: MASKS.spark, x: spark.x - r, y: spark.y - r, u: rt.clock, v: rt.clock >> 1 });
  });

  rt.seekers.forEach((seeker, i) => {
    const r = CARRIER_RADIUS.seeker;
    items.push({ id: lv.seekers[i].id, mask: MASKS.seeker, x: seeker.ox - r + glimpse(seeker.ox), y: seeker.oy - r });
  });

  const r = CARRIER_RADIUS.player;
  items.push({ id: 'player', mask: MASKS.player, x: rt.player.ox - r, y: rt.player.oy - r });

  if (breath >= 0 && breath <= BREATH.ticks) {
    items.push({
      id: 'sweep', mask: lv.sweepMask, y: 0,
      x: Math.round(-3 + (breath * (cols + 3)) / BREATH.ticks),
    });
  }

  if (intro && !rt.retry && rt.stateTick < TIMING.titleTicks) {
    const mask = lv.titleMask;
    items.push({ id: 'level-title', mask, x: centred(mask, cols) - 75 + rt.stateTick, y: 80 });
  }

  if (rt.state === 'caught') {
    items.push({ id: 'caught', mask: screenMask(cols, lv.rows), x: 0, y: 0, simmer: SIMMER.caught });
  }
  return items;
}

export function buildScene(rt, lv, cols, rows) {
  if (rt.state === 'title') return { ground: { u: 0, v: 0 }, palette: FALLBACK_PALETTE, items: titleScreen(rt, cols) };
  if (rt.state === 'end') return { ground: { u: 0, v: 0 }, palette: FALLBACK_PALETTE, items: endScreen(rt, cols) };
  const ground = lv.ground
    ? { u: flowOffset(rt.driftClock, lv.ground.vx), v: flowOffset(rt.driftClock, lv.ground.vy) }
    : { u: 0, v: 0 };
  return { ground, palette: lv.palette, items: levelItems(rt, lv, cols, rows) };
}
