import { SKILLS, SKILL_MAX_LEVEL, type SkillKey } from '../data/skills';
import { UPGRADES, type UpgradeDef } from '../data/items';
import type { PlayerEntity } from './types';
import type { Rng } from '../utils/rng';

// ============ 升级系统：四选一池构建与应用 ============

export type LevelPick =
  | { kind: 'stat'; def: UpgradeDef }
  | { kind: 'skill-new'; key: SkillKey }
  | { kind: 'skill-up'; key: SkillKey; nextLevel: number };

export const MAX_SKILLS = 3;

/** 升级池：属性词条 + 新技能 + 已有技能升级 */
export function buildLevelupPool(p: PlayerEntity): LevelPick[] {
  const pool: LevelPick[] = UPGRADES.map(def => ({ kind: 'stat' as const, def }));
  for (const key of Object.keys(SKILLS) as SkillKey[]) {
    const owned = p.skills.find(s => s.key === key);
    if (owned) {
      if (owned.level < SKILL_MAX_LEVEL) {
        pool.push({ kind: 'skill-up', key, nextLevel: owned.level + 1 });
      }
    } else if (p.skills.length < MAX_SKILLS) {
      pool.push({ kind: 'skill-new', key });
    }
  }
  return pool;
}

/** 带权去重抽取 n 项 */
export function pickLevelUps(pool: LevelPick[], n: number, rng: Rng = Math.random): LevelPick[] {
  const picks: LevelPick[] = [];
  const weights = (pick: LevelPick): number => {
    if (pick.kind === 'stat') return pick.def.w;
    return pick.kind === 'skill-new' ? 7 : 8;
  };
  const avail = pool.slice();
  while (picks.length < n && avail.length) {
    let total = 0;
    for (const it of avail) total += weights(it);
    let r = rng() * total;
    let idx = avail.length - 1;
    for (let i = 0; i < avail.length; i++) {
      r -= weights(avail[i]);
      if (r <= 0) { idx = i; break; }
    }
    picks.push(avail[idx]);
    avail.splice(idx, 1);
  }
  return picks;
}

/** 应用一次升级选择 */
export function applyLevelPick(p: PlayerEntity, pick: LevelPick): void {
  if (pick.kind === 'stat') {
    pick.def.f({ stats: p.stats, hp: p.hp, synergies: p.synergies });
    // maxHp 变更后夹紧当前生命
    p.hp = Math.min(p.hp, p.stats.maxHp);
    if (pick.def.n === '厚皮' || pick.def.n === '钢铁之躯' || pick.def.n === '生命药剂') {
      p.hp = Math.min(p.stats.maxHp, p.hp);
    }
  } else if (pick.kind === 'skill-new') {
    p.skills.push({ key: pick.key, level: 1, timer: 0.5, tick: 0, castAnim: 0 });
  } else {
    const s = p.skills.find(x => x.key === pick.key);
    if (s) s.level = Math.min(SKILL_MAX_LEVEL, s.level + 1);
  }
}

/** 升级选项的展示文案 */
export function describePick(pick: LevelPick): { title: string; desc: string; tag: string; icon: string; color: string } {
  if (pick.kind === 'stat') {
    return { title: pick.def.n, desc: pick.def.d, tag: '属性强化', icon: pick.def.icon, color: '#4aa3ff' };
  }
  const def = SKILLS[pick.key];
  if (pick.kind === 'skill-new') {
    return { title: `新技能：${def.name}`, desc: def.desc, tag: '新技能', icon: def.icon, color: def.color };
  }
  return { title: `${def.name} Lv.${pick.nextLevel - 1} → ${pick.nextLevel}`, desc: def.levelDesc(pick.nextLevel), tag: '技能升级', icon: def.icon, color: def.color };
}
