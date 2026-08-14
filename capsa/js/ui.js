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
  let lastPileKey = '';
  let lastTrick = 0;
  let lastHandNo = 0;

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

        // Running total, once there is one worth showing.
        if (seat.score !== 0) {
          const score = document.createElement('span');
          score.className = 'opp-score' + (seat.score < 0 ? ' good' : '');
          score.textContent = `${seat.score > 0 ? '+' : ''}${seat.score}`;
          node.append(score);
        }
        return node;
      }),
    );
  }

  /* ── Centre ────────────────────────────────────────────────────────────── */

  // Where a play should fly in from, relative to the seat that made it.
  // Seat order around the table is: you at the bottom, then left, top, right.
  function originFor(seat) {
    const step = (seat - view.you + 4) % 4;
    return ['0px, 130px', '-150px, 0px', '0px, -130px', '150px, 0px'][step];
  }

  const pileKey = (play) => `${play.seat}:${play.cards.join('.')}`;

  // Only the jitter is computed here — the cascade itself lives in CSS, keyed
  // off --depth, so the step can shrink on a phone without JS knowing about
  // breakpoints. Cards are pushed up and to the left as they are buried, which
  // keeps every earlier play's rank corner visible and clear of the label
  // underneath the pile.
  function jitterFor(jitter) {
    return {
      jx: (jitter % 7) - 3,
      jy: (((jitter / 7) | 0) % 7) - 3,
      rot: ((jitter % 15) - 7) * 0.9,
    };
  }

  function buildGroup(play, index) {
    const group = document.createElement('div');
    group.className = 'play-group';
    group.dataset.key = pileKey(play);
    group.dataset.jitter = String((play.seat * 37 + play.cards[0] * 17 + index * 91) % 100);
    group.style.setProperty('--from', originFor(play.seat));
    group.append(...play.cards.map((c) => cardElement(c)));
    return group;
  }

  // Lift the finished trick off the table instead of having it vanish.
  function sweepPile() {
    if (!el.playCards.children.length) return;
    const ghost = document.createElement('div');
    ghost.className = 'play-ghost';
    ghost.append(...el.playCards.children);
    el.playCards.parentElement.append(ghost);
    requestAnimationFrame(() => ghost.classList.add('is-swept'));
    setTimeout(() => ghost.remove(), 620);
  }

  function renderPlayArea() {
    const pile = view.trickPile || [];
    const key = `${view.handNo}|${view.trick}|${pile.map(pileKey).join('/')}`;

    if (key !== lastPileKey) {
      const trickChanged = view.trick !== lastTrick || view.handNo !== lastHandNo;
      if (trickChanged) {
        sweepPile();
        el.playCards.replaceChildren();
      }
      lastTrick = view.trick;
      lastHandNo = view.handNo;
      lastPileKey = key;

      // Append only what is new, so settled cards are not re-animated every
      // time somebody else plays.
      const rendered = [...el.playCards.children];
      const shares = rendered.every((node, i) => pile[i] && node.dataset.key === pileKey(pile[i]));
      if (!shares) el.playCards.replaceChildren();
      const from = el.playCards.children.length;
      for (let i = from; i < pile.length; i++) {
        el.playCards.append(buildGroup(pile[i], i));
      }

      // Depth drives how far each play sits under the one on top of it.
      // Re-laid out on every change: as a new play lands, the ones beneath it
      // slide further out, which is what makes the pile read as a pile.
      // Re-laid out on every change: as a new play lands, the ones beneath it
      // slide further out, which is what makes the pile read as a pile.
      const groups = [...el.playCards.children];
      groups.forEach((node, i) => {
        const depth = groups.length - 1 - i;
        const { jx, jy, rot } = jitterFor(Number(node.dataset.jitter) || 0);
        node.style.setProperty('--depth', String(depth));
        node.style.setProperty('--jx', `${jx}px`);
        node.style.setProperty('--jy', `${jy}px`);
        node.style.setProperty('--jrot', `${rot.toFixed(1)}deg`);
        node.classList.toggle('is-top', depth === 0);
        node.classList.toggle('is-buried', depth >= 4);
      });
    }

    el.playEmpty.hidden = pile.length > 0;

    if (view.current && view.currentSeat !== null) {
      const who = view.seats[view.currentSeat];
      el.playMeta.textContent = `${COMBO_LABEL[view.current.type]} · ${who.index === view.you ? 'you' : who.name}`;
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

      // A fresh deal fans in with a stagger; picking one card back up out of a
      // hand you already hold should not replay the whole animation.
      const isFreshDeal = hand.length === 13;
      el.hand.replaceChildren(
        ...hand.map((card, i) => {
          const node = cardElement(card, { button: true });
          if (isFreshDeal) node.style.setProperty('--deal-delay', `${i * 34}ms`);
          else node.style.animation = 'none';
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
    // clientWidth is the padding box and, unlike getBoundingClientRect, is not
    // inflated by the cards overflowing it — measuring the overflow was what
    // let the fan grow wider than the phone.
    const available = el.hand.clientWidth;
    // While the table is still hidden every measurement is 0, which would pin
    // the hand to maximum overlap and leave it there. Better to wait.
    if (available < 1) return;
    const cardWidth = el.hand.firstElementChild.offsetWidth;
    if (cardWidth < 1) return;
    el.hand.style.setProperty('--overlap', `${overlapFor(count, available, cardWidth)}px`);
  }

  // Any change to the hand's width refits the fan, so a transient measurement
  // during a screen transition or an orientation change cannot leave the cards
  // stuck at the wrong overlap.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => sizeHand()).observe(el.hand);
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
