// Multi-source Dijkstra from every Core Vent produces a next-hop for the whole
// surface in one pass, so unit count never touches pathfinding cost — walkers
// simply read their tile's next-hop and go downhill.

class MinHeap {
  constructor() { this.ids = []; this.keys = []; }
  get size() { return this.ids.length; }
  push(id, key) {
    this.ids.push(id); this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p); i = p;
    }
  }
  pop() {
    const top = this.ids[0];
    const lastId = this.ids.pop(), lastKey = this.keys.pop();
    if (this.ids.length) {
      this.ids[0] = lastId; this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  swap(a, b) {
    const ti = this.ids[a]; this.ids[a] = this.ids[b]; this.ids[b] = ti;
    const tk = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = tk;
  }
}

export function computeFlowField(tiles, targetIds, blocked) {
  const n = tiles.length;
  const dist = new Float32Array(n).fill(Infinity);
  const next = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const heap = new MinHeap();

  for (const id of targetIds) {
    if (blocked[id]) continue;
    dist[id] = 0;
    heap.push(id, 0);
  }

  while (heap.size) {
    const id = heap.pop();
    if (done[id]) continue;
    done[id] = 1;
    const here = tiles[id];
    for (const nb of here.neighbours) {
      if (blocked[nb] || done[nb]) continue;
      const step = here.center.distanceTo(tiles[nb].center);
      const d = dist[id] + step;
      if (d < dist[nb]) {
        dist[nb] = d;
        next[nb] = id;   // one hop closer to a vent
        heap.push(nb, d);
      }
    }
  }
  return { dist, next };
}

// A structure may not seal any part of the walkable surface off from the vents.
export function sealsSurface(tiles, targetIds, blocked, candidateId) {
  const wasBlocked = blocked[candidateId];
  blocked[candidateId] = 1;
  const { dist } = computeFlowField(tiles, targetIds, blocked);
  blocked[candidateId] = wasBlocked;
  for (let i = 0; i < tiles.length; i++) {
    if (!blocked[i] && i !== candidateId && dist[i] === Infinity) return true;
  }
  return false;
}
