import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/domain/world';
import { createPlayer } from '../../src/domain/PlayerSystem';
import { updateSkills, updateHazards } from '../../src/domain/SkillSystem';
import { skillStats } from '../../src/data/skills';
import { spawnTestEnemy } from './helpers';

function makeWorld() {
  const p = createPlayer('adventurer', 1000, 650, {
    maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
    crit: 0, critMult: 2, armor: 0, dodge: 0, pickup: 90, luck: 0,
  }, 'pistol');
  return createWorld(p, 1);
}

function learn(key: Parameters<typeof skillStats>[0], level = 1) {
  return { key, level, timer: 0, tick: 0, castAnim: 0 };
}

describe('技能数值', () => {
  it('全部 6 种技能等级数值单调成长', () => {
    for (const key of ['shockwave', 'chain', 'firefield', 'barrier', 'frenzy', 'thorns'] as const) {
      let lastDmg = -1, lastCd = Infinity;
      for (const lv of [1, 2, 3, 4, 5]) {
        const s = skillStats(key, lv);
        if (s.dmg > 0) expect(s.dmg).toBeGreaterThan(lastDmg);
        if (key !== 'thorns') expect(s.cd).toBeLessThanOrEqual(lastCd);
        lastDmg = s.dmg; lastCd = s.cd;
      }
    }
  });
});

describe('技能施放', () => {
  it('震荡波伤害并击退范围内敌人', () => {
    const { world } = makeWorld();
    world.player.skills.push(learn('shockwave', 1));
    const e = spawnTestEnemy(world, 'chaser', 1100, 650);
    updateSkills(world, 0.016);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(e.kx).not.toBe(0);
  });

  it('闪电链首跳必中最近敌人', () => {
    const { world } = makeWorld();
    world.player.skills.push(learn('chain', 1));
    const e = spawnTestEnemy(world, 'chaser', 1100, 650);
    updateSkills(world, 0.016);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('烈火结界生成危险区域并周期结算伤害', () => {
    const { world } = makeWorld();
    world.player.skills.push(learn('firefield', 1));
    const e = spawnTestEnemy(world, 'chaser', 1050, 650);
    updateSkills(world, 0.016);
    expect(world.hazards.length).toBe(1);
    const hpAfterCast = e.hp;
    updateHazards(world, 0.5); // 跨过 0.4s 结拍
    expect(e.hp).toBeLessThan(hpAfterCast);
  });

  it('圣盾叠盾且上限两倍', () => {
    const { world } = makeWorld();
    world.player.skills.push(learn('barrier', 1));
    updateSkills(world, 0.016);
    expect(world.player.shield).toBe(16);
    world.player.skills[0].timer = 0;
    updateSkills(world, 0.016);
    expect(world.player.shield).toBe(32);
    world.player.skills[0].timer = 0;
    updateSkills(world, 0.016);
    expect(world.player.shield).toBe(32); // 满层不再叠加
  });

  it('狂化提升攻速', () => {
    const { world } = makeWorld();
    world.player.skills.push(learn('frenzy', 1));
    updateSkills(world, 0.016);
    expect(world.player.frenzyT).toBeGreaterThan(0);
    expect(world.player.frenzyAspd).toBeGreaterThan(0);
  });

  it('荆棘领域持续伤害并减速', () => {
    const { world } = makeWorld();
    world.player.skills.push(learn('thorns', 1));
    const e = spawnTestEnemy(world, 'chaser', 1050, 650);
    const before = e.hp;
    updateSkills(world, 0.016);
    updateSkills(world, 0.4);
    expect(e.hp).toBeLessThan(before);
    expect(e.slowT).toBeGreaterThan(0);
  });

  it('冷却期间不重复施放', () => {
    const { world } = makeWorld();
    world.player.skills.push(learn('shockwave', 1));
    const e = spawnTestEnemy(world, 'chaser', 1100, 650);
    updateSkills(world, 0.016);
    const hpAfterFirst = e.hp;
    updateSkills(world, 0.016);
    expect(e.hp).toBe(hpAfterFirst); // 冷却中
    expect(world.player.skills[0].timer).toBeGreaterThan(0);
  });
});
