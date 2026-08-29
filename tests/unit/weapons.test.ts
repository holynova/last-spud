import { describe, expect, it } from 'vitest';
import { WEAPONS, weaponStats } from '../../src/data/weapons';
import { TAU } from '../../src/utils/math';
import {
  createBullet, findTarget, tryFire, updateBullet,
} from '../../src/domain/WeaponSystem';
import { createWorld } from '../../src/domain/world';
import { createPlayer } from '../../src/domain/PlayerSystem';
import { ENEMIES } from '../../src/data/enemies';
import type { EnemyEntity } from '../../src/domain/types';

function spawnEnemy(world: { enemies: EnemyEntity[] }, key: string, x: number, y: number, wave = 1): EnemyEntity {
  const def = ENEMIES[key];
  const hpMul = 1 + 0.42 * (wave - 1);
  const e: EnemyEntity = {
    key, def, x, y, r: def.r, color: def.color ?? '#888',
    hp: Math.round(def.hp * hpMul), maxHp: Math.round(def.hp * hpMul),
    dmg: def.dmg, speed: def.speed,
    flash: 0, kx: 0, ky: 0, slowT: 0, touchCd: 0,
    shootT: 0, dashT: 0, dashing: 0, dead: false, t: 0,
  };
  world.enemies.push(e);
  world.grid.insert(e);
  return e;
}

function makeWorld() {
  const p = createPlayer('adventurer', 1000, 650, {
    maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
    crit: 0, critMult: 2, armor: 0, dodge: 0, pickup: 90, luck: 0,
  }, 'pistol');
  return createWorld(p, 1);
}

describe('weaponStats', () => {
  it('10 种武器全部有定义', () => {
    expect(Object.keys(WEAPONS).length).toBe(10);
  });

  it('4 阶成长：伤害/冷却/射程单调', () => {
    for (const key of Object.keys(WEAPONS)) {
      let lastDmg = 0, lastCd = Infinity, lastRange = 0;
      for (const tier of [1, 2, 3, 4] as const) {
        const s = weaponStats(key, tier);
        expect(s.dmg).toBeGreaterThan(lastDmg);
        expect(s.cd).toBeLessThan(lastCd);
        expect(s.range).toBeGreaterThan(lastRange);
        lastDmg = s.dmg; lastCd = s.cd; lastRange = s.range;
      }
    }
  });

  it('同阶数值带缓存且稳定', () => {
    expect(weaponStats('pistol', 3)).toBe(weaponStats('pistol', 3));
  });
});

describe('目标获取与开火', () => {
  it('findTarget 返回最近者', () => {
    const { world } = makeWorld();
    const near = spawnEnemy(world, 'chaser', 1100, 650);
    spawnEnemy(world, 'chaser', 1400, 650);
    expect(findTarget(world, world.player, 330)).toBe(near);
  });

  it('射程外返回 null', () => {
    const { world } = makeWorld();
    spawnEnemy(world, 'chaser', 100, 100);
    expect(findTarget(world, world.player, 200)).toBeNull();
  });

  it('gun 开火生成 1 发子弹且朝向目标', () => {
    const { world } = makeWorld();
    spawnEnemy(world, 'chaser', 1200, 650);
    const w = world.player.weapons[0];
    expect(tryFire(world, world.player, w)).toBe(true);
    expect(world.bullets.length).toBe(1);
    expect(world.bullets[0].vx).toBeGreaterThan(0);
  });

  it('无目标不开火', () => {
    const { world } = makeWorld();
    expect(tryFire(world, world.player, world.player.weapons[0])).toBe(false);
  });

  it('shotgun 一次 5 发', () => {
    const { world } = makeWorld();
    spawnEnemy(world, 'chaser', 1150, 650);
    tryFire(world, world.player, { key: 'shotgun', tier: 1, timer: 0, aim: 0, recoil: 0 });
    expect(world.bullets.length).toBe(5);
  });

  it('melee 只伤害扇形内的敌人', () => {
    const { world } = makeWorld();
    // 目标在近处正右方，另一个更远在正后方（避免等距歧义）
    const front = spawnEnemy(world, 'chaser', 1080, 650);
    const behind = spawnEnemy(world, 'chaser', 900, 650);
    tryFire(world, world.player, { key: 'club', tier: 1, timer: 0, aim: 0, recoil: 0 });
    expect(front.hp).toBeLessThan(front.maxHp);
    expect(behind.hp).toBe(behind.maxHp);
  });

  it('beam 贯穿直线上的多个敌人', () => {
    const { world } = makeWorld();
    const a = spawnEnemy(world, 'chaser', 1100, 650);
    const b = spawnEnemy(world, 'chaser', 1300, 650);
    tryFire(world, world.player, { key: 'laser', tier: 1, timer: 0, aim: 0, recoil: 0 });
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('aura 无需目标即可施放', () => {
    const { world } = makeWorld();
    expect(tryFire(world, world.player, { key: 'aura', tier: 1, timer: 0, aim: 0, recoil: 0 })).toBe(true);
  });
});

describe('子弹与回旋镖', () => {
  it('子弹命中扣血并触发击杀事件', () => {
    const { world, bus } = makeWorld();
    const e = spawnEnemy(world, 'chaser', 1050, 650);
    const b = createBullet({ x: 1000, y: 650, vx: 100, vy: 0, dmg: 999, life: 1 });
    world.bullets.push(b);
    let killed = 0;
    bus.on('enemy:killed', () => killed++);
    for (let i = 0; i < 40 && b.life > 0; i++) updateBullet(world, b, 0.016);
    expect(e.dead).toBe(true);
    expect(killed).toBe(1);
  });

  it('回旋镖飞满射程后折返并最终回收', () => {
    const { world } = makeWorld();
    const b = createBullet({
      x: 1000, y: 650, vx: 440, vy: 0, dmg: 10, life: 6,
      boom: true, boomDist: 0, boomMax: 200, boomSpeed: 440,
    });
    world.bullets.push(b);
    for (let i = 0; i < 40 && !b.returning; i++) updateBullet(world, b, 0.016);
    expect(b.returning).toBe(true);
    const xAtTurn = b.x;
    expect(xAtTurn).toBeGreaterThan(1000); // 已飞出
    // 折返后回到玩家附近并被回收
    for (let i = 0; i < 200 && b.life > 0; i++) updateBullet(world, b, 0.016);
    expect(b.life).toBeLessThanOrEqual(0);
    expect(Math.abs(b.x - 1000)).toBeLessThan(60);
  });

  it('回旋镖速度恒定不放大（卡死回归）', () => {
    const { world } = makeWorld();
    const b = createBullet({
      x: 1000, y: 650, vx: 440, vy: 0, dmg: 10, life: 6,
      boom: true, boomDist: 0, boomMax: 300, boomSpeed: 440,
    });
    world.bullets.push(b);
    for (let i = 0; i < 600; i++) {
      updateBullet(world, b, 0.016);
      expect(Math.abs(b.vx)).toBeLessThanOrEqual(440.001);
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
    }
  });
});

describe('朝向工具', () => {
  it('TAU 为整圆', () => {
    expect(TAU).toBeCloseTo(Math.PI * 2);
  });
});
