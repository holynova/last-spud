import { describe, expect, it } from 'vitest';
import { ARENA_H, ARENA_W, WALL } from '../../src/config';
import { buildDecorList, wallPositions } from '../../src/domain/layout';
import { mulberry32 } from '../../src/utils/rng';

describe('wallPositions', () => {
  it('墙砖铺满四边且都在世界矩形内', () => {
    const tiles = wallPositions();
    expect(tiles.length).toBeGreaterThan(80);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(ARENA_W);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(ARENA_H);
    }
  });

  it('上边墙第一块贴齐左上角', () => {
    const tiles = wallPositions();
    expect(tiles[0]).toEqual({ x: WALL / 2, y: WALL / 2 });
  });

  it('相同输入产出稳定数量', () => {
    expect(wallPositions().length).toBe(wallPositions().length);
  });
});

describe('buildDecorList', () => {
  it('装饰数量与位置范围正确', () => {
    const decor = buildDecorList(mulberry32(42));
    expect(decor).toHaveLength(26);
    for (const d of decor) {
      expect(d.x).toBeGreaterThanOrEqual(90);
      expect(d.x).toBeLessThanOrEqual(2000 - 90);
      expect(d.y).toBeGreaterThanOrEqual(90);
      expect(d.y).toBeLessThanOrEqual(1300 - 90);
      expect(d.scale).toBeGreaterThanOrEqual(1.8);
      expect(['decor/rock', 'decor/crate', 'decor/barrel', 'decor/anvil']).toContain(d.kind);
    }
  });

  it('同种子完全确定（可回放）', () => {
    const a = JSON.stringify(buildDecorList(mulberry32(7)));
    const b = JSON.stringify(buildDecorList(mulberry32(7)));
    expect(a).toBe(b);
  });

  it('不同种子产出不同布局', () => {
    const a = JSON.stringify(buildDecorList(mulberry32(1)));
    const b = JSON.stringify(buildDecorList(mulberry32(2)));
    expect(a).not.toBe(b);
  });
});
