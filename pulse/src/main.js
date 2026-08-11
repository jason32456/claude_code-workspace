import { createProject, loadDemo, trackDef, PATTERN_NAMES, PATTERN_COUNT } from './state.js';
import { kitParams } from './kits.js';
import { scaleLadder } from './theory.js';
import { createEngine } from './engine.js';
import { createTransport } from './transport.js';
import { createUI } from './ui.js';
import { applyGenre, GENRES } from './generate.js';
import * as storage from './storage.js';
import { readHash, shareUrl } from './share.js';
import { exportWav as downloadWav } from './export.js';

const shared = await readHash().catch(() => null);
const project = shared || storage.load() || loadDemo(createProject());

let ctx = null;
let engine = null;
let transport = null;

function ensureAudio() {
  if (ctx) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  ctx = new Ctor({ latencyHint: 'interactive' });
  engine = createEngine(ctx, project);
  transport = createTransport(ctx, engine, project);
}

const app = {
  project,

  get playing() {
    return transport ? transport.playing : false;
  },

  touch() {
    // Once the session diverges from a shared link, drop the hash so a reload
    // restores the user's edits instead of the link they arrived on.
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    if (engine) engine.sync();
    storage.save(project);
  },

  say(message) {
    ui.say(message);
  },

  ladderFor(trackId) {
    const def = trackDef(trackId);
    return scaleLadder(def.baseMidi + project.key.root, project.key.scale, def.rows);
  },

  select(trackId) {
    project.selected = trackId;
    ui.renderGrid();
    ui.renderInspector();
  },

  audition(trackId, step) {
    ensureAudio();
    if (ctx.state === 'suspended') ctx.resume();
    engine.play(trackId, ctx.currentTime + 0.02, step.v ?? 1, Math.floor(Math.random() * 997), step.d ?? 0);
  },

  async togglePlay() {
    ensureAudio();
    if (transport.playing) {
      transport.stop();
      ui.setPlaying(false);
      ui.setPosition('–');
    } else {
      await transport.start();
      ui.setPlaying(true);
    }
  },

  setKit(kitKey) {
    project.kit = kitKey;
    project.voice = kitParams(kitKey);
    app.touch();
    ui.renderInspector();
    ui.say(`Kit loaded: ${kitKey}`);
  },

  generate(genreKey) {
    const genre = applyGenre(project, genreKey);
    app.touch();
    ui.renderAll();
    ui.say(`Generated a ${genre.name} pattern — ${project.bpm} BPM, ${Math.round(project.swing * 100)}% swing`);
  },

  async exportWav() {
    const button = document.querySelector('#btn-export');
    button.disabled = true;
    const label = button.textContent;
    button.textContent = 'Rendering…';
    ui.say('Rendering offline…');
    try {
      const { seconds, bytes } = await downloadWav(project, { repeats: 2 });
      ui.say(`Exported ${seconds.toFixed(1)} s · ${(bytes / 1048576).toFixed(1)} MB WAV`);
    } catch (err) {
      ui.say(`Export failed: ${err.message}`);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  },

  async share() {
    try {
      const url = await shareUrl(project);
      history.replaceState(null, '', url);
      await navigator.clipboard.writeText(url);
      ui.say('Share link copied to clipboard');
    } catch {
      ui.say('Share link is now in the address bar — copy it from there');
    }
  },
};

const ui = createUI(app);
ui.renderAll();
ui.setPosition('–');
ui.say('Press Space to play · click steps to build · right-click a step to accent');

let lastPattern = project.patternIndex;

function frame() {
  if (transport && transport.playing) {
    const cur = transport.poll();
    if (cur) {
      ui.setPlayhead(cur.step);
      const beat = Math.floor(cur.step / 4) + 1;
      const sub = (cur.step % 4) + 1;
      ui.setPosition(`${PATTERN_NAMES[cur.pattern]} · ${beat}.${sub}`);
      if (project.songMode && cur.pattern !== lastPattern) {
        lastPattern = cur.pattern;
        project.patternIndex = cur.pattern;
        ui.renderPatternBar();
        ui.renderGrid();
        ui.renderRoll();
      }
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const TYPING = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

window.addEventListener('keydown', (e) => {
  if (TYPING.has(document.activeElement?.tagName)) return;
  if (e.metaKey || e.ctrlKey) return;

  if (e.code === 'Space') {
    e.preventDefault();
    app.togglePlay();
    return;
  }
  const slot = '1234'.indexOf(e.key);
  if (slot >= 0 && slot < PATTERN_COUNT) {
    project.patternIndex = slot;
    app.touch();
    ui.renderPatternBar();
    ui.renderGrid();
    ui.renderRoll();
    return;
  }
  if (e.key.toLowerCase() === 'g') {
    app.generate(document.querySelector('#genre').value);
  }
  if (e.key.toLowerCase() === 'k') {
    const keys = Object.keys(GENRES);
    const next = keys[(keys.indexOf(document.querySelector('#genre').value) + 1) % keys.length];
    document.querySelector('#genre').value = next;
    ui.say(`Genre: ${GENRES[next].name}`);
  }
});
