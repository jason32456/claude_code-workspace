import { initState, getState } from './js/storage.js';
import { seedStarterBoard } from './js/starter-board.js';
import mountHome from './js/view-home.js';
import mountBoard from './js/view-board.js';

initState(seedStarterBoard);

const app = document.getElementById('app');

function route() {
  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);

  if (parts[0] === 'board' && parts[1]) {
    const board = getState().boards[parts[1]];
    if (!board) {
      location.hash = '#/';
      return;
    }
    return mountBoard(app, board.id);
  }

  return mountHome(app);
}

window.addEventListener('hashchange', route);
route();
