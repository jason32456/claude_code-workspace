import { FRAME_COUNT } from './stage-pose.js';

const LAST = FRAME_COUNT - 1;
const EPS = 1e-9;

export class Playhead {
  constructor({ moveSeconds = 1.6, holdSeconds = 0.5, endHoldSeconds = 1.8, stepSeconds = 0.9, instantSteps = false } = {}) {
    Object.assign(this, { moveSeconds, holdSeconds, endHoldSeconds, stepSeconds, instantSteps });
    this.pos = 0;
    this.dir = 1;
    this.playing = false;
    this.holdLeft = 0;
    this.target = null;
  }

  play() {
    this.playing = true;
    this.target = null;
  }

  pause() {
    this.playing = false;
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  scrub(value) {
    this.target = null;
    this.holdLeft = 0;
    this.pos = Math.min(LAST, Math.max(0, value));
  }

  nearestStop() {
    return Math.round(this.pos);
  }

  step(direction) {
    this.pause();
    const near = Math.round(this.pos);
    const atStop = Math.abs(this.pos - near) < 1e-6;
    let target;
    if (direction > 0) target = atStop ? near + 1 : Math.ceil(this.pos);
    else target = atStop ? near - 1 : Math.floor(this.pos);
    this.goTo(Math.min(LAST, Math.max(0, target)));
  }

  goTo(stop) {
    this.pause();
    if (this.instantSteps) {
      this.scrub(stop);
      return;
    }
    this.target = stop;
  }

  /** Advances by dt seconds; returns true if the position changed. */
  update(dt) {
    const before = this.pos;
    if (this.target !== null) {
      const delta = this.target - this.pos;
      const stride = dt / this.stepSeconds;
      this.pos = Math.abs(delta) <= stride ? this.target : this.pos + Math.sign(delta) * stride;
      if (this.pos === this.target) this.target = null;
    } else if (this.playing) {
      this.advance(dt);
    }
    return this.pos !== before;
  }

  advance(dt) {
    if (this.holdLeft > 0) {
      this.holdLeft -= dt;
      return;
    }
    if (this.dir > 0 && this.pos >= LAST - EPS) this.dir = -1;
    if (this.dir < 0 && this.pos <= EPS) this.dir = 1;
    const next = this.dir > 0 ? Math.floor(this.pos + EPS) + 1 : Math.ceil(this.pos - EPS) - 1;
    const moved = this.pos + (this.dir * dt) / this.moveSeconds;
    if (this.dir * (moved - next) >= 0) {
      this.pos = next;
      const atEnd = next === 0 || next === LAST;
      this.holdLeft = atEnd ? this.endHoldSeconds : this.holdSeconds;
      if (atEnd) this.dir = -this.dir;
    } else {
      this.pos = moved;
    }
  }
}
