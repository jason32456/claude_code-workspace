import { BUILDINGS, BUILD_ORDER, TERRAIN } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      topbar: $('topbar'), buildbar: $('buildbar'), inspector: $('inspector'),
      mapbox: $('mapbox'), toast: $('toast'), overlay: $('overlay'),
      titleCard: $('title-card'), endCard: $('end-card'),
      alloy: $('alloy-val'), alloyRate: $('alloy-rate'),
      powerFill: $('power-fill'), powerGhost: $('power-ghost'), powerBar: document.querySelector('.bar.power'),
      powerVal: $('power-val'), powerCap: $('power-cap'), powerFlow: $('power-flow'),
      coreFill: $('core-fill'), coreVal: $('core-val'),
      wave: $('wave-val'), waveState: $('wave-state'),
      timer: $('timer-val'), timerLabel: $('timer-label'),
      callWave: $('call-wave'), pause: $('pause-btn'), mute: $('mute-btn'),
      inspTitle: $('insp-title'), inspSub: $('insp-sub'), inspStats: $('insp-stats'),
      upgrade: $('btn-upgrade'), sell: $('btn-sell'),
      endTitle: $('end-title'), endSub: $('end-sub'), endStats: $('end-stats'),
      minimap: $('minimap'), help: $('help'),
    };
    this.ctx = this.el.minimap.getContext('2d');
    this.terrainLayer = null;
    this.toastTimer = 0;
    this.buildCards = {};
    this.buildBuildBar();

    $('start-btn').onclick = () => game.begin();
    $('again-btn').onclick = () => game.restart();
    $('help-btn').onclick = () => this.el.help.classList.remove('hidden');
    $('help-close').onclick = () => this.el.help.classList.add('hidden');
    this.el.callWave.onclick = () => game.callWave();
    this.el.pause.onclick = () => game.togglePause();
    this.el.mute.onclick = () => game.toggleMute();
    this.el.upgrade.onclick = () => game.upgradeSelected();
    this.el.sell.onclick = () => game.sellSelected();
  }

  buildBuildBar() {
    this.el.buildbar.innerHTML = '';
    for (const key of BUILD_ORDER) {
      const def = BUILDINGS[key];
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.innerHTML = `<span class="k">${def.hotkey}</span>
        <span class="ic">${def.glyph}</span>
        <span class="nm">${def.name.toUpperCase()}</span>
        <span class="cost">◈ ${def.cost}</span>`;
      btn.title = def.blurb;
      btn.onclick = () => this.game.selectBuild(key);
      this.el.buildbar.appendChild(btn);
      this.buildCards[key] = btn;
    }
  }

  enterGame() {
    this.el.overlay.classList.add('hidden');
    for (const k of ['topbar', 'buildbar', 'mapbox']) this.el[k].classList.remove('hidden');
    this.terrainLayer = null;
  }

  toast(msg, bad = false) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.toggle('bad', bad);
    this.el.toast.classList.add('show');
    this.toastTimer = 2.1;
  }

  showEnd(win, stats) {
    this.el.overlay.classList.remove('hidden');
    this.el.titleCard.classList.add('hidden');
    this.el.endCard.classList.remove('hidden');
    this.el.endTitle.textContent = win ? 'DAWN HOLDS' : 'GRID LOST';
    this.el.endTitle.classList.toggle('win', win);
    this.el.endSub.textContent = win
      ? 'Twelve waves broken on the terminator. The Blight burns off in the light.'
      : 'The vents are open. The crust is theirs.';
    this.el.endStats.innerHTML = Object.entries(stats)
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  update(dt) {
    const g = this.game;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    if (g.phase === 'title') return;

    this.el.alloy.textContent = Math.floor(g.alloy);
    this.el.alloyRate.textContent = `+${g.alloyRate.toFixed(1)}/s`;

    const cap = Math.max(1, g.powerCap);
    this.el.powerFill.style.width = `${(g.charge / cap) * 100}%`;
    this.el.powerGhost.style.width = `${Math.min(100, (g.production / Math.max(g.demand, g.production, 1)) * 100)}%`;
    this.el.powerVal.textContent = Math.round(g.charge);
    this.el.powerCap.textContent = Math.round(g.powerCap);
    const flow = g.production - g.demand;
    this.el.powerFlow.textContent = `${flow >= 0 ? '+' : ''}${flow.toFixed(1)}`;
    this.el.powerFlow.className = `flow ${flow >= 0 ? 'pos' : 'neg'}`;
    this.el.powerBar.classList.toggle('brown', g.powerScale < 0.999 && g.powerScale > 0.35);
    this.el.powerBar.classList.toggle('dead', g.powerScale <= 0.35);

    const integ = Math.max(0, g.integrity);
    this.el.coreFill.style.width = `${integ}%`;
    this.el.coreVal.textContent = Math.ceil(integ);

    this.el.wave.textContent = `${Math.max(1, g.wave)} / ${g.totalWaves}`;
    this.el.waveState.textContent = g.paused ? 'PAUSED'
      : g.phase === 'build' ? 'BUILD PHASE' : 'UNDER ATTACK';
    if (g.phase === 'build') {
      this.el.timer.textContent = fmt(g.timer);
      this.el.timerLabel.textContent = 'UNTIL DROP';
      this.el.callWave.classList.add('ready');
      this.el.callWave.disabled = false;
      this.el.callWave.innerHTML = `CALL WAVE <kbd>+${Math.floor(g.timer * 2)}◈</kbd>`;
    } else {
      this.el.timer.textContent = `${g.enemies.length}`;
      this.el.timerLabel.textContent = 'HOSTILES';
      this.el.callWave.classList.remove('ready');
      this.el.callWave.disabled = true;
      this.el.callWave.innerHTML = 'WAVE RUNNING';
    }

    for (const key of BUILD_ORDER) {
      const btn = this.buildCards[key];
      btn.classList.toggle('active', g.selectedBuild === key);
      btn.classList.toggle('poor', g.alloy < BUILDINGS[key].cost);
    }

    this.updateInspector();
    this.drawMinimap();
  }

  updateInspector() {
    const g = this.game;
    const b = g.selectedBuilding;
    if (!b) { this.el.inspector.classList.add('hidden'); return; }
    this.el.inspector.classList.remove('hidden');
    this.el.inspTitle.textContent = `${b.def.name.toUpperCase()}  L${b.level}`;
    this.el.inspSub.textContent = b.def.blurb;
    const rows = [['Integrity', `${Math.ceil(b.hp)} / ${b.maxHp}`]];
    if (b.def.solar) {
      const links = g.solarLinks(b);
      rows.push(['Output', `${g.solarOutput(b).toFixed(1)} PW/s`]);
      rows.push(['Array link', links ? `+${Math.round(links * 22)}% (${links})` : 'none']);
    }
    if (b.def.storage) rows.push(['Storage', `${b.scaled('storage').toFixed(0)} PW`]);
    if (b.def.alloy) rows.push(['Yield', `${b.scaled('alloy').toFixed(1)} AL/s`]);
    if (b.def.damage) {
      rows.push(['Damage', b.scaled('damage').toFixed(0)]);
      rows.push(['Rate', `${b.scaled('rate').toFixed(1)}/s`]);
      rows.push(['Range', b.def.range.toFixed(1)]);
      rows.push(['Draw', b.def.firePower ? `${b.def.firePower} PW/s` : 'none']);
      rows.push(['Air', b.def.hitsAir ? 'yes' : 'no']);
    }
    rows.push(['Sunlight', `${Math.round(b.tile.sun * 100)}%`]);
    this.el.inspStats.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    const maxed = b.level >= 3;
    this.el.upgrade.disabled = maxed || g.alloy < b.upgradeCost;
    this.el.upgrade.innerHTML = maxed ? 'MAX LEVEL' : `UPGRADE ◈${b.upgradeCost} <kbd>U</kbd>`;
    this.el.sell.innerHTML = `SELL ◈${b.sellValue} <kbd>X</kbd>`;
  }

  // Equirectangular surface map: the answer to "half the planet is behind the
  // planet". Terrain is cached once; only the night band and units redraw.
  drawMinimap() {
    const g = this.game;
    const ctx = this.ctx;
    const W = this.el.minimap.width;
    const H = this.el.minimap.height;
    if (!this.terrainLayer) this.bakeTerrain(W, H);
    ctx.drawImage(this.terrainLayer, 0, 0);

    const s = g.sunDir;
    ctx.fillStyle = 'rgba(2, 5, 14, 0.62)';
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2 - Math.PI;
      const A = Math.cos(lon) * s.x + Math.sin(lon) * s.z;
      if (Math.abs(s.y) < 1e-4) {
        if (A <= 0) ctx.fillRect(x, 0, 1, H);
        continue;
      }
      const latB = Math.atan(-A / s.y);
      const yB = ((Math.PI / 2 - latB) / Math.PI) * H;
      if (s.y > 0) ctx.fillRect(x, yB, 1, H - yB);
      else ctx.fillRect(x, 0, 1, yB);
    }

    for (const b of g.buildings) {
      const [x, y] = project(b.tile, W, H);
      ctx.fillStyle = b.isTurret ? '#4fd6ff' : '#8fb4cc';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const id of g.ventIds) {
      const [x, y] = project(g.tiles[id], W, H);
      ctx.strokeStyle = '#ff8b3d';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const e of g.enemies) {
      const lat = Math.asin(clamp(e.pos.y / e.pos.length()));
      const lon = Math.atan2(e.pos.z, e.pos.x);
      const x = ((lon + Math.PI) / (Math.PI * 2)) * W;
      const y = ((Math.PI / 2 - lat) / Math.PI) * H;
      ctx.fillStyle = e.def.flying ? '#7fe6ff' : '#e04fd0';
      ctx.fillRect(x - 1, y - 1, 2.4, 2.4);
    }

    for (const p of g.fx.pods) {
      const [x, y] = project(g.tiles[p.tileId], W, H);
      const k = 4 + Math.abs(Math.sin(p.t * 9)) * 4;
      ctx.strokeStyle = '#ff4fd0';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, k, 0, Math.PI * 2);
      ctx.stroke();
    }

    const cam = g.view.camera.position;
    const lat = Math.asin(clamp(cam.y / cam.length()));
    const lon = Math.atan2(cam.z, cam.x);
    const cx = ((lon + Math.PI) / (Math.PI * 2)) * W;
    const cy = ((Math.PI / 2 - lat) / Math.PI) * H;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
    ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
    ctx.stroke();
  }

  bakeTerrain(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#101f2c';
    ctx.fillRect(0, 0, W, H);
    // Tiles are ~7 px apart at the equator and converge toward the poles, so
    // each one is drawn a little wider than its spacing to close the seams.
    for (const t of this.game.tiles) {
      if (t.type === TERRAIN.BASIN) continue;
      const [x, y] = project(t, W, H);
      ctx.fillStyle = t.type === TERRAIN.RIDGE ? '#565049'
        : t.type === TERRAIN.ORE ? '#b8832f' : '#7d6844';
      const w = Math.min(34, 8 / Math.max(0.24, Math.cos(t.lat)));
      ctx.fillRect(x - w / 2, y - 4, w, 8);
    }
    this.terrainLayer = c;
  }
}

function project(tile, W, H) {
  return [
    ((tile.lon + Math.PI) / (Math.PI * 2)) * W,
    ((Math.PI / 2 - tile.lat) / Math.PI) * H,
  ];
}

const clamp = (v) => Math.max(-1, Math.min(1, v));

function fmt(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
