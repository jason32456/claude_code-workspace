const $ = (id) => document.getElementById(id);

const ARC = 189;

export class Hud {
  constructor() {
    this.el = {};
    for (const id of [
      'hud', 'floor', 'set-count', 'set-total', 'height-note', 'day-fill', 'day-text', 'clock',
      'score', 'combo', 'best', 'lmi-fill', 'lmi-pct', 'lmi-sub', 'plumb-bubble', 'plumb-mm',
      'sway-dot', 'sway-num', 'wind-fill', 'wind-ahead', 'wind-num', 'wind-sub',
      'load-panel', 'load-type', 'load-mass', 'load-radius', 'load-yawerr',
      'prompt', 'toasts', 'alarm', 'hookcam-frame', 'flash', 'title', 'over', 'paused',
      'over-title', 'over-reason', 'over-note', 'o-score', 'o-floors', 'o-true', 'o-plumb',
    ]) this.el[id] = $(id);
    this._prompt = null;
    this._score = 0;
  }

  show() {
    this.el.hud.classList.remove('hidden');
    this.el['hookcam-frame'].classList.remove('hidden');
  }

  update(s) {
    const e = this.el;
    e.floor.textContent = s.floor;
    e['set-count'].textContent = s.setIndex;
    e['set-total'].textContent = s.setTotal;
    e['height-note'].textContent = `hook ${s.hookY.toFixed(0)} m · jib ${s.jibY.toFixed(0)} m`;

    e['day-fill'].style.width = `${s.day * 100}%`;
    e['day-text'].textContent = s.dayText;
    const left = Math.max(0, s.timeLeft);
    e.clock.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} LEFT`;

    // Count the score up rather than snapping — a set should feel like it paid.
    this._score += (s.score - this._score) * 0.25;
    if (Math.abs(s.score - this._score) < 1) this._score = s.score;
    e.score.textContent = Math.round(this._score).toLocaleString();
    e.combo.textContent = `×${s.combo.toFixed(1)}`;
    e.best.textContent = s.best ? s.best.toLocaleString() : '—';

    const lmi = Math.min(1.02, s.lmi);
    e['lmi-fill'].style.strokeDashoffset = String(ARC * (1 - lmi));
    e['lmi-fill'].style.stroke = lmi > 0.97 ? '#ff5d55' : lmi > 0.82 ? '#ffb03a' : '#5fe08a';
    e['lmi-pct'].textContent = Math.round(lmi * 100);
    e['lmi-sub'].textContent = s.spec ? `${(s.spec.mass / 1000).toFixed(1)} t @ ${s.radius.toFixed(1)} m` : 'no load';
    e.alarm.classList.toggle('hidden', !s.overload);

    const leanFrac = Math.min(1.4, s.lean / s.leanTol);
    e['plumb-bubble'].style.left = `${50 + Math.max(-46, Math.min(46, (s.leanX / s.leanTol) * 40))}%`;
    e['plumb-bubble'].style.background = leanFrac > 0.8 ? '#ff5d55' : leanFrac > 0.5 ? '#ffb03a' : '#5fe08a';
    e['plumb-mm'].textContent = Math.round(s.lean * 1000);

    const px = Math.max(-40, Math.min(40, s.swayX * 14.6));
    const pz = Math.max(-40, Math.min(40, s.swayZ * 14.6));
    e['sway-dot'].style.transform = `translate(${px}px, ${pz}px)`;
    e['sway-dot'].style.background = s.sway < 0.3 ? '#5fe08a' : s.sway < 1.0 ? '#ffc247' : '#ff5d55';
    e['sway-num'].textContent = s.sway.toFixed(2);

    e['wind-fill'].style.width = `${Math.min(100, (s.wind / 18) * 100)}%`;
    e['wind-ahead'].style.left = `${Math.min(99, (s.windAhead / 18) * 100)}%`;
    e['wind-num'].textContent = s.wind.toFixed(1);
    e['wind-sub'].textContent = s.wind < 4 ? 'calm' : s.wind < 8 ? 'breeze' : s.wind < 12 ? 'fresh' : s.wind < 15 ? 'strong' : 'gale';

    if (s.spec) {
      e['load-panel'].classList.remove('hidden');
      e['load-type'].textContent = s.spec.name;
      e['load-mass'].textContent = `${(s.spec.mass / 1000).toFixed(1)} t`;
      e['load-radius'].textContent = `r ${s.radius.toFixed(1)} m / max ${s.rMax.toFixed(1)} m`;
      e['load-yawerr'].textContent = `${Math.round(s.yawErr)}°`;
      e['load-yawerr'].style.color = s.yawErr <= s.spec.yawTol ? '#5fe08a' : '#ffb03a';
    } else {
      e['load-panel'].classList.add('hidden');
    }

    this.setPrompt(s.prompt);
  }

  setPrompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    this.el.prompt.classList.toggle('hidden', !text);
    if (text) this.el.prompt.textContent = text;
  }

  toast(text, kind = 'ok', sub = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
    this.el.toasts.appendChild(d);
    setTimeout(() => {
      d.style.transition = 'opacity .4s, transform .4s';
      d.style.opacity = '0';
      d.style.transform = 'translateY(-10px)';
      setTimeout(() => d.remove(), 420);
    }, 1500);
  }

  flash() {
    this.el.flash.classList.add('on');
    requestAnimationFrame(() => this.el.flash.classList.remove('on'));
  }

  over(title, reason, note, stats) {
    this.el['over-title'].textContent = title;
    this.el['over-reason'].textContent = reason;
    this.el['over-note'].textContent = note;
    this.el['o-score'].textContent = stats.score.toLocaleString();
    this.el['o-floors'].textContent = stats.floors;
    this.el['o-true'].textContent = stats.setTrue;
    this.el['o-plumb'].textContent = Math.round(stats.lean * 1000);
    this.el.over.classList.remove('hidden');
  }

  resetScoreRoll() { this._score = 0; }
}
