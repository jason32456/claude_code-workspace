import { getState, createBoard, deleteBoard } from './storage.js';
import { escapeHtml } from './utils.js';

export default function mountHome(container) {
  const state = getState();
  const boardIds = state.boardOrder.filter((id) => state.boards[id]);

  container.innerHTML = `
    <section class="hero">
      <h1>Your boards</h1>
      <p class="hint">Organize work into columns you can drag across. Saved in this browser.</p>
    </section>
    <div class="board-actions">
      <button id="new-board-btn" class="btn btn-primary">+ New board</button>
    </div>
    <div id="new-board-form" class="new-board-form" hidden>
      <input id="new-board-name" type="text" placeholder="Board name" maxlength="60" />
      <button id="create-board-btn" class="btn btn-primary">Create</button>
      <button id="cancel-board-btn" class="btn btn-ghost">Cancel</button>
    </div>
    <div class="board-grid">
      ${boardIds.length ? boardIds.map((id) => boardCardHtml(state.boards[id])).join('') : emptyHtml()}
    </div>
  `;

  const remount = () => mountHome(container);
  const newBtn = container.querySelector('#new-board-btn');
  const form = container.querySelector('#new-board-form');
  const nameInput = container.querySelector('#new-board-name');

  newBtn.addEventListener('click', () => {
    form.hidden = false;
    newBtn.hidden = true;
    nameInput.focus();
  });
  container.querySelector('#cancel-board-btn').addEventListener('click', remount);
  container.querySelector('#create-board-btn').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const board = createBoard(name);
    location.hash = `#/board/${board.id}`;
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') container.querySelector('#create-board-btn').click();
  });

  container.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => {
      location.hash = `#/board/${el.dataset.open}`;
    })
  );
  container.querySelectorAll('[data-delete-board]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete this board and everything on it? This cannot be undone.')) {
        deleteBoard(btn.dataset.deleteBoard);
        remount();
      }
    })
  );
}

function boardCardHtml(board) {
  const cardCount = Object.keys(board.cards).length;
  const colCount = board.columnOrder.length;
  return `
    <article class="board-card" data-open="${board.id}">
      <button class="btn btn-icon board-delete" data-delete-board="${board.id}" title="Delete board">✕</button>
      <h2>${escapeHtml(board.name)}</h2>
      <p class="muted">${colCount} column${colCount === 1 ? '' : 's'} · ${cardCount} card${cardCount === 1 ? '' : 's'}</p>
    </article>
  `;
}

function emptyHtml() {
  return `<p class="empty">No boards yet — create one to get started.</p>`;
}
