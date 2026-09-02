import { uid } from './utils.js';

const LABEL_DEFS = [
  ['Bug', '#dc4c4c'],
  ['Feature', '#2563eb'],
  ['Urgent', '#d97706'],
  ['Idea', '#7c3aed'],
];

const DAY = 24 * 60 * 60 * 1000;

export function seedStarterBoard(state) {
  const boardId = uid('board');
  const colTodo = uid('col');
  const colDoing = uid('col');
  const colDone = uid('col');

  const labels = {};
  const labelOrder = [];
  const labelIdByName = {};
  for (const [name, color] of LABEL_DEFS) {
    const id = uid('label');
    labels[id] = { id, name, color };
    labelOrder.push(id);
    labelIdByName[name] = id;
  }

  const cards = {};
  const cardOrder = { [colTodo]: [], [colDoing]: [], [colDone]: [] };

  const seed = [
    [colTodo, 'Write the launch announcement', { labels: ['Feature'] }],
    [colTodo, 'Fix the overdue-badge color on dark backgrounds', { labels: ['Bug'], due: Date.now() + 3 * DAY }],
    [colTodo, 'Sketch a mobile layout', { labels: ['Idea'] }],
    [colDoing, 'Wire up drag-and-drop between columns', { labels: ['Feature'], due: Date.now() - DAY }],
    [colDoing, 'Add WIP limit warning styling', { labels: ['Feature'] }],
    [colDone, 'Set up the board data model', {}],
    [colDone, 'Pick a color palette', {}],
  ];

  for (const [colId, title, opts] of seed) {
    const id = uid('card');
    cards[id] = {
      id,
      columnId: colId,
      title,
      description: opts.description || '',
      due: opts.due ?? null,
      labels: (opts.labels || []).map((n) => labelIdByName[n]),
      createdAt: Date.now(),
    };
    cardOrder[colId].push(id);
  }

  state.boards[boardId] = {
    id: boardId,
    name: 'Launch Docket',
    createdAt: Date.now(),
    columnOrder: [colTodo, colDoing, colDone],
    columns: {
      [colTodo]: { id: colTodo, name: 'To Do', wipLimit: null },
      [colDoing]: { id: colDoing, name: 'In Progress', wipLimit: 3 },
      [colDone]: { id: colDone, name: 'Done', wipLimit: null },
    },
    cardOrder,
    cards,
    labelOrder,
    labels,
  };
  state.boardOrder.push(boardId);
}
