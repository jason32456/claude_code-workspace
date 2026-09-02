import { TILE, MAX_FLOOR, lightRadius, fuelBand, INVENTORY_CAP } from './constants.js';
import { idx, adjacent, DIRS4, randInt } from './utils.js';
import { computeFOV, hasLineOfSight } from './fov.js';
import { generateFloor } from './dungeon.js';
import { createPlayer, playerPower, playerDefense, calcDamage, randomGoldDrop } from './entities.js';
import { pickupItem, useInventoryItem } from './items.js';
import * as sfx from './audio.js';

const STATS_KEY = 'lastEmberStats';
const LOG_CAP = 60;

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { bestFloor: 0, runs: 0, wins: 0 };
    return JSON.parse(raw);
  } catch {
    return { bestFloor: 0, runs: 0, wins: 0 };
  }
}

function saveStats(update) {
  const stats = loadStats();
  stats.bestFloor = Math.max(stats.bestFloor, update.bestFloor);
  stats.runs += 1;
  if (update.won) stats.wins += 1;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* localStorage unavailable — meta stats just won't persist */
  }
  return stats;
}

function bfsNextStep(tiles, width, height, from, to) {
  if (from.x === to.x && from.y === to.y) return null;
  const start = idx(from.x, from.y, width);
  const goal = idx(to.x, to.y, width);
  const visited = new Uint8Array(width * height);
  const prev = new Int32Array(width * height).fill(-1);
  visited[start] = 1;
  const queue = [start];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur === goal) break;
    const cx = cur % width;
    const cy = (cur / width) | 0;
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = idx(nx, ny, width);
      if (visited[ni] || tiles[ni] === TILE.WALL) continue;
      visited[ni] = 1;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (!visited[goal]) return null;
  let cur = goal;
  while (prev[cur] !== -1 && prev[cur] !== start) cur = prev[cur];
  if (cur === goal && prev[cur] === -1 && start !== goal) return null;
  return { x: cur % width, y: (cur / width) | 0 };
}

export class Game {
  constructor() {
    this.state = 'title';
    this.messages = [];
    this.stats = loadStats();
    this.log = this.log.bind(this);
  }

  log(msg) {
    this.messages.push(msg);
    if (this.messages.length > LOG_CAP) this.messages.shift();
  }

  newGame() {
    this.depth = 1;
    this.turnCount = 0;
    this.player = createPlayer();
    this.messages = [];
    this._loadFloor(1);
    this.state = 'playing';
    this.log('You strike your torch alight and step into the mine.');
  }

  _loadFloor(depth) {
    const floor = generateFloor(depth);
    this.dungeon = floor;
    this.player.x = floor.playerStart.x;
    this.player.y = floor.playerStart.y;
    this.monsters = floor.monsters;
    this.items = floor.items;
    this.explored = new Set();
    this._recomputeFOV();
  }

  _recomputeFOV() {
    const radius = lightRadius(this.player.torchFuel);
    this.currentLightRadius = radius;
    this.visible = computeFOV(this.dungeon.tiles, this.dungeon.width, this.dungeon.height, this.player.x, this.player.y, radius);
    for (const i of this.visible) this.explored.add(i);
  }

  _tileAt(x, y) {
    return this.dungeon.tiles[idx(x, y, this.dungeon.width)];
  }

  _monsterAt(x, y) {
    return this.monsters.find((m) => m.hp > 0 && m.x === x && m.y === y);
  }

  movePlayer(dx, dy) {
    if (this.state !== 'playing') return;
    const p = this.player;
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (nx < 0 || ny < 0 || nx >= this.dungeon.width || ny >= this.dungeon.height) return;
    if (this._tileAt(nx, ny) === TILE.WALL) return;

    const target = this._monsterAt(nx, ny);
    if (target) {
      const dmg = calcDamage(playerPower(p), target.defense);
      target.hp -= dmg;
      this.log(`You hit the ${target.name} for ${dmg}.`);
      sfx.sfxHit();
      if (target.hp <= 0) {
        this.log(`The ${target.name} dies.`);
        p.kills++;
        const gold = randomGoldDrop(target);
        p.gold += gold;
        this.log(`It drops ${gold} gold.`);
        sfx.sfxDeath();
      }
      this._endTurn();
      return;
    }

    p.x = nx;
    p.y = ny;

    const itemIndex = this.items.findIndex((it) => it.x === nx && it.y === ny);
    if (itemIndex >= 0) {
      pickupItem(this, this.items[itemIndex]);
      this.items.splice(itemIndex, 1);
      sfx.sfxPickup();
    }

    const tile = this._tileAt(nx, ny);
    if (tile === TILE.STAIRS) {
      this.log('You descend the stairs into the dark.');
      sfx.sfxStairs();
      this._descend();
      return;
    }
    if (tile === TILE.EMBERHEART) {
      this._win();
      return;
    }

    this._endTurn();
  }

  wait() {
    if (this.state !== 'playing') return;
    this._endTurn();
  }

  useItem(index) {
    if (this.state !== 'playing') return;
    if (index < 0 || index >= this.player.inventory.length) return;
    const consumed = useInventoryItem(this, index);
    if (consumed) {
      sfx.sfxRefuel();
      this._endTurn();
    }
  }

  _descend() {
    this.depth++;
    if (this.depth > MAX_FLOOR) {
      this._win();
      return;
    }
    this._loadFloor(this.depth);
    this.log(`You descend to floor ${this.depth}.`);
    this.turnCount++;
    this._tickFuel();
  }

  _tickFuel() {
    const p = this.player;
    p.torchFuel = Math.max(0, p.torchFuel - 1);
    const band = fuelBand(p.torchFuel);
    if (band !== p.lastBand) {
      if (band === 'low' && p.lastBand !== 'empty') {
        this.log('Your torch is burning low.');
        sfx.sfxLowFuel();
      } else if (band === 'empty') {
        this.log('Your torch gutters out! You can barely see past your own hand.');
        sfx.sfxLowFuel();
      }
      p.lastBand = band;
    }
    this._recomputeFOV();
  }

  _endTurn() {
    this._tickFuel();
    if (this.player.hp <= 0) {
      this._die();
      return;
    }

    for (const m of this.monsters) {
      if (m.hp <= 0) continue;
      this._processMonsterTurn(m);
      if (this.player.hp <= 0) break;
    }
    this.monsters = this.monsters.filter((m) => m.hp > 0);

    this.turnCount++;

    if (this.player.hp <= 0) this._die();
  }

  _tryMoveMonster(m, nx, ny) {
    if (nx < 0 || ny < 0 || nx >= this.dungeon.width || ny >= this.dungeon.height) return false;
    if (this._tileAt(nx, ny) === TILE.WALL) return false;
    if (nx === this.player.x && ny === this.player.y) return false;
    if (this.monsters.some((o) => o !== m && o.hp > 0 && o.x === nx && o.y === ny)) return false;
    m.x = nx;
    m.y = ny;
    return true;
  }

  _monsterAttack(m) {
    const p = this.player;
    const dmg = calcDamage(m.power, playerDefense(p));
    p.hp -= dmg;
    this.log(`The ${m.name} hits you for ${dmg}.`);
    sfx.sfxPlayerHurt();
  }

  _processMonsterTurn(m) {
    const p = this.player;
    const steps = m.speed || 1;
    for (let step = 0; step < steps; step++) {
      if (m.hp <= 0) return;
      if (adjacent(m, p)) {
        this._monsterAttack(m);
        return;
      }
      if (m.ai === 'wander') {
        if (m.hp <= m.maxHp * 0.3) {
          const dx = Math.sign(m.x - p.x) || (Math.random() < 0.5 ? -1 : 1);
          const dy = Math.sign(m.y - p.y) || (Math.random() < 0.5 ? -1 : 1);
          if (!this._tryMoveMonster(m, m.x + dx, m.y)) this._tryMoveMonster(m, m.x, m.y + dy);
        } else if (Math.random() < 0.5) {
          const [dx, dy] = DIRS4[randInt(0, 3)];
          this._tryMoveMonster(m, m.x + dx, m.y + dy);
        }
        continue;
      }
      if (m.ai === 'chase' || m.ai === 'erratic') {
        if (!m.awake) {
          if (hasLineOfSight(this.dungeon.tiles, this.dungeon.width, m.x, m.y, p.x, p.y, m.sight)) {
            m.awake = true;
            this.log(`The ${m.name} notices you!`);
          } else {
            continue;
          }
        }
        if (m.ai === 'erratic') {
          const [dx, dy] = DIRS4[randInt(0, 3)];
          this._tryMoveMonster(m, m.x + dx, m.y + dy);
        } else {
          const next = bfsNextStep(this.dungeon.tiles, this.dungeon.width, this.dungeon.height, m, p);
          if (next) this._tryMoveMonster(m, next.x, next.y);
        }
      }
    }
  }

  _die() {
    this.state = 'dead';
    this.stats = saveStats({ bestFloor: this.depth, won: false });
    sfx.sfxGameOver();
  }

  _win() {
    this.state = 'win';
    this.stats = saveStats({ bestFloor: MAX_FLOOR, won: true });
    sfx.sfxWin();
  }

  inventoryFull() {
    return this.player.inventory.length >= INVENTORY_CAP;
  }
}
