// Table rendering and selection.
//
// Given a redacted view it draws the table; it never mutates game state and
// never talks to the network. Everything it needs to judge a selection comes
// from the shared engine, so the button label and the server agree.

import {
  COMBO_LABEL,
  detectCombo,
  explainInvalid,
  legalPlays,
  cardLabel,
} from './engine.js';
import { hintMove } from './bot.js';
import { cardElement, overlapFor } from './cards.js';

export function createTable(el, handlers) {
  let view = null;
  let selected = new Set();
  let hinted = new Set();
  let lastHandKey = '';
  let lastPlayKey = '';

  const isYourTurn = () =>
    view && view.phase === 'playing' && view.turn === view.you;

  /* ── Opponents ─────────────────────────────────────────────────────────── */

  function renderOpponents() {
    // Clockwise from you: left, across, right.
    const order = [1, 2, 3].map((step) => view.seats[(view.you + step) % 4]);
    el.opponents.replaceChildren(
      ...order.map((seat) => {
        const node = document.createElement('div');
        node.className = 'opp';
        if (view.phase === 'playing' && view.turn === seat.index) node.classList.add('is-turn');
        if (seat.passed) node.classList.add('is-passed');
        if (seat.away) node.classList.add('is-away');

        if (view.currentSeat === seat.index && view.currentCards.length) {
          const badge = document.createElement('span');
          badge.className = 'opp-badge play';
          badge.textContent = COMBO_LABEL[view.current.type];
          node.append(badge);
        } else if (seat.passed) {
          const badge = document.createElement('span');
          badge.className = 'opp-badge pass';
          badge.textContent = 'Passed';
          node.append(badge);
        }

        const name = document.createElement('span');
        name.className = 'opp-name';
        name.textContent = seat.name;

        const sub = document.createElement('span');
        sub.className = 'opp-sub';
        sub.textContent = seat.kind === 'bot' ? 'bot' : seat.joined ? 'player' : 'empty seat';

        const count = document.createElement('span');
        count.className = 'opp-count';
        count.textContent = String(seat.handCount);

        node.append(name, sub, count);
        return node;
      }),
    );
  }

  /* ── Centre ────────────────────────────────────────────────────────────── */

  function renderPlayArea() {
    const cards = view.currentCards || [];
    const key = cards.join(',');

    // Only rebuild when the played cards actually change. Recreating them on
    // every render would restart the deal-in animation, leaving the table
    // flickering once a second while opponents think.
    if (key !== lastPlayKey) {
      lastPlayKey = key;
      el.playCards.replaceChildren(...cards.map((c) => cardElement(c)));
    }
    el.playEmpty.hidden = cards.length > 0;

    if (cards.length && view.current) {
      const who = view.seats[view.currentSeat];
      el.playMeta.textContent = `${COMBO_LABEL[view.current.type]} · ${who.name}`;
      el.playMeta.hidden = false;
    } else {
      el.playMeta.hidden = true;
      el.playEmpty.textContent =
        view.mustInclude !== null
          ? `Opening lead — must include ${cardLabel(view.mustInclude)}`
          : 'New trick — lead anything';
    }

    el.trickTag.textContent = `Trick ${view.trick}`;
  }

  function renderStatus() {
    if (view.phase === 'lobby') {
      el.status.textContent = 'Waiting for players…';
      return;
    }
    if (view.phase === 'done') {
      const w = view.seats[view.winner];
      el.status.textContent = `${w.index === view.you ? 'You' : w.name} won the hand`;
      return;
    }
    if (isYourTurn()) {
      const invalid = selected.size ? explainInvalid([...selected], view.current) : null;
      el.status.textContent = invalid || (selected.size ? 'Ready' : 'Your turn');
      return;
    }
    const seat = view.seats[view.turn];
    el.status.textContent = `${seat.name} is thinking…`;
  }

  /* ── Hand ──────────────────────────────────────────────────────────────── */

  function renderHand() {
    const hand = view.hand || [];
    const key = hand.join(',');

    if (key !== lastHandKey) {
      lastHandKey = key;
      // Drop selections for cards that are no longer held.
      selected = new Set([...selected].filter((c) => hand.includes(c)));
      hinted.clear();

      el.hand.replaceChildren(
        ...hand.map((card) => {
          const node = cardElement(card, { button: true });
          node.addEventListener('click', () => toggle(card));
          return node;
        }),
      );
    }

    // Re-measured on every render, not just when the cards change, so the
    // first paint after the table becomes visible corrects itself.
    sizeHand();

    // Which cards could take part in a legal answer — a quiet nudge that stops
    // new players hunting through a hand that cannot beat the table.
    const usable = new Set();
    if (isYourTurn() && view.current) {
      for (const play of legalPlays(hand, view.current, view.mustInclude)) {
        for (const c of play.cards) usable.add(c);
      }
    }

    for (const node of el.hand.children) {
      const card = Number(node.dataset.card);
      const on = selected.has(card);
      node.classList.toggle('is-selected', on);
      node.classList.toggle('is-hinted', hinted.has(card));
      node.classList.toggle('is-playable', usable.has(card));
      node.setAttribute('aria-pressed', String(on));
    }
  }

  function sizeHand() {
    const count = el.hand.children.length;
    if (!count) return;
    const available = el.hand.getBoundingClientRect().width;
    // While the table is still hidden every measurement is 0, which would pin
    // the hand to maximum overlap and leave it there. Better to wait.
    if (available < 1) return;
    const cardWidth = el.hand.firstElementChild.getBoundingClientRect().width;
    if (cardWidth < 1) return;
    el.hand.style.setProperty('--overlap', `${overlapFor(count, available, cardWidth)}px`);
  }

  /* ── Actions ───────────────────────────────────────────────────────────── */

  function renderActions() {
    const yours = isYourTurn();
    const cards = [...selected];
    const combo = cards.length ? detectCombo(cards) : null;
    const playable = Boolean(yours && combo && !explainInvalid(cards, view.current));

    el.play.disabled = !playable;
    el.play.textContent = combo && playable ? `Play ${COMBO_LABEL[combo.type]}` : 'Play';

    // You may never pass a trick you are leading — there is nothing to beat.
    el.pass.disabled = !yours || !view.current;
    el.hint.disabled = !yours;
    el.sort.disabled = !view.hand || view.hand.length === 0;

    el.youName.classList.toggle('is-turn', yours);
    const me = view.seats[view.you];
    el.youName.textContent = me.name;
    el.youScore.textContent = `${me.handCount} cards · ${me.score >= 0 ? '+' : ''}${me.score}`;
  }

  /* ── Interaction ───────────────────────────────────────────────────────── */

  function toggle(card) {
    if (!isYourTurn()) return;
    if (selected.has(card)) selected.delete(card);
    else selected.add(card);
    hinted.clear();
    renderHand();
    renderActions();
    renderStatus();
  }

  function showHint() {
    if (!isYourTurn()) return;
    const move = hintMove(view.hand, view.current, view.mustInclude);
    if (!move) {
      handlers.onToast('Nothing beats that — you have to pass');
      return;
    }
    selected = new Set(move.cards);
    hinted = new Set(move.cards);
    renderHand();
    renderActions();
    renderStatus();
  }

  function clearSelection() {
    selected.clear();
    hinted.clear();
  }

  el.play.addEventListener('click', () => {
    if (el.play.disabled) return;
    handlers.onPlay([...selected]);
  });
  el.pass.addEventListener('click', () => {
    if (el.pass.disabled) return;
    clearSelection();
    handlers.onPass();
  });
  el.hint.addEventListener('click', showHint);
  el.sort.addEventListener('click', () => {
    clearSelection();
    renderHand();
    renderActions();
  });

  window.addEventListener('resize', sizeHand);

  // Desktop keyboard control. Ignored while typing in a field.
  window.addEventListener('keydown', (event) => {
    if (!view || event.target.matches('input, textarea')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();

    if (key === 'enter' && !el.play.disabled) { event.preventDefault(); el.play.click(); }
    else if (key === ' ' && !el.pass.disabled) { event.preventDefault(); el.pass.click(); }
    else if (key === 'h') showHint();
    else if (key === 'escape') { clearSelection(); renderHand(); renderActions(); renderStatus(); }
    else if (/^[0-9]$/.test(key)) {
      const index = key === '0' ? 9 : Number(key) - 1;
      const node = el.hand.children[index];
      if (node) toggle(Number(node.dataset.card));
    }
  });

  return {
    resize: sizeHand,
    render(next) {
      view = next;
      if (!view) return;
      renderOpponents();
      renderPlayArea();
      renderHand();
      renderActions();
      renderStatus();
    },
    clearSelection,
    get selection() {
      return [...selected];
    },
  };
}
