import { createGame, update, flap, resetRun, W, H } from "./game.js";
import { render } from "./render.js";
import { bindInput } from "./input.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const overlay = document.getElementById("overlay");
const gameover = document.getElementById("gameover");
const scoreEl = document.getElementById("score");
const bestLine = document.getElementById("bestLine");
const finalScore = document.getElementById("finalScore");
const finalBest = document.getElementById("finalBest");
const newBest = document.getElementById("newBest");
const goTitle = document.getElementById("goTitle");
const startBtn = document.getElementById("startBtn");
const retryBtn = document.getElementById("retryBtn");

const g = createGame();
bestLine.textContent = `Best: ${g.best}`;

let lastScore = -1;

function doFlap() {
  const wasTitle = g.state === "title";
  const wasDead = g.state === "dead";
  if (wasDead) resetRun(g);
  flap(g);
  if (wasTitle) overlay.classList.add("hidden");
  if (wasDead) gameover.classList.add("hidden");
}

startBtn.addEventListener("click", () => doFlap());
retryBtn.addEventListener("click", () => doFlap());
bindInput({ onFlap: doFlap });

const STEP = 1 / 120;
let acc = 0;
let prev = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  acc += dt;

  while (acc >= STEP) {
    const wasPlaying = g.state === "playing";
    update(g, STEP);
    acc -= STEP;
    if (wasPlaying && g.state === "dead") onDeath();
  }

  if (g.score !== lastScore && g.state === "playing") {
    lastScore = g.score;
    scoreEl.textContent = String(g.score);
    scoreEl.classList.remove("pulse");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("pulse");
  }

  render(ctx, g);
  requestAnimationFrame(frame);
}

function onDeath() {
  finalScore.textContent = String(g.score);
  finalBest.textContent = `Best: ${g.best}`;
  goTitle.textContent = g.deathCause || "WIPEOUT";
  const isNewBest = g.score === g.best && g.score > 0;
  newBest.classList.toggle("hidden", !isNewBest);
  gameover.classList.remove("hidden");
}

requestAnimationFrame(frame);
