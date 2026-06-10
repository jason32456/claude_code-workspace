import * as PIXI from 'pixi.js';
import { World } from '../ecs/World';
import { C } from '../components';
import type { CTileMap, CCamera, CTransform, CVelocity, CPlayer, CSprite } from '../components';
import type { InputManager } from '../input/InputManager';
import { SaveManager } from '../save/SaveManager';
import { createTestRoom } from '../world/testRoom';
import {
  GAME_WIDTH, GAME_HEIGHT, TILE_SIZE,
  PLAYER_W, PLAYER_H, PLAYER_SPEED, CAMERA_LERP,
  TILE_WALL,
  PAL_BG, PAL_FLOOR, PAL_FLOOR2, PAL_WALL, PAL_WALL_TOP,
  PAL_PLAYER, PAL_PLAYER2, PAL_HUD_TEXT,
  PAL_FLASH_OK, PAL_FLASH_ERR,
} from '../constants';

// ── helpers ──────────────────────────────────────────────────────────────────

function isSolid(tm: CTileMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= tm.width || ty >= tm.height) return true;
  return tm.solids.has(tm.tiles[ty * tm.width + tx]);
}

function resolveMove(
  tm: CTileMap,
  px: number, py: number,
  vx: number, vy: number,
  pw: number, ph: number,
): { x: number; y: number } {
  // Move X first
  let nx = px + vx;
  const ty0 = Math.floor(py / TILE_SIZE);
  const ty1 = Math.floor((py + ph - 1) / TILE_SIZE);
  const txL = Math.floor(nx / TILE_SIZE);
  const txR = Math.floor((nx + pw - 1) / TILE_SIZE);
  let xBlocked = false;
  outer:
  for (let ty = ty0; ty <= ty1; ty++) {
    for (const tx of [txL, txR]) {
      if (isSolid(tm, tx, ty)) { xBlocked = true; break outer; }
    }
  }
  if (xBlocked) nx = px;

  // Move Y next
  let ny = py + vy;
  const tx0 = Math.floor(nx / TILE_SIZE);
  const tx1 = Math.floor((nx + pw - 1) / TILE_SIZE);
  const tyU = Math.floor(ny / TILE_SIZE);
  const tyD = Math.floor((ny + ph - 1) / TILE_SIZE);
  let yBlocked = false;
  outer2:
  for (let tx = tx0; tx <= tx1; tx++) {
    for (const ty of [tyU, tyD]) {
      if (isSolid(tm, tx, ty)) { yBlocked = true; break outer2; }
    }
  }
  if (yBlocked) ny = py;

  return { x: nx, y: ny };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── flash message ─────────────────────────────────────────────────────────────

interface FlashMsg {
  text: string;
  color: number;
  ttl: number;
}

// ── Game class ────────────────────────────────────────────────────────────────

export class Game {
  private app: PIXI.Application;
  private world = new World();
  private save = new SaveManager();
  private input: InputManager;

  private playerEntity!: number;
  private tilemapEntity!: number;
  private cameraEntity!: number;

  // PixiJS display layers
  private worldContainer!: PIXI.Container;
  private tilemapGfx!: PIXI.Graphics;
  private playerGfx!: PIXI.Graphics;
  private hudContainer!: PIXI.Container;
  private hudText!: PIXI.Text;
  private flashText!: PIXI.Text;

  private flashMsg: FlashMsg | null = null;
  private autoSaveTimer = 0;
  private readonly AUTO_SAVE_INTERVAL = 30; // seconds

  constructor(canvas: HTMLCanvasElement, inputManager: InputManager) {
    this.input = inputManager;
    this.app = new PIXI.Application({
      view: canvas as unknown as HTMLCanvasElement,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: PAL_BG,
      resolution: 1,
      antialias: false,
    });
  }

  async init(): Promise<void> {
    await this.save.init();

    // Load save or use defaults
    const saveData = await this.save.load(0);
    const startX = saveData?.playerX ?? 3 * TILE_SIZE;
    const startY = saveData?.playerY ?? 3 * TILE_SIZE;

    // Create display layers
    this.worldContainer = new PIXI.Container();
    this.hudContainer = new PIXI.Container();
    this.app.stage.addChild(this.worldContainer);
    this.app.stage.addChild(this.hudContainer);

    // Build tilemap
    const tmData = createTestRoom();
    this.tilemapGfx = this.buildTilemapGfx(tmData);
    this.worldContainer.addChild(this.tilemapGfx);

    // Build player gfx
    this.playerGfx = this.buildPlayerGfx();
    this.worldContainer.addChild(this.playerGfx);

    // ECS entities
    this.tilemapEntity = this.world.createEntity();
    this.world.add<CTileMap>(this.tilemapEntity, C.TILEMAP, tmData);

    this.playerEntity = this.world.createEntity();
    this.world.add<CTransform>(this.playerEntity, C.TRANSFORM, {
      x: startX, y: startY, w: PLAYER_W, h: PLAYER_H,
    });
    this.world.add<CVelocity>(this.playerEntity, C.VELOCITY, { vx: 0, vy: 0 });
    this.world.add<CPlayer>(this.playerEntity, C.PLAYER, { facing: 'down' });
    this.world.add<CSprite>(this.playerEntity, C.SPRITE, {
      container: this.worldContainer,
      body: this.playerGfx,
    });

    this.cameraEntity = this.world.createEntity();
    const hw = GAME_WIDTH / 2, hh = GAME_HEIGHT / 2;
    this.world.add<CCamera>(this.cameraEntity, C.CAMERA, {
      x: startX + PLAYER_W / 2,
      y: startY + PLAYER_H / 2,
      minX: hw,       maxX: tmData.pixelWidth - hw,
      minY: hh,       maxY: tmData.pixelHeight - hh,
    });

    // HUD
    this.buildHud();

    // Start loop
    this.app.ticker.add(this.tick, this);
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  private tick(): void {
    const dt = this.app.ticker.deltaMS / 1000;
    const input = this.input.snapshot();

    this.systemInput(dt, input);
    this.systemMovement(dt);
    this.systemCamera(dt);
    this.systemRender();
    this.systemHud(dt, input);

    this.autoSaveTimer += dt;
    if (this.autoSaveTimer >= this.AUTO_SAVE_INTERVAL) {
      this.autoSaveTimer = 0;
      this.doSave();
    }

    if (input.save) this.doSave();
    if (input.load) this.doLoad();

    this.input.flush();
    this.world.flushDestroyed();
  }

  // ── Systems ───────────────────────────────────────────────────────────────

  private systemInput(_dt: number, input: ReturnType<InputManager['snapshot']>): void {
    const vel = this.world.get<CVelocity>(this.playerEntity, C.VELOCITY);
    const player = this.world.get<CPlayer>(this.playerEntity, C.PLAYER);

    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      vel.vx = (dx / len) * PLAYER_SPEED;
      vel.vy = (dy / len) * PLAYER_SPEED;
      if (Math.abs(dx) >= Math.abs(dy)) {
        player.facing = dx > 0 ? 'right' : 'left';
      } else {
        player.facing = dy > 0 ? 'down' : 'up';
      }
    } else {
      vel.vx = 0;
      vel.vy = 0;
    }
  }

  private systemMovement(dt: number): void {
    const tm = this.world.get<CTileMap>(this.tilemapEntity, C.TILEMAP);
    const tr = this.world.get<CTransform>(this.playerEntity, C.TRANSFORM);
    const vel = this.world.get<CVelocity>(this.playerEntity, C.VELOCITY);

    if (vel.vx === 0 && vel.vy === 0) return;

    const { x, y } = resolveMove(tm, tr.x, tr.y, vel.vx * dt, vel.vy * dt, tr.w, tr.h);
    tr.x = Math.max(0, Math.min(tm.pixelWidth - tr.w, x));
    tr.y = Math.max(0, Math.min(tm.pixelHeight - tr.h, y));
  }

  private systemCamera(dt: number): void {
    const tr = this.world.get<CTransform>(this.playerEntity, C.TRANSFORM);
    const cam = this.world.get<CCamera>(this.cameraEntity, C.CAMERA);

    const targetX = tr.x + tr.w / 2;
    const targetY = tr.y + tr.h / 2;
    const t = Math.min(1, CAMERA_LERP * dt);
    cam.x = lerp(cam.x, targetX, t);
    cam.y = lerp(cam.y, targetY, t);
    cam.x = Math.max(cam.minX, Math.min(cam.maxX, cam.x));
    cam.y = Math.max(cam.minY, Math.min(cam.maxY, cam.y));
  }

  private systemRender(): void {
    const tr = this.world.get<CTransform>(this.playerEntity, C.TRANSFORM);
    const player = this.world.get<CPlayer>(this.playerEntity, C.PLAYER);
    const cam = this.world.get<CCamera>(this.cameraEntity, C.CAMERA);

    // Update world container offset
    this.worldContainer.position.set(
      Math.round(GAME_WIDTH / 2 - cam.x),
      Math.round(GAME_HEIGHT / 2 - cam.y),
    );

    // Update player gfx position
    this.playerGfx.position.set(Math.round(tr.x), Math.round(tr.y));

    // Redraw facing indicator on player
    this.playerGfx.clear();
    // Body
    this.playerGfx.beginFill(PAL_PLAYER).drawRect(0, 0, tr.w, tr.h).endFill();
    // Shadow/base
    this.playerGfx.beginFill(PAL_PLAYER2).drawRect(0, tr.h - 3, tr.w, 3).endFill();
    // Facing dot
    this.playerGfx.beginFill(0x4a3a2a);
    switch (player.facing) {
      case 'up':    this.playerGfx.drawRect(tr.w / 2 - 1, 1, 2, 2); break;
      case 'down':  this.playerGfx.drawRect(tr.w / 2 - 1, tr.h - 5, 2, 2); break;
      case 'left':  this.playerGfx.drawRect(1, tr.h / 2 - 1, 2, 2); break;
      case 'right': this.playerGfx.drawRect(tr.w - 3, tr.h / 2 - 1, 2, 2); break;
    }
    this.playerGfx.endFill();
  }

  private systemHud(dt: number, _input: ReturnType<InputManager['snapshot']>): void {
    const tr = this.world.get<CTransform>(this.playerEntity, C.TRANSFORM);
    const fps = Math.round(this.app.ticker.FPS);
    const tileX = Math.floor(tr.x / TILE_SIZE);
    const tileY = Math.floor(tr.y / TILE_SIZE);

    this.hudText.text =
      `PALLBEARER  Phase 0\n` +
      `Pos: (${Math.round(tr.x)}, ${Math.round(tr.y)})  Tile: (${tileX}, ${tileY})\n` +
      `FPS: ${fps}\n` +
      `[WASD/Arrows] Move  [F] Save  [G] Load`;

    if (this.flashMsg) {
      this.flashMsg.ttl -= dt;
      this.flashText.text = this.flashMsg.text;
      this.flashText.style.fill = this.flashMsg.color;
      this.flashText.alpha = Math.min(1, this.flashMsg.ttl * 2);
      if (this.flashMsg.ttl <= 0) {
        this.flashMsg = null;
        this.flashText.text = '';
      }
    }
  }

  // ── Save / Load ───────────────────────────────────────────────────────────

  private async doSave(): Promise<void> {
    const tr = this.world.get<CTransform>(this.playerEntity, C.TRANSFORM);
    try {
      await this.save.save(0, { playerX: tr.x, playerY: tr.y, regionId: 'test-room' });
      this.flash('SAVED', PAL_FLASH_OK);
    } catch (_e) {
      this.flash('SAVE FAILED', PAL_FLASH_ERR);
    }
  }

  private async doLoad(): Promise<void> {
    try {
      const data = await this.save.load(0);
      if (!data) { this.flash('NO SAVE FOUND', PAL_FLASH_ERR); return; }
      const tr = this.world.get<CTransform>(this.playerEntity, C.TRANSFORM);
      const cam = this.world.get<CCamera>(this.cameraEntity, C.CAMERA);
      tr.x = data.playerX;
      tr.y = data.playerY;
      cam.x = tr.x + tr.w / 2;
      cam.y = tr.y + tr.h / 2;
      this.flash('LOADED', PAL_FLASH_OK);
    } catch {
      this.flash('LOAD FAILED', PAL_FLASH_ERR);
    }
  }

  private flash(text: string, color: number, duration = 2): void {
    this.flashMsg = { text, color, ttl: duration };
  }

  // ── Build display objects ─────────────────────────────────────────────────

  private buildTilemapGfx(tm: CTileMap): PIXI.Graphics {
    const g = new PIXI.Graphics();
    for (let ty = 0; ty < tm.height; ty++) {
      for (let tx = 0; tx < tm.width; tx++) {
        const tile = tm.tiles[ty * tm.width + tx];
        const px = tx * TILE_SIZE;
        const py = ty * TILE_SIZE;
        if (tile === TILE_WALL) {
          // Wall body
          g.beginFill(PAL_WALL).drawRect(px, py, TILE_SIZE, TILE_SIZE).endFill();
          // Top edge highlight (only if tile above is not wall)
          const above = ty > 0 ? tm.tiles[(ty - 1) * tm.width + tx] : TILE_WALL;
          if (above !== TILE_WALL) {
            g.beginFill(PAL_WALL_TOP).drawRect(px, py, TILE_SIZE, 2).endFill();
          }
        } else {
          // Floor — alternate slightly for visual texture using checker-ish pattern
          const alt = ((tx + ty) % 3 === 0);
          g.beginFill(alt ? PAL_FLOOR2 : PAL_FLOOR).drawRect(px, py, TILE_SIZE, TILE_SIZE).endFill();
        }
      }
    }
    return g;
  }

  private buildPlayerGfx(): PIXI.Graphics {
    return new PIXI.Graphics(); // content drawn each frame in systemRender
  }

  private buildHud(): void {
    const style = new PIXI.TextStyle({
      fontFamily: 'monospace',
      fontSize: 7,
      fill: PAL_HUD_TEXT,
      lineHeight: 10,
    });
    this.hudText = new PIXI.Text('', style);
    this.hudText.position.set(4, 4);
    this.hudContainer.addChild(this.hudText);

    const flashStyle = new PIXI.TextStyle({
      fontFamily: 'monospace',
      fontSize: 9,
      fill: PAL_FLASH_OK,
      fontWeight: 'bold',
    });
    this.flashText = new PIXI.Text('', flashStyle);
    this.flashText.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 20);
    this.flashText.anchor.set(0.5, 0);
    this.hudContainer.addChild(this.flashText);
  }

  destroy(): void {
    this.app.destroy(false, { children: true });
  }
}
