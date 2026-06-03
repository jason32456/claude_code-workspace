import * as THREE from 'three';
import { Track } from './track';
import { Bike } from './bike';
import { ChaseCamera } from './camera';
import { InputManager } from './input';
import { Hud } from './hud';
import { formatTime } from './utils';

type GameState = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private track: Track;
  private bike: Bike;
  private camera: ChaseCamera;
  private input: InputManager;
  private hud: Hud;

  private state: GameState = 'menu';
  private lapTime = 0;
  private bestTime: number | null = null;
  private lapNumber = 1;
  private countdownValue = 3;
  private countdownTimer = 0;
  private lastTimestamp = 0;
  private crossingArmed = false; // true once bike has cleared the start zone

  // DOM overlays
  private menuEl: HTMLElement;
  private countdownEl: HTMLElement;
  private countdownNumEl: HTMLElement;
  private finishEl: HTMLElement;
  private finishLapTimeEl: HTMLElement;
  private finishBestEl: HTMLElement;
  private pauseEl: HTMLElement;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 250, 600);

    this._setupLights();

    this.track = new Track();
    const trackScene = this.track.buildScene();
    this.scene.add(trackScene);

    this.bike = new Bike(this.track.startPosition, this.track.startHeading);
    this.scene.add(this.bike.model);
    this.scene.add(this.bike.smokeSystem.points);

    this.camera = new ChaseCamera(window.innerWidth / window.innerHeight);
    this.camera.snapTo(this.bike.state);

    this.input = new InputManager();
    this.hud = new Hud(this.track);

    this.menuEl = document.getElementById('menu-screen')!;
    this.countdownEl = document.getElementById('countdown-screen')!;
    this.countdownNumEl = document.getElementById('countdown-number')!;
    this.finishEl = document.getElementById('finish-screen')!;
    this.finishLapTimeEl = document.getElementById('finish-lap-time')!;
    this.finishBestEl = document.getElementById('finish-best-label')!;
    this.pauseEl = document.getElementById('pause-screen')!;

    this._bindEvents();
    window.addEventListener('resize', () => this._onResize());
  }

  private _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfffaee, 1.3);
    sun.position.set(80, 120, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a6b2a, 0.4);
    this.scene.add(hemi);
  }

  private _bindEvents() {
    this.input.on('start', () => {
      if (this.state === 'menu') this._startCountdown();
      else if (this.state === 'finished') this._startCountdown();
    });

    this.input.on('pause', () => {
      if (this.state === 'racing') this._pause();
      else if (this.state === 'paused') this._resume();
    });

    this.input.on('cameraToggle', () => {
      if (this.state === 'racing') this.camera.cycleMode();
    });

    document.getElementById('race-again-btn')!.addEventListener('click', () => {
      this._startCountdown();
    });

    document.getElementById('resume-btn')!.addEventListener('click', () => this._resume());
    document.getElementById('restart-btn')!.addEventListener('click', () => this._startCountdown());
  }

  private _startCountdown() {
    this._setState('countdown');
    this.countdownValue = 3;
    this.countdownTimer = 0;
    this.countdownNumEl.textContent = '3';

    this.bike.reset(this.track.startPosition, this.track.startHeading);
    this.camera.snapTo(this.bike.state);
    this.lapTime = 0;
    this.lapNumber = 1;
    this.crossingArmed = false;
  }

  private _pause() {
    this._setState('paused');
  }

  private _resume() {
    this._setState('racing');
    this.lastTimestamp = 0; // reset dt to avoid jump
  }

  private _setState(s: GameState) {
    this.state = s;
    this.menuEl.classList.toggle('hidden', s !== 'menu');
    this.countdownEl.classList.toggle('hidden', s !== 'countdown');
    this.finishEl.classList.toggle('hidden', s !== 'finished');
    this.pauseEl.classList.toggle('hidden', s !== 'paused');
  }

  private _finishLap() {
    const isNewBest = this.bestTime === null || this.lapTime < this.bestTime;
    if (isNewBest) this.bestTime = this.lapTime;

    this.finishLapTimeEl.textContent = formatTime(this.lapTime);
    this.finishBestEl.textContent = isNewBest
      ? `🏆 New best!`
      : `Best: ${formatTime(this.bestTime!)}`;
    this.finishBestEl.className = 'finish-best' + (isNewBest ? ' new-record' : '');

    this._setState('finished');
  }

  start() {
    this._setState('menu');
    requestAnimationFrame(ts => this._loop(ts));
  }

  private _loop(timestamp: number) {
    requestAnimationFrame(ts => this._loop(ts));

    if (this.lastTimestamp === 0) this.lastTimestamp = timestamp;
    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;

    this._update(dt);
    this.renderer.render(this.scene, this.camera.camera);
  }

  private _update(dt: number) {
    switch (this.state) {
      case 'countdown':
        this._updateCountdown(dt);
        // Keep rendering the bike static while counting down
        this.camera.update(this.bike.state, dt);
        break;

      case 'racing': {
        const input = this.input.getInput();
        const lapCrossed = this.bike.update(input, dt, this.track);
        this.camera.update(this.bike.state, dt);

        this.lapTime += dt;

        // Arm lap detection after the bike clears the start zone
        if (!this.crossingArmed && this.bike.state.trackIndex > 150) {
          this.crossingArmed = true;
        }

        if (lapCrossed && this.crossingArmed) {
          this._finishLap();
          this.crossingArmed = false;
        }

        this.hud.update(this.bike.state, this.lapTime, this.bestTime, this.lapNumber);
        break;
      }

      case 'paused':
      case 'menu':
      case 'finished':
        break;
    }
  }

  private _updateCountdown(dt: number) {
    this.countdownTimer += dt;
    if (this.countdownTimer >= 1) {
      this.countdownTimer -= 1;
      this.countdownValue--;

      if (this.countdownValue <= 0) {
        this.countdownNumEl.textContent = 'GO!';
        setTimeout(() => {
          this._setState('racing');
          this.lastTimestamp = 0;
        }, 600);
      } else {
        this.countdownNumEl.textContent = String(this.countdownValue);
        // Restart animation
        this.countdownNumEl.style.animation = 'none';
        void this.countdownNumEl.offsetWidth;
        this.countdownNumEl.style.animation = '';
      }
    }
  }

  private _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.setAspect(w / h);
  }
}
