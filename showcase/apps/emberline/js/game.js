import * as THREE from 'three';
import { WORLD, N, CELL, PLANE, MISSIONS } from './config.js';
import { Terrain, cellCentre } from './terrain.js';
import { Fire } from './fire.js';
import { Effects } from './fx.js';
import { Plane } from './plane.js';
import { Rig } from './camera.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Hud, bearing, clock } from './hud.js';

const $ = (id) => document.getElementById(id);
const BEST_KEY = 'emberline.best.v1';

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#14161f');
  g.addColorStop(0.42, '#3a2a35');
  g.addColorStop(0.68, '#89432c');
  g.addColorStop(0.85, '#c46a2a');
  g.addColorStop(1.0, '#e0913f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function house(rand) {
  const g = new THREE.Group();
  const wall = new THREE.MeshLambertMaterial({ color: 0xc9bda6 });
  const roof = new THREE.MeshLambertMaterial({ color: 0x7a3b2c });
  const w = 7 + rand() * 4;
  const d = 7 + rand() * 4;
  const h = 5 + rand() * 2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
  body.position.y = h / 2;
  g.add(body);
  const top = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 4.2, 4), roof);
  top.position.y = h + 2;
  top.rotation.y = Math.PI / 4;
  g.add(top);
  g.userData.mats = [wall, roof];
  return g;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 1, 3600);
    this.rig = new Rig(this.camera);
    this.input = new Input();
    this.audio = new Audio();
    this.hud = new Hud();

    this.state = 'title';
    this.clockPrev = performance.now();
    this.best = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');

    this.#bindUi();
    addEventListener('resize', () => this.#resize());
    this.#buildTitleCards();
    requestAnimationFrame(() => this.loop());
  }

  #resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  #bindUi() {
    $('btn-launch').onclick = () => this.begin();
    $('btn-brief-back').onclick = () => this.showTitle();
    $('btn-retry').onclick = () => this.load(this.missionIndex);
    $('btn-title').onclick = () => this.showTitle();
    $('btn-mute').onclick = (e) => {
      this.muted = !this.muted;
      this.audio.mute(this.muted);
      e.target.textContent = this.muted ? 'SOUND OFF' : 'SOUND ON';
    };
  }

  #buildTitleCards() {
    const wrap = $('mission-list');
    wrap.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'mission-card';
      const best = this.best[m.id];
      b.innerHTML = `<span class="num">0${i + 1}</span>
        <span class="body"><b>${m.name}</b><i>${m.subtitle}</i></span>
        <span class="grade">${best ? best.grade : '—'}</span>`;
      b.onclick = () => this.load(i);
      wrap.appendChild(b);
    });
  }

  showTitle() {
    this.state = 'title';
    $('title').classList.remove('hidden');
    $('brief').classList.add('hidden');
    $('results').classList.add('hidden');
    this.hud.el.hud.classList.add('hidden');
    this.#buildTitleCards();
  }

  load(index) {
    this.audio.start();
    this.missionIndex = index;
    const m = (this.mission = MISSIONS[index]);
    $('title').classList.add('hidden');
    $('results').classList.add('hidden');
    $('loading').classList.remove('hidden');

    // Let the loading card paint before the world build blocks the thread.
    setTimeout(() => {
      this.#buildWorld(m);
      $('loading').classList.add('hidden');
      $('brief').classList.remove('hidden');
      $('brief-name').textContent = m.name;
      $('brief-sub').textContent = m.subtitle;
      $('brief-text').textContent = m.brief;
      $('brief-wind').textContent = `${m.wind.speed} m/s from the ${bearing((m.wind.dir + 180) % 360)}`;
      $('brief-struct').textContent = `${this.structures.length} buildings · keep ${m.require}`;
      $('brief-shift').textContent = m.shifts.length
        ? m.shifts.map((s) => `${clock(s.t)} → ${bearing(s.dir)} ${s.speed} m/s`).join(' · ')
        : 'steady all night';
      this.state = 'brief';
    }, 30);
  }

  #buildWorld(m) {
    const scene = new THREE.Scene();
    this.scene = scene;
    const fogColor = new THREE.Color(0x6a3a26);
    scene.fog = new THREE.FogExp2(fogColor, 0.0006);
    scene.background = fogColor.clone().multiplyScalar(0.55);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false })
    );
    scene.add(sky);

    scene.add(new THREE.HemisphereLight(0x8a5a44, 0x1a1410, 1.15));
    const sun = new THREE.DirectionalLight(0xffb373, 1.5);
    sun.position.set(-700, 380, 500);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4a6a8a, 0.35);
    fill.position.set(500, 260, -400);
    scene.add(fill);

    this.terrain = new Terrain(m);
    this.terrain.addTo(scene);

    this.fire = new Fire(this.terrain, m.seed);
    this.fx = new Effects(scene, this.terrain, scene.fog);
    this.plane = new Plane(this.terrain);
    scene.add(this.plane.mesh);

    this.#placeStructures(m);

    this.wind = { dir: m.wind.dir, speed: m.wind.speed };
    this.windBase = { ...this.wind };
    this.fire.wind = this.wind;
    this.shifts = m.shifts.map((s) => ({ ...s, done: false }));
    this.nextShift = this.shifts[0] || null;

    this.elapsed = 0;
    this.drops = 0;
    this.dropping = false;
    this.threatened = 0;
    this.containAcc = 0;
    this.gpws = 0;
    this.lastImpact = null;
    this.result = null;

    const ig = m.ignitions[0];
    this.igniteAt = ig;

    // Start upwind of the fire, high, pointed at it.
    const w = this.fire.windVec();
    const sx = Math.max(-700, Math.min(700, ig.x - w.x * 620));
    const sz = Math.max(-700, Math.min(700, ig.z - w.z * 620));
    this.plane.spawn(sx, sz, Math.atan2(ig.x - sx, -(ig.z - sz)));
    this.rig.briefT = 0;
  }

  #placeStructures(m) {
    this.structures = [];
    let seed = m.seed ^ 0x1234;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (const town of m.towns) {
      for (let i = 0; i < town.n; i++) {
        let x, z, tries = 0;
        do {
          const a = rand() * 6.283;
          const r = Math.sqrt(rand()) * town.spread;
          x = town.x + Math.cos(a) * r;
          z = town.z + Math.sin(a) * r;
          tries++;
        } while (this.terrain.isWaterAt(x, z) && tries < 30);
        const g = house(rand);
        g.position.set(x, this.terrain.heightAt(x, z) - 0.6, z);
        g.rotation.y = rand() * 6.283;
        this.scene.add(g);
        this.structures.push({ x, z, mesh: g, cell: this.terrain.cellAt(x, z), lost: false, threat: 0, heat: 0 });
      }
    }
    this.structuresSafe = this.structures.length;
  }

  begin() {
    $('brief').classList.add('hidden');
    this.hud.el.hud.classList.remove('hidden');
    this.audio.start();
    for (const ig of this.mission.ignitions) this.fire.igniteAt(ig.x, ig.z, 22);
    this.hud.el.mission.textContent = this.mission.name.toUpperCase();
    this.rig.snap(this.plane);
    this.state = 'fly';
    this.hud.say('DROP ON GROUND THE FIRE HAS NOT REACHED YET', 'good');
  }

  finish(won, reason) {
    if (this.state !== 'fly') return;
    this.state = 'over';
    const m = this.mission;
    const saved = this.structuresSafe;
    const ratio = saved / this.structures.length;
    const ha = this.fire.hectares;
    let score = 100 * ratio;
    score -= Math.max(0, ha - m.par.ha) * 0.22;
    score -= Math.max(0, this.drops - m.par.drops) * 1.1;
    score -= Math.max(0, this.elapsed - 420) * 0.02;
    if (!won) score = Math.min(score, 35);
    score = Math.max(0, Math.round(score));
    const grade = score >= 95 ? 'S' : score >= 84 ? 'A' : score >= 70 ? 'B' : score >= 54 ? 'C' : 'D';

    const prev = this.best[m.id];
    if (!prev || prev.score < score) {
      this.best[m.id] = { score, grade };
      localStorage.setItem(BEST_KEY, JSON.stringify(this.best));
    }

    $('results').classList.remove('hidden');
    this.hud.el.hud.classList.add('hidden');
    $('res-title').textContent = won ? 'FIRE CONTAINED' : 'MISSION LOST';
    $('res-title').className = won ? 'win' : 'lose';
    $('res-reason').textContent = reason;
    $('res-grade').textContent = grade;
    $('res-rows').innerHTML = [
      ['Buildings saved', `${saved} / ${this.structures.length}`],
      ['Burned', `${Math.round(ha)} ha`],
      ['Containment', `${Math.round(this.fire.containment * 100)}%`],
      ['Loads dropped', `${this.drops}`],
      ['Time on the fire', clock(this.elapsed)],
      ['Score', `${score}`],
    ]
      .map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`)
      .join('');

    this.audio.set('eng', 0);
    this.audio.set('wind', 0);
    this.audio.set('fire', 0);
    this.audio.set('slurry', 0);
    if (won) this.audio.chord([392, 523, 659, 784], 1.1, 0.11);
    else this.audio.chord([196, 165, 131], 1.4, 0.11);
  }

  // ── per-frame ─────────────────────────────────────────────────────────
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.clockPrev) / 1000);
    this.clockPrev = now;

    if (this.state === 'brief') this.#brief(dt);
    else if (this.state === 'fly') this.#fly(dt);
    else if (this.state === 'over') this.#after(dt);

    if (this.input.hit('KeyM') || this.input.hit('Escape')) {
      // held for tactical, handled in #fly; Escape returns to title from brief
      if (this.state === 'brief') this.showTitle();
    }
    if (this.state === 'brief' && this.input.hit('Enter')) this.begin();
    if (this.state === 'title') {
      for (let i = 0; i < MISSIONS.length; i++)
        if (this.input.hit(`Digit${i + 1}`)) this.load(i);
    }
    this.input.endFrame();

    if (this.scene) {
      this.terrain.flush();
      this.renderer.render(this.scene, this.camera);
    }
  }

  #brief(dt) {
    const ig = this.igniteAt;
    this.rig.brief(dt, { x: ig.x, y: this.terrain.heightAt(ig.x, ig.z), z: ig.z }, 420);
    this.fx.update(dt, this.camera, this.fire, this.wind);
  }

  #after(dt) {
    this.fire.update(dt);
    this.fx.update(dt, this.camera, this.fire, this.wind);
    this.rig.follow(this.plane, dt, false, this.terrain);
    if (this.plane.alive) this.plane.update(dt, { pitch: 0, roll: 0, throttle: 0 });
  }

  #fly(dt) {
    const input = this.input.axes();
    const p = this.plane;
    this.elapsed += dt;

    if (this.input.hit('KeyC')) this.rig.cycle();
    if (this.input.hit('KeyR')) { this.load(this.missionIndex); return; }

    this.#wind(dt);
    p.update(dt, input);
    this.#retardant(dt, input);
    this.fire.update(dt);
    this.#structures(dt);
    this.fx.update(dt, this.camera, this.fire, this.wind);
    this.rig.follow(p, dt, this.input.down('KeyM'), this.terrain);
    this.#reticle();
    this.#sound(dt);

    this.containAcc += dt;
    if (this.containAcc > 1) {
      this.containAcc = 0;
      this.fire.measureContainment();
    }

    if (p.alive && p.agl < PLANE.crashAlt) {
      p.alive = false;
      this.audio.crash();
      for (let i = 0; i < 40; i++)
        this.fx.spawnDrop(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 40, Math.random() * 26, (Math.random() - 0.5) * 40, 'ember');
      this.fire.igniteAt(p.pos.x, p.pos.z, 16);
      this.finish(false, 'You flew it into the hill. There is no second aircraft tonight.');
      return;
    }

    if (this.structuresSafe < this.mission.require) {
      this.finish(false, `The fire took ${this.structures.length - this.structuresSafe} buildings — more than the ${this.structures.length - this.mission.require} you could afford to lose.`);
      return;
    }

    if (this.elapsed > 8 && this.fire.out) {
      this.finish(true, 'Every edge of the burn is on ground it cannot cross. The fire went out on your line.');
    }

    this.hud.update(dt, this);
  }

  // Where this load would actually land, drawn on the ground rather than on the
  // nose — the drop leads the aircraft by however long the slurry falls.
  #reticle() {
    const p = this.plane;
    const el = this.hud.el.reticle;
    if (!p.alive) { el.style.opacity = 0; return; }
    const agl = Math.max(1, p.agl);
    const fall = Math.min(4.5, Math.sqrt((2 * agl) / 9.81));
    const f = p.forward(this._f || (this._f = new THREE.Vector3()));
    const hl = Math.hypot(f.x, f.z) || 1;
    const lead = p.speed * fall * 0.82;
    const x = p.pos.x + (f.x / hl) * lead;
    const z = p.pos.z + (f.z / hl) * lead;
    const v = (this._v || (this._v = new THREE.Vector3())).set(x, this.terrain.surfaceAt(x, z), z);
    v.project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.4 || Math.abs(v.y) > 1.4) { el.style.opacity = 0; return; }
    const size = 26 + agl * 0.55;
    el.style.opacity = 1;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    el.className = agl < 70 ? 'tight' : agl > 115 ? 'thin' : '';
  }

  #wind(dt) {
    const s = this.nextShift;
    if (s && this.elapsed >= s.t) {
      const u = Math.min(1, (this.elapsed - s.t) / 25);
      this.wind.dir = lerpAngle(this.windBase.dir, s.dir, u);
      this.wind.speed = this.windBase.speed + (s.speed - this.windBase.speed) * u;
      if (!s.announced) {
        s.announced = true;
        this.hud.say(`WIND SHIFTING TO ${bearing(s.dir)} — YOUR FLANK IS BECOMING THE HEAD`, 'bad');
        this.audio.blip(320, 0.5, 'sawtooth', 0.1);
      }
      if (u >= 1) {
        this.windBase = { dir: s.dir, speed: s.speed };
        s.done = true;
        this.shifts.shift();
        this.nextShift = this.shifts[0] || null;
      }
    }
    const g = this.mission.wind.gust;
    this.wind.speed = Math.max(
      1,
      (this.nextShift && this.elapsed >= this.nextShift.t ? this.wind.speed : this.windBase.speed) +
        Math.sin(this.elapsed * 0.31) * g * 0.6 +
        Math.sin(this.elapsed * 0.13 + 2) * g * 0.4
    );
    this.fire.wind = this.wind;
  }

  #retardant(dt, input) {
    const p = this.plane;
    if (!p.alive) return;
    const overWater = this.terrain.isWaterAt(p.pos.x, p.pos.z);
    const scooping =
      input.release && overWater && p.agl < PLANE.scoopAlt && p.speed < PLANE.scoopSpeed && p.load < PLANE.capacity;

    if (scooping) {
      p.load = Math.min(PLANE.capacity, p.load + PLANE.scoopRate * dt);
      if (Math.random() < dt * 22) {
        const f = p.forward();
        this.fx.spawnDrop(
          p.pos.x, p.pos.y - 1, p.pos.z,
          -f.x * 10 + (Math.random() - 0.5) * 12, 6 + Math.random() * 8, -f.z * 10 + (Math.random() - 0.5) * 12,
          'water'
        );
      }
      this.scoopBeep = (this.scoopBeep || 0) + dt;
      if (this.scoopBeep > 0.35) {
        this.scoopBeep = 0;
        this.audio.splash();
      }
      this.emptySaid = false;
      if (p.load >= PLANE.capacity && !this.fullSaid) {
        this.fullSaid = true;
        this.hud.say('TANKS FULL', 'good');
      }
      this.dropping = false;
      this.lastImpact = null;
      this.audio.set('slurry', 0);
      return;
    }
    this.fullSaid = false;

    const dropping = input.release && p.load > 0 && !overWater && p.agl > 6;
    if (dropping && !this.dropping) {
      this.drops++;
      this.lastImpact = null;
    }
    this.dropping = dropping;
    this.audio.set('slurry', dropping ? 0.28 : 0, 0.05);

    if (!dropping) {
      this.lastImpact = null;
      if (input.release && p.load <= 0 && !this.emptySaid) {
        this.emptySaid = true;
        this.hud.say('EMPTY — SCOOP AT THE LAKE', 'bad');
      }
      return;
    }

    p.load = Math.max(0, p.load - PLANE.dropRate * dt);

    const agl = Math.max(1, p.agl);
    const fall = Math.min(4.5, Math.sqrt((2 * agl) / 9.81));
    const f = p.forward();
    const hx = f.x, hz = f.z;
    const hl = Math.hypot(hx, hz) || 1;
    const lead = p.speed * fall * 0.82;
    const ix = p.pos.x + (hx / hl) * lead;
    const iz = p.pos.z + (hz / hl) * lead;

    const dose = Math.max(0.2, Math.min(1, 1.25 - agl / 130));
    const radius = 1 + agl / 42;
    this.#paintLine(this.lastImpact, { x: ix, z: iz }, radius, dose);
    this.lastImpact = { x: ix, z: iz };

    for (let i = 0; i < 2; i++)
      this.fx.spawnDrop(
        p.pos.x + (Math.random() - 0.5) * 6, p.pos.y - 1.6, p.pos.z + (Math.random() - 0.5) * 6,
        p.vel.x * 0.9 + (Math.random() - 0.5) * 8, p.vel.y * 0.5 - 3, p.vel.z * 0.9 + (Math.random() - 0.5) * 8,
        'slurry'
      );
  }

  #paintLine(a, b, radius, dose) {
    const steps = a ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL * 0.5))) : 1;
    const r = Math.ceil(radius);
    for (let s = 0; s < steps; s++) {
      const u = a ? (s + 1) / steps : 1;
      const x = a ? a.x + (b.x - a.x) * u : b.x;
      const z = a ? a.z + (b.z - a.z) * u : b.z;
      const k = this.terrain.cellAt(x, z);
      if (k < 0) continue;
      const ci = k % N, cj = (k / N) | 0;
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const d = Math.hypot(di, dj);
          if (d > radius) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          this.fire.drop(nj * N + ni, dose * (1 - (d / (radius + 0.6)) * 0.55) * 0.5);
        }
    }
  }

  #structures(dt) {
    let threat = 0;
    const fire = this.fire;
    for (const s of this.structures) {
      if (s.lost) continue;
      const i = s.cell % N, j = (s.cell / N) | 0;
      let hot = 0;
      for (let dj = -3; dj <= 3; dj++)
        for (let di = -3; di <= 3; di++) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          if (fire.state[nj * N + ni] === 1) hot++;
        }
      s.threat = hot;
      if (hot > 0) {
        threat++;
        s.heat += dt * Math.min(2.5, hot * 0.3);
      } else {
        s.heat = Math.max(0, s.heat - dt * 0.5);
      }
      if (s.heat > 12) {
        s.lost = true;
        this.structuresSafe--;
        for (const m of s.mesh.userData.mats) m.color.setHex(0x1a1614);
        fire.igniteAt(s.x, s.z, 12);
        this.hud.say('BUILDING LOST', 'bad');
        this.audio.blip(180, 0.4, 'square', 0.16);
      }
    }
    this.threatened = threat;
  }

  #sound(dt) {
    const p = this.plane;
    this.audio.rpm(p.speed);
    this.audio.set('eng', p.alive ? 0.16 : 0);
    this.audio.set('wind', Math.min(0.2, (p.speed / PLANE.vMax) * 0.16));

    let near = 0;
    const b = this.fire.burning;
    const step = Math.max(1, Math.floor(b.length / 400));
    for (let i = 0; i < b.length; i += step) {
      const c = cellCentre(b[i]);
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d < 420) near += 1 - d / 420;
    }
    this.audio.set('fire', Math.min(0.34, (near * step) / 260));

    if (p.alive && p.agl < PLANE.warnAlt) {
      this.gpws -= dt;
      if (this.gpws <= 0) {
        this.gpws = p.agl < 22 ? 0.28 : 0.6;
        this.audio.blip(880, 0.09, 'square', 0.09);
      }
    }
  }
}

function lerpAngle(a, b, u) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * u;
}
