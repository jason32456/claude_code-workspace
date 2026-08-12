// Pomodoro state machine and countdown

export const PHASES = { FOCUS: "focus", SHORT_BREAK: "short_break", LONG_BREAK: "long_break" };

export function defaultSettings() {
  return {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsUntilLongBreak: 4,
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem("focusSettings");
    return raw ? { ...defaultSettings(), ...JSON.parse(raw) } : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings) {
  localStorage.setItem("focusSettings", JSON.stringify(settings));
}

export function createTimer(settings) {
  return {
    phase: PHASES.FOCUS,
    secondsLeft: settings.focusMinutes * 60,
    running: false,
    sessionsCompleted: 0,
    // seconds elapsed in the current focus session (for partial-session tracking)
    focusSecondsElapsed: 0,
    settings,
  };
}

export function phaseDuration(timer) {
  switch (timer.phase) {
    case PHASES.FOCUS:       return timer.settings.focusMinutes * 60;
    case PHASES.SHORT_BREAK: return timer.settings.shortBreakMinutes * 60;
    case PHASES.LONG_BREAK:  return timer.settings.longBreakMinutes * 60;
  }
}

// Returns { completed: bool, minutesCompleted: number } describing what happened this tick
export function tick(timer) {
  if (!timer.running) return { completed: false, minutesCompleted: 0 };

  timer.secondsLeft -= 1;

  if (timer.phase === PHASES.FOCUS) {
    timer.focusSecondsElapsed += 1;
  }

  if (timer.secondsLeft > 0) return { completed: false, minutesCompleted: 0 };

  // Phase just finished
  const completed = timer.phase === PHASES.FOCUS;
  const minutesCompleted = completed ? timer.settings.focusMinutes : 0;

  if (completed) {
    timer.sessionsCompleted += 1;
    timer.focusSecondsElapsed = 0;
    const isLong = timer.sessionsCompleted % timer.settings.sessionsUntilLongBreak === 0;
    timer.phase = isLong ? PHASES.LONG_BREAK : PHASES.SHORT_BREAK;
  } else {
    timer.phase = PHASES.FOCUS;
    timer.focusSecondsElapsed = 0;
  }

  timer.secondsLeft = phaseDuration(timer);
  timer.running = false;

  return { completed, minutesCompleted };
}

export function reset(timer) {
  timer.running = false;
  timer.secondsLeft = phaseDuration(timer);
  timer.focusSecondsElapsed = 0;
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
