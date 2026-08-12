import { loadPet, savePet, rewardSession, penalizeAbandoned, mood } from "./pet.js";
import {
  loadSettings, saveSettings, createTimer, tick, reset, phaseDuration, PHASES
} from "./timer.js";
import {
  renderPet, renderStats, renderTimer, showRewardAnimation, showEvolveFlash, setTimerRing
} from "./ui.js";

const TICK_MS = 1000;
const SAVE_INTERVAL_TICKS = 10;

let pet = loadPet();
let settings = loadSettings();
let timer = createTimer(settings);
let tickCount = 0;
let intervalId = null;
let prevStage = pet.stage;
let celebratingReward = false;

function fullRender() {
  renderPet(pet);
  renderStats(pet);
  renderTimer(timer);
  const frac = timer.secondsLeft / phaseDuration(timer);
  setTimerRing(frac);
}

function onTick() {
  const { completed, minutesCompleted } = tick(timer);

  if (completed) {
    const oldStage = pet.stage;
    rewardSession(pet, minutesCompleted);
    celebratingReward = true;

    const petSvg = document.getElementById("pet-svg");
    showRewardAnimation(petSvg);
    setTimeout(() => { celebratingReward = false; }, 1200);

    if (pet.stage !== oldStage) {
      showEvolveFlash();
    }

    savePet(pet);
    // Auto-start break
    timer.running = true;
  }

  tickCount++;
  if (tickCount % SAVE_INTERVAL_TICKS === 0) savePet(pet);

  fullRender();
}

function startStop() {
  if (timer.running) {
    timer.running = false;
    // Mild penalty for abandoning mid-session focus phase
    if (timer.phase === PHASES.FOCUS && timer.focusSecondsElapsed > 30) {
      penalizeAbandoned(pet);
    }
  } else {
    timer.running = true;
  }
  fullRender();
}

function doReset() {
  timer.running = false;
  reset(timer);
  fullRender();
}

function openSettings() {
  document.getElementById("settings-panel").classList.toggle("hidden");
  // Populate fields
  document.getElementById("input-focus").value = settings.focusMinutes;
  document.getElementById("input-short").value = settings.shortBreakMinutes;
  document.getElementById("input-long").value = settings.longBreakMinutes;
  document.getElementById("input-name").value = pet.name;
}

function saveSettingsFromUI() {
  const focus = parseInt(document.getElementById("input-focus").value, 10) || 25;
  const short  = parseInt(document.getElementById("input-short").value, 10) || 5;
  const long   = parseInt(document.getElementById("input-long").value, 10) || 15;
  const name   = document.getElementById("input-name").value.trim() || "Blobby";

  settings.focusMinutes = Math.max(1, Math.min(90, focus));
  settings.shortBreakMinutes = Math.max(1, Math.min(30, short));
  settings.longBreakMinutes = Math.max(1, Math.min(60, long));
  saveSettings(settings);

  pet.name = name;
  savePet(pet);

  timer = createTimer(settings);
  document.getElementById("settings-panel").classList.add("hidden");
  fullRender();
}

// ─── Idle animation tick (independent of timer) ─────────────────────────────

let idleFrame = 0;
function idleAnimate() {
  if (!celebratingReward) {
    idleFrame++;
    // Gentle bob via CSS variable
    const offset = Math.sin(idleFrame * 0.04) * 5;
    document.getElementById("pet-svg").style.transform = `translateY(${offset}px)`;
  }
  requestAnimationFrame(idleAnimate);
}

// ─── Boot ────────────────────────────────────────────────────────────────────

document.getElementById("btn-start").addEventListener("click", startStop);
document.getElementById("btn-reset").addEventListener("click", doReset);
document.getElementById("btn-settings").addEventListener("click", openSettings);
document.getElementById("btn-settings-save").addEventListener("click", saveSettingsFromUI);
document.getElementById("btn-settings-cancel").addEventListener("click", () => {
  document.getElementById("settings-panel").classList.add("hidden");
});

intervalId = setInterval(onTick, TICK_MS);

fullRender();
idleAnimate();

// Persist on unload
window.addEventListener("beforeunload", () => savePet(pet));
