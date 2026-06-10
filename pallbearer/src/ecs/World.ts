export type Entity = number;

export class World {
  private nextId = 0;
  private alive = new Set<Entity>();
  private stores = new Map<string, Map<Entity, unknown>>();
  private toDestroy: Entity[] = [];

  createEntity(): Entity {
    const id = this.nextId++;
    this.alive.add(id);
    return id;
  }

  destroyEntity(e: Entity): void {
    this.toDestroy.push(e);
  }

  flushDestroyed(): void {
    for (const e of this.toDestroy) {
      this.alive.delete(e);
      for (const store of this.stores.values()) store.delete(e);
    }
    this.toDestroy.length = 0;
  }

  add<T>(e: Entity, name: string, data: T): T {
    let store = this.stores.get(name);
    if (!store) { store = new Map(); this.stores.set(name, store); }
    store.set(e, data);
    return data;
  }

  get<T>(e: Entity, name: string): T {
    const v = this.stores.get(name)?.get(e);
    if (v === undefined) throw new Error(`Entity ${e} missing component "${name}"`);
    return v as T;
  }

  tryGet<T>(e: Entity, name: string): T | undefined {
    return this.stores.get(name)?.get(e) as T | undefined;
  }

  has(e: Entity, name: string): boolean {
    return this.stores.get(name)?.has(e) ?? false;
  }

  remove(e: Entity, name: string): void {
    this.stores.get(name)?.delete(e);
  }

  query(...names: string[]): Entity[] {
    if (names.length === 0) return [...this.alive];
    let smallest: Map<Entity, unknown> | undefined;
    let smallestSize = Infinity;
    for (const n of names) {
      const s = this.stores.get(n);
      if (!s || s.size === 0) return [];
      if (s.size < smallestSize) { smallest = s; smallestSize = s.size; }
    }
    if (!smallest) return [];
    const result: Entity[] = [];
    for (const e of smallest.keys()) {
      if (names.every(n => this.stores.get(n)?.has(e))) result.push(e);
    }
    return result;
  }
}
