const $ = (id) => document.getElementById(id);
const RING = 2 * Math.PI * 42;

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), num: $('level-num'), name: $('level-name'),
      crystals: $('crystal-count'), pips: $('echo-pips'), par: $('par-note'),
      ring: $('ring-fill'), time: $('loop-time'),
      hint: $('hint'), toast: $('toast'), flash: $('flash'),
    };
    this._toastTimer = 0;
    this._hintTimer = 0;
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  setLevel(def, index, maxEchoes) {
    this.el.num.textContent = String(index + 1).padStart(2, '0');
    this.el.name.textContent = def.name;
    this.el.par.textContent = `par ${def.par}`;
    this.el.pips.innerHTML = '';
    for (let i = 0; i < maxEchoes; i++) {
      const d = document.createElement('div');
      d.className = 'pip';
      this.el.pips.appendChild(d);
    }
  }

  setEchoes(n) {
    [...this.el.pips.children].forEach((p, i) => p.classList.toggle('used', i < n));
  }

  setCrystals(taken, total) {
    this.el.crystals.textContent = `${taken}/${total}`;
    this.el.crystals.classList.toggle('done', taken === total);
  }

  setLoop(t, loop) {
    const k = Math.max(0, 1 - t / loop);
    this.el.ring.style.strokeDashoffset = String(RING * (1 - k));
    this.el.time.textContent = Math.max(0, loop - t).toFixed(1);
    this.el.ring.classList.toggle('urgent', loop - t < 4);
  }

  hint(text, secs = 6) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
    this._hintTimer = secs;
  }

  toast(text, cls = '', secs = 1.5) {
    this.el.toast.textContent = text;
    this.el.toast.className = `show ${cls}`;
    this._toastTimer = secs;
  }

  flash() {
    this.el.flash.classList.remove('fire');
    void this.el.flash.offsetWidth;
    this.el.flash.classList.add('fire');
  }

  tick(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.className = '';
    }
    if (this._hintTimer > 0) {
      this._hintTimer -= dt;
      if (this._hintTimer <= 0) this.el.hint.classList.remove('show');
    }
  }
}
