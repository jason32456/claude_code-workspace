export const TILE = 10;

const perTick = (cellsPerSecond) => cellsPerSecond / 60;

export const PLAYER = {
  speed: perTick(66),
  radius: 4.5,
  maskRadius: 5,
  deadZone: 0.12,
  // Analog sticks may not creep below this share of full speed: sub-cell creeping
  // would flicker between moving and still on alternate ticks and slip past the watchers.
  slowestShare: 0.65,
};

export const SEEKER = {
  radius: 4.5,
  maskRadius: 8,
  patrol: 34,
  hunt: 58,
  investigate: 46,
  movingRange: 70,
  listeningRange: 95,
  earshot: 90,
  touch: 11,
  listen: [1.2, 2.6],
  afterHuntListen: [1.6, 2.4],
  giveUpTicks: 600,
  stuckCheckTicks: 45,
  perTick,
};

// The window is long on purpose: with a short one, tapping in bursts just under
// the threshold is never seen. Six moving ticks in any half second is.
export const DETECTION = { window: 30, needed: 6 };

export const BUMP = { shiverTicks: 24, knockGap: 30, pieceGap: 60 };

export const BREATH = { ticks: 90, shiverTicks: 16 };

export const TIMING = {
  titleTicks: 150,
  breathDelay: 20,
  tail: 6,
  caughtTicks: 36,
  clearedTicks: 72,
  endGraceTicks: 150,
  titleGraceTicks: 30,
  startMoveTicks: 8,
};

export const SIMMER = { walls: 0.1, caught: 0.85 };

export const SPARK_REACH = 9;
export const GATE_REACH = 10;

export const STILL_HINT = { moveTicks: 20, stillTicks: 18 };
