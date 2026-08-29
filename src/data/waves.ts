// ============ 波次成长曲线 ============

export const waveDuration = (w: number): number => 24 + w * 3;
export const waveHpMul = (w: number): number => 1 + 0.42 * (w - 1) + Math.max(0, w - 8) * 0.25;
export const waveDmgMul = (w: number): number => 1 + 0.10 * (w - 1);
export const spawnInterval = (w: number): number => Math.min(1.25, Math.max(0.38, 1.25 - w * 0.07));
export const spawnPerTick = (w: number): number => 1 + Math.floor(w / 4);
export const eliteChance = (w: number): number => (w >= 5 ? 0.035 + w * 0.004 : 0);
