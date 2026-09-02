import * as THREE from '../vendor/three.module.js';
import { createScene, CLOUD_BASE } from './scene.js';
import { World, heightAt } from './world.js';
import { Player, CHARGE_CAP } from './player.js';
import { Storm } from './storm.js';
import { Input } from './input.js';
import { Hud, project } from './hud.js';
import { Audio } from './audio.js';
import { STORMS, RULES } from './levels.js';

const canvas = document.getElementById('game');
const ctl = createScene(canvas);
const { renderer, scene, camera } = ctl;

const world = new World(scene, 1337);
const player = new Player(scene);
const storm = new Storm(scene, world, ctl);
const input = new Input(canvas);
const hud = new Hud();
const audio = new Audio();

const $ = (id) => document.getElementById(id);
const panels = {
  menu: $('menu'),
  brief: $('briefing'),
  result: $('result'),
  pause: $('pause'),
  over: $('gameover'),
};

const game = {
  state: 'menu',
  stormIndex: 0,
  delivered: 0,
  timeLeft: 0,
  score: 0,
  runFires: 0,
  shake: 0,
  clock: 0,
  best: Number(localStorage.getItem('leyden.best') || 0),
};

world.igniteCallback = (h) => {
  audio.ignite();
  hud.toast(`FIRE — ${h.name}`, 'bad');
  game.runFires++;
};

storm.onThunder = (d) => audio.thunder(d);
storm.onWarn = () => {};
storm.onAttach = (attached) => {
  const kind = attached.kind;
  if (kind === 'player') {
    const payload =
      RULES.strikePayload[0] + Math.random() * (RULES.strikePayload[1] - RULES.strikePayload[0]);
    const gained = player.takeStrike(payload);
    audio.strikeOnPlayer();
    game.shake = 1;
    hud.toast(`STRUCK — +${Math.round(gained)} kC`, 'good');
    if (!player.alive) endRun('THE LURE WENT DOWN', 'Hull integrity gone. The valley keeps the charge.');
    else if (player.hull < 3) audio.hullHit();
  } else if (kind === 'jar') {
    const used = world.deliver(attached.ref, RULES.jarStrikeCharge);
    game.delivered += used;
    hud.toast(`JAR TOOK A HIT — +${Math.round(used)} kC`, '');
  } else if (kind === 'hazard') {
    world.ignite(attached.ref);
  } else if (kind === 'decoy') {
    hud.toast(`${attached.ref.name} TOOK IT`, 'dim');
  }
  const d = player.pos.distanceTo(attached.pos);
  game.shake = Math.max(game.shake, Math.max(0, 1 - d / 120));
};

function setState(s) {
  game.state = s;
  for (const k of Object.keys(panels)) panels[k].classList.toggle('hidden', k !== s);
  hud.show(s === 'play');
  if (s === 'play') {
    input.requestLock();
  } else {
    input.releaseLock();
  }
}

function startRun() {
  audio.init();
  audio.resume();
  game.stormIndex = 0;
  game.score = 0;
  game.runFires = 0;
  beginStorm();
}

function beginStorm() {
  const cfg = STORMS[game.stormIndex];
  world.reset();
  player.reset(new THREE.Vector3(0, 74, 96));
  storm.begin(cfg);
  ctl.setRain(cfg.rainVisual);
  game.delivered = 0;
  game.timeLeft = cfg.time;
  game.stormFires = 0;
  hud.setStorm(cfg, game.stormIndex);
  $('brief-title').textContent = `STORM ${game.stormIndex + 1} — ${cfg.name}`;
  $('brief-sub').textContent = cfg.subtitle;
  $('brief-quota').textContent = `${cfg.quota} kC`;
  $('brief-time').textContent = `${cfg.time} s`;
  $('brief-cells').textContent = `${cfg.cells} cells · ${cfg.simultaneous} at a time`;
  $('brief-hint').textContent = cfg.hint;
  setState('brief');
}

function launchStorm() {
  audio.init();
  audio.resume();
  setState('play');
}

function completeStorm() {
  const cfg = STORMS[game.stormIndex];
  const timeBonus = Math.round(game.timeLeft * 12);
  const fireBonus = world.fires === 0 ? 250 : 0;
  const hullBonus = player.hull === 3 ? 400 : 0;
  const gained = Math.round(game.delivered) + timeBonus + fireBonus + hullBonus;
  game.score += gained;
  audio.win();
  $('result-title').textContent = `STORM ${game.stormIndex + 1} SURVIVED`;
  $('result-line').textContent = cfg.name;
  $('res-delivered').textContent = `${Math.round(game.delivered)} kC`;
  $('res-time').textContent = `${Math.round(game.timeLeft)} s`;
  $('res-fires').textContent = world.fires;
  $('res-hull').textContent = `${player.hull}/3`;
  $('res-score').textContent = gained;
  $('res-total').textContent = game.score;
  $('btn-next').textContent =
    game.stormIndex >= STORMS.length - 1 ? 'FINISH RUN ⏎' : 'NEXT STORM ⏎';
  setState('result');
}

function endRun(title, line) {
  audio.lose();
  const won = title === 'THE GRID HELD';
  $('over-title').textContent = title;
  $('over-line').textContent = line;
  $('over-score').textContent = game.score;
  $('over-storm').textContent = `${game.stormIndex + 1} / ${STORMS.length}`;
  if (game.score > game.best) {
    game.best = game.score;
    localStorage.setItem('leyden.best', String(game.best));
    $('over-best').textContent = `NEW BEST — ${game.best}`;
  } else {
    $('over-best').textContent = `BEST ${game.best}`;
  }
  $('over-title').className = won ? 'win' : '';
  setState('over');
}

input.onPause = (fromLock) => {
  if (game.state === 'play') {
    setState('pause');
  } else if (game.state === 'pause' && !fromLock) {
    setState('play');
  }
};
input.onMute = () => {
  audio.setEnabled(!audio.enabled);
  hud.toast(audio.enabled ? 'AUDIO ON' : 'AUDIO MUTED', 'dim');
};

$('btn-start').addEventListener('click', startRun);
$('btn-dive').addEventListener('click', launchStorm);
$('btn-resume').addEventListener('click', () => setState('play'));
$('btn-abort').addEventListener('click', () => setState('menu'));
$('btn-again').addEventListener('click', startRun);
$('btn-menu').addEventListener('click', () => setState('menu'));
$('btn-next').addEventListener('click', () => {
  if (game.stormIndex >= STORMS.length - 1) {
    endRun('THE GRID HELD', 'Five storms, and Leyden still has light. Nobody down there knows what it cost.');
    return;
  }
  game.stormIndex++;
  beginStorm();
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Enter') return;
  if (game.state === 'brief') launchStorm();
  else if (game.state === 'result') $('btn-next').click();
  else if (game.state === 'menu') startRun();
  else if (game.state === 'over') startRun();
  else if (game.state === 'pause') setState('play');
});

const bestLine = $('best-line');
if (game.best > 0) bestLine.textContent = `BEST RUN — ${game.best}`;

// The visible half of a delivery: a live arc from the gondola to the jar head.
const arcPts = [];
for (let i = 0; i <= 12; i++) arcPts.push(new THREE.Vector3());
const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
const arcMat = new THREE.LineBasicMaterial({
  color: 0x9fe8ff,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const arcLine = new THREE.Line(arcGeo, arcMat);
arcLine.frustumCulled = false;
scene.add(arcLine);

function updateArc(dt, active, from, to) {
  arcMat.opacity += ((active ? 0.9 : 0) - arcMat.opacity) * Math.min(1, dt * 14);
  if (arcMat.opacity < 0.01) {
    arcLine.visible = false;
    return;
  }
  arcLine.visible = true;
  const a = arcGeo.attributes.position.array;
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    const jitter = Math.sin(f * Math.PI) * 2.4;
    a[i * 3] = from.x + (to.x - from.x) * f + (Math.random() - 0.5) * jitter;
    a[i * 3 + 1] = from.y - 3 + (to.y - (from.y - 3)) * f + (Math.random() - 0.5) * jitter;
    a[i * 3 + 2] = from.z + (to.z - from.z) * f + (Math.random() - 0.5) * jitter;
  }
  arcGeo.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- game loop

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  game.clock += dt;

  const playing = game.state === 'play';
  input.sample();

  if (playing) {
    const wind = storm.windAt(game.clock);
    player.update(dt, input, wind, game.clock);

    const rainHere = storm.rainAt(player.pos.x, player.pos.z);
    if (rainHere > 0.3 && player.charge > 0) {
      player.charge = Math.max(0, player.charge - rainHere * 9 * dt);
    }

    // Delivery link.
    const { jar, dist } = world.nearestJar(player.pos);
    const flat = Math.hypot(player.pos.x - jar.pos.x, player.pos.z - jar.pos.z);
    const linked =
      flat < RULES.dumpRadius &&
      player.pos.y < RULES.dumpCeiling &&
      jar.charge < jar.capacity;
    let dumping = false;
    if (linked && input.dump && player.charge > 0) {
      const amount = Math.min(player.charge, RULES.dumpRate * dt);
      const wasFull = jar.charge >= jar.capacity;
      const used = world.deliver(jar, amount);
      player.charge -= used;
      game.delivered += used;
      dumping = used > 0;
      if (dumping && Math.random() < dt * 14) audio.deliverTick();
      if (!wasFull && jar.charge >= jar.capacity) {
        audio.jarFull();
        hud.toast(`${jar.name} FULL`, 'good');
      }
    }
    if (input.bleed && player.charge > 0) {
      player.bleed(dt, RULES.bleedRate);
    }

    updateArc(dt, dumping, player.pos, jar.head);

    storm.update(dt, game.clock, player, false);
    world.update(dt, game.clock, (x, z) => storm.rainAt(x, z));

    game.timeLeft -= dt;

    if (world.fires >= RULES.maxFires) {
      endRun('LEYDEN BURNED', 'Three fires at once. There was no one left to fight them.');
    } else if (game.delivered >= STORMS[game.stormIndex].quota) {
      completeStorm();
    } else if (game.timeLeft <= 0) {
      endRun('THE GRID WENT DARK', 'The storm moved on with the jars still empty.');
    }

    const warnCell = storm.activeWarning();
    const warnLeft = warnCell ? Math.max(0, warnCell.warn) : 0;
    const warnScreen = warnCell ? project(warnCell.group.position, camera) : null;
    const jarScreen = linked ? null : project(jar.head, camera);

    hud.update(dt, {
      charge: player.charge,
      chargeCap: CHARGE_CAP,
      heat: player.heat,
      hull: player.hull,
      delivered: game.delivered,
      quota: STORMS[game.stormIndex].quota,
      timeLeft: game.timeLeft,
      fires: world.fires,
      altitude: player.pos.y - heightAt(player.pos.x, player.pos.z),
      speed: player.vel.length(),
      bait: player.streamerAmount > 0.4,
      warnLeft,
      warnScreen,
      jarScreen,
      dumpReady: linked && player.charge > 0,
      dumping,
      flash: ctl.state.flash,
    });

    if (player.heat > 92 && Math.random() < dt * 3) audio.alarm();
  } else {
    updateArc(dt, false, player.pos, player.pos);
    storm.update(dt, game.clock, player, true);
    world.update(dt, game.clock, (x, z) => storm.rainAt(x, z));
  }

  updateCamera(dt, playing);
  ctl.update(dt, camera.position);
  audio.update(dt, {
    speed: player.vel.length(),
    charge: player.charge / CHARGE_CAP,
    warn: storm.activeWarning() ? 1 - Math.max(0, storm.activeWarning().warn) / 3.2 : 0,
  });

  renderer.render(scene, camera);
}

function updateCamera(dt, playing) {
  if (!playing && game.state === 'menu') {
    // Slow orbit over the valley behind the title card.
    const a = game.clock * 0.07;
    camPos.set(Math.cos(a) * 165, 96 + Math.sin(a * 0.6) * 18, Math.sin(a) * 165);
    camera.position.lerp(camPos, Math.min(1, dt * 2));
    camTarget.set(0, 34, 0);
    camera.lookAt(camTarget);
    return;
  }

  const d = 36 + Math.min(12, player.vel.length() * 0.3);
  const cp = Math.cos(input.pitch);
  camPos.set(
    player.pos.x + Math.sin(input.yaw) * cp * d,
    player.pos.y + Math.sin(input.pitch) * d + 11,
    player.pos.z + Math.cos(input.yaw) * cp * d
  );
  const floor = heightAt(camPos.x, camPos.z) + 4;
  if (camPos.y < floor) camPos.y = floor;
  if (camPos.y > CLOUD_BASE + 14) camPos.y = CLOUD_BASE + 14;

  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt * 1.8);
    const s = game.shake * game.shake * 3.4;
    camPos.x += (Math.random() - 0.5) * s;
    camPos.y += (Math.random() - 0.5) * s;
    camPos.z += (Math.random() - 0.5) * s;
  }

  camera.position.lerp(camPos, Math.min(1, dt * 9));
  const fwd = new THREE.Vector3(-Math.sin(input.yaw), 0, -Math.cos(input.yaw));
  camTarget.copy(player.pos).addScaledVector(fwd, 14);
  camTarget.y += 1 - input.pitch * 12;
  camera.lookAt(camTarget);
}

setState('menu');
requestAnimationFrame(frame);

// Expose a tiny hook so screenshots can drive the game deterministically.
window.__leyden = { game, world, player, storm, input, hud, setState, startRun, launchStorm, beginStorm, ctl, THREE };
