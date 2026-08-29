// ============ 技能配置与成长 ============

export type SkillKey = 'shockwave' | 'chain' | 'firefield' | 'barrier' | 'frenzy' | 'thorns';

export interface SkillDef {
  name: string;
  icon: string;   // 素材键 skill/<icon>
  color: string;
  desc: string;
  baseDmg: number;
  baseCd: number;
  baseRange: number;
  jumps?: number;     // 闪电链
  shield?: number;    // 圣盾
  duration?: number;  // 火圈持续 / 狂化持续
  aspdBuff?: number;  // 狂化攻速
  speedBuff?: number; // 狂化移速
  slow?: number;      // 荆棘减速
  perLv: { dmg?: number; cd?: number; range?: number; jumps?: number; shield?: number; duration?: number; aspd?: number };
  levelDesc: (lv: number) => string;
}

export const SKILLS: Record<SkillKey, SkillDef> = {
  shockwave: {
    name: '震荡波', icon: 'skill/shockwave', color: '#ffd257',
    desc: '向四周释放冲击波，伤害并击退所有敌人',
    baseDmg: 16, baseCd: 4.5, baseRange: 210,
    perLv: { dmg: 0.5, cd: -0.12, range: 22 },
    levelDesc: (lv) => `伤害 ${Math.round(16 * (1 + 0.5 * (lv - 1)))} · 半径 ${210 + 22 * (lv - 1)} · 冷却 ${(4.5 - 0.12 * (lv - 1)).toFixed(1)}s`,
  },
  chain: {
    name: '闪电链', icon: 'skill/chain', color: '#7ee8ff',
    desc: '雷击最近的敌人，并在敌人之间连锁跳跃',
    baseDmg: 14, baseCd: 3.2, baseRange: 360, jumps: 3,
    perLv: { dmg: 0.45, jumps: 1 },
    levelDesc: (lv) => `伤害 ${Math.round(14 * (1 + 0.45 * (lv - 1)))} · 跳跃 ${3 + (lv - 1)} 次`,
  },
  firefield: {
    name: '烈火结界', icon: 'skill/firefield', color: '#ff9530',
    desc: '在脚下生成持续燃烧的火圈',
    baseDmg: 10, baseCd: 6.5, baseRange: 110, duration: 3,
    perLv: { dmg: 0.4, range: 12, duration: 0.4 },
    levelDesc: (lv) => `每秒 ${Math.round(10 * (1 + 0.4 * (lv - 1)))} 伤害 · 半径 ${110 + 12 * (lv - 1)} · 持续 ${(3 + 0.4 * (lv - 1)).toFixed(1)}s`,
  },
  barrier: {
    name: '圣盾术', icon: 'skill/barrier', color: '#ffe9a3',
    desc: '周期获得一层护盾，优先抵挡受到的伤害',
    baseDmg: 0, baseCd: 9, baseRange: 0, shield: 16,
    perLv: { shield: 8, cd: -0.3 },
    levelDesc: (lv) => `护盾 ${16 + 8 * (lv - 1)} 点 · 冷却 ${(9 - 0.3 * (lv - 1)).toFixed(1)}s`,
  },
  frenzy: {
    name: '狂化', icon: 'skill/frenzy', color: '#ff6b5e',
    desc: '进入狂化状态：攻速与移速大幅提升',
    baseDmg: 0, baseCd: 11, baseRange: 0, duration: 3, aspdBuff: 0.35, speedBuff: 0.25,
    perLv: { duration: 0.5, aspd: 0.05 },
    levelDesc: (lv) => `持续 ${(3 + 0.5 * (lv - 1)).toFixed(1)}s · 攻速 +${Math.round((0.35 + 0.05 * (lv - 1)) * 100)}% · 移速 +25%`,
  },
  thorns: {
    name: '荆棘领域', icon: 'skill/thorns', color: '#8ee05a',
    desc: '周身缠绕荆棘，持续伤害并减速靠近的敌人',
    baseDmg: 6, baseCd: 0, baseRange: 95, slow: 0.35,
    perLv: { dmg: 0.5, range: 10 },
    levelDesc: (lv) => `每秒 ${Math.round(6 * (1 + 0.5 * (lv - 1)))} 伤害 · 半径 ${95 + 10 * (lv - 1)} · 减速 35%`,
  },
};

export const SKILL_MAX_LEVEL = 5;

export interface SkillRuntime {
  key: SkillKey;
  level: number;
  timer: number;
  tick: number;
  castAnim: number;
}

/** 技能等级数值（带缓存） */
const cache = new Map<string, SkillRuntimeStats>();
export interface SkillRuntimeStats {
  dmg: number; cd: number; range: number;
  jumps: number; shield: number; duration: number; aspdBuff: number; slow: number;
}

export function skillStats(key: SkillKey, level: number): SkillRuntimeStats {
  const ck = key + level;
  const hit = cache.get(ck);
  if (hit) return hit;
  const d = SKILLS[key];
  const lv = level - 1;
  const s: SkillRuntimeStats = {
    dmg: d.baseDmg * (1 + (d.perLv.dmg ?? 0) * lv),
    cd: Math.max(0.5, d.baseCd + (d.perLv.cd ?? 0) * lv),
    range: d.baseRange + (d.perLv.range ?? 0) * lv,
    jumps: (d.jumps ?? 0) + (d.perLv.jumps ?? 0) * lv,
    shield: (d.shield ?? 0) + (d.perLv.shield ?? 0) * lv,
    duration: (d.duration ?? 0) + (d.perLv.duration ?? 0) * lv,
    aspdBuff: (d.aspdBuff ?? 0) + (d.perLv.aspd ?? 0) * lv,
    slow: d.slow ?? 0,
  };
  cache.set(ck, s);
  return s;
}
