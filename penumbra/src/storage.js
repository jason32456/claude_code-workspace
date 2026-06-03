// IndexedDB storage layer — all reads/writes go through here
const DB_NAME = 'penumbra';
const DB_VERSION = 1;

let db = null;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('decks')) {
        database.createObjectStore('decks', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('cards')) {
        const cards = database.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('deckId', 'deckId', { unique: false });
        cards.createIndex('due', 'due', { unique: false });
      }
      if (!database.objectStoreNames.contains('sessions')) {
        const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('date', 'date', { unique: false });
        sessions.createIndex('type', 'type', { unique: false });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

// ---- Settings ----

export async function getSetting(key) {
  await openDB();
  const result = await request(tx('settings').get(key));
  return result?.value;
}

export async function setSetting(key, value) {
  await openDB();
  return request(tx('settings', 'readwrite').put({ key, value }));
}

// ---- Decks ----

export async function getDecks() {
  await openDB();
  return request(tx('decks').getAll());
}

export async function getDeck(id) {
  await openDB();
  return request(tx('decks').get(id));
}

export async function putDeck(deck) {
  await openDB();
  return request(tx('decks', 'readwrite').put(deck));
}

export async function deleteDeck(id) {
  await openDB();
  const store = tx('decks', 'readwrite');
  await request(store.delete(id));
}

// ---- Cards ----

export async function getCards() {
  await openDB();
  return request(tx('cards').getAll());
}

export async function getCardsByDeck(deckId) {
  await openDB();
  return request(tx('cards').index('deckId').getAll(deckId));
}

export async function getCard(id) {
  await openDB();
  return request(tx('cards').get(id));
}

export async function putCard(card) {
  await openDB();
  return request(tx('cards', 'readwrite').put(card));
}

export async function deleteCard(id) {
  await openDB();
  return request(tx('cards', 'readwrite').delete(id));
}

export async function deleteCardsByDeck(deckId) {
  await openDB();
  const cards = await getCardsByDeck(deckId);
  const store = tx('cards', 'readwrite');
  await Promise.all(cards.map(c => request(store.delete(c.id))));
}

// ---- Sessions ----

export async function putSession(session) {
  await openDB();
  return request(tx('sessions', 'readwrite').put(session));
}

export async function getSessionsByDate(date) {
  await openDB();
  return request(tx('sessions').index('date').getAll(date));
}

export async function getRecentSessions(limit = 30) {
  await openDB();
  const all = await request(tx('sessions').getAll());
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}
