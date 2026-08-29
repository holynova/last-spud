/** 全局常量：世界尺寸、画布基准 */
export const ARENA_W = 2000;
export const ARENA_H = 1300;
export const WALL = 48;             // 边界墙厚度（16px 墙砖 × 3）
export const TOTAL_WAVES = 12;
export const MAX_WEAPONS = 6;
export const MAX_SKILLS = 3;
export const SKILL_MAX_LEVEL = 5;

/** 素材键 → URL（public/assets 下的相对路径） */
export const assetUrl = (key: string): string => `assets/${key}.png`;
