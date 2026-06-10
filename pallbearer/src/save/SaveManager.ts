const DB_NAME = 'pallbearer';
const DB_VER = 1;
const STORE = 'saves';
const SAVE_VER = 1;

export interface SaveState {
  version: number;
  slot: number;
  regionId: string;
  playerX: number;
  playerY: number;
  corruption: number;
  radiance: number;
  flags: Record<string, boolean | number | string>;
  timestamp: number;
}

function makeDefault(): Omit<SaveState, 'version' | 'slot' | 'timestamp'> {
  return {
    regionId: 'test-room',
    playerX: 48,
    playerY: 48,
    corruption: 0,
    radiance: 0,
    flags: {},
  };
}

export class SaveManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (ev) => {
        const db = (ev.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'slot' });
        }
      };
      req.onsuccess = (ev) => { this.db = (ev.target as IDBOpenDBRequest).result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  async save(slot: number, partial: Partial<Omit<SaveState, 'version' | 'slot' | 'timestamp'>>): Promise<void> {
    const existing = await this.load(slot);
    const merged: SaveState = {
      ...makeDefault(),
      ...(existing ?? {}),
      ...partial,
      version: SAVE_VER,
      slot,
      timestamp: Date.now(),
    };
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not initialised')); return; }
      const tx = this.db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(merged);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async load(slot: number): Promise<SaveState | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not initialised')); return; }
      const tx = this.db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(slot);
      req.onsuccess = () => resolve((req.result as SaveState) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  exportToString(state: SaveState): string {
    return btoa(encodeURIComponent(JSON.stringify(state)));
  }

  importFromString(s: string): SaveState {
    return JSON.parse(decodeURIComponent(atob(s))) as SaveState;
  }
}
