import {
  STEPS, PATTERN_NAMES, PATTERN_COUNT, VEL_NAMES, PROB_LEVELS, DELAY_DIVS,
  DRUM_TRACKS, SYNTH_TRACKS, ALL_TRACKS, activePattern, trackDef, isMelodic,
  emptyStep, clearPattern, copyPattern,
} from './state.js';
import { KITS, VOICE_PARAMS } from './kits.js';
import { SCALES, NOTE_NAMES, midiToName, euclid } from './theory.js';
import { GENRES } from './generate.js';

const $ = (sel) => document.querySelector(sel);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function fmt(value, param) {
  if (param.unit === 'Hz') return `${Math.round(value)} Hz`;
  if (param.unit === 's') return `${(value * 1000).toFixed(0)} ms`;
  if (param.unit) return `${value}${param.unit}`;
  return typeof value === 'number' ? value.toFixed(2) : value;
}

export function createUI(app) {
  const project = app.project;
  const columns = Array.from({ length: STEPS }, () => []);
  const drumCells = {};
  let rollCells = [];
  let painting = null;

  // ---- header -------------------------------------------------------------

  const bpmInput = $('#bpm');
  const swingInput = $('#swing');
  const swingVal = $('#swing-val');
  const rootSel = $('#root');
  const scaleSel = $('#scale');
  const kitSel = $('#kit');
  const genreSel = $('#genre');
  const posOut = $('#pos');
  const playBtn = $('#btn-play');
  const status = $('#status');

  NOTE_NAMES.forEach((n, i) => rootSel.append(new Option(n, String(i))));
  Object.entries(SCALES).forEach(([k, s]) => scaleSel.append(new Option(s.name, k)));
  Object.entries(KITS).forEach(([k, s]) => kitSel.append(new Option(s.name, k)));
  Object.entries(GENRES).forEach(([k, g]) => genreSel.append(new Option(g.name, k)));

  bpmInput.addEventListener('input', () => {
    const v = Number(bpmInput.value);
    if (Number.isFinite(v) && v >= 60 && v <= 200) {
      project.bpm = v;
      app.touch();
    }
  });
  swingInput.addEventListener('input', () => {
    project.swing = Number(swingInput.value);
    swingVal.textContent = `${Math.round(project.swing * 100)}%`;
    app.touch();
  });
  rootSel.addEventListener('change', () => {
    project.key.root = Number(rootSel.value);
    app.touch();
    renderRoll();
  });
  scaleSel.addEventListener('change', () => {
    project.key.scale = scaleSel.value;
    app.touch();
    renderRoll();
  });
  kitSel.addEventListener('change', () => app.setKit(kitSel.value));
  playBtn.addEventListener('click', () => app.togglePlay());
  $('#btn-gen').addEventListener('click', () => app.generate(genreSel.value));
  $('#btn-export').addEventListener('click', () => app.exportWav());
  $('#btn-share').addEventListener('click', () => app.share());

  // ---- pattern bar --------------------------------------------------------

  const slotWrap = $('#pattern-slots');
  const slotButtons = PATTERN_NAMES.map((name, i) => {
    const b = el('button', 'slot', name);
    b.addEventListener('click', () => {
      project.patternIndex = i;
      app.touch();
      renderPatternBar();
      renderGrid();
      renderRoll();
    });
    slotWrap.append(b);
    return b;
  });

  $('#btn-song').addEventListener('click', () => {
    project.songMode = !project.songMode;
    app.touch();
    renderPatternBar();
  });
  $('#btn-copy').addEventListener('click', () => {
    const to = (project.patternIndex + 1) % PATTERN_COUNT;
    copyPattern(project, project.patternIndex, to);
    project.patternIndex = to;
    app.touch();
    renderPatternBar();
    renderGrid();
    renderRoll();
    app.say(`Copied to pattern ${PATTERN_NAMES[to]}`);
  });
  $('#btn-clear').addEventListener('click', () => {
    clearPattern(project, project.patternIndex);
    app.touch();
    renderGrid();
    renderRoll();
    app.say(`Cleared pattern ${PATTERN_NAMES[project.patternIndex]}`);
  });

  const chainWrap = $('#song-chain');

  function renderChain() {
    chainWrap.replaceChildren();
    project.song.forEach((p, i) => {
      const b = el('button', 'chip', PATTERN_NAMES[p]);
      b.title = 'Click to cycle · right-click to remove';
      b.addEventListener('click', () => {
        project.song[i] = (project.song[i] + 1) % PATTERN_COUNT;
        app.touch();
        renderChain();
      });
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (project.song.length > 1) project.song.splice(i, 1);
        app.touch();
        renderChain();
      });
      chainWrap.append(b);
    });
    const add = el('button', 'chip add', '+');
    add.title = 'Append a slot to the song chain';
    add.addEventListener('click', () => {
      if (project.song.length < 16) project.song.push(project.patternIndex);
      app.touch();
      renderChain();
    });
    chainWrap.append(add);
  }

  function renderPatternBar() {
    slotButtons.forEach((b, i) => b.classList.toggle('active', i === project.patternIndex));
    $('#btn-song').classList.toggle('active', project.songMode);
    chainWrap.classList.toggle('dim', !project.songMode);
  }

  // ---- drum grid ----------------------------------------------------------

  const ruler = $('#ruler');
  const grid = $('#drumgrid');

  function buildRuler() {
    ruler.replaceChildren();
    ruler.append(el('div', 'lane-head ruler-head', '16 steps'));
    const cells = el('div', 'cells');
    for (let i = 0; i < STEPS; i++) {
      const c = el('div', `tick${i % 4 === 0 ? ' beat' : ''}`, i % 4 === 0 ? String(i / 4 + 1) : '');
      cells.append(c);
    }
    ruler.append(cells);
  }

  function stepAt(trackId, i) {
    return activePattern(project).tracks[trackId][i];
  }

  function paintCell(node, s) {
    node.className = 'cell';
    if (Number(node.dataset.step) % 4 === 0) node.classList.add('beat');
    if (s.on) node.classList.add('on', `v${s.v}`);
    if (s.on && s.p > 0) node.classList.add(`p${s.p}`);
  }

  function applyEdit(trackId, i, mode) {
    const lane = activePattern(project).tracks[trackId];
    const s = lane[i];
    if (mode === 'on') lane[i] = { ...s, on: true };
    else if (mode === 'off') lane[i] = { ...s, on: false };
    else if (mode === 'vel') lane[i] = { ...s, on: true, v: (s.v + 1) % 3 };
    else if (mode === 'prob') lane[i] = { ...s, on: true, p: (s.p + 1) % PROB_LEVELS.length };
    paintCell(drumCells[trackId][i], lane[i]);
    app.touch();
    if (mode !== 'off' && !app.playing) app.audition(trackId, lane[i]);
  }

  function buildGrid() {
    grid.replaceChildren();
    for (const t of DRUM_TRACKS) {
      const lane = el('div', 'lane');
      lane.style.setProperty('--hue', t.hue);
      lane.dataset.track = t.id;

      const head = el('div', 'lane-head');
      const name = el('button', 'lane-name', t.name);
      name.addEventListener('click', () => app.select(t.id));
      const btns = el('div', 'lane-btns');
      const mute = el('button', 'tiny', 'M');
      const solo = el('button', 'tiny', 'S');
      mute.addEventListener('click', () => {
        project.mix[t.id].mute = !project.mix[t.id].mute;
        app.touch();
        renderMixStates();
      });
      solo.addEventListener('click', () => {
        project.mix[t.id].solo = !project.mix[t.id].solo;
        app.touch();
        renderMixStates();
      });
      btns.append(mute, solo);
      const vol = el('input', 'lane-vol');
      vol.type = 'range';
      vol.min = 0;
      vol.max = 1.4;
      vol.step = 0.01;
      vol.value = project.mix[t.id].vol;
      vol.title = 'Level';
      vol.addEventListener('input', () => {
        project.mix[t.id].vol = Number(vol.value);
        app.touch();
      });
      head.append(name, btns, vol);
      head.dataset.track = t.id;

      const cells = el('div', 'cells');
      drumCells[t.id] = [];
      for (let i = 0; i < STEPS; i++) {
        const c = el('div', 'cell');
        c.dataset.step = i;
        c.dataset.track = t.id;
        c.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (e.button === 2) return;
          if (e.altKey) return applyEdit(t.id, i, 'prob');
          if (e.shiftKey) return applyEdit(t.id, i, 'vel');
          painting = stepAt(t.id, i).on ? 'off' : 'on';
          applyEdit(t.id, i, painting);
        });
        c.addEventListener('pointerenter', () => {
          if (painting) applyEdit(t.id, i, painting);
        });
        c.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          applyEdit(t.id, i, 'vel');
        });
        drumCells[t.id].push(c);
        columns[i].push(c);
        cells.append(c);
      }
      lane.append(head, cells);
      grid.append(lane);
    }
  }

  // ---- note roll ----------------------------------------------------------

  const rollTabs = $('#roll-tabs');
  const roll = $('#roll');

  function buildTabs() {
    rollTabs.replaceChildren();
    for (const t of SYNTH_TRACKS) {
      const b = el('button', 'tab', t.name);
      b.addEventListener('click', () => {
        project.melodic = t.id;
        app.select(t.id);
        renderRoll();
      });
      b.dataset.track = t.id;
      rollTabs.append(b);
    }
    const mute = el('button', 'tiny', 'M');
    const solo = el('button', 'tiny', 'S');
    mute.id = 'roll-mute';
    solo.id = 'roll-solo';
    mute.addEventListener('click', () => {
      project.mix[project.melodic].mute = !project.mix[project.melodic].mute;
      app.touch();
      renderMixStates();
    });
    solo.addEventListener('click', () => {
      project.mix[project.melodic].solo = !project.mix[project.melodic].solo;
      app.touch();
      renderMixStates();
    });
    const clear = el('button', 'tiny wide', 'Clear lane');
    clear.addEventListener('click', () => {
      const lane = activePattern(project).tracks[project.melodic];
      for (let i = 0; i < STEPS; i++) lane[i] = emptyStep();
      app.touch();
      renderRoll();
    });
    rollTabs.append(el('span', 'tab-gap'), mute, solo, clear);
  }

  function renderRoll() {
    const trackId = project.melodic;
    const def = trackDef(trackId);
    const ladder = app.ladderFor(trackId);
    const lane = activePattern(project).tracks[trackId];

    roll.replaceChildren();
    roll.style.setProperty('--hue', def.hue);
    rollCells = [];
    for (const b of rollTabs.querySelectorAll('.tab')) {
      b.classList.toggle('active', b.dataset.track === trackId);
    }

    for (let row = def.rows - 1; row >= 0; row--) {
      const laneEl = el('div', 'lane roll-lane');
      const head = el('div', 'lane-head note-head');
      head.append(el('span', 'note-name', midiToName(ladder[row])));
      laneEl.append(head);

      const cells = el('div', 'cells');
      for (let i = 0; i < STEPS; i++) {
        const c = el('div', 'cell note-cell');
        c.dataset.step = i;
        if (i % 4 === 0) c.classList.add('beat');
        const s = lane[i];
        if (s.on && s.d === row) {
          c.classList.add('on', `v${s.v}`);
          if (s.p > 0) c.classList.add(`p${s.p}`);
        }
        c.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const cur = lane[i];
          if (cur.on && cur.d === row) {
            if (e.altKey) lane[i] = { ...cur, p: (cur.p + 1) % PROB_LEVELS.length };
            else if (e.shiftKey || e.button === 2) lane[i] = { ...cur, v: (cur.v + 1) % 3 };
            else lane[i] = { ...cur, on: false };
          } else {
            lane[i] = { on: true, v: cur.on ? cur.v : 1, p: cur.on ? cur.p : 0, d: row };
          }
          app.touch();
          renderRoll();
          if (lane[i].on && !app.playing) app.audition(trackId, lane[i]);
        });
        c.addEventListener('contextmenu', (e) => e.preventDefault());
        cells.append(c);
        rollCells.push({ el: c, step: i });
      }
      laneEl.append(cells);
      roll.append(laneEl);
    }
  }

  // ---- inspector ----------------------------------------------------------

  const inspector = $('#inspector');

  function slider(label, value, min, max, step, onInput, format) {
    const row = el('div', 'ctl');
    const top = el('div', 'ctl-top');
    top.append(el('span', 'ctl-label', label));
    const out = el('span', 'ctl-val', format ? format(value) : String(value));
    top.append(out);
    const input = el('input', 'ctl-range');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = format ? format(v) : String(v);
      onInput(v);
    });
    row.append(top, input);
    return row;
  }

  function select(label, value, options, onChange) {
    const row = el('div', 'ctl');
    const top = el('div', 'ctl-top');
    top.append(el('span', 'ctl-label', label));
    row.append(top);
    const sel = el('select', 'ctl-select');
    for (const o of options) {
      const opt = new Option(typeof o === 'string' ? o : o.label, typeof o === 'string' ? o : o.value);
      sel.append(opt);
    }
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    row.append(sel);
    return row;
  }

  function renderInspector() {
    const trackId = project.selected;
    const def = trackDef(trackId);
    const params = VOICE_PARAMS[def.voice];
    const voice = project.voice[trackId];
    const mix = project.mix[trackId];

    inspector.replaceChildren();
    inspector.style.setProperty('--hue', def.hue);

    const title = el('div', 'insp-title');
    title.append(el('span', 'swatch'), el('h2', null, def.name), el('span', 'insp-sub', def.voice));
    inspector.append(title);

    const voiceBox = el('section', 'insp-group');
    voiceBox.append(el('h3', null, 'Voice'));
    for (const p of params) {
      if (p.options) {
        voiceBox.append(select(p.label, voice[p.k], p.options, (v) => {
          voice[p.k] = v;
          app.touch();
        }));
      } else {
        voiceBox.append(slider(p.label, voice[p.k], p.min, p.max, p.step, (v) => {
          voice[p.k] = v;
          app.touch();
        }, (v) => fmt(v, p)));
      }
    }
    const audition = el('button', 'btn wide', 'Audition');
    audition.addEventListener('click', () => app.audition(trackId, { v: 2, d: 0 }));
    voiceBox.append(audition);
    inspector.append(voiceBox);

    const mixBox = el('section', 'insp-group');
    mixBox.append(el('h3', null, 'Channel'));
    mixBox.append(slider('Level', mix.vol, 0, 1.4, 0.01, (v) => {
      mix.vol = v;
      const laneVol = grid.querySelector(`.lane[data-track="${trackId}"] .lane-vol`);
      if (laneVol) laneVol.value = v;
      app.touch();
    }, (v) => `${Math.round(v * 100)}%`));
    mixBox.append(slider('Pan', mix.pan, -1, 1, 0.01, (v) => {
      mix.pan = v;
      app.touch();
    }, (v) => (Math.abs(v) < 0.02 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)));
    mixBox.append(slider('Delay send', mix.delay, 0, 1, 0.01, (v) => {
      mix.delay = v;
      app.touch();
    }, (v) => `${Math.round(v * 100)}%`));
    mixBox.append(slider('Reverb send', mix.reverb, 0, 1, 0.01, (v) => {
      mix.reverb = v;
      app.touch();
    }, (v) => `${Math.round(v * 100)}%`));
    inspector.append(mixBox);

    const euclidBox = el('section', 'insp-group');
    euclidBox.append(el('h3', null, 'Euclidean fill'));
    const eRow = el('div', 'euclid-row');
    const pulses = el('input', 'num');
    pulses.type = 'number';
    pulses.min = 0;
    pulses.max = STEPS;
    pulses.value = 4;
    const rotate = el('input', 'num');
    rotate.type = 'number';
    rotate.min = 0;
    rotate.max = STEPS - 1;
    rotate.value = 0;
    const fill = el('button', 'btn', 'Fill');
    fill.addEventListener('click', () => {
      const hits = euclid(Number(pulses.value), STEPS, Number(rotate.value));
      const lane = activePattern(project).tracks[trackId];
      const degree = isMelodic(trackId) ? (lane.find((s) => s.on)?.d ?? 0) : 0;
      for (let i = 0; i < STEPS; i++) {
        lane[i] = hits[i] ? { on: true, v: i % 4 === 0 ? 2 : 1, p: 0, d: degree } : emptyStep();
      }
      app.touch();
      renderGrid();
      renderRoll();
      app.say(`Euclid ${pulses.value}/${STEPS} → ${def.name}`);
    });
    eRow.append(el('span', 'mini', 'pulses'), pulses, el('span', 'mini', 'rot'), rotate, fill);
    euclidBox.append(eRow);
    inspector.append(euclidBox);

    const fxBox = el('section', 'insp-group');
    fxBox.append(el('h3', null, 'Master'));
    const fx = project.fx;
    fxBox.append(select('Delay time', fx.delayDiv, Object.keys(DELAY_DIVS), (v) => {
      fx.delayDiv = v;
      app.touch();
    }));
    fxBox.append(slider('Delay fb', fx.delayFb, 0, 0.85, 0.01, (v) => {
      fx.delayFb = v;
      app.touch();
    }, (v) => `${Math.round(v * 100)}%`));
    fxBox.append(slider('Delay mix', fx.delayMix, 0, 0.8, 0.01, (v) => {
      fx.delayMix = v;
      app.touch();
    }, (v) => `${Math.round(v * 100)}%`));
    fxBox.append(slider('Reverb size', fx.reverbSize, 0.3, 5, 0.1, (v) => {
      fx.reverbSize = v;
      app.touch();
    }, (v) => `${v.toFixed(1)} s`));
    fxBox.append(slider('Reverb mix', fx.reverbMix, 0, 0.8, 0.01, (v) => {
      fx.reverbMix = v;
      app.touch();
    }, (v) => `${Math.round(v * 100)}%`));
    fxBox.append(slider('Filter', fx.filter, 300, 18000, 50, (v) => {
      fx.filter = v;
      app.touch();
    }, (v) => `${(v / 1000).toFixed(1)} kHz`));
    fxBox.append(slider('Drive', fx.drive, 0, 1, 0.01, (v) => {
      fx.drive = v;
      app.touch();
    }, (v) => `${Math.round(v * 100)}%`));
    fxBox.append(slider('Master', fx.master, 0, 1.2, 0.01, (v) => {
      fx.master = v;
      app.touch();
    }, (v) => `${Math.round(v * 100)}%`));
    inspector.append(fxBox);
  }

  // ---- shared render ------------------------------------------------------

  function renderMixStates() {
    for (const t of ALL_TRACKS) {
      const m = project.mix[t.id];
      const lane = grid.querySelector(`.lane[data-track="${t.id}"]`);
      if (lane) {
        lane.classList.toggle('muted', m.mute);
        lane.querySelectorAll('.tiny')[0].classList.toggle('on', m.mute);
        lane.querySelectorAll('.tiny')[1].classList.toggle('on', m.solo);
      }
    }
    const cur = project.mix[project.melodic];
    $('#roll-mute').classList.toggle('on', cur.mute);
    $('#roll-solo').classList.toggle('on', cur.solo);
    roll.classList.toggle('muted', cur.mute);
  }

  function renderGrid() {
    for (const t of DRUM_TRACKS) {
      const lane = activePattern(project).tracks[t.id];
      for (let i = 0; i < STEPS; i++) paintCell(drumCells[t.id][i], lane[i]);
      const vol = grid.querySelector(`.lane[data-track="${t.id}"] .lane-vol`);
      if (vol) vol.value = project.mix[t.id].vol;
    }
    for (const b of grid.querySelectorAll('.lane-name')) {
      b.classList.toggle('selected', b.parentElement.dataset.track === project.selected);
    }
    renderMixStates();
  }

  function renderHeader() {
    bpmInput.value = project.bpm;
    swingInput.value = project.swing;
    swingVal.textContent = `${Math.round(project.swing * 100)}%`;
    rootSel.value = String(project.key.root);
    scaleSel.value = project.key.scale;
    kitSel.value = project.kit;
  }

  let lastColumn = -1;

  function setPlayhead(step) {
    if (step === lastColumn) return;
    if (lastColumn >= 0) for (const c of columns[lastColumn]) c.classList.remove('playing');
    if (step >= 0) for (const c of columns[step]) c.classList.add('playing');
    for (const { el: node, step: s } of rollCells) node.classList.toggle('playing', s === step);
    lastColumn = step;
  }

  function setPosition(text) {
    posOut.textContent = text;
  }

  function setPlaying(isPlaying) {
    playBtn.classList.toggle('playing', isPlaying);
    playBtn.setAttribute('aria-label', isPlaying ? 'Stop' : 'Play');
    if (!isPlaying) setPlayhead(-1);
  }

  function say(message) {
    status.textContent = message;
  }

  document.addEventListener('pointerup', () => {
    painting = null;
  });
  document.addEventListener('pointercancel', () => {
    painting = null;
  });

  buildRuler();
  buildGrid();
  buildTabs();

  function renderAll() {
    renderHeader();
    renderPatternBar();
    renderChain();
    renderGrid();
    renderRoll();
    renderInspector();
  }

  return { renderAll, renderGrid, renderRoll, renderInspector, renderHeader, renderPatternBar, renderChain, setPlayhead, setPosition, setPlaying, say };
}
