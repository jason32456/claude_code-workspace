import * as THREE from '../vendor/three.module.js';
import { Glass } from './glass.js';
import { PieceMesh, buildGhost } from './mesh.js';
import { buildScene, VIEWS, MOUTH_X, PIPE_Y } from './scene.js';
import { createInput, TOOLS } from './input.js';
import { ORDERS, scorePiece } from './orders.js';
import * as hud from './hud.js';
import { initAudio, ambience, sfx, setMuted, isMuted } from './audio.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const CLOCKS = [95, 105, 100, 115, 125];

const canvas = document.getElementById('game');
const S = buildScene(canvas);
const piece = new PieceMesh(S.spinner);

const game = {
  state: 'title',
  index: 0,
  results: [],
  glass: new Glass(),
  clock: CLOCKS[0],
  ghost: null,
  ghostOn: true,
  view: 0,
  zPos: 4,
  prevApply: false,
  toolBeat: 0,
  ruined: null,
};

const camPos = new THREE.Vector3(...VIEWS[0].pos);
const camLook = new THREE.Vector3(...VIEWS[0].look);

// ---------------------------------------------------------------- input

const input = createInput(canvas, {
  onTool: (i) => {
    hud.setTool(i);
    sfx.click();
    const c = TOOLS[i].color;
    S.cursorParts.forEach((p) => p.material.color.setHex(c));
  },
  onBench: () => {
    if (game.state === 'work') benchIt('BENCHED');
    else if (game.state === 'brief') startOrder();
    else if (game.state === 'score') nextOrder();
    else if (game.state === 'title') beginShift();
    else if (game.state === 'end') restart();
  },
  onGhost: () => {
    game.ghostOn = !game.ghostOn;
    if (game.ghost) game.ghost.visible = game.ghostOn;
  },
  onCamera: () => {
    game.view = (game.view + 1) % VIEWS.length;
    sfx.click();
  },
  onMute: () => setMuted(!isMuted()),
  onFirstInput: () => initAudio(),
});

hud.buildToolList((i) => {
  input.tool = i;
  hud.setTool(i);
});
hud.setTool(0);
S.cursorParts.forEach((p) => p.material.color.setHex(TOOLS[0].color));

document.getElementById('btn-start').addEventListener('click', () => {
  initAudio();
  beginShift();
});
document.getElementById('btn-take').addEventListener('click', startOrder);
document.getElementById('btn-next').addEventListener('click', nextOrder);
document.getElementById('btn-again').addEventListener('click', restart);

// ---------------------------------------------------------------- flow

function beginShift() {
  game.index = 0;
  game.results = [];
  hud.setShiftScore(0);
  showBrief();
}

function showBrief() {
  game.state = 'brief';
  const order = ORDERS[game.index];
  hud.fillBrief(order, game.index);
  hud.showPanel(hud.el.brief);
  hud.el.hud.classList.add('hidden');
}

function startOrder() {
  const order = ORDERS[game.index];
  game.state = 'work';
  game.glass.reset();
  game.clock = CLOCKS[game.index];
  game.ruined = null;
  game.zPos = game.glass.L * 0.5;
  if (game.ghost) S.rig.remove(game.ghost);
  game.ghost = buildGhost(order);
  game.ghost.visible = game.ghostOn;
  S.rig.add(game.ghost);
  hud.setOrderCard(order, game.index, game.results);
  hud.showPanel(null);
  hud.el.hud.classList.remove('hidden');
}

function benchIt(kicker) {
  if (game.state !== 'work') return;
  game.state = 'score';
  const order = ORDERS[game.index];
  const result = scorePiece(game.glass, order);
  if (game.ruined) {
    result.total = 0;
    result.grade = 'LOSS';
    result.note = RUIN_NOTE[game.ruined] || 'The piece is on the floor.';
    result.parts = result.parts.map(([l]) => [l, 0]);
  }
  game.results.push(result);
  hud.setShiftScore(game.results.reduce((a, r) => a + r.total, 0));
  hud.fillScore(result, order, game.glass, game.ruined ? kicker : null);
  hud.drawProfile(document.getElementById('silhouette'), order, game.glass);
  hud.showPanel(hud.el.score);
  hud.el.hud.classList.add('hidden');
  document.getElementById('btn-next').textContent = game.index >= ORDERS.length - 1 ? 'END OF SHIFT' : 'NEXT ORDER';
  if (!game.ruined && result.total >= 75) sfx.good();
  else sfx.bench();
}

const RUIN_NOTE = {
  BLOWOUT: 'You blew straight through the wall. There is glass on the ceiling.',
  CRACKED: 'You put a tool into cold glass. It let go in your hands.',
  DROPPED: 'It sagged off the pipe and hit the floor. Roll the pipe.',
  TIME: 'The gather went cold on the bench before it was anything.',
};

function nextOrder() {
  game.index++;
  if (game.index >= ORDERS.length) {
    game.state = 'end';
    hud.fillEnd(game.results, ORDERS);
    hud.showPanel(hud.el.end);
    return;
  }
  showBrief();
}

function restart() {
  beginShift();
}

// ---------------------------------------------------------------- loop

const ndc = new THREE.Vector3();
let last = performance.now();
let clockAcc = 0;

function cursorZ() {
  const g = game.glass;
  ndc.set(S.rig.position.x, PIPE_Y, 0).project(S.camera);
  const ax = ndc.x;
  ndc.set(S.rig.position.x + g.L, PIPE_Y, 0).project(S.camera);
  const bx = ndc.x;
  const mx = (input.mouseX ?? 0.5) * 2 - 1;
  const t = Math.abs(bx - ax) < 1e-4 ? 0.5 : (mx - ax) / (bx - ax);
  return clamp(t, 0, 1) * g.L;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const g = game.glass;

  if (game.state === 'work') {
    const steps = 2;
    for (let i = 0; i < steps; i++) g.update(dt / steps, input, MOUTH_X);

    game.zPos = cursorZ();
    const tool = TOOLS[input.tool].key;
    if (input.apply && !g.dead) {
      if (tool === 'shears') {
        if (!game.prevApply) {
          const res = g.shears(game.zPos);
          if (res === 'shear') {
            sfx.shear();
            hud.toast('OPENED', '#ffb457');
          } else if (res === 'toothick') {
            hud.toast('TOO THICK TO CUT', '#8c8378');
          } else if (res === 'toocold') {
            hud.toast('TOO COLD TO CUT', '#8c8378');
          }
        }
      } else {
        const res = g.applyTool(tool, game.zPos, dt);
        game.toolBeat -= dt;
        if (game.toolBeat <= 0 && res) {
          game.toolBeat = tool === 'marver' ? 0.3 : 0.14;
          tool === 'marver' ? sfx.marver() : sfx.tool();
        }
      }
    }
    game.prevApply = input.apply;

    if (g.dead && !game.ruined) {
      game.ruined = g.dead;
      if (g.dead === 'BLOWOUT') sfx.burst();
      else if (g.dead === 'CRACKED') sfx.crack();
      else sfx.drop();
      hud.toast(g.dead, '#ff4a3a');
      setTimeout(() => benchIt(g.dead), 1200);
    }

    clockAcc += dt;
    game.clock -= dt;
    if (clockAcc > 0.1) {
      clockAcc = 0;
      hud.updateGauges(g, game.clock);
      hud.drawProfile(document.getElementById('silhouette'), ORDERS[game.index], g);
    }
    if (game.clock <= 0 && !game.ruined) {
      game.ruined = 'TIME';
      hud.toast('TIME', '#ff4a3a');
      benchIt('OUT OF TIME');
    }

    ambience(clamp(g.depth / 24, 0, 1) * 0.9 + 0.08, input.blow && !g.opened);
  }

  // ---- presentation
  S.rig.position.x = g.depth;
  S.spinner.rotation.x = g.phi;
  piece.update(g);

  S.cursor.position.x = game.zPos;
  S.cursor.visible = game.state === 'work' && !g.dead;
  const rNear = g.r[g.indexAt(game.zPos)] || 1;
  const gap = (rNear + 0.75) * (input.apply ? 0.72 : 1);
  S.cursorParts[0].position.y = gap;
  S.cursorParts[1].position.y = -gap;
  S.cursorGuide.material.opacity = input.apply ? 0.3 : 0.14;

  const meanT = g.meanTemp();
  const glowU = clamp((meanT - 480) / 700, 0, 1) ** 1.9;
  S.pieceLight.position.set(g.L * 0.5, 0, 0);
  S.pieceLight.intensity = glowU * 195;
  S.pieceLight.color.setHSL(0.055 + 0.03 * glowU, 1, 0.5);

  const t = now / 1000;
  const flick = 0.86 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 17.7) + 0.04 * Math.sin(t * 31.1);
  // the mouth flares up as the piece goes in and blocks less of the throat
  const inFire = clamp(g.depth / 22, 0, 1);
  S.furnaceLight.intensity = (205 + 150 * inFire) * flick;
  S.gloryMat.opacity = 0.86 * flick + 0.1;
  S.gloryHaze.material.opacity = (0.2 + 0.3 * inFire) * flick;
  hud.el.heatwash.style.opacity = (0.28 + 0.5 * clamp(g.depth / 24, 0, 1) * flick).toFixed(3);

  const view = VIEWS[game.view];
  const k = 1 - Math.exp(-4.5 * dt);
  camPos.lerp(new THREE.Vector3(...view.pos), k);
  camLook.lerp(new THREE.Vector3(...view.look), k);
  S.camera.position.copy(camPos);
  S.camera.lookAt(camLook);

  S.renderer.render(S.scene, S.camera);
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  S.renderer.setSize(w, h, false);
  S.camera.aspect = w / h;
  S.camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

hud.showPanel(hud.el.title);
requestAnimationFrame(frame);

// exposed so the page can be driven headlessly for screenshots
window.__gather = { game, input, startOrder, benchIt, beginShift };
