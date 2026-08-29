import type { Stats } from '../domain/types';

// ============ 可选角色 ============

import type { SkillKey } from './skills';

export interface CharacterDef {
  key: string;
  name: string;
  sprite: string;
  desc: string;
  start: string; // 起始武器键
  mod: Partial<Stats>;
  startSkill?: SkillKey;        // 特性：初始技能
  unlockKills?: number;         // 特性：局外解锁所需累计击杀
}

export const CHARACTERS: CharacterDef[] = [
  {
    key: 'adventurer', name: '冒险家', sprite: 'player/adventurer',
    desc: '初出茅庐的流浪者，各项属性均衡，起手一把橡木魔杖。',
    start: 'pistol', mod: {},
  },
  {
    key: 'apprentice', name: '小学徒', sprite: 'player/apprentice',
    desc: '暴击率 +15%，闪避 +10%，幸运 +3，最大生命 -8。初始技能：闪电链。',
    start: 'boomerang', startSkill: 'chain', mod: { crit: 0.15, dodge: 0.10, luck: 3, maxHp: -8 },
  },
  {
    key: 'berserker', name: '狂战士', sprite: 'player/berserker',
    desc: '攻速 +25%，移速 +12%，最大生命 -12。初始技能：狂化。',
    start: 'club', startSkill: 'frenzy', mod: { aspd: 0.25, speed: 0.12, maxHp: -12 },
  },
  {
    key: 'knight', name: '铁卫骑士', sprite: 'player/knight',
    desc: '最大生命 +35，护甲 +4，伤害 +10%，移速 -18%。初始技能：圣盾术。',
    start: 'club', startSkill: 'barrier', mod: { maxHp: 35, armor: 4, dmg: 0.10, speed: -0.18 },
  },
  {
    key: 'gunner', name: '机关薯', sprite: 'player/adventurer',
    desc: '累计击杀 300 解锁。远距狙击起手，天生 +10% 暴击。',
    start: 'sniper', mod: { crit: 0.10, maxHp: -5 }, unlockKills: 300,
  },
  {
    key: 'summoner', name: '召唤师', sprite: 'player/apprentice',
    desc: '累计击杀 800 解锁。召唤精灵协战，幸运 +2。',
    start: 'totem', mod: { luck: 2, maxHp: -6 }, unlockKills: 800,
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
