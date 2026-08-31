const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      overlay: $('overlay'),
      night: $('night-num'),
      phase: $('phase-label'),
      food: $('food-num'),
      quota: $('quota-num'),
      quotaFill: $('quota-fill'),
      timer: $('timer-label'),
      startNight: $('btn-start-night'),
      silkFill: $('silk-fill'),
      silkNum: $('silk-num'),
      lifeFill: $('life-fill'),
      lifeNum: $('life-num'),
      score: $('score-num'),
      gust: $('gust-warning'),
      gustDir: $('gust-dir'),
      cue: $('cue'),
      cueArrow: $('cue-arrow'),
      cueText: $('cue-text'),
      action: $('action-prompt'),
      actionFill: $('action-fill'),
      actionText: $('action-text'),
      build: $('build-panel'),
      buildHint: $('build-hint'),
      buildCost: $('build-cost'),
      buildErr: $('build-err'),
      silkToggle: $('silk-toggle'),
      toasts: $('toast-wrap'),
      flash: $('damage-flash'),
      touch: $('touch'),
    };
    this.panels = {
      title: $('panel-title'),
      dusk: $('panel-dusk'),
      dawn: $('panel-dawn'),
      over: $('panel-over'),
      pause: $('panel-pause'),
    };
  }

  showPanel(name) {
    this.el.overlay.classList.toggle('hidden', !name);
    for (const [k, p] of Object.entries(this.panels)) p.classList.toggle('hidden', k !== name);
  }

  setHudVisible(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  stats(s) {
    this.el.night.textContent = s.night;
    this.el.phase.textContent = s.phaseLabel;
    this.el.food.textContent = Math.floor(s.food);
    this.el.quota.textContent = s.quota;
    this.el.quotaFill.style.width = `${Math.min(100, (s.food / s.quota) * 100)}%`;
    this.el.timer.textContent = s.timer;
    this.el.startNight.classList.toggle('hidden', !s.canStartNight);
    this.el.silkFill.style.width = `${Math.min(100, (s.silk / s.silkMax) * 100)}%`;
    this.el.silkNum.textContent = Math.floor(s.silk);
    this.el.lifeFill.style.width = `${Math.max(0, s.health)}%`;
    this.el.lifeNum.textContent = Math.round(s.health);
    this.el.score.textContent = s.score;
  }

  gustWarning(on, dir) {
    this.el.gust.classList.toggle('hidden', !on);
    if (on) this.el.gustDir.textContent = dir > 0 ? '→→→' : '←←←';
  }

  cue(on, angle, text) {
    this.el.cue.classList.toggle('hidden', !on);
    if (on) {
      this.el.cueArrow.style.transform = `rotate(${-angle}rad)`;
      this.el.cueText.textContent = text;
    }
  }

  action(on, progress, text) {
    this.el.action.classList.toggle('hidden', !on);
    if (on) {
      this.el.actionFill.style.width = `${Math.min(100, progress * 100)}%`;
      this.el.actionText.textContent = text;
    }
  }

  buildPanel(on, state) {
    this.el.build.classList.toggle('hidden', !on);
    if (!on) return;
    this.el.silkToggle.textContent = state.type === 'capture' ? 'CAPTURE SILK  Q' : 'FRAME SILK  Q';
    this.el.silkToggle.className = `silk-btn ${state.type}`;
    this.el.buildHint.textContent = state.hint;
    this.el.buildCost.classList.toggle('hidden', !state.cost);
    if (state.cost) this.el.buildCost.textContent = `◇ ${state.cost.toFixed(1)} silk`;
    this.el.buildErr.classList.toggle('hidden', !state.error);
    if (state.error) this.el.buildErr.textContent = state.error;
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  flash() {
    this.el.flash.classList.add('on');
    setTimeout(() => this.el.flash.classList.remove('on'), 60);
  }

  list(el, rows) {
    el.innerHTML = '';
    for (const r of rows) {
      const li = document.createElement('li');
      if (r.kind) li.className = r.kind;
      const a = document.createElement('span');
      a.textContent = r.label;
      const b = document.createElement('span');
      b.textContent = r.value;
      li.append(a, b);
      el.appendChild(li);
    }
  }
}
