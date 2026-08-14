// "It's your turn" alerts.
//
// The case that actually matters is the one where you are not looking at the
// page — waiting on three other people, with the tab in the background. So the
// alert works in layers, cheapest and most reliable first:
//
//   1. the tab title, which needs no permission and is visible in any browser
//   2. vibration on a phone, where the tab title is not visible at all
//   3. a system notification, which is the only layer that needs asking for
//
// The on-screen banner is handled by the caller, since it belongs to the table.

const BASE_TITLE = document.title;
const TAG = 'capsa-turn';

let titleAlerted = false;
let live = null;

export const supported = () => typeof Notification !== 'undefined';

export function permission() {
  if (!supported()) return 'unsupported';
  return Notification.permission;
}

// Must be called from a user gesture — browsers reject it otherwise, and
// Safari only accepts the callback form.
export async function requestPermission() {
  if (!supported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function restoreTitle() {
  if (!titleAlerted) return;
  document.title = BASE_TITLE;
  titleAlerted = false;
}

// A notification for a turn you have already taken is worse than none, so it
// is dismissed as soon as you look at the page or the turn moves on.
export function clear() {
  restoreTitle();
  if (live) {
    try { live.close(); } catch { /* already gone */ }
    live = null;
  }
}

function vibrate() {
  try {
    if (navigator.vibrate) navigator.vibrate([90, 60, 90]);
  } catch { /* unsupported or blocked — the other layers still fire */ }
}

function systemNotification(roomCode) {
  if (!supported() || Notification.permission !== 'granted') return;
  try {
    live = new Notification('Your turn', {
      body: roomCode ? `Capsa · room ${roomCode}` : 'Capsa',
      tag: TAG,
      renotify: true,
      silent: false,
    });
    live.onclick = () => {
      window.focus();
      clear();
    };
  } catch { /* some browsers require a service worker; the title still changed */ }
}

/**
 * Fire the out-of-page layers. The caller decides when it is your turn.
 * @param {{roomCode?: string|null}} options
 */
export function turnAlert({ roomCode = null } = {}) {
  vibrate();

  // Only shout when the page is not being looked at. Doing this while the tab
  // is focused would just be noise on top of the banner.
  if (!document.hidden) return;
  titleAlerted = true;
  document.title = `🔔 Your turn — ${BASE_TITLE}`;
  systemNotification(roomCode);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clear();
});
window.addEventListener('focus', clear);
