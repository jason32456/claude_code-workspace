import { LEVELS } from './levels.js';
import { createAudio } from './audio.js';
import { TIMING } from './world-config.js';
import { bodyX, bodyY } from './world-body.js';
import { introLayout } from './world-flow.js';
import { buildLevel } from './world-level.js';
import { resetLevelState, tickPlay } from './world-play.js';
import { buildScene } from './world-scene.js';

const STORAGE_KEY = 'still-life:furthest';
const SEED = 0x51117;
const TITLE_NAME = 'STILL LIFE';
const END_NAME = 'EVERY FRAME WAS NOISE';

function makeStore(enabled) {
  if (!enabled) return { load: () => 0, save: () => {} };
  return {
    load() {
      try {
        const n = Number.parseInt(localStorage.getItem(STORAGE_KEY), 10);
        return Number.isInteger(n) && n >= 0 && n < LEVELS.length ? n : 0;
      } catch {
        return 0;
      }
    },
    save(n) {
      try {
        localStorage.setItem(STORAGE_KEY, String(n));
      } catch {
        // storage can be blocked; progress just will not persist
      }
    },
  };
}

const finite = (v) => (Number.isFinite(v) ? v : 0);

function cleanInput(input) {
  const i = input || {};
  return {
    dx: Math.max(-1, Math.min(1, finite(i.dx))),
    dy: Math.max(-1, Math.min(1, finite(i.dy))),
    action: !!i.action,
  };
}

// options: cols, rows, startLevel (1-based, skips the title), skipIntro,
// storage (false keeps tests and the debug page away from localStorage).
export function createWorld(options = {}) {
  const { cols = 320, rows = 180, storage = true } = options;
  const store = makeStore(storage);
  const audio = createAudio();
  const built = new Map();
  let silent = false;
  const fx = {
    knock: () => silent || audio.knock(),
    spark: () => silent || audio.spark(),
    gate: () => silent || audio.gate(),
    caught: () => silent || audio.caught(),
  };

  const levelAt = (index) => {
    if (!built.has(index)) built.set(index, buildLevel(LEVELS[index], cols, rows));
    return built.get(index);
  };

  let furthest = store.load();
  let rt = {
    state: 'title',
    stateTick: 0,
    clock: 0,
    deaths: 0,
    attempt: 0,
    rng: SEED,
    levelIndex: furthest,
    retry: false,
    pressTicks: 0,
  };
  resetLevelState(rt, levelAt(rt.levelIndex));

  const enter = (state) => {
    rt.state = state;
    rt.stateTick = 0;
    rt.pressTicks = 0;
  };

  function startLevel(index, retry) {
    rt.levelIndex = index;
    rt.retry = retry;
    rt.attempt++;
    rt.rng = (SEED ^ Math.imul(index + 1, 2654435761) ^ Math.imul(rt.attempt, 40503)) | 0;
    resetLevelState(rt, levelAt(index));
    if (index > furthest) {
      furthest = index;
      store.save(furthest);
    }
    enter('intro');
  }

  function wantsToStart(input, grace) {
    const pushing = Math.hypot(input.dx, input.dy) > 0.3;
    rt.pressTicks = pushing ? rt.pressTicks + 1 : 0;
    return rt.stateTick > grace && (input.action || rt.pressTicks >= TIMING.startMoveTicks);
  }

  function audioFrame() {
    const playing = rt.state === 'play';
    audio.update({
      playerMoving: playing && rt.player.moving,
      listener: { x: bodyX(rt.player), y: bodyY(rt.player) },
      seekers: rt.state === 'title' || rt.state === 'end' ? [] : rt.seekers.map((s) => ({
        x: bodyX(s), y: bodyY(s), moving: playing && s.moving,
      })),
    });
  }

  function step(rawInput) {
    const input = cleanInput(rawInput);
    rt.clock++;
    rt.stateTick++;
    const lv = levelAt(rt.levelIndex);

    switch (rt.state) {
      case 'title':
        if (wantsToStart(input, TIMING.titleGraceTicks)) startLevel(rt.levelIndex, false);
        break;
      case 'intro':
        if (rt.stateTick >= introLayout(rt.retry).total) enter('play');
        break;
      case 'play': {
        const result = tickPlay(rt, lv, input, fx);
        if (result === 'caught') {
          rt.deaths++;
          fx.caught();
          enter('caught');
        } else if (result === 'cleared') {
          fx.gate();
          enter('cleared');
        }
        break;
      }
      case 'caught':
        if (rt.stateTick >= TIMING.caughtTicks) startLevel(rt.levelIndex, true);
        break;
      case 'cleared':
        if (rt.stateTick >= TIMING.clearedTicks) {
          if (rt.levelIndex + 1 < LEVELS.length) {
            startLevel(rt.levelIndex + 1, false);
          } else {
            store.save(0);
            furthest = 0;
            enter('end');
          }
        }
        break;
      case 'end':
        if (wantsToStart(input, TIMING.endGraceTicks)) {
          rt.deaths = 0;
          startLevel(0, false);
        }
        break;
      default:
    }
    audioFrame();
  }

  function info() {
    const lv = levelAt(rt.levelIndex);
    const title = rt.state === 'title' ? TITLE_NAME : rt.state === 'end' ? END_NAME : lv.name;
    return {
      state: rt.state,
      level: rt.state === 'end' ? LEVELS.length : rt.levelIndex + 1,
      levelCount: LEVELS.length,
      title,
      deaths: rt.deaths,
    };
  }

  const world = {
    step,
    scene: () => buildScene(rt, levelAt(rt.levelIndex), cols, rows),
    info,
    unlockAudio: () => audio.unlock(),
    setMuted: (muted) => audio.setMuted(muted),
    debug: {
      get rt() { return rt; },
      level: (index = rt.levelIndex) => levelAt(index),
      snapshot: () => structuredClone(rt),
      restore: (snapshot) => { rt = structuredClone(snapshot); },
      // Steps a snapshot forward without sound, for planners and tests.
      advance(input) {
        silent = true;
        try {
          step(input);
        } finally {
          silent = false;
        }
      },
      jump(level, { skipIntro = false } = {}) {
        rt.deaths = 0;
        startLevel(Math.max(0, Math.min(LEVELS.length - 1, level - 1)), skipIntro);
        if (skipIntro) enter('play');
      },
    },
  };

  if (options.startLevel) world.debug.jump(options.startLevel, { skipIntro: !!options.skipIntro });
  return world;
}
