// All DOM writing lives here. The HUD's job is to make three invisible things
// legible: which arms you are actually attending, how well your skin matches
// the ground under you, and how much evidence each predator has collected.

import { S } from './octopus.js';

const $ = (id) => document.getElementById(id);

const STATE_LABEL = {
  free: 'FREE', reach: 'SEND', grip: 'GRIP', hold: 'HOLD',
  probe: 'PROBE', pry: 'PRY', hurt: 'HURT', gone: '—',
};

export class Hud {
  constructor() {
    this.el = {
      nightNum: $('night-num'), reefName: $('reef-name'), quotaNote: $('quota-note'),
      dawnFill: $('dawn-fill'), clock: $('clock'),
      food: $('food-count'), quota: $('food-quota'), carry: $('carry-count'),
      debtFill: $('debt-fill'), debtNum: $('debt-num'),
      matchFill: $('match-fill'), matchNum: $('match-num'),
      skin: $('skin-swatch'), ground: $('ground-swatch'),
      threats: $('threat-panel'), pips: $('pips'), inkPips: $('ink-pips'),
      arms: $('arm-chips'), prompt: $('prompt'), toasts: $('toast-stack'),
      reticle: $('reticle'), inkVeil: $('ink-veil'), hurtFlash: $('hurt-flash'),
      denMarker: $('den-marker'), denDist: $('den-dist'), hud: $('hud'),
    };
    this.chips = [];
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('div');
      c.className = 'arm-chip';
      c.innerHTML = `<div class="n">${i + 1}</div><div class="s">FREE</div>`;
      this.el.arms.appendChild(c);
      this.chips.push(c);
    }
    this.threatRows = new Map();
    this.toastTimers = [];
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  setNight(n, night) {
    this.el.nightNum.textContent = n + 1;
    this.el.reefName.textContent = night.name;
    this.el.quotaNote.textContent = `bring ${night.quota} back to the den`;
    this.el.quota.textContent = night.quota;
  }

  update(game) {
    const o = game.octo;
    const e = this.el;

    // clock / dawn
    const frac = 1 - game.timeLeft / game.night.duration;
    e.dawnFill.style.width = `${frac * 100}%`;
    const secs = Math.max(0, Math.ceil(game.timeLeft));
    e.clock.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} to first light`;

    e.food.textContent = game.food;
    e.carry.textContent = o.carryCount();

    e.debtFill.style.height = `${o.debt * 100}%`;
    e.debtNum.textContent = Math.round(o.debt * 100);
    e.debtFill.style.filter = o.exhausted ? 'brightness(1.6)' : 'none';

    e.matchFill.style.height = `${o.match * 100}%`;
    e.matchNum.textContent = Math.round(o.match * 100);

    if (o.ground) {
      // Terrain colours live in the renderer's linear space; the swatch has to
      // be gamma-corrected or it will not look like what is under your feet.
      const g = o.ground.col.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255));
      e.ground.style.background = `rgb(${g.join(',')})`;
      e.skin.style.background = `#${o.skinMat.color.getHexString()}`;
    }

    // attention pips
    const used = o.attentionUsed();
    for (let i = 0; i < e.pips.children.length; i++) {
      e.pips.children[i].classList.toggle('on', i < used);
    }
    for (let i = 0; i < e.inkPips.children.length; i++) {
      e.inkPips.children[i].classList.toggle('on', i < game.ink);
    }

    // arm chips
    for (let i = 0; i < 8; i++) {
      const arm = o.arms[i];
      const chip = this.chips[i];
      const label = arm.state === S.HOLD && arm.item ? arm.item.kind.toUpperCase().slice(0, 5) : STATE_LABEL[arm.state];
      if (chip._label !== label) { chip.lastChild.textContent = label; chip._label = label; }
      const cls = arm.state === S.GONE ? 'gone'
        : arm.state === S.HURT ? 'hurt'
        : arm.attended ? 'attended'
        : arm.state === S.HOLD ? 'holding' : '';
      if (chip._cls !== cls) { chip.className = `arm-chip ${cls}`; chip._cls = cls; }
    }

    // threats
    const seen = new Set();
    for (const p of game.predators) {
      if (p.dist > 30) continue;
      seen.add(p);
      let row = this.threatRows.get(p);
      if (!row) {
        row = document.createElement('div');
        row.className = 'threat';
        row.innerHTML = `<div class="tname"><span>${p.spec.label}</span><span class="tdist">0m</span></div>
                         <div class="tbar"><div></div></div>`;
        this.el.threats.appendChild(row);
        this.threatRows.set(p, row);
      }
      row.children[0].children[1].textContent = `${Math.round(p.dist)}m`;
      row.children[1].firstChild.style.width = `${p.suspicion * 100}%`;
      const cls = p.state === 'attack' ? 'threat hunt'
        : p.suspicion > 0.45 ? 'threat look' : 'threat';
      if (row._cls !== cls) { row.className = cls; row._cls = cls; }
    }
    for (const [p, row] of this.threatRows) {
      if (!seen.has(p)) { row.remove(); this.threatRows.delete(p); }
    }

    // den distance, once the quota is met or dawn is close
    const dd = Math.hypot(o.pos.x - game.reef.den.x, o.pos.z - game.reef.den.z);
    const wantDen = game.food >= game.night.quota || game.timeLeft < 45;
    e.denMarker.classList.toggle('hidden', !wantDen);
    if (wantDen) e.denDist.textContent = Math.round(dd);

    e.inkVeil.style.opacity = game.inkVeil.toFixed(2);
  }

  setReticle(mode) {
    this.el.reticle.className = mode || '';
  }

  prompt(text) {
    if (!text) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.textContent = text;
    this.el.prompt.classList.remove('hidden');
  }

  hurtFlash() {
    this.el.hurtFlash.style.opacity = '1';
    setTimeout(() => { this.el.hurtFlash.style.opacity = '0'; }, 190);
  }

  toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    this.el.toasts.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .4s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 420);
    }, 2600);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild.remove();
  }
}
