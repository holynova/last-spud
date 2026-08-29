// ============ 敌人配置与波次成长曲线 ============

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  xp: number;
  sprite: string;         // 素材键 enemy/<sprite>
  color?: string;         // 击杀粒子色兜底
  shape?: 'circle' | 'square' | 'tri' | 'blob';
  elite?: boolean;
  boss?: boolean;
  ranged?: boolean;       // 风筝远程
  keep?: number;          // 保持距离
  shootCd?: number;
  pspd?: number;          // 敌方弹速
  explode?: boolean;      // 死亡自爆
  boomDmg?: number;
  boomR?: number;
  splitInto?: string;     // 死亡分裂
  splitCount?: number;
  dashCd?: number;        // Boss 冲锋
}

export const ENEMIES: Record<string, EnemyDef> = {
  chaser:   { name: '独眼怪',   hp: 13,   speed: 100, dmg: 6,  r: 15, xp: 1, sprite: 'enemy/chaser' },
  runner:   { name: '疾风蝠',   hp: 8,    speed: 195, dmg: 4,  r: 13, xp: 1, sprite: 'enemy/runner' },
  spitter:  { name: '毒蛛',     hp: 18,   speed: 75,  dmg: 5,  r: 15, xp: 2, color: '#b07ec9', sprite: 'enemy/spitter',
              ranged: true, keep: 270, shootCd: 2.4, pspd: 250 },
  boomling: { name: '爆爆蟹',   hp: 11,   speed: 140, dmg: 5,  r: 14, xp: 1, color: '#e8a33d', sprite: 'enemy/boomling',
              explode: true, boomDmg: 20, boomR: 85 },
  brute:    { name: '怨灵',     hp: 65,   speed: 55,  dmg: 15, r: 24, xp: 4, color: '#c95b5b', sprite: 'enemy/brute' },
  splitter: { name: '分裂史莱姆', hp: 30, speed: 80,  dmg: 8,  r: 19, xp: 2, color: '#59c9a5', sprite: 'enemy/splitter',
              splitInto: 'splitling', splitCount: 2 },
  splitling:{ name: '小史莱姆',  hp: 10,  speed: 120, dmg: 4,  r: 12, xp: 1, color: '#8fe0c9', sprite: 'enemy/splitling' },
  elite:    { name: '血祭司',   hp: 170,  speed: 85,  dmg: 20, r: 26, xp: 12, color: '#e0559c', sprite: 'enemy/elite', elite: true },
  boss:     { name: '鼠王',     hp: 1600, speed: 62,  dmg: 30, r: 50, xp: 60, color: '#8e44ad', sprite: 'enemy/boss',
              boss: true, shootCd: 1.7, pspd: 220, dashCd: 6 },
};

/** 每波刷怪权重表 */
export function spawnTable(wave: number): Array<{ k: string; w: number }> {
  const t = [{ k: 'chaser', w: 10 }];
  if (wave >= 2) t.push({ k: 'runner', w: 7 });
  if (wave >= 3) t.push({ k: 'spitter', w: 4 });
  if (wave >= 4) t.push({ k: 'boomling', w: 4 });
  if (wave >= 5) t.push({ k: 'brute', w: 3 });
  if (wave >= 6) t.push({ k: 'splitter', w: 3 });
  return t;
}
