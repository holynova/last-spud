import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/domain/world';
import { createPlayer } from '../../src/domain/PlayerSystem';
import { updateEnemy } from '../../src/domain/EnemySystem';
import { startWave, sweepWave, updateWave } from '../../src/domain/WaveDirector';
import { waveDuration } from '../../src/data/waves';
import { TOTAL_WAVES } from '../../src/config';
import { spawnTestEnemy } from './helpers';

function makeWorld() {
  const p = createPlayer('adventurer', 1000, 650, {
    maxHp: 9999, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
    crit: 0, critMult: 2, armor: 0, dodge: 0, pickup: 90, luck: 0,
  }, 'pistol');
  return createWorld(p, 1);
}

describe('敌人 AI', () => {
  it('追击型向玩家移动', () => {
    const { world } = makeWorld();
    const e = spawnTestEnemy(world, 'chaser', 1200, 650);
    const d0 = Math.abs(e.x - 1000);
    updateEnemy(world, e, 0.1);
    expect(Math.abs(e.x - 1000)).toBeLessThan(d0);
  });

  it('接触伤害玩家并击退敌人', () => {
    const { world } = makeWorld();
    const e = spawnTestEnemy(world, 'chaser', 1010, 650);
    world.player.invuln = 0; world.player.stats.dodge = -1; world.player.stats.armor = -1e9;
    updateEnemy(world, e, 0.016);
    expect(world.player.hp).toBeLessThan(9999);
    expect(e.touchCd).toBeGreaterThan(0);
    expect(e.kx).not.toBe(0);
  });

  it('毒蛛远程射击生成敌方子弹', () => {
    const { world } = makeWorld();
    const e = spawnTestEnemy(world, 'spitter', 1100, 650);
    e.shootT = 0;
    const before = world.bullets.length;
    updateEnemy(world, e, 0.016);
    expect(world.bullets.length).toBe(before + 1);
    expect(world.bullets[0].fromPlayer).toBe(false);
  });

  it('Boss 环形弹幕一次 12 发', () => {
    const { world } = makeWorld();
    const e = spawnTestEnemy(world, 'boss', 1200, 650);
    e.shootT = 0;
    updateEnemy(world, e, 0.016);
    expect(world.bullets.length).toBe(12);
  });

  it('减速状态降低移动速度', () => {
    const { world } = makeWorld();
    const e = spawnTestEnemy(world, 'chaser', 1200, 650);
    e.slowT = 1;
    updateEnemy(world, e, 0.1);
    const slowDist = 1200 - e.x;
    const e2 = spawnTestEnemy(world, 'chaser', 1200, 650);
    updateEnemy(world, e2, 0.1);
    expect(slowDist).toBeLessThan(1200 - e2.x);
  });
});

describe('波次导演', () => {
  it('startWave 设置时长并清场', () => {
    const { world, run } = makeWorld();
    spawnTestEnemy(world, 'chaser', 500, 500);
    startWave(run, world, 3);
    expect(run.timeLeft).toBeCloseTo(waveDuration(3));
    expect(run.wave).toBe(3);
    expect(world.enemies.length).toBe(0);
  });

  it('最终波只放 Boss', () => {
    const { world, run } = makeWorld();
    startWave(run, world, TOTAL_WAVES);
    expect(world.enemies.length).toBe(1);
    expect(world.enemies[0].def.boss).toBe(true);
  });

  it('updateWave 随时间刷怪', () => {
    const { world, run } = makeWorld();
    startWave(run, world, 1);
    let spawned = false;
    for (let i = 0; i < 200; i++) {
      if (updateWave(run, world, 0.1)) { spawned = true; break; }
    }
    expect(spawned).toBe(true);
    expect(world.enemies.length).toBeGreaterThan(0);
  });

  it('Boss 波 updateWave 不刷小怪', () => {
    const { world, run } = makeWorld();
    startWave(run, world, TOTAL_WAVES);
    const before = world.enemies.length;
    for (let i = 0; i < 50; i++) updateWave(run, world, 0.1);
    expect(world.enemies.length).toBe(before);
  });

  it('sweepWave 全灭并发掉落事件', () => {
    const { world, run, bus } = makeWorld();
    startWave(run, world, 1);
    spawnTestEnemy(world, 'chaser', 500, 500);
    spawnTestEnemy(world, 'runner', 600, 600);
    let drops = 0;
    bus.on('enemy:killed', (p2) => { drops += p2.drops; });
    sweepWave(run, world);
    expect(world.enemies.length).toBe(0);
    expect(drops).toBe(2);
    expect(run.sweeping).toBe(true);
  });
});
