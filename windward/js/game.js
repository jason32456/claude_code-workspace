import * as THREE from 'three';
import { BOAT, WIND, RACE, RIVALS, PLAYER_COLOR, DEG, RAD } from './config.js';
import { Ocean, waveHeight, waveSlope } from './ocean.js';
import { buildSky, PALETTE } from './sky.js';
import { WindField } from './wind.js';
import { Boat } from './boat.js';
import { Wake } from './wake.js';
import { Course, Progress, MARKS } from './course.js';
import { Helm } from './ai.js';
import { ChaseCamera, CAMERA_MODES } from './camera.js';
import { Hud, formatTime } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { makeBoat, stepBoat, optimalTrim, angleDelta, clamp, lerp } from './sailing.js';

const FIXED_DT = 1 / 120;
const BEST_KEY = 'windward.best.v1';
const COURSE_CENTER = { x: 52, z: 0 };
const SOFT_BOUND = 250;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, PALETTE.fogDensity * 0.55);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 6000);
    this.chase = new ChaseCamera(this.camera);

    const sky = buildSky(this.scene);
    this.sun = sky.sun;

    this.ocean = new Ocean(this.scene, PALETTE);
    this.wind = new WindField();
    this.course = new Course(this.scene);
    this.wake = new Wake(this.scene);

    this.hud = new Hud();
    this.input = new Input();
    this.audio = new Audio();

    this.time = 0;
    this.raceTime = 0;
    this.accumulator = 0;
    this.mode = 'MENU';
    this.autoTrim = false;
    this.countdown = 0;
    this.best = parseFloat(localStorage.getItem(BEST_KEY)) || 0;

    this.fleet = [];
    this.buildFleet();
    this.resetRace();

    this.input.onKey = (code) => this.onKey(code);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.heightAt = (x, z, t) => waveHeight(x, z, t);
  }

  buildFleet() {
    const player = {
      name: 'YOU',
      color: PLAYER_COLOR,
      isPlayer: true,
      state: makeBoat(0, 0, 0),
      mesh: new Boat(this.scene, PLAYER_COLOR, true),
      progress: new Progress(),
      helm: null,
    };
    this.fleet.push(player);
    this.player = player;

    for (const r of RIVALS) {
      this.fleet.push({
        name: r.name,
        color: r.color,
        isPlayer: false,
        state: makeBoat(0, 0, 0),
        mesh: new Boat(this.scene, r.color, false),
        progress: new Progress(),
        helm: new Helm(r),
      });
    }
  }

  resetRace() {
    const startZ = -122;
    const lanes = [-8, -30, 12, 32];
    this.fleet.forEach((b, i) => {
      const s = b.state;
      Object.assign(s, makeBoat(lanes[i], startZ, 42 * DEG));
      s.trim = optimalTrim(42);
      b.progress = new Progress();
      if (b.helm) b.helm.tack = 1;
      b.finishPlace = 0;
    });

    this.raceTime = 0;
    this.countdown = 3.999;
    this.mode = 'COUNTDOWN';
    this.lastCountShown = 5;
    this.chase.snap(this.player.state, 0);
    document.body.classList.remove('finished');
    this.hideOverlays();
  }

  hideOverlays() {
    for (const id of ['menu', 'results', 'pause']) document.getElementById(id).classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
  }

  start() {
    this.audio.init();
    this.audio.resume();
    this.resetRace();
  }

  onKey(code) {
    if (code === 'KeyR' && this.mode !== 'MENU') { this.start(); return; }
    if (code === 'KeyT') {
      this.autoTrim = !this.autoTrim;
      this.hud.say(this.autoTrim ? 'AUTO-TRIM ON' : 'AUTO-TRIM OFF', 1.6, this.time);
      return;
    }
    if (code === 'KeyC') {
      this.hud.say(`CAMERA · ${this.chase.cycle()}`, 1.4, this.time);
      return;
    }
    if (code === 'KeyM') {
      this.audio.setEnabled(!this.audio.enabled);
      this.hud.say(this.audio.enabled ? 'SOUND ON' : 'SOUND OFF', 1.4, this.time);
      return;
    }
    if (code === 'Escape') {
      if (this.mode === 'RACING' || this.mode === 'COUNTDOWN') {
        this.mode = 'PAUSED';
        document.getElementById('pause').classList.remove('hidden');
      } else if (this.mode === 'PAUSED') {
        this.mode = 'RACING';
        document.getElementById('pause').classList.add('hidden');
      }
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  controlPlayer(dt) {
    const s = this.player.state;
    const k = this.input.state;

    const target = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * BOAT.rudderMax;
    const rate = (target === 0 ? BOAT.rudderReturn : BOAT.rudderRate) * BOAT.rudderMax;
    const diff = target - s.rudder;
    s.rudder += clamp(diff, -rate * dt, rate * dt);

    if (this.autoTrim) {
      const want = optimalTrim(Math.abs(s.awa));
      s.trim += clamp(want - s.trim, -BOAT.trimRate * 1.6 * dt, BOAT.trimRate * 1.6 * dt);
    } else {
      if (k.trimIn) s.trim -= BOAT.trimRate * dt;
      if (k.trimOut) s.trim += BOAT.trimRate * dt;
      s.trim = clamp(s.trim, 0, 90);
    }

    const wantsHike = k.hike && s.stamina > 1;
    s.hiking = wantsHike;
    s.stamina = clamp(
      s.stamina + (wantsHike ? -BOAT.hikeDrain : BOAT.hikeRecover) * dt,
      0, 100,
    );
  }

  stepPhysics(dt) {
    const t = this.time;
    for (const b of this.fleet) {
      const s = b.state;
      const wind = this.wind.sample(s.x, s.z);
      const slope = waveSlope(s.x, s.z, t);

      if (b.helm && !b.progress.finished) {
        b.helm.update(s, b.progress, this.wind, dt, this.raceTime);
      }

      let dragMul = s.dragMul || 1;
      if (this.raceTime < b.progress.penaltyUntil) dragMul *= 3.2;

      const outside = Math.hypot(s.x - COURSE_CENTER.x, s.z - COURSE_CENTER.z);
      if (outside > SOFT_BOUND) dragMul *= 1 + (outside - SOFT_BOUND) * 0.05;

      stepBoat(s, { wind, slopeX: slope.x, slopeZ: slope.z, dt, dragMul });
    }
  }

  updateProgress() {
    for (const b of this.fleet) {
      const before = b.progress.lap;
      b.progress.step(b.state.x, b.state.z, this.raceTime);

      if (b.progress.hitMark) {
        if (b.isPlayer) {
          this.hud.say('BUOY HIT · 2s PENALTY', 2.0, this.time);
          this.hud.flash(this.time);
          this.audio.thud();
          this.chase.addShake(0.6);
        }
      }
      if (b.progress.justRounded) {
        if (b.isPlayer) {
          this.audio.bell();
          if (b.progress.finished) this.finish();
          else if (b.progress.lap > before) {
            const lt = b.progress.lapTimes[b.progress.lapTimes.length - 1];
            this.hud.say(`LAP ${b.progress.lap} · ${formatTime(lt)}`, 2.4, this.time);
          } else {
            this.hud.say(`${MARKS[b.progress.markIndex].name} NEXT`, 1.8, this.time);
          }
        } else if (b.progress.finished) {
          b.finishPlace = this.fleet.filter((o) => o.progress.finished).length;
        }
      }
    }
  }

  standings() {
    return [...this.fleet].sort(
      (a, b) => a.progress.remaining(a.state.x, a.state.z) - b.progress.remaining(b.state.x, b.state.z),
    );
  }

  finish() {
    this.mode = 'FINISHED';
    this.audio.horn();
    const total = this.player.progress.finishTime;
    const isBest = !this.best || total < this.best;
    if (isBest) {
      this.best = total;
      localStorage.setItem(BEST_KEY, String(total));
    }

    const order = this.standings();
    const place = order.indexOf(this.player) + 1;

    document.getElementById('result-place').textContent =
      ['', '1st', '2nd', '3rd', '4th'][place] || `${place}th`;
    document.getElementById('result-time').textContent = formatTime(total);
    document.getElementById('result-best').textContent = formatTime(this.best);
    document.getElementById('result-flag').textContent = isBest ? 'NEW PERSONAL BEST' : '';

    const laps = this.player.progress.lapTimes
      .map((t, i) => `<li><span>Lap ${i + 1}</span><b>${formatTime(t)}</b></li>`)
      .join('');
    document.getElementById('result-laps').innerHTML = laps;

    const rows = order.map((b, i) => {
      const done = b.progress.finished;
      const gap = done ? formatTime(b.progress.finishTime) : 'still racing';
      return `<li class="${b.isPlayer ? 'me' : ''}"><span>${i + 1}. ${b.name}</span><b>${gap}</b></li>`;
    }).join('');
    document.getElementById('result-fleet').innerHTML = rows;

    document.getElementById('results').classList.remove('hidden');
    document.body.classList.add('finished');
  }

  updateVisuals(dt) {
    const t = this.time;
    for (const b of this.fleet) {
      b.mesh.update(b.state, this.heightAt, t);
      const wy = b.mesh.group.position.y;
      this.wake.trail(b.state, wy, dt, b.isPlayer ? 1.15 : 0.8);
    }
    this.wake.update(dt);

    const ps = this.player.state;
    const waterY = this.heightAt(ps.x, ps.z, t);
    this.chase.update(ps, waterY, dt, t);

    this.ocean.update(t, this.camera.position.x, this.camera.position.z, this.wind.gusts);
    this.course.update(t, this.heightAt, this.player.progress.markIndex);

    this.sun.position.set(ps.x, 0, ps.z).addScaledVector(PALETTE.sunDir, 120);
    this.sun.target.position.set(ps.x, 0, ps.z);
    this.sun.target.updateMatrixWorld();
  }

  updateHud() {
    const b = this.player;
    const s = b.state;
    const windFrom = this.wind.directionFrom(s.x, s.z);
    const windSpeed = this.wind.strengthAt(s.x, s.z);
    const m = MARKS[b.progress.markIndex];
    const markBearing = Math.atan2(m.x - s.x, m.z - s.z);
    const order = this.standings();

    this.hud.update({
      speed: s.speed,
      heel: s.heel,
      trim: s.trim,
      alpha: s.alpha,
      awa: s.awa,
      twa: angleDelta(s.heading, windFrom) * RAD,
      luffing: s.luffing,
      heading: s.heading,
      windFrom,
      windSpeed,
      gustFactor: windSpeed / this.wind.baseSpeed,
      gusts: this.wind.gusts,
      markBearing,
      markName: m.name,
      markDist: Math.hypot(m.x - s.x, m.z - s.z),
      markIndex: b.progress.markIndex,
      lap: b.progress.lap,
      place: order.indexOf(b) + 1,
      fleetSize: this.fleet.length,
      elapsed: this.raceTime,
      best: this.best,
      stamina: s.stamina,
      autoTrim: this.autoTrim,
      fleet: this.fleet.map((o) => ({
        x: o.state.x, z: o.state.z, heading: o.state.heading,
        color: o.color, isPlayer: o.isPlayer,
      })),
    }, this.time);

    this.audio.update(s, windSpeed / this.wind.baseSpeed - 1);
  }

  frame(dt) {
    this.time += dt;

    if (this.mode === 'COUNTDOWN') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this.lastCountShown) {
        this.lastCountShown = n;
        if (n > 0) {
          this.hud.say(String(n), 1.0, this.time);
          this.audio.ping(560, 0.3, 'sine', 0.2);
        }
      }
      if (this.countdown <= 0) {
        this.mode = 'RACING';
        this.hud.say('GO', 1.2, this.time);
        this.audio.horn();
      }
    }

    const live = this.mode === 'RACING';
    if (live) this.raceTime += dt;

    this.wind.update(dt);

    if (live || this.mode === 'COUNTDOWN' || this.mode === 'FINISHED') {
      if (live) this.controlPlayer(dt);
      this.accumulator += Math.min(dt, 0.1);
      while (this.accumulator >= FIXED_DT) {
        if (live || this.mode === 'FINISHED') this.stepPhysics(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
      if (live) this.updateProgress();
    }

    this.updateVisuals(dt);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }
}
