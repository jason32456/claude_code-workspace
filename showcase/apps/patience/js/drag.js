import { canPlaceOnFoundation, canPlaceOnTableau, isValidRun } from './game.js';
import { FACE_UP_OFFSET, flashInvalid } from './render.js';

// Pointer-based drag & drop (mouse + touch) for single cards and tableau
// runs. Dragging manipulates a floating clone ("ghost") that tracks the
// pointer; the real pile DOM is only rebuilt (via `refresh`) once the drag
// ends, so an in-progress drag never fights a re-render.
export function initDragAndDrop({ boardEl, engine, onMove, onAutoMove, refresh, playSound }) {
  let session = null;

  function pileElsOf(zone) {
    return boardEl.querySelectorAll(`[data-zone="${zone}"]`);
  }

  function clearDropHighlights() {
    boardEl.querySelectorAll('.drop-target-valid, .drop-target-invalid').forEach((el) => {
      el.classList.remove('drop-target-valid', 'drop-target-invalid');
    });
  }

  function findDropZone(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const zoneEl = el.closest('[data-zone="tableau"], [data-zone="foundation"]');
    return zoneEl;
  }

  function checkValidity(zoneEl) {
    if (!session || !zoneEl) return false;
    const first = session.run[0];
    const zone = zoneEl.dataset.zone;
    if (zone === session.sourceZone && Number(zoneEl.dataset.pile) === session.sourcePile) return false;
    if (zone === 'tableau') {
      const pile = engine.state.tableau[Number(zoneEl.dataset.pile)];
      return canPlaceOnTableau(first, pile);
    }
    if (zone === 'foundation') {
      if (session.run.length !== 1) return false;
      const suit = zoneEl.dataset.suit;
      if (suit !== first.suit) return false;
      return canPlaceOnFoundation(first, engine.state.foundations[suit]);
    }
    return false;
  }

  function endSession(dropZoneEl) {
    clearDropHighlights();
    if (session.ghost) session.ghost.remove();
    session.elements.forEach((el) => el.classList.remove('dragging'));

    let moved = false;
    if (dropZoneEl && checkValidity(dropZoneEl)) {
      const zone = dropZoneEl.dataset.zone;
      if (session.sourceZone === 'tableau' && zone === 'tableau') {
        moved = onMove({ type: 'tableau-tableau', from: session.sourcePile, cardIndex: session.cardIndex, to: Number(dropZoneEl.dataset.pile) });
      } else if (session.sourceZone === 'tableau' && zone === 'foundation') {
        moved = onMove({ type: 'tableau-foundation', pile: session.sourcePile });
      } else if (session.sourceZone === 'waste' && zone === 'tableau') {
        moved = onMove({ type: 'waste-tableau', to: Number(dropZoneEl.dataset.pile) });
      } else if (session.sourceZone === 'waste' && zone === 'foundation') {
        moved = onMove({ type: 'waste-foundation' });
      } else if (session.sourceZone === 'foundation' && zone === 'tableau') {
        moved = onMove({ type: 'foundation-tableau', suit: session.sourceSuit, to: Number(dropZoneEl.dataset.pile) });
      }
      if (!moved) {
        playSound('invalid');
        flashInvalid(dropZoneEl);
      }
    } else if (dropZoneEl) {
      // Hovered a real pile that turned out illegal (as opposed to just
      // releasing back over the source with no real drag attempt).
      const isSourcePile =
        dropZoneEl.dataset.zone === session.sourceZone &&
        Number(dropZoneEl.dataset.pile || -1) === session.sourcePile;
      if (!isSourcePile) {
        playSound('invalid');
        flashInvalid(dropZoneEl);
      }
    }

    session = null;
    refresh();
  }

  boardEl.addEventListener('pointerdown', (e) => {
    const cardEl = e.target.closest('.card');
    if (!cardEl || cardEl.classList.contains('not-draggable') || !cardEl.classList.contains('face-up')) return;
    const zone = cardEl.dataset.zone;
    if (zone === 'stock') return;
    const cardIndex = Number(cardEl.dataset.cardIndex);
    const state = engine.state;
    let run = null;
    let sourcePile = null;
    let sourceSuit = null;
    let containerEl = null;

    if (zone === 'tableau') {
      sourcePile = Number(cardEl.dataset.pile);
      const pile = state.tableau[sourcePile];
      if (!isValidRun(pile, cardIndex)) return;
      run = pile.slice(cardIndex);
      containerEl = cardEl.closest('[data-zone="tableau"]');
    } else if (zone === 'waste') {
      if (cardIndex !== state.waste.length - 1) return;
      run = [state.waste[cardIndex]];
    } else if (zone === 'foundation') {
      sourceSuit = cardEl.dataset.suit;
      const pile = state.foundations[sourceSuit];
      if (cardIndex !== pile.length - 1) return;
      run = [pile[cardIndex]];
    } else {
      return;
    }

    e.preventDefault();
    const rect = cardEl.getBoundingClientRect();
    const elements =
      zone === 'tableau'
        ? Array.from(containerEl.querySelectorAll('.card')).filter((el) => Number(el.dataset.cardIndex) >= cardIndex)
        : [cardEl];

    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    elements.forEach((el, i) => {
      const clone = el.cloneNode(true);
      clone.classList.remove('dragging', 'not-draggable');
      clone.style.position = 'absolute';
      clone.style.left = '0px';
      clone.style.top = `${i * FACE_UP_OFFSET}px`;
      ghost.appendChild(clone);
    });
    document.body.appendChild(ghost);
    elements.forEach((el) => el.classList.add('dragging'));

    session = {
      run,
      sourceZone: zone,
      sourcePile,
      sourceSuit,
      cardIndex,
      elements,
      ghost,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      pointerId: e.pointerId,
    };

    const onMoveHandler = (ev) => {
      if (!session) return;
      session.ghost.style.left = `${ev.clientX - session.offsetX}px`;
      session.ghost.style.top = `${ev.clientY - session.offsetY}px`;
      clearDropHighlights();
      const zoneEl = findDropZone(ev.clientX, ev.clientY);
      if (zoneEl) {
        zoneEl.classList.add(checkValidity(zoneEl) ? 'drop-target-valid' : 'drop-target-invalid');
      }
    };
    const onUpHandler = (ev) => {
      window.removeEventListener('pointermove', onMoveHandler);
      window.removeEventListener('pointerup', onUpHandler);
      window.removeEventListener('pointercancel', onCancelHandler);
      if (!session) return;
      const zoneEl = findDropZone(ev.clientX, ev.clientY);
      endSession(zoneEl);
    };
    const onCancelHandler = () => {
      window.removeEventListener('pointermove', onMoveHandler);
      window.removeEventListener('pointerup', onUpHandler);
      window.removeEventListener('pointercancel', onCancelHandler);
      if (!session) return;
      endSession(null);
    };
    window.addEventListener('pointermove', onMoveHandler);
    window.addEventListener('pointerup', onUpHandler);
    window.addEventListener('pointercancel', onCancelHandler);
  });

  boardEl.addEventListener('dblclick', (e) => {
    const cardEl = e.target.closest('.card');
    if (!cardEl || !cardEl.classList.contains('face-up')) return;
    const zone = cardEl.dataset.zone;
    if (zone === 'tableau') {
      const pile = Number(cardEl.dataset.pile);
      if (Number(cardEl.dataset.cardIndex) !== engine.state.tableau[pile].length - 1) return;
      onAutoMove('tableau', pile);
    } else if (zone === 'waste') {
      onAutoMove('waste', null);
    }
  });
}
