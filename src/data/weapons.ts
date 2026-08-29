// ============ 武器配置与阶数成长 ============

export type WeaponKind = 'gun' | 'shotgun' | 'throw' | 'boomerang' | 'melee' | 'beam' | 'aura' | 'summon';
export type WeaponTag = 'fire' | 'electric' | 'melee' | 'throw';

export interface WeaponDef {
  name: string;
  icon: string;       // 素材键 assets/weapon/<icon>.png
  kind: WeaponKind;
  color: string;
  dmg: number;
  cd: number;         // 基础冷却（秒）
  range: number;
  pspd?: number;      // 弹速
  count?: number;     // 一次发射数量
  pierce?: number;    // 穿透数
  kb?: number;        // 击退
  spread?: number;    // 散布弧度
  life?: number;      // 弹药寿命（覆盖射程换算）
  arc?: number;       // 近战扇形角
  tags?: WeaponTag[]; // 流派标签（协同道具加成）
  desc: string;
}

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    name: '橡木魔杖', icon: 'weapon/pistol', kind: 'gun', color: '#c9a86a',
    dmg: 13, cd: 0.85, range: 330, pspd: 560, count: 1, pierce: 0, kb: 90,
    tags: ['electric'],
    desc: '学徒的起手魔杖，射速稳定',
  },
  smg: {
    name: '毒藤魔杖', icon: 'weapon/smg', kind: 'gun', color: '#8fd86e',
    dmg: 5, cd: 0.2, range: 280, pspd: 620, count: 1, pierce: 0, kb: 30, spread: 0.14,
    tags: ['electric'],
    desc: '射速极快的毒刺连发',
  },
  shotgun: {
    name: '碎石战斧', icon: 'weapon/shotgun', kind: 'shotgun', color: '#c9b06a',
    dmg: 8, cd: 1.35, range: 240, pspd: 500, count: 5, spread: 0.5, pierce: 0, kb: 160, life: 0.55,
    tags: ['melee'],
    desc: '近身一击崩出 5 枚碎石',
  },
  sniper: {
    name: '符文长剑', icon: 'weapon/sniper', kind: 'gun', color: '#e8e6ff',
    dmg: 42, cd: 2.0, range: 540, pspd: 1000, count: 1, pierce: 3, kb: 240,
    desc: '射出贯穿 3 人的符文剑气',
  },
  knife: {
    name: '飞刀', icon: 'weapon/knife', kind: 'throw', color: '#d8f0ff',
    dmg: 15, cd: 0.62, range: 310, pspd: 600, count: 1, pierce: 2, kb: 70, spread: 0.05,
    tags: ['throw'],
    desc: '掷出并穿透 2 个敌人',
  },
  boomerang: {
    name: '回旋飞斧', icon: 'weapon/boomerang', kind: 'boomerang', color: '#c9f06e',
    dmg: 11, cd: 1.5, range: 350, pspd: 440, pierce: 99, kb: 90,
    tags: ['throw'],
    desc: '掷出后飞回手中，两段伤害',
  },
  club: {
    name: '战锤', icon: 'weapon/club', kind: 'melee', color: '#e8b04b',
    dmg: 26, cd: 1.05, range: 105, arc: 2.4, kb: 320,
    tags: ['melee'],
    desc: '扇形横扫，击退效果极强',
  },
  laser: {
    name: '冰霜射线', icon: 'weapon/laser', kind: 'beam', color: '#7ec8ff',
    dmg: 17, cd: 1.15, range: 400,
    desc: '贯穿一条直线上的所有敌人',
  },
  aura: {
    name: '风暴图腾', icon: 'weapon/aura', kind: 'aura', color: '#c88fff',
    dmg: 7, cd: 1.0, range: 125,
    desc: '周期电击周身所有敌人',
  },
  totem: {
    name: '精灵图腾', icon: 'skill/chain', kind: 'summon', color: '#8ee05a',
    dmg: 9, cd: 8, range: 380, pspd: 520, pierce: 0, kb: 40,
    tags: ['electric'],
    desc: '召唤小精灵协战 8 秒（至多 2 个）',
  },
  flamer: {
    name: '喷火魔杖', icon: 'weapon/flamer', kind: 'gun', color: '#ff9530',
    dmg: 3.5, cd: 0.07, range: 190, pspd: 300, count: 1, pierce: 1, kb: 20, spread: 0.4, life: 0.55,
    tags: ['fire'],
    desc: '短程火焰喷射，弹幕成片',
  },
};

export const TIER_NAMES = ['普通', '精良', '稀有', '史诗'] as const;
export const TIER_COLORS = ['#9aa4ad', '#5ad06e', '#4aa3ff', '#c86bff'] as const;
export type WeaponTier = 1 | 2 | 3 | 4;

export interface WeaponStats extends WeaponDef {
  key: string;
  tier: WeaponTier;
}

const statsCache = new Map<string, WeaponStats>();

/** 阶数成长：伤害 ×(1+0.55×(tier-1))，冷却 ×0.94^(tier-1)，射程 +7%/阶（带缓存） */
export function weaponStats(key: string, tier: WeaponTier): WeaponStats {
  const cacheKey = key + tier;
  const hit = statsCache.get(cacheKey);
  if (hit) return hit;
  const def = WEAPONS[key];
  if (!def) throw new Error(`未知武器: ${key}`);
  const m = 1 + 0.55 * (tier - 1);
  const c = Math.pow(0.94, tier - 1);
  const s: WeaponStats = {
    ...def,
    key, tier,
    dmg: def.dmg * m,
    cd: def.cd * c,
    range: def.range * (1 + 0.07 * (tier - 1)),
  };
  statsCache.set(cacheKey, s);
  return s;
}
