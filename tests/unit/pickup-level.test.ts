import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/domain/world';
import { createPlayer } from '../../src/domain/PlayerSystem';
import { PickupSystem, createPickup } from '../../src/domain/PickupSystem';
import { applyLevelPick, buildLevelupPool, pickLevelUps } from '../../src/domain/LevelSystem';
import type { EventBus } from '../../src/domain/EventBus';
import type { GameEvents } from '../../src/domain/types';

function makeWorld() {
  const p = createPlayer('adventurer', 1000, 650, {
    maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
    crit: 0, critMult: 2, armor: 0, dodge: 0, pickup: 90, luck: 0,
  }, 'pistol');
  const { world, bus } = createWorld(p, 1);
  return { world, bus: bus as unknown as EventBus<GameEvents> };
}

describe('掉落拾取', () => {
  it('击杀事件生成材料掉落', () => {
    const { bus } = makeWorld();
    const ps = new PickupSystem(bus as unknown as EventBus<never>);
    ps.attachDrops();
    bus.emit('enemy:killed', {
      enemy: {
        x: 100, y: 100, def: { xp: 3, elite: false, boss: false },
      } as never,
      drops: 3,
    });
    expect(ps.pickups.length).toBe(3);
  });

  it('精英必掉治疗包，小怪低概率', () => {
    const { bus } = makeWorld();
    const ps = new PickupSystem(bus as unknown as EventBus<never>);
    ps.attachDrops();
    for (let i = 0; i < 20; i++) {
      bus.emit('enemy:killed', { enemy: { x: 0, y: 0, def: { xp: 1, elite: true, boss: false } } as never, drops: 0 });
    }
    expect(ps.pickups.some(pk => pk.type === 'heart')).toBe(true);
  });

  it('进入拾取半径磁吸并回收', () => {
    const ps = new PickupSystem(new Proxy({}, { get: () => () => {} }) as unknown as EventBus<never>);
    ps.pickups.push({ ...createPickup(1000, 650, 'material'), vx: 0, vy: 0 });
    const p = createPlayer('adventurer', 1060, 650, {
      maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
      crit: 0, critMult: 2, armor: 0, dodge: 0, pickup: 90, luck: 0,
    }, 'pistol');
    let materials = 0;
    for (let i = 0; i < 120; i++) ps.update(p, 0.016, () => materials++, () => {});
    expect(materials).toBe(1);
    expect(ps.pickups.length).toBe(0);
  });

  it('absorbAll 立即结算', () => {
    const ps = new PickupSystem(new Proxy({}, { get: () => () => {} }) as unknown as EventBus<never>);
    ps.pickups.push(createPickup(0, 0, 'material'), createPickup(0, 0, 'heart'));
    let m = 0, h = 0;
    ps.absorbAll(() => m++, () => h++);
    expect(m).toBe(1); expect(h).toBe(1); expect(ps.pickups.length).toBe(0);
  });
});

describe('升级池', () => {
  it('空技能栏时包含新技能卡', () => {
    const { world } = makeWorld();
    const pool = buildLevelupPool(world.player);
    expect(pool.some(x => x.kind === 'skill-new')).toBe(true);
    expect(pool.filter(x => x.kind === 'stat').length).toBe(14);
  });

  it('学满 3 个技能后不再出新技能卡，已学出升级卡', () => {
    const { world } = makeWorld();
    const p = world.player;
    for (const key of ['shockwave', 'chain', 'firefield'] as const) {
      p.skills.push({ key, level: 1, timer: 0, tick: 0, castAnim: 0 });
    }
    const pool = buildLevelupPool(p);
    expect(pool.some(x => x.kind === 'skill-new')).toBe(false);
    expect(pool.filter(x => x.kind === 'skill-up').length).toBe(3);
  });

  it('5 级满级技能不再出升级卡', () => {
    const { world } = makeWorld();
    const p = world.player;
    p.skills.push({ key: 'shockwave', level: 5, timer: 0, tick: 0, castAnim: 0 });
    const pool = buildLevelupPool(p);
    expect(pool.some(x => x.kind === 'skill-up' && x.key === 'shockwave')).toBe(false);
  });

  it('四选一去重且不超过池大小', () => {
    const { world } = makeWorld();
    const pool = buildLevelupPool(world.player);
    for (let i = 0; i < 50; i++) {
      const picks = pickLevelUps(pool, 4);
      expect(new Set(picks.map(x => x.kind === 'stat' ? 's:' + x.def.n : x.kind + ':' + x.key)).size).toBe(picks.length);
      expect(picks.length).toBe(4);
    }
  });

  it('应用技能卡：新技能入栏、升级卡加等级', () => {
    const { world } = makeWorld();
    const p = world.player;
    applyLevelPick(p, { kind: 'skill-new', key: 'chain' });
    expect(p.skills[0]).toMatchObject({ key: 'chain', level: 1 });
    applyLevelPick(p, { kind: 'skill-up', key: 'chain', nextLevel: 2 });
    expect(p.skills[0].level).toBe(2);
  });

  it('应用属性卡：厚皮加血', () => {
    const { world } = makeWorld();
    const pool = buildLevelupPool(world.player);
    const pick = pool.find(x => x.kind === 'stat' && x.def.n === '厚皮')!;
    applyLevelPick(world.player, pick);
    expect(world.player.stats.maxHp).toBe(66);
  });
});
