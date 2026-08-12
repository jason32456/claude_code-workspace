// Core game state and rules for Timber!
// A segment is the tree's building block: { branch: 'left' | 'right' | 'none' }.
// segments[0] is the block being chopped at the bottom; the stack grows upward.

export const SIDE = { LEFT: 'left', RIGHT: 'right' };

const VISIBLE_SEGMENTS = 11;   // how many trunk blocks we keep in the stack
const TIMER_MAX = 1;           // timer bar is normalized 0..1
const TIMER_REFILL = 0.11;     // added per chop (before scaling)

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.segments = [];
    this.score = 0;
    this.combo = 0;
    this.comboWindow = 0;      // time left to keep the streak alive
    this.timer = 0.6;
    this.side = SIDE.LEFT;     // which side the lumberjack stands on
    this.state = 'ready';      // 'ready' | 'playing' | 'over'
    this.deathCause = null;    // 'squash' | 'timeout'

    // Give the player a safe runway: the first few blocks never carry branches.
    for (let i = 0; i < VISIBLE_SEGMENTS; i++) {
      this.segments.push({ branch: 'none' });
    }
    // Seed a couple of branches up high so the first chops have stakes.
    for (let i = 4; i < VISIBLE_SEGMENTS; i++) {
      this.segments[i] = this._spawnSegment(this.segments[i - 1]);
    }
  }

  start() {
    if (this.state === 'playing') return;
    this.reset();
    this.state = 'playing';
  }

  // Difficulty scales smoothly with score.
  _drainRate() {
    return 0.16 + Math.min(this.score, 200) * 0.0016; // per second
  }

  _branchChance() {
    return Math.min(0.42 + this.score * 0.004, 0.7);
  }

  // Chopping in a sustained rhythm builds a score multiplier (caps at x5).
  multiplier() {
    return Math.min(1 + Math.floor(this.combo / 6), 5);
  }

  // A new top block. Never two branched blocks in a row -> always solvable.
  _spawnSegment(below) {
    if (below && below.branch !== 'none') return { branch: 'none' };
    if (Math.random() < this._branchChance()) {
      return { branch: Math.random() < 0.5 ? SIDE.LEFT : SIDE.RIGHT };
    }
    return { branch: 'none' };
  }

  // Returns true if the chop landed safely, false if it ended the game.
  chop(side) {
    if (this.state !== 'playing') return false;
    this.side = side;

    // The block the lumberjack's body passes is segments[1]; a branch there
    // on the chosen side squashes the player.
    const danger = this.segments[1];
    if (danger && danger.branch === side) {
      this.state = 'over';
      this.deathCause = 'squash';
      this.onChop?.(side, false);
      return false;
    }

    // Successful chop: drop the bottom block, shift down, grow a new top.
    this.segments.shift();
    const top = this.segments[this.segments.length - 1];
    this.segments.push(this._spawnSegment(top));

    this.combo += 1;
    this.comboWindow = 1.1;
    const mult = this.multiplier();
    this.score += mult;
    const refill = TIMER_REFILL * (1 - Math.min(this.score, 150) / 260);
    this.timer = Math.min(TIMER_MAX, this.timer + refill);

    this.onChop?.(side, true, mult);
    return true;
  }

  update(dt) {
    if (this.state !== 'playing') return;
    if (this.comboWindow > 0) {
      this.comboWindow -= dt;
      if (this.comboWindow <= 0) this.combo = 0; // lost the rhythm
    }
    this.timer -= this._drainRate() * dt;
    if (this.timer <= 0) {
      this.timer = 0;
      this.state = 'over';
      this.deathCause = 'timeout';
    }
  }
}
