import { describe, expect, it } from 'vitest';
import { SpatialGrid, GRID_MARGIN } from '../../src/domain/SpatialGrid';

interface Pt { x: number; y: number; id: number }

const pt = (id: number, x: number, y: number): Pt => ({ id, x, y });

describe('SpatialGrid', () => {
  it('查询命中范围内的全部实体', () => {
    const g = new SpatialGrid<Pt>(96);
    const a = pt(1, 100, 100), b = pt(2, 150, 130), c = pt(3, 800, 800);
    g.insert(a); g.insert(b); g.insert(c);
    const out = g.query(120, 120, 100, []);
    const ids = out.map(p => p.id).sort();
    expect(ids).toEqual([1, 2]);
  });

  it('非有限坐标插入被忽略', () => {
    const g = new SpatialGrid<Pt>(96);
    g.insert(pt(1, NaN, 100));
    g.insert(pt(2, Infinity, 100));
    expect(g.query(0, 0, 4096, []).length).toBe(0);
  });

  it('非有限/超大半径查询返回空（防 ±Infinity 死循环）', () => {
    const g = new SpatialGrid<Pt>(96);
    g.insert(pt(1, 100, 100));
    expect(g.query(NaN, 100, 100, []).length).toBe(0);
    expect(g.query(100, Infinity, 100, []).length).toBe(0);
    expect(g.query(100, 100, NaN, []).length).toBe(0);
    expect(g.query(100, 100, Infinity, []).length).toBe(0);
    expect(g.query(100, 100, 1e9, []).length).toBe(0);
    expect(g.query(100, 100, 4000, []).map(p => p.id)).toEqual([1]);
  });

  it('clear 后查询为空', () => {
    const g = new SpatialGrid<Pt>(96);
    g.insert(pt(1, 100, 100));
    g.clear();
    expect(g.query(100, 100, 50, []).length).toBe(0);
  });

  it('查询余量常数覆盖最大敌人半径', () => {
    expect(GRID_MARGIN).toBeGreaterThanOrEqual(54);
  });
});
