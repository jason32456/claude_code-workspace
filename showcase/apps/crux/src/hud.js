import { HOLD_TYPES, TYPE_ORDER } from './holds.js';

const $ = (id) => document.getElementById(id);

function hex(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

function qualityColor(q) {
  if (q > 0.62) return '#62d493';
  if (q > 0.34) return '#ffb257';
  return '#e2513c';
}

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      height: $('height'),
      band: $('band'),
      bandNote: $('band-note'),
      stormFill: $('storm-fill'),
      stormText: $('storm-text'),
      clock: $('clock'),
      cams: $('cams'),
      chalk: $('chalk'),
      seed: $('seed'),
      pumpFill: $('pump-fill'),
      pumpNum: $('pump-num'),
      legsFill: $('legs-fill'),
      feetShare: $('feet-share'),
      armsShare: $('arms-share'),
      feetPct: $('feet-pct'),
      armsPct: $('arms-pct'),
      handLeft: $('hand-left'),
      handRight: $('hand-right'),
      leftFill: $('left-fill'),
      rightFill: $('right-fill'),
      leftType: $('left-type'),
      rightType: $('right-type'),
      targetInfo: $('target-info'),
      tSwatch: $('t-swatch'),
      tType: $('t-type'),
      tDist: $('t-dist'),
      tHint: $('t-hint'),
      toast: $('toast'),
      camPrompt: $('cam-prompt'),
      pumpFlash: $('pump-flash'),
    };
    this.toastTimer = 0;
    this.buildLegend();
  }

  buildLegend() {
    const legend = $('legend');
    if (!legend) return;
    legend.innerHTML = TYPE_ORDER.map((t) => {
      const s = HOLD_TYPES[t];
      return `<div class="row"><span class="dot" style="background:${hex(s.color)}"></span><span class="nm">${s.name}</span><span class="hint">${s.hint}</span></div>`;
    }).join('');
  }

  toast(text, kind = '') {
    this.el.toast.textContent = text;
    this.el.toast.className = 'show ' + kind;
    this.toastTimer = 2.2;
  }

  update(dt, s) {
    const el = this.el;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) el.toast.className = '';
    }

    el.height.textContent = Math.max(0, s.height).toFixed(0);
    el.band.textContent = s.band.name;
    el.bandNote.textContent = s.band.note;

    el.stormFill.style.width = (s.storm * 100).toFixed(1) + '%';
    el.stormText.textContent = s.stormText;
    el.clock.textContent = s.clock;

    el.cams.textContent = '●'.repeat(s.cams) + '○'.repeat(Math.max(0, s.camsTotal - s.cams));
    el.chalk.textContent = s.chalk;
    el.seed.textContent = s.seed;

    const pump = s.pump;
    el.pumpFill.style.height = pump.toFixed(1) + '%';
    el.pumpFill.style.background = pump > 78 ? '#e2513c' : pump > 52 ? '#ffb257' : '#62d493';
    el.pumpNum.textContent = pump.toFixed(0);
    el.legsFill.style.height = s.legs.toFixed(0) + '%';
    el.legsFill.style.background = s.legs < 25 ? '#e2513c' : '#6ba6ff';
    el.pumpFlash.style.opacity = pump > 70 ? ((pump - 70) / 30) * 0.9 : 0;

    const feet = Math.round(s.footShare * 100);
    el.feetShare.style.width = feet + '%';
    el.armsShare.style.width = 100 - feet + '%';
    el.feetPct.textContent = feet + '%';
    el.armsPct.textContent = 100 - feet + '%';

    for (const side of ['left', 'right']) {
      const h = s.hands[side];
      const row = side === 'left' ? el.handLeft : el.handRight;
      const fill = side === 'left' ? el.leftFill : el.rightFill;
      const label = side === 'left' ? el.leftType : el.rightType;
      row.classList.toggle('off', !h.hold);
      row.classList.toggle('slipping', h.slip > 0.05);
      fill.style.width = (h.hold ? h.quality * 100 : 0).toFixed(0) + '%';
      fill.style.background = qualityColor(h.quality);
      label.textContent = h.hold ? h.hold.spec.name.toLowerCase() : 'off';
    }

    if (s.target) {
      el.targetInfo.classList.remove('hidden');
      el.tSwatch.style.background = hex(s.target.spec.color);
      el.tType.textContent = s.target.spec.name;
      el.tDist.textContent = s.targetDyno ? 'DYNO — Shift+Q/E' : '';
      el.tHint.textContent = s.target.spec.hint + (s.target.wet > 0.25 ? ' · WET' : '');
    } else {
      el.targetInfo.classList.add('hidden');
    }

    el.camPrompt.classList.toggle('hidden', !s.camPrompt);
  }

  show() {
    this.el.hud.classList.remove('hidden');
  }

  hide() {
    this.el.hud.classList.add('hidden');
  }
}
