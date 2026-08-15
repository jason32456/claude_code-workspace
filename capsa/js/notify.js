// Out-of-page half of the "it's your turn" alert.
//
// Deliberately quiet. The on-screen pill the table shows is the alert; this
// only covers the case where you are not looking at the page at all, and even
// then it does nothing a browser has to ask permission for. There is no system
// notification: a card game interrupting the whole desktop is out of
// proportion to a turn that will still be there in a minute.
//
// The banner itself belongs to the table, so the caller owns it.

const BASE_TITLE = document.title;

let titleAlerted = false;

function restoreTitle() {
  if (!titleAlerted) return;
  document.title = BASE_TITLE;
  titleAlerted = false;
}

// An alert for a turn you have already taken is worse than none, so it goes as
// soon as you look at the page or the turn moves on.
export function clear() {
  restoreTitle();
}

function vibrate() {
  try {
    // One short tick, not a pattern — a nudge rather than an alarm.
    if (navigator.vibrate) navigator.vibrate(35);
  } catch { /* unsupported or blocked — the pill still shows */ }
}

/** Fire the out-of-page layers. The caller decides when it is your turn. */
export function turnAlert() {
  vibrate();

  // Only mark the title when the page is not being looked at. Doing it while
  // the tab is focused would just be noise on top of the pill.
  if (!document.hidden) return;
  titleAlerted = true;
  document.title = `● Your turn — ${BASE_TITLE}`;
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clear();
});
window.addEventListener('focus', clear);
