import * as THREE from '../vendor/three.module.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      shift: $('shift-num'),
      objective: $('objective'),
      o2Fill: $('o2-fill'),
      o2Num: $('o2-num'),
      o2Bar: $('o2-fill').parentElement,
      hullFill: $('hull-fill'),
      hullNum: $('hull-num'),
      hullBar: $('hull-fill').parentElement,
      gasFill: $('gas-fill'),
      banked: $('banked-num'),
      quota: $('quota-num'),
      cargo: $('cargo-num'),
      mass: $('mass-num'),
      speed: $('speed-num'),
      anchorState: $('anchor-state'),
      tetherState: $('tether-state'),
      chargeWrap: $('charge-wrap'),
      chargeFill: $('charge-fill'),
      chargeHint: $('charge-hint'),
      closure: $('closure'),
      closureNum: $('closure-num'),
      toast: $('toast'),
      flash: $('damage-flash'),
      void: $('void-warning'),
      pro: $('marker-pro'),
      retro: $('marker-retro'),
    };
    this.toastUntil = 0;
    this.tmp = new THREE.Vector3();
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  toast(msg, seconds = 2.2) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.remove('hidden');
    this.toastUntil = performance.now() / 1000 + seconds;
  }

  flash() {
    this.el.flash.classList.add('on');
    setTimeout(() => this.el.flash.classList.remove('on'), 60);
  }

  update(s, camera) {
    const e = this.el;
    e.shift.textContent = s.shift;
    e.objective.textContent = s.objective;

    const o2f = s.o2 / s.o2Max;
    e.o2Fill.style.width = `${Math.max(0, o2f) * 100}%`;
    e.o2Num.textContent = Math.ceil(Math.max(0, s.o2));
    e.o2Bar.classList.toggle('low', o2f < 0.2);

    e.hullFill.style.width = `${Math.max(0, s.hull)}%`;
    e.hullNum.textContent = Math.ceil(Math.max(0, s.hull));
    e.hullBar.classList.toggle('low', s.hull < 30);

    e.gasFill.style.width = `${Math.max(0, s.gas)}%`;
    e.banked.textContent = s.banked;
    e.quota.textContent = s.quota;
    e.cargo.textContent = s.cargo;
    e.mass.textContent = Math.round(s.mass);
    e.speed.textContent = s.speed.toFixed(1);

    e.anchorState.textContent = s.anchored ? 'ANCHORED' : 'DRIFTING';
    e.anchorState.style.color = s.anchored ? 'var(--green)' : 'var(--dim)';

    e.tetherState.textContent = s.tether
      ? (s.reeling ? `REELING ${s.tetherLen.toFixed(0)} m` : (s.taut ? `TAUT ${s.tetherLen.toFixed(0)} m` : `SLACK ${s.tetherLen.toFixed(0)} m`))
      : 'TETHER READY';
    e.tetherState.style.color = s.tether ? 'var(--cyan)' : 'var(--dim)';

    e.chargeWrap.classList.toggle('hidden', !s.charging);
    if (s.charging) {
      e.chargeFill.style.width = `${s.charge * 100}%`;
      e.chargeHint.textContent = s.kickBlocked ? 'AIM CLEARS THE HULL — KICK WILL SLIDE ALONG IT' : 'RELEASE TO KICK';
      e.chargeHint.style.color = s.kickBlocked ? 'var(--red)' : '';
    }

    if (s.closureDist != null) {
      e.closure.classList.remove('hidden');
      e.closureNum.textContent = `${s.closure >= 0 ? '+' : ''}${s.closure.toFixed(1)}`;
      e.closure.classList.toggle('hot', s.closure > 6);
      e.closureNum.nextElementSibling.textContent = `m/s · ${s.closureDist.toFixed(0)} m`;
    } else {
      e.closure.classList.add('hidden');
    }

    e.void.classList.toggle('hidden', !s.inVoid);

    this.marker(e.pro, s.velDir, camera, s.speed > 0.35);
    this.marker(e.retro, s.velDir ? s.velDir.clone().negate() : null, camera, s.speed > 0.35);

    if (this.toastUntil && performance.now() / 1000 > this.toastUntil) {
      e.toast.classList.add('hidden');
      this.toastUntil = 0;
    }
  }

  marker(el, dir, camera, on) {
    if (!on || !dir) { el.classList.add('hidden'); return; }
    const p = this.tmp.copy(camera.position).addScaledVector(dir, 60).project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
  }
}
