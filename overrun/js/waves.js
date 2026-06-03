import {
  WAVE_BASE, WAVE_STEP, MAX_ENEMIES, BREATHER,
  ENEMY_BASE_HP, ENEMY_BASE_SPD, ENEMY_BASE_DMG,
  HP_SCALE, SPD_SCALE, DMG_SCALE,
  KILL_SCORE, WAVE_BONUS,
  ARENA_HALF
} from './constants.js';

const SPAWN_INSET = 1.5;  // how far inside the arena wall enemies spawn

function randomSpawnPos() {
  const edge = Math.floor(Math.random() * 4);
  const t = (Math.random() - 0.5) * 2 * (ARENA_HALF - SPAWN_INSET - 1);
  const r = ARENA_HALF - SPAWN_INSET;
  switch (edge) {
    case 0: return { x:  r, z: t };
    case 1: return { x: -r, z: t };
    case 2: return { x: t,  z:  r };
    default:return { x: t,  z: -r };
  }
}

export function createWaveDirector(enemyPool) {
  let wave = 0;
  let state = 'idle';    // idle | active | breather
  let breatherTimer = 0;
  let totalToSpawn = 0;
  let spawned = 0;
  let spawnTimer = 0;
  const SPAWN_INTERVAL = 0.35;

  let score = 0;
  let kills = 0;
  let waveHp = 0, waveSpd = 0, waveDmg = 0;

  function waveCount(n) {
    return Math.min(WAVE_BASE + (n - 1) * WAVE_STEP, MAX_ENEMIES);
  }

  function beginWave(n) {
    wave = n;
    state = 'active';
    totalToSpawn = waveCount(n);
    spawned = 0;
    spawnTimer = 0;
    waveHp  = ENEMY_BASE_HP  * (1 + (n - 1) * HP_SCALE);
    waveSpd = ENEMY_BASE_SPD * (1 + (n - 1) * SPD_SCALE);
    waveDmg = ENEMY_BASE_DMG * (1 + (n - 1) * DMG_SCALE);
  }

  function start() { beginWave(1); }

  function onKill() {
    kills++;
    score += KILL_SCORE;
  }

  function update(dt, onWaveComplete) {
    if (state === 'breather') {
      breatherTimer -= dt;
      if (breatherTimer <= 0) beginWave(wave + 1);
      return;
    }

    if (state !== 'active') return;

    // Spawn next batch enemy
    if (spawned < totalToSpawn) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const p = randomSpawnPos();
        enemyPool.spawn(p.x, p.z, waveHp, waveSpd, waveDmg);
        spawned++;
        spawnTimer = SPAWN_INTERVAL;
      }
    }

    // Check if wave cleared
    if (spawned === totalToSpawn && enemyPool.count === 0) {
      score += WAVE_BONUS * wave;
      state = 'breather';
      breatherTimer = BREATHER;
      onWaveComplete(wave);
    }
  }

  function reset() {
    wave = 0; state = 'idle'; score = 0; kills = 0;
    breatherTimer = 0; spawned = 0; totalToSpawn = 0;
  }

  return {
    get wave()          { return wave; },
    get state()         { return state; },
    get score()         { return score; },
    get kills()         { return kills; },
    get breatherTimer() { return breatherTimer; },
    get breatherTotal() { return BREATHER; },
    get nextWave()      { return wave + 1; },
    start, update, onKill, reset,
  };
}
