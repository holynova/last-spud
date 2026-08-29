/** 空间网格：邻近查询从 O(n²) 降到近似 O(n)。
 *  网格存引用，查询到的实体坐标始终实时；
 *  插入按实体中心所在格，查询方需自带最大半径余量。
 */
export class SpatialGrid<T extends { x: number; y: number }> {
  private map = new Map<number, T[]>();

  constructor(public cell = 96) {}

  clear(): void {
    this.map.clear();
  }

  insert(e: T): void {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return;
    const k = Math.floor(e.x / this.cell) * 4096 + Math.floor(e.y / this.cell);
    const arr = this.map.get(k);
    if (arr) arr.push(e);
    else this.map.set(k, [e]);
  }

  /** 收集 (x,y) 半径 r 覆盖格内的实体到 out（调用方仍需精确距离判定）。
   *  非有限坐标或异常半径一律返回空，杜绝 ±Infinity 无限循环。 */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(r >= 0) || r > 4096) return out;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.map.get(cx * 4096 + cy);
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  }
}

/** 查询余量：敌人最大半径（Boss 50）+ 保险 */
export const GRID_MARGIN = 54;
