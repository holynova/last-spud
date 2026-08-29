import type { Stats } from '../domain/types';

// ============ 可选角色 ============

export interface CharacterDef {
  key: string;
  name: string;
  sprite: string;
  desc: string;
  start: string; // 起始武器键
  mod: Partial<Stats>;
}

export const CHARACTERS: CharacterDef[] = [
  {
    key: 'adventurer', name: '冒险家', sprite: 'player/adventurer',
    desc: '初出茅庐的流浪者，各项属性均衡，起手一把橡木魔杖。',
    start: 'pistol', mod: {},
  },
  {
    key: 'berserker', name: '狂战士', sprite: 'player/berserker',
    desc: '攻击速度 +25%，移速 +12%，但最大生命 -12。',
    start: 'club', mod: { aspd: 0.25, speed: 0.12, maxHp: -12 },
  },
  {
    key: 'knight', name: '铁卫骑士', sprite: 'player/knight',
    desc: '最大生命 +35，护甲 +4，伤害 +10%，但移速 -18%。',
    start: 'club', mod: { maxHp: 35, armor: 4, dmg: 0.10, speed: -0.18 },
  },
  {
    key: 'apprentice', name: '小学徒', sprite: 'player/apprentice',
    desc: '暴击率 +15%，闪避 +10%，幸运 +3，最大生命 -8。',
    start: 'boomerang', mod: { crit: 0.15, dodge: 0.10, luck: 3, maxHp: -8 },
  },
];

export function baseStats(): Stats {
  return {
    maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
    crit: 0.05, critMult: 2, armor: 0, dodge: 0.03, pickup: 90, luck: 0,
  };
}

/** 角色修正应用后的初始属性 */
export function characterStats(char: CharacterDef): Stats {
  const stats = baseStats();
  for (const [k, v] of Object.entries(char.mod)) {
    (stats as unknown as Record<string, number>)[k] += v as number;
  }
  return stats;
}
