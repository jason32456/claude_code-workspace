import { LEVELS } from './levels.js';

const $ = (id) => document.getElementById(id);
const pct = (v) => `${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%`;

export class Hud {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      hud: $('hud'),
      seasonName: $('season-name'),
      seasonSub: $('season-sub'),
      phaseTag: $('phase-tag'),
      clock: $('melt-clock'),
      meltFill: $('melt-fill'),
      flow: $('flow-num'),
      objectives: $('objectives'),
      spoilNum: $('spoil-num'),
      spoilFill: $('spoil-fill'),
      workNum: $('work-num'),
      workUnit: document.querySelector('#work-num + .unit'),
      workFill: $('work-fill'),
      timberNum: $('timber-num'),
      timberRow: document.querySelector('.timber-row'),
      brushFill: $('brush-fill'),
      toolHint: $('tool-hint'),
      gates: $('gates'),
      release: $('release-wrap'),
      toasts: $('toasts'),
    };
    this.objRows = new Map();
    this.wire();
  }

  wire() {
    document.querySelectorAll('.tool').forEach((b) =>
      b.addEventListener('click', () => this.h.onTool(b.dataset.tool))
    );
    $('brush-down').addEventListener('click', () => this.h.onBrush(-1));
    $('brush-up').addEventListener('click', () => this.h.onBrush(1));
    $('release-btn').addEventListener('click', () => this.h.onRelease());
    $('start-btn').addEventListener('click', () => this.h.onStart());
    $('how-btn').addEventListener('click', () => this.showScreen('help'));
    $('help-close').addEventListener('click', () => this.h.onHelpClose());
    $('brief-btn').addEventListener('click', () => this.h.onBriefDone());
    $('result-next').addEventListener('click', () => this.h.onNext());
    $('result-retry').addEventListener('click', () => this.h.onRetry());
    $('result-menu').addEventListener('click', () => this.h.onMenu());
    $('pause-resume').addEventListener('click', () => this.h.onResume());
    $('pause-restart').addEventListener('click', () => this.h.onRetry());
    $('pause-help').addEventListener('click', () => this.showScreen('help'));
    $('pause-menu').addEventListener('click', () => this.h.onMenu());
    $('mute').addEventListener('click', () => this.h.onMute());
  }

  showScreen(name) {
    for (const s of ['title', 'brief', 'result', 'help', 'pause']) {
      $(s).classList.toggle('hidden', s !== name);
    }
    this.el.hud.classList.toggle('hidden', name === 'title' || name === 'brief');
  }

  setMuted(m) {
    $('mute').classList.toggle('off', m);
    $('mute').textContent = m ? '✕' : '♪';
  }

  buildSeasonGrid(unlocked, best) {
    const grid = $('season-grid');
    grid.innerHTML = '';
    LEVELS.forEach((l, i) => {
      const d = document.createElement('div');
      const cleared = best[i] > 0;
      d.className = `season-chip${i > unlocked ? ' locked' : ''}${cleared ? ' cleared' : ''}`;
      d.innerHTML = `<b>${i + 1}</b>${l.name.toUpperCase()}${cleared ? `<br>${best[i]}` : ''}`;
      if (i <= unlocked) {
        d.style.cursor = 'pointer';
        d.addEventListener('click', () => this.h.onPickSeason(i));
      }
      grid.appendChild(d);
    });
    $('start-btn').textContent = unlocked > 0 ? `CONTINUE — SEASON ${unlocked + 1}` : 'BEGIN SEASON 1';
  }

  showBrief(level, index) {
    $('brief-sub').textContent = level.subtitle;
    $('brief-name').textContent = level.name;
    $('brief-text').textContent = level.brief;
    $('brief-hint').textContent = ` ${level.hint}`;
    const stats = [
      ['MELTWATER', `${Math.round(level.melt.total)} m³`],
      ['MELT LASTS', `${level.melt.duration}s`],
      ['TERRACES', String(level.fields.length)],
      ['EARTH MOVED', `${level.work} m³`],
    ];
    if (level.timber) stats.push(['TIMBER', `${level.timber}`]);
    if (level.bankTarget) stats.push(['BANK', `${level.bankTarget} m³`]);
    if (level.erosion) stats.push(['GROUND', 'SOFT']);
    $('brief-stats').innerHTML = stats
      .map(([k, v]) => `<div class="brief-stat"><span>${k}</span><b>${v}</b></div>`)
      .join('');
    this.showScreen('brief');
  }

  // One row per objective, built once per season and then only updated.
  buildObjectives(world) {
    const rows = [];
    for (const f of world.fields) rows.push({ key: `f${f.index}`, name: f.name, cls: '' });
    for (const r of world.reservoirs) if (world.level.bankTarget) rows.push({ key: `r`, name: r.name, cls: 'bank' });
    for (const v of world.villages) rows.push({ key: `v`, name: v.name, cls: 'danger' });

    this.el.objectives.innerHTML = rows
      .map(
        (r) => `<div class="obj ${r.cls}" data-key="${r.key}">
          <div class="obj-head"><span class="obj-name">${r.name}</span><span class="obj-val">—</span></div>
          <div class="bar"><div></div></div>
        </div>`
      )
      .join('');
    this.objRows.clear();
    this.el.objectives.querySelectorAll('.obj').forEach((el) => {
      this.objRows.set(el.dataset.key, {
        el,
        val: el.querySelector('.obj-val'),
        fill: el.querySelector('.bar > div'),
      });
    });
  }

  setTool(tool, available) {
    document.querySelectorAll('.tool').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === tool);
      b.disabled = available[b.dataset.tool] === false;
    });
    const hints = {
      dig: 'Drag to cut. Every m³ you cut lands on the spoil pile.',
      raise: 'Drag to build up ground from the spoil pile.',
      dam: 'Drag a line to wall the valley. Dams breach under enough head.',
      gate: 'Drag a short gate into a dam line. Keys 1–4 open and close it.',
      erase: 'Drag over a structure to take it down and get the timber back.',
    };
    this.el.toolHint.textContent = hints[tool] || '';
  }

  setBrush(r, min, max) {
    this.el.brushFill.style.width = pct((r - min) / (max - min));
  }

  setGates(gates) {
    this.el.gates.classList.toggle('hidden', gates.length === 0);
    this.el.gates.innerHTML = gates
      .map((g, i) => `<button class="gate-btn ${g.open ? 'open' : ''}" data-gate="${i}"><b>${i + 1}</b>${g.open ? 'OPEN' : 'SHUT'}</button>`)
      .join('');
    this.el.gates.querySelectorAll('.gate-btn').forEach((b) =>
      b.addEventListener('click', () => this.h.onGate(Number(b.dataset.gate)))
    );
  }

  update(g) {
    const { world, level } = g;
    this.el.seasonName.textContent = level.name;
    this.el.seasonSub.textContent = level.subtitle;

    const melting = g.phase === 'melt' || g.phase === 'settle';
    this.el.phaseTag.textContent = g.phase === 'survey' ? 'SURVEY' : g.phase === 'melt' ? 'MELT' : 'DRAINING';
    this.el.phaseTag.classList.toggle('melting', melting);
    const t = Math.max(0, g.meltTime);
    this.el.clock.textContent = `${(t / 60) | 0}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    this.el.meltFill.style.width = pct(t / level.melt.duration);
    this.el.flow.textContent = g.rate.toFixed(1);

    for (const f of world.fields) {
      const row = this.objRows.get(`f${f.index}`);
      if (!row) continue;
      const p = Math.min(1, f.soaked / f.need);
      row.fill.style.width = pct(p);
      row.val.textContent = f.done ? 'irrigated' : `${Math.round(p * 100)}%`;
      row.el.classList.toggle('done', f.done);
    }
    if (level.bankTarget) {
      const row = this.objRows.get('r');
      const held = world.reservoirs.reduce((s, r) => s + r.held, 0);
      if (row) {
        row.fill.style.width = pct(held / level.bankTarget);
        row.val.textContent = `${Math.round(held)} / ${level.bankTarget} m³`;
        row.el.classList.toggle('done', held >= level.bankTarget);
      }
    }
    const row = this.objRows.get('v');
    if (row) {
      const v = world.villages[0];
      const dmg = world.villages.reduce((s, x) => s + x.damage, 0);
      const tol = v.tolerance;
      row.fill.style.width = pct(dmg / tol);
      row.val.textContent = dmg < 0.5 ? 'dry' : `${Math.round((dmg / tol) * 100)}% damage`;
      row.el.classList.toggle('failing', dmg > tol * 0.6);
    }

    this.el.spoilNum.textContent = Math.round(g.tools.spoil);
    this.el.spoilFill.style.width = pct(g.tools.spoil / Math.max(120, level.spoil * 2.2));
    this.el.workNum.textContent = Math.round(g.tools.work);
    if (this.el.workUnit) this.el.workUnit.textContent = `/${level.work}`;
    this.el.workFill.style.width = pct(g.tools.work / level.work);
    this.el.timberNum.textContent = Math.round(g.tools.timber);
    this.el.timberRow.style.display = level.timber ? '' : 'none';

    this.el.release.classList.toggle('hidden', g.phase !== 'survey');
  }

  toast(text, kind = '') {
    // The sim can fire the same event many times in a second; one line is enough.
    const now = performance.now();
    if (this.lastToast === text && now - this.lastToastAt < 3500) return;
    this.lastToast = text;
    this.lastToastAt = now;
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('fade'), 2600);
    setTimeout(() => d.remove(), 3200);
  }

  showResult(sum) {
    $('result-verdict').textContent = sum.passed ? 'SEASON COMPLETE' : 'SEASON FAILED';
    $('result-verdict').classList.toggle('fail', !sum.passed);
    $('result-name').textContent = sum.name;
    $('result-rows').innerHTML = sum.rows
      .map(
        (r) =>
          `<div class="result-row ${r.ok === true ? 'ok' : r.ok === false ? 'bad' : ''}"><span>${r.label}</span><span class="rv">${r.value}</span></div>`
      )
      .join('');
    $('result-score').textContent = sum.score;
    $('result-next').classList.toggle('hidden', !sum.passed || !sum.hasNext);
    $('result-next').textContent = sum.hasNext ? 'NEXT SEASON' : 'NEXT';
    this.showScreen('result');
  }
}
