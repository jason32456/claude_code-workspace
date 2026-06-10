import type { Container, Graphics } from 'pixi.js';

export interface CTransform {
  x: number; // top-left x, world coords
  y: number; // top-left y, world coords
  w: number;
  h: number;
}

export interface CVelocity {
  vx: number;
  vy: number;
}

export interface CPlayer {
  facing: 'up' | 'down' | 'left' | 'right';
}

export interface CTileMap {
  width: number;   // tiles
  height: number;  // tiles
  tiles: Uint8Array;
  solids: ReadonlySet<number>;
  // derived
  pixelWidth: number;
  pixelHeight: number;
}

export interface CCamera {
  x: number; // world coords of screen center
  y: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CSprite {
  container: Container;
  body: Graphics;
}

export const C = {
  TRANSFORM: 'transform',
  VELOCITY:  'velocity',
  PLAYER:    'player',
  TILEMAP:   'tilemap',
  CAMERA:    'camera',
  SPRITE:    'sprite',
} as const;
