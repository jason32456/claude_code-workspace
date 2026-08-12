// Pet state model, decay, reward, mood, and evolution

export const STAGES = ["egg", "baby", "child", "adult"];
export const STAGE_THRESHOLDS = [0, 60, 240, 600]; // totalFocusMinutes to reach each stage

const HUNGER_DECAY_PER_HOUR = 8;
const HAPPINESS_DECAY_PER_HOUR = 5;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function stageFor(totalMinutes) {
  let stage = "egg";
  if (totalMinutes >= 600) stage = "adult";
  else if (totalMinutes >= 240) stage = "child";
  else if (totalMinutes >= 60) stage = "baby";
  return stage;
}

export function mood(pet) {
  if (pet.hunger < 25) return "hungry";
  if (pet.happiness < 25) return "sad";
  if (pet.happiness > 75 && pet.hunger > 50) return "happy";
  return "content";
}

export function applyDecay(pet, now) {
  const hoursAway = (now - pet.lastSeen) / 3_600_000;
  pet.hunger    = clamp(pet.hunger    - hoursAway * HUNGER_DECAY_PER_HOUR,    0, 100);
  pet.happiness = clamp(pet.happiness - hoursAway * HAPPINESS_DECAY_PER_HOUR, 0, 100);
  pet.lastSeen  = now;
}

export function rewardSession(pet, minutes) {
  pet.hunger    = clamp(pet.hunger    + 30, 0, 100);
  pet.happiness = clamp(pet.happiness + 20, 0, 100);
  pet.totalFocusMinutes += minutes;
  pet.stage = stageFor(pet.totalFocusMinutes);
}

export function penalizeAbandoned(pet) {
  // Mild happiness dip only — absence of reward is the main signal
  pet.happiness = clamp(pet.happiness - 5, 0, 100);
}

export function defaultPet() {
  return {
    name: "Blobby",
    stage: "egg",
    totalFocusMinutes: 0,
    hunger: 80,
    happiness: 80,
    lastSeen: Date.now(),
  };
}

export function loadPet() {
  try {
    const raw = localStorage.getItem("focusPet");
    if (!raw) return defaultPet();
    const pet = JSON.parse(raw);
    applyDecay(pet, Date.now());
    return pet;
  } catch {
    return defaultPet();
  }
}

export function savePet(pet) {
  pet.lastSeen = Date.now();
  localStorage.setItem("focusPet", JSON.stringify(pet));
}

export function nextStageThreshold(pet) {
  const idx = STAGES.indexOf(pet.stage);
  if (idx >= STAGES.length - 1) return null;
  return STAGE_THRESHOLDS[idx + 1];
}
