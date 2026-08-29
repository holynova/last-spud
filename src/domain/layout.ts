import { ARENA_H, ARENA_W, WALL } from '../config';
import type { Rng } from '../utils/rng';

/** 场地静态布局：边界墙坐标与装饰物（纯函数，可单测） */

export interface WallTile { x: number; y: number }
export interface Decor { kind: string; x: number; y: number; scale: number; rotation: number }

export const WALL_TILE = 48; // 16px 墙砖 × 3
export const DECOR_KINDS = ['decor/rock', 'decor/crate', 'decor/barrel', 'decor/anvil'] as const;

/** 边界墙砖坐标（沿四边平铺，含四角） */
export function wallPositions(): WallTile[] {
  const tiles: WallTile[] = [];
  for (let x = 0; x < ARENA_W; x += WALL_TILE) {
    tiles.push({ x: x + WALL_TILE / 2, y: WALL / 2 });
    tiles.push({ x: x + WALL_TILE / 2, y: ARENA_H - WALL / 2 });
  }
  for (let y = WALL_TILE; y < ARENA_H - WALL_TILE; y += WALL_TILE) {
    tiles.push({ x: WALL / 2, y: y + WALL_TILE / 2 });
    tiles.push({ x: ARENA_W - WALL / 2, y: y + WALL_TILE / 2 });
  }
  return tiles;
}

/** 装饰物列表：少量、半透明风格由渲染层决定，这里只产出布局数据 */
export function buildDecorList(rng: Rng, count = 26): Decor[] {
  const list: Decor[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      kind: DECOR_KINDS[Math.floor(rng() * DECOR_KINDS.length)],
      x: 90 + rng() * (ARENA_W - 180),
      y: 90 + rng() * (ARENA_H - 180),
      scale: 1.8 + rng() * 1.6,
      rotation: (rng() - 0.5) * 0.5,
    });
  }
  return list;
}
