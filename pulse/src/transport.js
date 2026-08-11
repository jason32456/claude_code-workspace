import { ALL_TRACKS, STEPS, PROB_LEVELS, audibleTracks } from './state.js';

const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;

/** Fires one grid column into the engine. Shared by live playback and offline render. */
export function scheduleStep(engine, project, patternIndex, step, time, audible, rng) {
  const pattern = project.patterns[patternIndex];
  if (!pattern) return;
  ALL_TRACKS.forEach((t, i) => {
    if (!audible.has(t.id)) return;
    const s = pattern.tracks[t.id][step];
    if (!s || !s.on) return;
    const chance = PROB_LEVELS[s.p] ?? 1;
    if (chance < 1 && rng() > chance) return;
    engine.play(t.id, time, s.v, step * 13 + i * 7, s.d);
  });
}

export function stepDuration(project) {
  return 60 / project.bpm / 4;
}

/** Odd 16ths get pushed late; the underlying grid stays rigid so swing is not cumulative. */
export function swingOffset(project, step, dur) {
  return step % 2 === 1 ? project.swing * dur * 0.66 : 0;
}

export function patternAt(project, songPos) {
  if (!project.songMode || !project.song.length) return project.patternIndex;
  return project.song[songPos % project.song.length];
}

/**
 * The lookahead scheduler from Chris Wilson's "A Tale of Two Clocks": a coarse
 * setInterval tick queues precise AudioContext-clocked events slightly ahead of
 * time, so timer jitter never reaches the audio.
 */
export function createTransport(ctx, engine, project) {
  let playing = false;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let songPos = 0;
  let fired = null;
  const queue = [];

  function tick() {
    while (nextTime < ctx.currentTime + LOOKAHEAD_S) {
      const dur = stepDuration(project);
      const when = nextTime + swingOffset(project, step, dur);
      const pat = patternAt(project, songPos);
      scheduleStep(engine, project, pat, step, when, audibleTracks(project), Math.random);
      queue.push({ step, pattern: pat, songPos, time: when });

      nextTime += dur;
      step += 1;
      if (step >= STEPS) {
        step = 0;
        if (project.songMode) songPos += 1;
      }
    }
  }

  async function start() {
    if (playing) return;
    if (ctx.state === 'suspended') await ctx.resume();
    playing = true;
    step = 0;
    songPos = 0;
    queue.length = 0;
    fired = null;
    nextTime = ctx.currentTime + 0.08;
    tick();
    timer = setInterval(tick, TICK_MS);
  }

  function stop() {
    playing = false;
    clearInterval(timer);
    timer = null;
    queue.length = 0;
    fired = null;
  }

  /** Called from rAF: returns the step that is audible right now, or null. */
  function poll() {
    while (queue.length && queue[0].time <= ctx.currentTime) fired = queue.shift();
    return fired;
  }

  return {
    start,
    stop,
    poll,
    toggle: () => (playing ? (stop(), false) : (start(), true)),
    get playing() {
      return playing;
    },
  };
}
