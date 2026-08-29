import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/domain/world';
import { createPlayer, gainMaterial, xpNext } from '../../src/domain/PlayerSystem';
import { dealDamage, hurtPlayer, rollDamage } from '../../src/domain/DamageSystem';
import { spawnTestEnemy } from './helpers';

function makeWorld(playerStats?: Partial<Parameters<typeof createPlayer>[2]>) {
  const stats = {
    maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
    crit: 0, critMult: 2, armor: 0, dodge: 0, pickup: 90, luck: 0,
    ...playerStats,
  };
  const p = createPlayer('adventurer', 1000, 650, stats, 'pistol');
  return createWorld(p, 1);
}

describe('伤害结算', () => {
  it('暴击按倍率放大', () => {
    const { world } = makeWorld({ crit: 1, critMult: 3 });
    const r = rollDamage(world.player, 10);
    expect(r.crit).toBe(true);
    expect(r.val).toBe(30);
  });

  it('无暴击无加成', () => {
    const { world } = makeWorld({ crit: 0 });
    const r = rollDamage(world.player, 10);
    expect(r.crit).toBe(false);
    expect(r.val).toBe(10);
  });

  it('护甲减伤有上限', () => {
    const { world } = makeWorld({ armor: 9999 });
    hurtPlayer(world, 1000);
    // 75% 上限：1000 → 250
    expect(world.player.hp).toBe(60 - 250);
  });

  it('闪避判定：掷中则免伤并获得无敌帧', () => {
    const { world } = makeWorld({ dodge: 0.6 });
    hurtPlayer(world, 50, () => 0.1); // 0.1 < 0.6 → 闪避
    expect(world.player.hp).toBe(60);
    expect(world.player.invuln).toBeGreaterThan(0);
  });

  it('闪避判定：未掷中则正常受伤', () => {
    const { world } = makeWorld({ dodge: 0.6 });
    hurtPlayer(world, 50, () => 0.9); // 0.9 ≥ 0.6 → 命中
    expect(world.player.hp).toBe(10);
  });

  it('圣盾优先抵挡', () => {
    const { world } = makeWorld();
    world.player.shield = 30;
    hurtPlayer(world, 20);
    expect(world.player.shield).toBe(10);
    expect(world.player.hp).toBe(60);
  });

  it('无敌帧内不受伤', () => {
    const { world } = makeWorld();
    world.player.invuln = 1;
    hurtPlayer(world, 50);
    expect(world.player.hp).toBe(60);
  });

  it('对敌伤害发飘字事件并致死', () => {
    const { world, bus } = makeWorld();
    const e = spawnTestEnemy(world, 'chaser', 1000, 650);
    let dmgEvents = 0, killEvents = 0;
    bus.on('damage', () => dmgEvents++);
    bus.on('enemy:killed', (p) => { killEvents++; expect(p.drops).toBeGreaterThanOrEqual(1); });
    dealDamage(world, e, { val: 9999, crit: false }, 0, 0, 0);
    expect(dmgEvents).toBe(1);
    expect(killEvents).toBe(1);
    expect(e.dead).toBe(true);
  });

  it('自爆连锁波及玩家与友军伤害', () => {
    const { world } = makeWorld();
    world.player.stats.armor = -1e9; // 关护甲
    world.player.stats.dodge = -1;   // 关闪避
    const boom = spawnTestEnemy(world, 'boomling', 1030, 650);
    dealDamage(world, boom, { val: 9999, crit: false }, 0, 0, 0);
    // 玩家在爆炸半径内受伤
    expect(world.player.hp).toBeLessThan(60);
  });
});

describe('经验与金钱', () => {
  it('材料同时加经验与金钱，跨级返回 true', () => {
    const { world } = makeWorld();
    const p = world.player;
    const lvl = p.level;
    let leveled = false;
    const need = xpNext(p.level);
    for (let i = 0; i < need + 1; i++) {
      if (gainMaterial(p)) leveled = true;
    }
    expect(p.money).toBe(xpNext(lvl) + 1);
    expect(leveled).toBe(true);
    expect(p.level).toBe(lvl + 1);
  });

  it('经验曲线单调递增', () => {
    let last = 0;
    for (let l = 1; l <= 20; l++) {
      expect(xpNext(l)).toBeGreaterThan(last);
      last = xpNext(l);
    }
  });
});
