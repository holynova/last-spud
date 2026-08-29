// ============ 通用工具 ============
const TAU = Math.PI * 2;

function rand(a = 1, b) {
  return b === undefined ? Math.random() * a : a + Math.random() * (b - a);
}
function irand(a, b) { return Math.floor(rand(a, b + 1)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
}
// 带权随机挑选（items: [{w: 权重, ...}]）
function weightedPick(items) {
  let total = 0;
  for (const it of items) total += it.w;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
// 点到线段的最短距离平方
function pointSegDist2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist2(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist2(px, py, x1 + dx * t, y1 + dy * t);
}

// ============ 空间网格：把邻近查询从 O(n²) 降到近似 O(n) ============
// 网格只存引用不存快照，查询结果里的实体坐标始终是实时值；
// 注意：插入按实体中心点所在格，调用方查询时需自带最大半径余量（敌人最大半径 50，统一 +54）。
class SpatialGrid {
  constructor(cell = 96) {
    this.cell = cell;
    this.map = new Map();
  }
  clear() { this.map.clear(); }
  insert(e) {
    const k = Math.floor(e.x / this.cell) * 4096 + Math.floor(e.y / this.cell);
    const arr = this.map.get(k);
    if (arr) arr.push(e);
    else this.map.set(k, [e]);
  }
  // 收集 (x,y) 半径 r 覆盖的所有格内实体到 out（调用方仍需做精确距离判定）
  query(x, y, r, out) {
    out.length = 0;
    // 防御：非有限坐标或异常半径一律返回空，避免 ±Infinity 边界导致无限循环
    if (!isFinite(x) || !isFinite(y) || !(r >= 0) || r > 4096) return out;
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
