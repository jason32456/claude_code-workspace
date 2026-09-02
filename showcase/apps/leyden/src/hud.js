const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      chargeFill: $('charge-fill'),
      chargeNum: $('charge-num'),
      heatFill: $('heat-fill'),
      hullPips: $('hull-pips'),
      quotaFill: $('quota-fill'),
      quotaNum: $('quota-num'),
      quotaTarget: $('quota-target'),
      clock: $('clock'),
      stormName: $('storm-name'),
      stormSub: $('storm-sub'),
      firesNum: $('fires-num'),
      warnBanner: $('warn-banner'),
      warnMarker: $('warn-marker'),
      jarMarker: $('jar-marker'),
      dumpPrompt: $('dump-prompt'),
      toast: $('toast'),
      alert: $('alert'),
      flash: $('flash'),
      altNum: $('alt-num'),
      speedNum: $('speed-num'),
      baitState: $('bait-state'),
    };
    this.toastTimer = 0;
    this.pips = [];
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.className = 'pip';
      this.el.hullPips.appendChild(s);
      this.pips.push(s);
    }
  }

  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  toast(msg, cls = '') {
    this.el.toast.textContent = msg;
    this.el.toast.className = `toast ${cls}`;
    this.toastTimer = 2.4;
  }

  setStorm(storm, index) {
    this.el.stormName.textContent = `STORM ${index + 1} — ${storm.name}`;
    this.el.stormSub.textContent = storm.subtitle;
    this.el.quotaTarget.textContent = storm.quota;
  }

  update(dt, s) {
    const q = s.charge / s.chargeCap;
    this.el.chargeFill.style.width = `${q * 100}%`;
    this.el.chargeNum.textContent = Math.round(s.charge);
    this.el.chargeFill.classList.toggle('hot', q > 0.68);

    const h = s.heat / 100;
    this.el.heatFill.style.width = `${h * 100}%`;
    this.el.heatFill.classList.toggle('danger', h > 0.75);

    for (let i = 0; i < 3; i++) this.pips[i].classList.toggle('dead', i >= s.hull);

    const p = Math.min(1, s.delivered / s.quota);
    this.el.quotaFill.style.width = `${p * 100}%`;
    this.el.quotaNum.textContent = Math.round(s.delivered);

    const t = Math.max(0, s.timeLeft);
    const m = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    this.el.clock.textContent = `${m}:${String(sec).padStart(2, '0')}`;
    this.el.clock.classList.toggle('low', t < 30);

    this.el.firesNum.textContent = s.fires;
    this.el.firesNum.classList.toggle('bad', s.fires > 0);

    this.el.altNum.textContent = Math.round(s.altitude);
    this.el.speedNum.textContent = Math.round(s.speed);

    this.el.baitState.textContent = s.bait ? 'STREAMER OUT' : 'STREAMER STOWED';
    this.el.baitState.classList.toggle('active', s.bait);

    if (s.warnLeft > 0) {
      this.el.warnBanner.classList.remove('hidden');
      this.el.warnBanner.textContent = `CELL CHARGING — ${s.warnLeft.toFixed(1)}s`;
    } else {
      this.el.warnBanner.classList.add('hidden');
    }

    this._marker(this.el.warnMarker, s.warnScreen);
    this._marker(this.el.jarMarker, s.jarScreen);

    if (s.dumpReady) {
      this.el.dumpPrompt.classList.remove('hidden');
      this.el.dumpPrompt.textContent = s.dumping ? 'TRANSFERRING…' : 'HOLD Q — DUMP CHARGE';
      this.el.dumpPrompt.classList.toggle('active', s.dumping);
    } else {
      this.el.dumpPrompt.classList.add('hidden');
    }

    this.el.alert.classList.toggle('hidden', !(s.heat > 88));

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      this.el.toast.style.opacity = Math.min(1, this.toastTimer * 2);
    } else {
      this.el.toast.style.opacity = 0;
    }

    this.el.flash.style.opacity = Math.min(0.82, s.flash * 0.9);
  }

  _marker(el, screen) {
    if (!screen) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.style.left = `${screen.x}px`;
    el.style.top = `${screen.y}px`;
    el.classList.toggle('offscreen', !!screen.off);
    el.style.transform = screen.off
      ? `translate(-50%, -50%) rotate(${screen.angle}rad)`
      : 'translate(-50%, -50%)';
  }
}

/** Projects a world point to screen space, clamping to a screen-edge arrow. */
export function project(vec, camera) {
  const v = vec.clone().project(camera);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const behind = v.z > 1;
  let x = (v.x * 0.5 + 0.5) * w;
  let y = (-v.y * 0.5 + 0.5) * h;
  if (behind) {
    x = w - x;
    y = h - y;
  }
  const pad = 64;
  const off = behind || x < pad || x > w - pad || y < pad || y > h - pad;
  if (!off) return { x, y, off: false, angle: 0 };
  const cx = w / 2;
  const cy = h / 2;
  let dx = x - cx;
  let dy = y - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const sx = Math.min(cx - pad, cy - pad) * 1.35;
  const scale = Math.min((cx - pad) / Math.abs(dx || 1e-6), (cy - pad) / Math.abs(dy || 1e-6), sx);
  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
    off: true,
    angle: Math.atan2(dy, dx) + Math.PI / 2,
  };
}
