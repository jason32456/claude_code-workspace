// App shell: menu, session lifecycle, overlays.

import { handPenalty, MODES, MODE_LABEL, RANK_POINTS, ORDINALS } from './js/engine.js';
import { DIFFICULTY_LABEL } from './js/bot.js';
import { createLocalSession } from './js/local-game.js';
import {
  probeServer,
  createRoom,
  joinRoom,
  createNetSession,
  rememberSeat,
  recallSeat,
  forgetSeat,
} from './js/net-game.js';
import { createTable } from './js/ui.js';
import { login, logout, currentUser, setCredentials, storedToken } from './js/auth.js';
import * as sound from './js/sound.js';
import * as notify from './js/notify.js';

const $ = (id) => document.getElementById(id);

const el = {
  login: $('screen-login'),
  menu: $('screen-menu'),
  table: $('screen-table'),
  opponents: $('opponents'),
  playCards: $('play-cards'),
  playEmpty: $('play-empty'),
  playMeta: $('play-meta'),
  status: $('status-line'),
  trickTag: $('trick-tag'),
  roomTag: $('room-tag'),
  hand: $('hand'),
  youName: $('you-name'),
  youScore: $('you-score'),
  play: $('btn-play'),
  pass: $('btn-pass'),
  hint: $('btn-hint'),
  sort: $('btn-sort'),
};

const DIFFICULTY_BLURB = {
  casual: 'Plays its lowest legal combination and passes when it cannot beat you. A gentle introduction.',
  sharp: "Plays a solid game — holds 2s back and won't break a pair to win a trick it doesn't need.",
  ruthless: 'Weighs every move by the hand it leaves behind, and spends its best card to stop you on your last one.',
};

let session = null;
let unsubscribe = null;
let difficulty = 'sharp';
let lobbyDifficulty = 'sharp';
let soloMode = MODES.FIRST_OUT;
let lobbyMode = MODES.FIRST_OUT;
let resultShownFor = -1;

const MODE_BLURB = {
  firstOut:
    'The hand stops the moment someone sheds their last card. Everyone else scores the cards left in their hand.',
  playToEnd:
    'Going out does not stop the hand — the rest keep playing for 2nd and 3rd, and the player left holding cards comes 4th. Scored by position: 1st −3, 2nd −1, 3rd +1, 4th +3.',
};

/* ── Chrome ──────────────────────────────────────────────────────────────── */

let toastTimer = null;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 2600);
}

function showScreen(name) {
  el.login.classList.toggle('is-active', name === 'login');
  el.menu.classList.toggle('is-active', name === 'menu');
  el.table.classList.toggle('is-active', name === 'table');
}

const table = createTable(el, {
  onPlay: async (cards) => {
    const result = await session.play(cards);
    if (!result.ok) {
      sound.play('invalid');
      toast(result.error);
    } else {
      table.clearSelection();
    }
  },
  onPass: async () => {
    const result = await session.pass();
    if (!result.ok) {
      sound.play('invalid');
      toast(result.error);
    }
  },
  onToast: toast,
  onYourTurn: announceTurn,
  onTurnEnded: retireTurnAlert,
});

/* ── Your turn ───────────────────────────────────────────────────────────── */

let bannerTimer = null;
let turnEndedAt = 0;

function showTurnBanner() {
  const banner = $('turn-banner');
  clearTimeout(bannerTimer);
  banner.classList.remove('is-leaving');
  banner.hidden = false;
  bannerTimer = setTimeout(() => {
    banner.classList.add('is-leaving');
    bannerTimer = setTimeout(() => {
      banner.hidden = true;
      banner.classList.remove('is-leaving');
    }, 280);
  }, 2600);
}

function hideTurnBanner() {
  clearTimeout(bannerTimer);
  $('turn-banner').hidden = true;
  $('turn-banner').classList.remove('is-leaving');
}

function announceTurn() {
  // Title, vibration and the system notification only speak up when the page
  // is in the background — that check lives in notify.js.
  notify.turnAlert({ roomCode: el.roomTag.hidden ? null : el.roomTag.textContent });

  // The banner answers "I was looking but did not notice". Online it always
  // earns its place; solo the turn comes back every few seconds, so it would
  // be noise unless the wait was actually long.
  const waited = turnEndedAt ? Date.now() - turnEndedAt : Infinity;
  if ((session && session.kind === 'net') || waited > 4000 || document.hidden) {
    showTurnBanner();
  }
}

function retireTurnAlert() {
  turnEndedAt = Date.now();
  hideTurnBanner();
  notify.clear();
}

/* ── Result overlay ──────────────────────────────────────────────────────── */

function renderResult(view) {
  const playToEnd = view.mode === MODES.PLAY_TO_END;
  const me = view.seats[view.you];

  $('result-title').textContent = playToEnd && me.rank
    ? `You finished ${ORDINALS[me.rank - 1]}`
    : view.winner === view.you
      ? 'You win the hand'
      : `${view.seats[view.winner].name} wins the hand`;

  // In play-to-the-end the deltas come from the finishing order; otherwise from
  // the cards left behind. Both are reproduced here from the same rules the
  // engine used, so the sheet always adds up to zero.
  const pot = view.seats.reduce(
    (sum, s) => (s.index === view.winner ? sum : sum + handPenalty(s.handCount)),
    0,
  );
  const deltaFor = (seat) => {
    if (playToEnd) return RANK_POINTS[view.finishOrder.indexOf(seat.index)] ?? 0;
    return seat.index === view.winner ? -pot : handPenalty(seat.handCount);
  };

  // Ranked order when we have one, otherwise seat order.
  const rows = playToEnd && view.finishOrder.length === 4
    ? view.finishOrder.map((i) => view.seats[i])
    : view.seats;

  $('result-rows').replaceChildren(
    ...rows.map((seat) => {
      const delta = deltaFor(seat);
      const row = document.createElement('tr');
      if (seat.index === view.winner) row.className = 'is-winner';

      const name = document.createElement('td');
      name.className = 'sb-name';
      name.textContent = seat.index === view.you ? 'You' : seat.name;

      const place = document.createElement('td');
      place.className = 'sb-rank';
      place.textContent = playToEnd && seat.rank ? ORDINALS[seat.rank - 1] : '';

      const cards = document.createElement('td');
      cards.className = 'sb-cards';
      cards.textContent = seat.handCount === 0 ? 'went out' : `${seat.handCount} left`;

      const score = document.createElement('td');
      score.className = 'sb-delta' + (delta < 0 ? ' good' : '');
      score.textContent = `${delta > 0 ? '+' : ''}${delta}`;

      const total = document.createElement('td');
      total.className = 'sb-cards';
      total.textContent = `total ${seat.score}`;

      row.append(name, place, cards, score, total);
      return row;
    }),
  );

  const isHost = view.you === view.hostSeat;
  $('btn-next-hand').hidden = !isHost;
  $('btn-new-game').hidden = !isHost;
  $('result-wait').hidden = isHost;
  if (!isHost) {
    $('result-wait').textContent = `Waiting for ${view.seats[view.hostSeat].name} to deal…`;
  }

  $('overlay-result').hidden = false;
}

/* ── Scoreboard ──────────────────────────────────────────────────────────── */

let latestView = null;

function renderScores(view) {
  const best = Math.min(...view.seats.map((s) => s.score));
  const label = (seat) => (seat.index === view.you ? 'You' : seat.name);

  // Count finished hands, not dealt ones — a hand in progress has not scored.
  const played = (view.history || []).length;
  $('scores-sub').textContent =
    played > 0
      ? `${played} hand${played === 1 ? '' : 's'} played · lowest total wins.`
      : 'No hands finished yet · lowest total wins.';

  $('scores-totals').replaceChildren(
    ...[...view.seats]
      .sort((a, b) => a.score - b.score)
      .map((seat) => {
        const row = document.createElement('tr');
        if (seat.score === best && played > 0) row.className = 'is-leader';

        const name = document.createElement('td');
        name.className = 'sb-name';
        name.textContent = label(seat);

        const kind = document.createElement('td');
        kind.className = 'sb-cards';
        kind.textContent = seat.kind === 'bot' ? 'bot' : '';

        const total = document.createElement('td');
        total.className = 'sb-delta' + (seat.score < 0 ? ' good' : '');
        total.textContent = `${seat.score > 0 ? '+' : ''}${seat.score}`;

        row.append(name, kind, total);
        return row;
      }),
  );

  const history = view.history || [];
  $('history-empty').hidden = history.length > 0;

  const head = document.createElement('tr');
  const corner = document.createElement('th');
  corner.textContent = 'Hand';
  head.append(corner);
  for (const seat of view.seats) {
    const th = document.createElement('th');
    th.textContent = label(seat);
    head.append(th);
  }
  $('history-head').replaceWith(head);
  head.id = 'history-head';

  $('history-rows').replaceChildren(
    ...history
      .slice()
      .reverse()
      .map((entry) => {
        const row = document.createElement('tr');
        const n = document.createElement('td');
        n.textContent = `#${entry.hand}`;
        row.append(n);
        for (const seat of view.seats) {
          const td = document.createElement('td');
          const delta = entry.deltas[seat.index];
          td.textContent = `${delta > 0 ? '+' : ''}${delta}`;
          if (entry.winner === seat.index) td.className = 'win';
          row.append(td);
        }
        return row;
      }),
  );

  // Only the host may reset an online match.
  $('btn-scores-new').hidden = view.you !== view.hostSeat;
  $('overlay-scores').hidden = false;
}

/* ── Lobby ───────────────────────────────────────────────────────────────── */

function renderLobby(view) {
  const isHost = view.you === view.hostSeat;
  $('lobby-code').textContent = view.code;

  $('seat-list').replaceChildren(
    ...view.seats.map((seat) => {
      const row = document.createElement('li');
      row.className = 'seat-row';
      if (seat.kind === 'empty') row.classList.add('is-empty');
      if (seat.index === view.you) row.classList.add('is-you');

      const name = document.createElement('span');
      name.className = 'seat-row-name';
      name.textContent =
        seat.index === view.you ? `${seat.name} (you)`
          : seat.kind === 'empty' ? 'Waiting for a player…'
          : seat.name;

      row.append(name);

      if (seat.index === view.hostSeat) {
        const tag = document.createElement('span');
        tag.className = 'seat-row-tag host';
        tag.textContent = 'Host';
        row.append(tag);
      }
      if (seat.kind === 'empty') {
        const tag = document.createElement('span');
        tag.className = 'seat-row-tag';
        tag.textContent = 'Empty';
        row.append(tag);
      }
      return row;
    }),
  );

  // Only the host gets the controls; everyone else is told what is happening.
  $('lobby-host').hidden = !isHost;
  $('lobby-wait').hidden = isHost;
  if (!isHost) {
    const host = view.seats[view.hostSeat];
    $('lobby-wait').textContent = `Waiting for ${host.name} to start…`;
  }

  // The rule set is stored on the room, so everyone sees what they are about
  // to play, not just the host who chose it.
  lobbyMode = view.mode || MODES.FIRST_OUT;
  for (const pill of document.querySelectorAll('#lobby-mode .pill')) {
    pill.classList.toggle('is-active', pill.dataset.mode === lobbyMode);
  }
  $('lobby-mode-note').innerHTML = '';
  $('lobby-mode-note').append('Rules: ', Object.assign(document.createElement('strong'), {
    textContent: MODE_LABEL[lobbyMode],
  }));

  // Waiting in the lobby is the natural moment to offer this: there is time to
  // read it, and the click is the user gesture the permission prompt needs.
  const canAsk = notify.supported() && notify.permission() === 'default';
  $('btn-enable-alerts').hidden = !canAsk;

  $('overlay-lobby').hidden = false;
}

$('btn-enable-alerts').addEventListener('click', async () => {
  const result = await notify.requestPermission();
  $('btn-enable-alerts').hidden = true;
  if (result === 'granted') toast("You'll be alerted when it's your turn");
  else if (result === 'denied') toast('Alerts blocked — the tab title still changes');
});

/* ── Session lifecycle ───────────────────────────────────────────────────── */

function attach(next, { code = null } = {}) {
  detach();
  session = next;
  resultShownFor = -1;

  el.roomTag.hidden = !code;
  if (code) el.roomTag.textContent = code;

  // Show the table before the first render: the hand cannot measure itself for
  // fanning while its container is still display:none.
  showScreen('table');

  unsubscribe = session.subscribe((view) => {
    if (!view) return;
    const scoreChanged = latestView && latestView.seats[view.you].score !== view.seats[view.you].score;
    latestView = view;
    table.render(view);
    if (scoreChanged) {
      el.youScore.classList.remove('is-bumped');
      void el.youScore.offsetWidth; // restart the animation
      el.youScore.classList.add('is-bumped');
    }
    if (!$('overlay-scores').hidden) renderScores(view);

    if (view.phase === 'lobby') {
      renderLobby(view);
      return;
    }
    $('overlay-lobby').hidden = true;

    if (view.phase === 'done' && resultShownFor !== view.handNo) {
      resultShownFor = view.handNo;
      setTimeout(() => renderResult(view), 700);
    }
  });

  if (session.onError) {
    session.onError(() => toast('Lost contact with the server — retrying'));
  }

  // Terminal failures land here rather than in onError, so the player gets an
  // explanation and a way out instead of a toast that repeats forever.
  if (session.onGone) {
    session.onGone(async (err) => {
      const signedOut = err.status === 401;
      detach();
      forgetSeat();
      if (signedOut) {
        await logout().catch(() => {});
        showScreen('login');
        $('login-note').textContent = 'Your session expired — sign in again to keep playing.';
        $('login-user').focus();
      } else {
        showScreen('menu');
        toast(err.message || 'That room is no longer available');
        initOnline();
      }
    });
  }

  requestAnimationFrame(() => table.resize());
}

function detach() {
  if (unsubscribe) unsubscribe();
  if (session) session.leave();
  session = null;
  unsubscribe = null;
  $('overlay-result').hidden = true;
  $('overlay-lobby').hidden = true;
  $('overlay-scores').hidden = true;
  hideTurnBanner();
  notify.clear();
  turnEndedAt = 0;
  latestView = null;
}

/* ── Menu ────────────────────────────────────────────────────────────────── */

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const other of document.querySelectorAll('.tab')) {
      const on = other === tab;
      other.classList.toggle('is-active', on);
      other.setAttribute('aria-selected', String(on));
    }
    for (const panel of document.querySelectorAll('.panel')) {
      panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.tab);
    }
  });
}

for (const pill of document.querySelectorAll('#difficulty-group .pill')) {
  pill.addEventListener('click', () => {
    difficulty = pill.dataset.difficulty;
    for (const other of document.querySelectorAll('#difficulty-group .pill')) {
      other.classList.toggle('is-active', other === pill);
    }
    $('difficulty-blurb').textContent = DIFFICULTY_BLURB[difficulty];
  });
}

for (const pill of document.querySelectorAll('#mode-group .pill')) {
  pill.addEventListener('click', () => {
    soloMode = pill.dataset.mode;
    for (const other of document.querySelectorAll('#mode-group .pill')) {
      other.classList.toggle('is-active', other === pill);
    }
    $('mode-blurb').textContent = MODE_BLURB[soloMode];
  });
}

$('btn-solo').addEventListener('click', () => {
  attach(createLocalSession({ difficulty, name: soloName(), mode: soloMode }));
});

const NAME_KEY = 'capsa:name';

function playerName() {
  return $('name-input').value.trim();
}

// Remembered across visits so an invite link can seat you straight away
// instead of asking for a name every time.
function rememberName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
  } catch { /* private mode — the name just won't persist */ }
}

function recallName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

// "You" is how the local seat is labelled; sending it to a room would show
// every other player an opponent called "You".
const soloName = () => playerName() || 'You';
const onlineName = () => playerName() || 'Player';

/* ── Online ──────────────────────────────────────────────────────────────── */

let serverAvailable = false;

async function initOnline() {
  const { online, store } = await probeServer();

  // A deploy with no shared store is worse than no server at all. Each
  // serverless instance keeps its own copy of everything, so a room and a
  // session created on one instance simply do not exist on the next — and
  // roughly every request that lands elsewhere is rejected. That presents as a
  // flaky connection, so name the real cause rather than let people chase it.
  serverAvailable = online && store === 'redis';
  $('btn-create').disabled = !serverAvailable;
  $('btn-join').disabled = !serverAvailable;

  if (!online) {
    $('online-status').textContent =
      'No server behind this page — online rooms need the Vercel API. Solo play works offline.';
    return;
  }
  if (store !== 'redis') {
    $('online-status').textContent =
      'Server is up but has no shared store, so online rooms cannot work — set '
      + 'KV_REST_API_URL and KV_REST_API_TOKEN on the deployment, then redeploy. '
      + 'Solo play against bots works in the meantime.';
    return;
  }
  $('online-status').textContent =
    'Create a room, then share the code. Empty seats play as bots until someone takes them.';
}

async function enterRoom(promise, label) {
  const button = label === 'create' ? $('btn-create') : $('btn-join');
  button.disabled = true;
  try {
    const seat = await promise;
    rememberName(playerName());
    rememberSeat(seat);
    attach(createNetSession(seat), { code: seat.code });
    if (label === 'create') toast(`Room ${seat.code} — share the code`);
  } catch (err) {
    toast(err.message || 'Could not reach the room');
  } finally {
    button.disabled = !serverAvailable;
  }
}

$('btn-create').addEventListener('click', () => {
  enterRoom(createRoom(onlineName()), 'create');
});

$('btn-join').addEventListener('click', () => {
  const code = $('code-input').value.trim().toUpperCase();
  if (code.length !== 4) {
    toast('Room codes are 4 letters');
    return;
  }
  enterRoom(joinRoom(code, onlineName()), 'join');
});

$('code-input').addEventListener('input', (event) => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, '');
});

$('code-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('btn-join').click();
});

// A room code in the URL (?room=ABCD) is what gets shared, so it has to work
// from a cold load. It only seats you automatically once we know your name —
// otherwise a room fills up with players all called "Player".
async function joinFromUrl() {
  const code = new URLSearchParams(location.search).get('room');
  if (!code) return false;
  const clean = code.trim().toUpperCase();
  if (clean.length !== 4) return false;

  document.querySelector('.tab[data-tab="online"]').click();
  $('code-input').value = clean;
  if (!serverAvailable) return false;

  if (!playerName()) {
    $('name-input').focus();
    $('online-status').textContent = `Enter a name to join room ${clean}.`;
    return true;
  }
  await enterRoom(joinRoom(clean, onlineName()), 'join');
  return true;
}

/* ── Table chrome ────────────────────────────────────────────────────────── */

function leaveGame() {
  detach();
  forgetSeat();
  showScreen('menu');
}

$('btn-leave').addEventListener('click', leaveGame);
$('btn-result-leave').addEventListener('click', leaveGame);

$('btn-next-hand').addEventListener('click', async () => {
  $('overlay-result').hidden = true;
  const result = await session.nextHand();
  if (result && !result.ok) toast(result.error);
});

async function startNewGame() {
  $('overlay-result').hidden = true;
  $('overlay-scores').hidden = true;
  const result = await session.newGame();
  if (result && !result.ok) toast(result.error);
  else toast('New game — scores reset');
}

$('btn-new-game').addEventListener('click', startNewGame);
$('btn-scores-new').addEventListener('click', startNewGame);

$('btn-scores').addEventListener('click', () => {
  if (latestView) renderScores(latestView);
});
$('btn-scores-close').addEventListener('click', () => {
  $('overlay-scores').hidden = true;
});
$('overlay-scores').addEventListener('click', (event) => {
  if (event.target === $('overlay-scores')) $('overlay-scores').hidden = true;
});

for (const pill of document.querySelectorAll('#lobby-difficulty .pill')) {
  pill.addEventListener('click', () => {
    lobbyDifficulty = pill.dataset.difficulty;
    for (const other of document.querySelectorAll('#lobby-difficulty .pill')) {
      other.classList.toggle('is-active', other === pill);
    }
  });
}

for (const pill of document.querySelectorAll('#lobby-mode .pill')) {
  pill.addEventListener('click', async () => {
    lobbyMode = pill.dataset.mode;
    for (const other of document.querySelectorAll('#lobby-mode .pill')) {
      other.classList.toggle('is-active', other === pill);
    }
    if (session && session.setMode) {
      const result = await session.setMode(lobbyMode);
      if (result && !result.ok) toast(result.error);
    }
  });
}

$('btn-start').addEventListener('click', async () => {
  $('btn-start').disabled = true;
  const result = await session.start(lobbyDifficulty, lobbyMode);
  $('btn-start').disabled = false;
  if (result && !result.ok) toast(result.error);
});

$('btn-lobby-leave').addEventListener('click', leaveGame);
$('lobby-code').addEventListener('click', shareInvite);

$('room-tag').addEventListener('click', shareInvite);

async function shareInvite() {
  const url = `${location.origin}${location.pathname}?room=${el.roomTag.textContent}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Capsa', url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Invite link copied');
    }
  } catch { /* the user dismissed the share sheet */ }
}

for (const id of ['btn-rules', 'btn-rules-2']) {
  $(id).addEventListener('click', () => {
    $('overlay-rules').hidden = false;
  });
}
$('btn-rules-close').addEventListener('click', () => {
  $('overlay-rules').hidden = true;
});
$('overlay-rules').addEventListener('click', (event) => {
  if (event.target === $('overlay-rules')) $('overlay-rules').hidden = true;
});

/* ── Sign in ─────────────────────────────────────────────────────────────── */

let account = null;

function showLoginError(message) {
  const node = $('login-error');
  node.textContent = message;
  node.hidden = !message;
}

function enterApp(user) {
  account = user;
  $('signed-as').innerHTML = '';
  const who = document.createElement('strong');
  who.textContent = user.username;
  $('signed-as').append('signed in as ', who);
  $('btn-admin').hidden = user.role !== 'admin';
  showLoginError('');
  showScreen('menu');
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('btn-login');
  button.disabled = true;
  showLoginError('');
  try {
    const user = await login($('login-user').value.trim(), $('login-pass').value);
    $('login-pass').value = '';
    enterApp(user);
    await afterSignIn();
  } catch (err) {
    showLoginError(err.message || 'Could not sign in');
  } finally {
    button.disabled = false;
  }
});

$('btn-logout').addEventListener('click', async () => {
  detach();
  await logout();
  account = null;
  $('login-user').value = '';
  $('login-pass').value = '';
  showScreen('login');
});

/* ── Admin ───────────────────────────────────────────────────────────────── */

function adminMessage(error, ok) {
  $('admin-error').textContent = error || '';
  $('admin-error').hidden = !error;
  $('admin-ok').textContent = ok || '';
  $('admin-ok').hidden = !ok;
}

async function openAdmin() {
  adminMessage('', '');
  const user = await currentUser();
  if (user) {
    $('admin-player-user').value = user.playerUsername || '';
    $('admin-self-user').value = user.adminUsername || '';
  }
  $('admin-player-pass').value = '';
  $('admin-self-pass').value = '';
  $('overlay-admin').hidden = false;
}

async function saveCredentials(target, userField, passField) {
  adminMessage('', '');
  try {
    const result = await setCredentials(target, $(userField).value.trim(), $(passField).value);
    $(passField).value = '';
    const what = target === 'admin' ? 'Admin' : 'Player';
    adminMessage(
      '',
      result.passwordChanged
        ? `${what} username and password updated.`
        : `${what} username updated.`,
    );
    if (target === 'admin' && account) {
      account.username = result.username;
      enterApp(account);
    }
  } catch (err) {
    adminMessage(err.message || 'Could not save', '');
  }
}

$('btn-admin').addEventListener('click', openAdmin);
$('btn-admin-close').addEventListener('click', () => {
  $('overlay-admin').hidden = true;
});
$('overlay-admin').addEventListener('click', (event) => {
  if (event.target === $('overlay-admin')) $('overlay-admin').hidden = true;
});
$('admin-player-form').addEventListener('submit', (event) => {
  event.preventDefault();
  saveCredentials('player', 'admin-player-user', 'admin-player-pass');
});
$('admin-self-form').addEventListener('submit', (event) => {
  event.preventDefault();
  saveCredentials('admin', 'admin-self-user', 'admin-self-pass');
});

/* ── Sound ───────────────────────────────────────────────────────────────── */

function paintSoundButton() {
  const on = sound.isEnabled();
  $('btn-sound').textContent = on ? '🔊' : '🔇';
  $('btn-sound').setAttribute('aria-pressed', String(on));
  $('btn-sound').setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
}

$('btn-sound').addEventListener('click', () => {
  sound.toggle();
  paintSoundButton();
});

// Audio is blocked until the page has been interacted with, so the first press
// anywhere — signing in, dealing — is what starts it.
sound.unlockOnFirstGesture();
paintSoundButton();

/* ── Boot ────────────────────────────────────────────────────────────────── */

$('difficulty-blurb').textContent = DIFFICULTY_BLURB[difficulty];
$('name-input').value = recallName();

// Reclaim a seat after an accidental refresh rather than stranding it as a bot.
const previous = recallSeat();

async function afterSignIn() {
  await initOnline();
  if (await joinFromUrl()) return;
  if (previous && serverAvailable) {
    try {
      attach(createNetSession(previous), { code: previous.code });
      toast(`Rejoined room ${previous.code}`);
    } catch {
      forgetSeat();
    }
  }
}

(async function boot() {
  const { online } = await probeServer();

  // With no API there is nothing that can check a password, and nothing worth
  // protecting either — the only thing available is a local game against bots.
  // Pretending to authenticate here would be theatre, so say so instead.
  if (!online) {
    $('login-note').textContent =
      'No server behind this page, so sign-in is unavailable. Solo play against bots works offline; online rooms need the deployed API.';
    $('login-form').hidden = true;
    const skip = document.createElement('button');
    skip.className = 'btn btn-primary';
    skip.textContent = 'Play solo offline';
    skip.addEventListener('click', () => {
      $('btn-logout').hidden = true;
      $('signed-as').textContent = 'offline';
      showScreen('menu');
      initOnline();
    });
    $('login-form').after(skip);
    return;
  }

  const user = storedToken() ? await currentUser() : null;
  if (user) {
    enterApp(user);
    await afterSignIn();
    return;
  }
  showScreen('login');
  $('login-user').focus();
})();
