// Rendering, animations, stat bars, pet SVG

import { mood, STAGES, STAGE_THRESHOLDS, nextStageThreshold } from "./pet.js";
import { PHASES, formatTime } from "./timer.js";

// ─── Pet SVG ───────────────────────────────────────────────────────────────

const STAGE_SCALE = { egg: 0.65, baby: 0.8, child: 0.95, adult: 1.1 };

function eyesSVG(currentMood) {
  switch (currentMood) {
    case "happy":
    // ^_^ arc eyes
    return `
      <path d="M 72 90 Q 80 82 88 90" stroke="#3d2b1f" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M 112 90 Q 120 82 128 90" stroke="#3d2b1f" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case "hungry":
    // o_o wide eyes
    return `
      <circle cx="80" cy="90" r="7" fill="#3d2b1f"/>
      <circle cx="120" cy="90" r="7" fill="#3d2b1f"/>
      <circle cx="83" cy="87" r="2" fill="white"/>
      <circle cx="123" cy="87" r="2" fill="white"/>`;
    case "sad":
    // T_T droopy eyes
    return `
      <path d="M 72 86 Q 80 96 88 86" stroke="#3d2b1f" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M 112 86 Q 120 96 128 86" stroke="#3d2b1f" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    default: // content
    return `
      <circle cx="80" cy="90" r="5" fill="#3d2b1f"/>
      <circle cx="120" cy="90" r="5" fill="#3d2b1f"/>
      <circle cx="82" cy="88" r="1.5" fill="white"/>
      <circle cx="122" cy="88" r="1.5" fill="white"/>`;
  }
}

function mouthSVG(currentMood) {
  switch (currentMood) {
    case "happy":
      return `<path d="M 85 108 Q 100 122 115 108" stroke="#3d2b1f" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case "hungry":
      return `<ellipse cx="100" cy="114" rx="12" ry="8" fill="#3d2b1f" opacity="0.8"/>`;
    case "sad":
      return `<path d="M 85 116 Q 100 106 115 116" stroke="#3d2b1f" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    default:
      return `<path d="M 88 112 Q 100 118 112 112" stroke="#3d2b1f" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
}

function cheeksSVG(currentMood) {
  if (currentMood !== "happy") return "";
  return `
    <ellipse cx="65" cy="103" rx="10" ry="6" fill="#ffb3c1" opacity="0.6"/>
    <ellipse cx="135" cy="103" rx="10" ry="6" fill="#ffb3c1" opacity="0.6"/>`;
}

function bodyColorFor(stage, currentMood) {
  if (currentMood === "sad")    return { body: "#b0b8c1", shine: "#d0d8e0" };
  if (currentMood === "hungry") return { body: "#c8b8a0", shine: "#e0d0b8" };
  const colors = {
    egg:   { body: "#ffe0a0", shine: "#fff0c8" },
    baby:  { body: "#a8d8a8", shine: "#c8f0c8" },
    child: { body: "#80b8e8", shine: "#b8d8f8" },
    adult: { body: "#c8a0e8", shine: "#e8c8ff" },
  };
  return colors[stage] || colors.baby;
}

function eggSVG(currentMood) {
  const { body, shine } = bodyColorFor("egg", currentMood);
  return `
    <ellipse cx="100" cy="115" rx="50" ry="62" fill="${body}"/>
    <ellipse cx="87" cy="88" rx="12" ry="20" fill="${shine}" opacity="0.5" transform="rotate(-20,87,88)"/>
    ${eyesSVG(currentMood)}
    ${mouthSVG(currentMood)}
    ${cheeksSVG(currentMood)}`;
}

function blobSVG(stage, currentMood) {
  const { body, shine } = bodyColorFor(stage, currentMood);
  // Different blob shapes per stage
  const blobPath = stage === "child" || stage === "adult"
    ? "M 100 45 C 130 40 155 65 155 95 C 155 130 135 155 100 158 C 65 155 45 130 45 95 C 45 65 70 40 100 45 Z"
    : "M 100 50 C 128 48 150 70 150 98 C 150 128 128 148 100 150 C 72 148 50 128 50 98 C 50 70 72 48 100 50 Z";

  const extras = stage === "adult"
    ? `<ellipse cx="55" cy="115" rx="15" ry="10" fill="${body}"/>
       <ellipse cx="145" cy="115" rx="15" ry="10" fill="${body}"/>` // little arm nubs
    : "";

  return `
    ${extras}
    <path d="${blobPath}" fill="${body}"/>
    <ellipse cx="82" cy="72" rx="14" ry="22" fill="${shine}" opacity="0.45" transform="rotate(-20,82,72)"/>
    ${eyesSVG(currentMood)}
    ${mouthSVG(currentMood)}
    ${cheeksSVG(currentMood)}`;
}

function petSVGInner(stage, currentMood) {
  if (stage === "egg") return eggSVG(currentMood);
  return blobSVG(stage, currentMood);
}

// ─── Public render functions ────────────────────────────────────────────────

export function renderPet(pet, animClass = "") {
  const currentMood = mood(pet);
  const scale = STAGE_SCALE[pet.stage] || 1;
  const el = document.getElementById("pet-svg");
  if (!el) return;
  el.innerHTML = `
    <g transform="translate(100,100) scale(${scale}) translate(-100,-100)" class="${animClass}">
      ${petSVGInner(pet.stage, currentMood)}
    </g>`;
  el.setAttribute("data-mood", currentMood);
  el.setAttribute("data-stage", pet.stage);
}

export function renderStats(pet) {
  const hunger = Math.round(pet.hunger);
  const happiness = Math.round(pet.happiness);
  const currentMood = mood(pet);

  document.getElementById("hunger-bar").style.width = `${hunger}%`;
  document.getElementById("happiness-bar").style.width = `${happiness}%`;
  document.getElementById("hunger-value").textContent = hunger;
  document.getElementById("happiness-value").textContent = happiness;

  const moodLabel = document.getElementById("mood-label");
  const moodEmojis = { happy: "😄", content: "😊", hungry: "😋", sad: "😔" };
  moodLabel.textContent = `${moodEmojis[currentMood] || ""} ${currentMood}`;

  // Growth progress
  const threshold = nextStageThreshold(pet);
  const prevIdx = STAGES.indexOf(pet.stage);
  const prevThreshold = STAGE_THRESHOLDS[prevIdx] || 0;
  const progressEl = document.getElementById("growth-progress");
  const growthLabel = document.getElementById("growth-label");

  if (threshold === null) {
    progressEl.style.width = "100%";
    growthLabel.textContent = `${pet.stage} · max level`;
  } else {
    const pct = Math.min(100, ((pet.totalFocusMinutes - prevThreshold) / (threshold - prevThreshold)) * 100);
    progressEl.style.width = `${pct}%`;
    growthLabel.textContent = `${pet.stage} · ${Math.round(pet.totalFocusMinutes)}/${threshold} min`;
  }

  document.getElementById("pet-name").textContent = pet.name;
}

export function renderTimer(timer) {
  document.getElementById("timer-display").textContent = formatTime(timer.secondsLeft);

  const phaseEl = document.getElementById("phase-label");
  const labels = {
    focus: "Focus",
    short_break: "Short Break",
    long_break: "Long Break",
  };
  phaseEl.textContent = labels[timer.phase] || "";
  phaseEl.className = `phase-label phase-${timer.phase}`;

  const startBtn = document.getElementById("btn-start");
  startBtn.textContent = timer.running ? "Pause" : "Start";

  // Session dots
  const dotsEl = document.getElementById("session-dots");
  const total = timer.settings.sessionsUntilLongBreak;
  const done = timer.sessionsCompleted % total;
  dotsEl.innerHTML = Array.from({ length: total }, (_, i) =>
    `<span class="dot ${i < done ? "dot-done" : ""}"></span>`
  ).join("");
}

export function showRewardAnimation(petEl) {
  petEl.classList.add("pet-reward");
  setTimeout(() => petEl.classList.remove("pet-reward"), 1200);
}

export function showEvolveFlash() {
  const flash = document.getElementById("evolve-flash");
  flash.classList.add("active");
  setTimeout(() => flash.classList.remove("active"), 1800);
}

export function setTimerRing(fraction) {
  // fraction 0→1 of time remaining
  const ring = document.getElementById("timer-ring");
  if (!ring) return;
  const r = 90;
  const circ = 2 * Math.PI * r;
  ring.style.strokeDashoffset = circ * (1 - fraction);
}
