import { randInt } from './utils.js';
import { FUEL_CAP, INVENTORY_CAP } from './constants.js';

function potionHeal() {
  return { kind: 'potion_heal', name: 'Healing Potion', glyph: '!', color: '#ff5577', amount: 12 };
}

function potionStrength() {
  return { kind: 'potion_strength', name: 'Strength Potion', glyph: '!', color: '#ffaa33', amount: 2 };
}

function oilFlask() {
  return { kind: 'oil_flask', name: 'Oil Flask', glyph: 'o', color: '#ffcc55', amount: 60 };
}

function spareTorch() {
  return { kind: 'torch_spare', name: 'Spare Torch', glyph: 't', color: '#ffdd88', amount: 150 };
}

function weapon(depth) {
  const power = 3 + Math.floor(depth * 0.8);
  return { kind: 'weapon', name: `Blade +${power}`, glyph: '/', color: '#99ccff', power };
}

function armor(depth) {
  const defense = 2 + Math.floor(depth * 0.6);
  return { kind: 'armor', name: `Armor +${defense}`, glyph: '[', color: '#88bb88', defense };
}

function gold(depth) {
  const amount = randInt(3, 8) + depth * 2;
  return { kind: 'gold', name: 'Gold', glyph: '$', color: '#ffdd33', amount };
}

const CONSUMABLE_FACTORIES = [potionHeal, potionStrength, oilFlask, spareTorch];

export function spawnItems(depth, candidates, used) {
  const items = [];
  const place = (factory) => {
    let attempts = 0;
    while (attempts < 200) {
      attempts++;
      const tile = candidates[randInt(0, candidates.length - 1)];
      const key = tile.y * 100000 + tile.x;
      if (used.has(key)) continue;
      used.add(key);
      items.push({ ...factory(), x: tile.x, y: tile.y });
      return;
    }
  };

  const potionCount = Math.min(6, 2 + Math.floor(depth / 2));
  for (let i = 0; i < potionCount; i++) {
    place(Math.random() < 0.65 ? potionHeal : potionStrength);
  }

  const oilCount = Math.min(5, 2 + Math.floor(depth / 2));
  for (let i = 0; i < oilCount; i++) place(oilFlask);

  if (Math.random() < 0.55) place(spareTorch);

  place(() => weapon(depth));
  if (Math.random() < 0.7) place(() => armor(depth));

  const goldPiles = randInt(3, 6);
  for (let i = 0; i < goldPiles; i++) place(() => gold(depth));

  return items;
}

export function pickupItem(game, item) {
  const { player, log } = game;
  if (item.kind === 'gold') {
    player.gold += item.amount;
    log(`You pick up ${item.amount} gold.`);
    return;
  }
  if (item.kind === 'weapon') {
    if (item.power > player.weaponPower) {
      player.weaponPower = item.power;
      player.weaponName = item.name;
      log(`You equip a ${item.name}.`);
    } else {
      log(`You find a ${item.name}, but your current weapon is better.`);
    }
    return;
  }
  if (item.kind === 'armor') {
    if (item.defense > player.armorDefense) {
      player.armorDefense = item.defense;
      player.armorName = item.name;
      log(`You equip ${item.name}.`);
    } else {
      log(`You find ${item.name}, but your current armor is better.`);
    }
    return;
  }
  // Consumables go into the capped inventory.
  if (player.inventory.length >= INVENTORY_CAP) {
    log(`Your pack is full — you leave the ${item.name} behind.`);
    return;
  }
  player.inventory.push({ kind: item.kind, name: item.name, glyph: item.glyph, color: item.color, amount: item.amount });
  log(`You pick up a ${item.name}.`);
}

export function useInventoryItem(game, index) {
  const { player, log } = game;
  const item = player.inventory[index];
  if (!item) return false;

  if (item.kind === 'potion_heal') {
    if (player.hp >= player.maxHp) {
      log('You feel fully rested already.');
    } else {
      player.hp = Math.min(player.maxHp, player.hp + item.amount);
      log(`You drink the Healing Potion and recover ${item.amount} HP.`);
    }
  } else if (item.kind === 'potion_strength') {
    player.basePower += item.amount;
    log(`Strength floods through you. Power +${item.amount}, permanently.`);
  } else if (item.kind === 'oil_flask') {
    const before = player.torchFuel;
    player.torchFuel = Math.min(FUEL_CAP, player.torchFuel + item.amount);
    log(`You pour oil on your torch. It flares brighter (+${player.torchFuel - before} fuel).`);
  } else if (item.kind === 'torch_spare') {
    if (player.torchFuel >= item.amount) {
      log('Your current torch already burns brighter than the spare.');
    } else {
      player.torchFuel = item.amount;
      log('You light a fresh torch. The dark retreats.');
    }
  }

  player.inventory.splice(index, 1);
  return true;
}
