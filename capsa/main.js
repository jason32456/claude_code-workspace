// App shell: menu, session lifecycle, overlays.

import { handPenalty } from './js/engine.js';
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

const $ = (id) => document.getElementById(id);

const el = {
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
let resultShownFor = -1;

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
  el.menu.classList.toggle('is-active', name === 'menu');
  el.table.classList.toggle('is-active', name === 'table');
}

const table = createTable(el, {
  onPlay: async (cards) => {
    const result = await session.play(cards);
    if (!result.ok) toast(result.error);
    else table.clearSelection();
  },
  onPass: async () => {
    const result = await session.pass();
    if (!result.ok) toast(result.error);
  },
  onToast: toast,
});

/* ── Result overlay ──────────────────────────────────────────────────────── */

function renderResult(view) {
  $('result-title').textContent =
    view.winner === view.you ? 'You win the hand' : `${view.seats[view.winner].name} wins the hand`;

  const pot = view.seats.reduce(
    (sum, s) => (s.index === view.winner ? sum : sum + handPenalty(s.handCount)),
    0,
  );

  $('result-rows').replaceChildren(
    ...view.seats.map((seat) => {
      const delta = seat.index === view.winner ? -pot : handPenalty(seat.handCount);
      const row = document.createElement('tr');
      if (seat.index === view.winner) row.className = 'is-winner';

      const name = document.createElement('td');
      name.className = 'sb-name';
      name.textContent = seat.index === view.you ? 'You' : seat.name;

      const cards = document.createElement('td');
      cards.className = 'sb-cards';
      cards.textContent = seat.handCount === 0 ? 'went out' : `${seat.handCount} left`;

      const score = document.createElement('td');
      score.className = 'sb-delta' + (delta < 0 ? ' good' : '');
      score.textContent = `${delta > 0 ? '+' : ''}${delta}`;

      const total = document.createElement('td');
      total.className = 'sb-cards';
      total.textContent = `total ${seat.score}`;

      row.append(name, cards, score, total);
      return row;
    }),
  );

  $('overlay-result').hidden = false;
}

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
    table.render(view);

    if (view.phase === 'done' && resultShownFor !== view.handNo) {
      resultShownFor = view.handNo;
      setTimeout(() => renderResult(view), 700);
    }
  });

  if (session.onError) {
    session.onError(() => toast('Lost contact with the server — retrying'));
  }

  requestAnimationFrame(() => table.resize());
}

function detach() {
  if (unsubscribe) unsubscribe();
  if (session) session.leave();
  session = null;
  unsubscribe = null;
  $('overlay-result').hidden = true;
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

$('btn-solo').addEventListener('click', () => {
  attach(createLocalSession({ difficulty, name: soloName() }));
});

function playerName() {
  return $('name-input').value.trim();
}

// "You" is how the local seat is labelled; sending it to a room would show
// every other player an opponent called "You".
const soloName = () => playerName() || 'You';
const onlineName = () => playerName() || 'Player';

/* ── Online ──────────────────────────────────────────────────────────────── */

let serverAvailable = false;

async function initOnline() {
  const { online, store } = await probeServer();
  serverAvailable = online;
  $('btn-create').disabled = !online;
  $('btn-join').disabled = !online;

  if (!online) {
    $('online-status').textContent =
      'No server behind this page — online rooms need the Vercel API. Solo play works offline.';
    return;
  }
  $('online-status').textContent =
    store === 'redis'
      ? 'Create a room, then share the code. Empty seats play as bots until someone takes them.'
      : 'Server is up, but has no shared store — rooms will not survive across devices. Add Upstash Redis to enable that.';
}

async function enterRoom(promise, label) {
  const button = label === 'create' ? $('btn-create') : $('btn-join');
  button.disabled = true;
  try {
    const seat = await promise;
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

// A room code in the URL (?room=ABCD) joins straight away — this is what gets
// shared, so it has to work from a cold load.
async function joinFromUrl() {
  const code = new URLSearchParams(location.search).get('room');
  if (!code) return false;
  const clean = code.trim().toUpperCase();
  if (clean.length !== 4) return false;

  document.querySelector('.tab[data-tab="online"]').click();
  $('code-input').value = clean;
  if (!serverAvailable) return false;
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

$('room-tag').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${el.roomTag.textContent}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Capsa', url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Invite link copied');
    }
  } catch { /* the user dismissed the share sheet */ }
});

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

/* ── Boot ────────────────────────────────────────────────────────────────── */

$('difficulty-blurb').textContent = DIFFICULTY_BLURB[difficulty];

// Reclaim a seat after an accidental refresh rather than stranding it as a bot.
const previous = recallSeat();

initOnline().then(async () => {
  if (await joinFromUrl()) return;
  if (previous && serverAvailable) {
    try {
      attach(createNetSession(previous), { code: previous.code });
      toast(`Rejoined room ${previous.code}`);
    } catch {
      forgetSeat();
    }
  }
});
