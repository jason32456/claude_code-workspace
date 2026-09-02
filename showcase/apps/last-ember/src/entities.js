import { randInt } from './utils.js';

export const MONSTER_TYPES = {
  rat: {
    name: 'rat',
    glyph: 'r',
    color: '#c98a4b',
    hp: 6,
    power: 3,
    defense: 0,
    ai: 'wander',
    speed: 1,
    sight: 4,
    introducedFloor: 1,
    goldDrop: [1, 3],
  },
  skeleton: {
    name: 'skeleton',
    glyph: 's',
    color: '#d8d8d8',
    hp: 12,
    power: 5,
    defense: 1,
    ai: 'chase',
    speed: 1,
    sight: 6,
    introducedFloor: 2,
    goldDrop: [2, 5],
  },
  bat: {
    name: 'bat',
    glyph: 'b',
    color: '#a85bd6',
    hp: 8,
    power: 4,
    defense: 0,
    ai: 'erratic',
    speed: 2,
    sight: 5,
    introducedFloor: 3,
    goldDrop: [1, 4],
  },
  ghoul: {
    name: 'ghoul',
    glyph: 'g',
    color: '#4bc98a',
    hp: 22,
    power: 8,
    defense: 2,
    ai: 'chase',
    speed: 1,
    sight: 6,
    introducedFloor: 5,
    goldDrop: [4, 9],
  },
  warden: {
    name: 'the Warden',
    glyph: 'W',
    color: '#e0433a',
    hp: 60,
    power: 14,
    defense: 5,
    ai: 'chase',
    speed: 1,
    sight: 8,
    introducedFloor: 8,
    goldDrop: [15, 30],
  },
};

// Monsters get slightly tougher the deeper they appear below their
// introduction floor, so a floor-5 rat isn't identical to a floor-1 rat.
export function createMonster(typeKey, x, y, depth) {
  const base = MONSTER_TYPES[typeKey];
  const beyond = Math.max(0, depth - base.introducedFloor);
  const scale = 1 + 0.08 * beyond;
  const hp = Math.round(base.hp * scale);
  return {
    type: typeKey,
    name: base.name,
    glyph: base.glyph,
    color: base.color,
    x,
    y,
    hp,
    maxHp: hp,
    power: Math.round(base.power * scale),
    defense: base.defense + Math.floor(beyond / 3),
    ai: base.ai,
    speed: base.speed,
    sight: base.sight,
    awake: base.ai === 'wander',
    goldDrop: base.goldDrop,
  };
}

export function monsterPoolForDepth(depth) {
  return Object.entries(MONSTER_TYPES)
    .filter(([key, def]) => def.introducedFloor <= depth && key !== 'warden')
    .map(([key, def]) => ({
      value: key,
      weight: Math.max(1, 6 - (depth - def.introducedFloor)),
    }));
}

export function randomGoldDrop(monster) {
  const [lo, hi] = monster.goldDrop;
  return randInt(lo, hi);
}

export function createPlayer() {
  return {
    x: 0,
    y: 0,
    hp: 30,
    maxHp: 30,
    basePower: 5,
    baseDefense: 2,
    weaponPower: 0,
    weaponName: null,
    armorDefense: 0,
    armorName: null,
    torchFuel: 150,
    gold: 0,
    inventory: [],
    kills: 0,
    lastBand: 'high',
  };
}

export function playerPower(p) {
  return p.basePower + p.weaponPower;
}

export function playerDefense(p) {
  return p.baseDefense + p.armorDefense;
}

export function calcDamage(atkPower, defDefense) {
  const raw = Math.max(1, atkPower - defDefense);
  const variance = 0.8 + Math.random() * 0.4;
  return Math.max(1, Math.round(raw * variance));
}
