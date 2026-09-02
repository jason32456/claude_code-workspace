import {
  getState,
  renameBoard,
  createColumn,
  renameColumn,
  setColumnWipLimit,
  deleteColumn,
  reorderColumn,
  createCard,
  updateCard,
  deleteCard,
  moveCard,
  createLabel,
  toggleCardLabel,
} from './storage.js';
import { escapeHtml, formatDate, dueStatus } from './utils.js';

const LABEL_SWATCH = ['#dc4c4c', '#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777'];

// Drag state lives outside the render closure so it survives the innerHTML
// rebuild that follows every mutation.
const drag = { type: null, id: null, fromColumnId: null };

export default function mountBoard(container, boardId) {
  const render = () => draw(container, boardId, render);
  render();
}

function draw(container, boardId, rerender) {
  const board = getState().boards[boardId];

  container.innerHTML = `
    <a class="back-link" href="#/">← All boards</a>
    <div class="board-toolbar">
      <input id="board-name" class="board-name-input" value="${escapeHtml(board.name)}" maxlength="60" />
      <input id="search-input" class="search-input" type="text" placeholder="Search cards…" />
    </div>
    <div class="columns-track" id="columns-track">
      ${board.columnOrder.map((colId) => columnHtml(board, board.columns[colId])).join('')}
      <div class="add-column-ghost" id="add-column-ghost">+ Add column</div>
    </div>
    <div id="modal-root"></div>
  `;

  container.querySelector('#board-name').addEventListener('change', (e) => {
    const name = e.target.value.trim();
    if (name) renameBoard(boardId, name);
    rerender();
  });

  wireSearch(container);
  wireAddColumn(container, boardId, rerender);
  wireColumnActions(container, boardId, rerender);
  wireQuickAdd(container, boardId, rerender);
  wireCardClicks(container, boardId, rerender);
  wireCardDrag(container, boardId, rerender);
  wireColumnDrag(container, boardId, rerender);
}

function columnHtml(board, col) {
  const cardIds = board.cardOrder[col.id] || [];
  const count = cardIds.length;
  const wipExceeded = col.wipLimit && count > col.wipLimit;
  return `
    <div class="column" data-column-id="${col.id}">
      <div class="column-header" draggable="true" data-col-header="${col.id}">
        <span class="column-name">${escapeHtml(col.name)}</span>
        <span class="column-count ${wipExceeded ? 'wip-exceeded' : ''}">${count}${col.wipLimit ? ' / ' + col.wipLimit : ''}</span>
        <div class="column-header-actions">
          <button class="btn btn-icon" data-rename-col="${col.id}" title="Rename column">✎</button>
          <button class="btn btn-icon" data-wip-col="${col.id}" title="Set WIP limit">≡</button>
          <button class="btn btn-icon" data-delete-col="${col.id}" title="Delete column">✕</button>
        </div>
      </div>
      <div class="card-list" data-column-list="${col.id}">
        ${cardIds.map((id) => cardHtml(board, board.cards[id])).join('')}
      </div>
      <div class="quick-add">
        <input type="text" class="quick-add-input" data-quick-add="${col.id}" placeholder="+ Add a card" />
      </div>
    </div>
  `;
}

function cardHtml(board, card) {
  const labels = (card.labels || [])
    .map((id) => board.labels[id])
    .filter(Boolean)
    .map((l) => `<span class="chip" style="background:${l.color}">${escapeHtml(l.name)}</span>`)
    .join('');
  const due = card.due
    ? `<span class="due-badge due-${dueStatus(card.due)}">${formatDate(card.due)}</span>`
    : '';
  const searchText = escapeHtml(
    `${card.title} ${(card.labels || []).map((id) => board.labels[id]?.name || '').join(' ')}`
  ).toLowerCase();
  return `
    <div class="card" draggable="true" data-card-id="${card.id}" data-column-id="${card.columnId}" data-search="${searchText}">
      ${labels ? `<div class="chip-row">${labels}</div>` : ''}
      <p class="card-title">${escapeHtml(card.title)}</p>
      ${due}
    </div>
  `;
}

function wireSearch(container) {
  const input = container.querySelector('#search-input');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    container.querySelectorAll('.card').forEach((el) => {
      const match = !q || el.dataset.search.includes(q);
      el.classList.toggle('card-faded', !match);
    });
  });
}

function wireAddColumn(container, boardId, rerender) {
  container.querySelector('#add-column-ghost').addEventListener('click', function handler() {
    const name = prompt('Column name:');
    if (!name || !name.trim()) return;
    createColumn(boardId, name.trim());
    rerender();
  });
}

function wireColumnActions(container, boardId, rerender) {
  container.querySelectorAll('[data-rename-col]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const board = getState().boards[boardId];
      const col = board.columns[btn.dataset.renameCol];
      const name = prompt('Column name:', col.name);
      if (name === null || !name.trim()) return;
      renameColumn(boardId, col.id, name.trim());
      rerender();
    })
  );
  container.querySelectorAll('[data-wip-col]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const board = getState().boards[boardId];
      const col = board.columns[btn.dataset.wipCol];
      const raw = prompt('WIP limit (blank for none):', col.wipLimit ?? '');
      if (raw === null) return;
      const n = parseInt(raw, 10);
      setColumnWipLimit(boardId, col.id, Number.isFinite(n) && n > 0 ? n : null);
      rerender();
    })
  );
  container.querySelectorAll('[data-delete-col]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (confirm('Delete this column and all its cards?')) {
        deleteColumn(boardId, btn.dataset.deleteCol);
        rerender();
      }
    })
  );
}

function wireQuickAdd(container, boardId, rerender) {
  container.querySelectorAll('[data-quick-add]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const title = input.value.trim();
      if (!title) return;
      createCard(boardId, input.dataset.quickAdd, title);
      rerender();
    });
  });
}

function wireCardClicks(container, boardId, rerender) {
  container.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', () => {
      openCardModal(container, boardId, el.dataset.cardId, rerender);
    });
  });
}

// --- Card drag and drop -----------------------------------------------

function wireCardDrag(container, boardId, rerender) {
  container.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('dragstart', (e) => {
      drag.type = 'card';
      drag.id = el.dataset.cardId;
      drag.fromColumnId = el.dataset.columnId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag.id);
      requestAnimationFrame(() => el.classList.add('dragging'));
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      clearIndicators(container);
      drag.type = null;
    });
  });

  container.querySelectorAll('.card-list').forEach((list) => {
    list.addEventListener('dragover', (e) => {
      if (drag.type !== 'card') return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      showCardIndicator(list, e.clientY);
    });
    list.addEventListener('drop', (e) => {
      if (drag.type !== 'card') return;
      e.preventDefault();
      e.stopPropagation();
      const toColumnId = list.dataset.columnList;
      const indicator = list.querySelector('.drop-indicator');
      const toIndex = countCardsBefore(list, indicator);
      clearIndicators(container);
      moveCard(boardId, drag.id, toColumnId, toIndex);
      drag.type = null;
      rerender();
    });
  });
}

// Counts real (non-dragging) cards before `indicator` in DOM order — this is
// exactly the insertion index in the column's array once the dragged card is
// removed from wherever it started. Pass indicator=null to count them all.
function countCardsBefore(list, indicator) {
  let count = 0;
  for (const child of Array.from(list.children)) {
    if (child === indicator) break;
    if (child.classList.contains('card') && !child.classList.contains('dragging')) count++;
  }
  return count;
}

function showCardIndicator(list, clientY) {
  clearAllIndicatorsInList(list);
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  const cards = Array.from(list.querySelectorAll('.card:not(.dragging)'));
  const target = cards.find((c) => {
    const rect = c.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  if (target) {
    list.insertBefore(indicator, target);
  } else {
    list.appendChild(indicator);
  }
}

function clearAllIndicatorsInList(list) {
  list.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
}

function clearIndicators(container) {
  container.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
}

// --- Column drag and drop -----------------------------------------------

function wireColumnDrag(container, boardId, rerender) {
  const track = container.querySelector('#columns-track');

  container.querySelectorAll('[data-col-header]').forEach((header) => {
    header.addEventListener('dragstart', (e) => {
      drag.type = 'column';
      drag.id = header.dataset.colHeader;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag.id);
      requestAnimationFrame(() => header.closest('.column').classList.add('dragging'));
    });
    header.addEventListener('dragend', () => {
      header.closest('.column')?.classList.remove('dragging');
      track.querySelectorAll('.column-drop-indicator').forEach((el) => el.remove());
      drag.type = null;
    });
  });

  track.addEventListener('dragover', (e) => {
    if (drag.type !== 'column') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    track.querySelectorAll('.column-drop-indicator').forEach((el) => el.remove());
    const indicator = document.createElement('div');
    indicator.className = 'column-drop-indicator';
    const columns = Array.from(track.querySelectorAll('.column:not(.dragging)'));
    const target = columns.find((c) => {
      const rect = c.getBoundingClientRect();
      return e.clientX < rect.left + rect.width / 2;
    });
    if (target) track.insertBefore(indicator, target);
    else track.insertBefore(indicator, track.querySelector('.add-column-ghost'));
  });

  track.addEventListener('drop', (e) => {
    if (drag.type !== 'column') return;
    e.preventDefault();
    const indicator = track.querySelector('.column-drop-indicator');
    const columns = Array.from(track.children).filter((c) => c.classList.contains('column'));

    // Target index among non-dragging columns, based on where the indicator landed.
    let idx = columns.length;
    if (indicator) {
      idx = 0;
      for (const child of Array.from(track.children)) {
        if (child === indicator) break;
        if (child.classList.contains('column') && !child.classList.contains('dragging')) idx++;
      }
    }
    track.querySelectorAll('.column-drop-indicator').forEach((el) => el.remove());
    reorderColumn(boardId, drag.id, idx);
    drag.type = null;
    rerender();
  });
}

// --- Card detail modal -----------------------------------------------

function openCardModal(container, boardId, cardId, rerender) {
  const board = getState().boards[boardId];
  const card = board.cards[cardId];
  const root = container.querySelector('#modal-root');

  const labelChips = board.labelOrder
    .map((id) => board.labels[id])
    .filter(Boolean)
    .map(
      (l) => `
        <button class="chip chip-toggle ${card.labels.includes(l.id) ? 'chip-active' : ''}"
          style="background:${l.color}" data-toggle-label="${l.id}">${escapeHtml(l.name)}</button>
      `
    )
    .join('');

  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <input id="modal-title" class="modal-title-input" value="${escapeHtml(card.title)}" maxlength="120" />
          <button class="btn btn-icon" id="modal-close" title="Close">✕</button>
        </div>
        <label class="modal-label">Description</label>
        <textarea id="modal-desc" rows="4" placeholder="Add more detail…">${escapeHtml(card.description || '')}</textarea>

        <label class="modal-label">Due date</label>
        <input id="modal-due" type="date" value="${card.due ? isoDate(card.due) : ''}" />

        <label class="modal-label">Labels</label>
        <div class="chip-row modal-labels">
          ${labelChips}
          <button class="btn btn-ghost btn-icon" id="modal-add-label" title="New label">+</button>
        </div>
        <div id="new-label-form" class="new-label-form" hidden>
          <input id="new-label-name" type="text" placeholder="Label name" maxlength="20" />
          <div class="swatch-row" id="swatch-row">
            ${LABEL_SWATCH.map((c, i) => `<button class="swatch ${i === 0 ? 'swatch-selected' : ''}" style="background:${c}" data-color="${c}"></button>`).join('')}
          </div>
          <button class="btn btn-primary" id="create-label-btn">Add label</button>
        </div>

        <div class="modal-footer">
          <button class="btn btn-danger" id="modal-delete">Delete card</button>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    root.innerHTML = '';
    rerender();
  };

  root.querySelector('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') close();
  });
  root.querySelector('#modal-close').addEventListener('click', close);

  root.querySelector('#modal-title').addEventListener('change', (e) => {
    updateCard(boardId, cardId, { title: e.target.value.trim() || card.title });
  });
  root.querySelector('#modal-desc').addEventListener('change', (e) => {
    updateCard(boardId, cardId, { description: e.target.value });
  });
  root.querySelector('#modal-due').addEventListener('change', (e) => {
    const val = e.target.value;
    updateCard(boardId, cardId, { due: val ? new Date(val + 'T12:00:00').getTime() : null });
  });

  root.querySelectorAll('[data-toggle-label]').forEach((btn) =>
    btn.addEventListener('click', () => {
      toggleCardLabel(boardId, cardId, btn.dataset.toggleLabel);
      btn.classList.toggle('chip-active');
    })
  );

  root.querySelector('#modal-add-label').addEventListener('click', () => {
    root.querySelector('#new-label-form').hidden = false;
  });

  let selectedColor = LABEL_SWATCH[0];
  root.querySelectorAll('.swatch').forEach((sw) =>
    sw.addEventListener('click', () => {
      root.querySelectorAll('.swatch').forEach((s) => s.classList.remove('swatch-selected'));
      sw.classList.add('swatch-selected');
      selectedColor = sw.dataset.color;
    })
  );
  root.querySelector('#create-label-btn').addEventListener('click', () => {
    const name = root.querySelector('#new-label-name').value.trim();
    if (!name) return;
    const label = createLabel(boardId, name, selectedColor);
    toggleCardLabel(boardId, cardId, label.id);
    openCardModal(container, boardId, cardId, rerender);
  });

  root.querySelector('#modal-delete').addEventListener('click', () => {
    if (confirm('Delete this card?')) {
      deleteCard(boardId, cardId);
      close();
    }
  });
}

function isoDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
