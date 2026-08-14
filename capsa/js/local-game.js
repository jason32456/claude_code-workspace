// A solo game against bots, running entirely in the tab.
//
// Exposes the same surface as the networked session (view / play / pass /
// nextHand / subscribe / leave) so the table UI is identical either way, and
// so the game stays fully playable when there is no server at all.

import { createRoom, startHand, applyPlay, applyPass, redact, resetScores } from './engine.js';
import { chooseMove, thinkDelay, botName } from './bot.js';

const YOU = 0;

export function createLocalSession({ difficulty = 'sharp', name = 'You', mode } = {}) {
  const seed = (Math.random() * 2 ** 31) | 0;
  const room = createRoom('SOLO', seed);
  if (mode) room.mode = mode;
  const listeners = new Set();
  let timer = null;
  let alive = true;

  room.seats[YOU].kind = 'human';
  room.seats[YOU].name = name || 'You';
  room.seats[YOU].id = 'local';
  for (let i = 1; i < 4; i++) {
    room.seats[i].kind = 'bot';
    room.seats[i].difficulty = difficulty;
    room.seats[i].name = botName(seed + i * 977);
  }

  startHand(room, seed);

  const view = () => redact(room, YOU);

  function emit() {
    room.version += 1;
    for (const fn of listeners) fn(view());
  }

  // Drives bot seats. Re-armed after every change; a single pending timer at a
  // time, so a fast human move cannot stack up duplicate bot turns.
  function schedule() {
    clearTimeout(timer);
    if (!alive || room.phase !== 'playing') return;
    const seat = room.seats[room.turn];
    if (seat.kind !== 'bot') return;

    timer = setTimeout(() => {
      if (!alive || room.phase !== 'playing') return;
      const current = room.seats[room.turn];
      if (current.kind !== 'bot') return;

      const move = chooseMove(
        {
          you: room.turn,
          hand: current.hand,
          current: room.current,
          mustInclude: room.mustInclude,
          seats: room.seats.map((s) => ({ index: s.index, handCount: s.hand.length })),
          played: room.played,
        },
        current.difficulty,
      );

      const result = move.pass
        ? applyPass(room, room.turn)
        : applyPlay(room, room.turn, move.cards);

      // A bot should never produce an illegal move; if one slips through,
      // passing keeps the table moving rather than deadlocking it.
      if (!result.ok && room.current) applyPass(room, room.turn);

      emit();
      schedule();
    }, thinkDelay(seat.difficulty));
  }

  schedule();

  return {
    kind: 'local',
    get view() {
      return view();
    },
    play(cards) {
      const result = applyPlay(room, YOU, cards);
      if (result.ok) {
        emit();
        schedule();
      }
      return result;
    },
    pass() {
      const result = applyPass(room, YOU);
      if (result.ok) {
        emit();
        schedule();
      }
      return result;
    },
    nextHand() {
      startHand(room, (Math.random() * 2 ** 31) | 0);
      emit();
      schedule();
      return { ok: true };
    },
    newGame() {
      resetScores(room);
      startHand(room, (Math.random() * 2 ** 31) | 0);
      emit();
      schedule();
      return { ok: true };
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(view());
      return () => listeners.delete(fn);
    },
    leave() {
      alive = false;
      clearTimeout(timer);
      listeners.clear();
    },
  };
}
