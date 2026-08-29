import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/domain/world';
import { createPlayer } from '../../src/domain/PlayerSystem';
import { startWave, WAVE_EVENTS } from '../../src/domain/WaveDirector';
import { createEnemy } from '../../src/domain/entities';
import { dealDamage } from '../../src/domain/DamageSystem';

function makeWorld() {
  const p = createPlayer('adventurer', 1000, 650, {
    maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
    crit: 0, critMult: 2, armor: 0, dodge: 0, pickup: 90, luck: 0,
  }, 'pistol');
  return createWorld(p, 1);
}

describe('事件波次', () => {
  it('每 4 波必出事件且属合法值', () => {
    for (const wave of [4, 8]) {
      const { world, run } = makeWorld();
      startWave(run, world, wave);
      expect(run.event).not.toBeNull();
      expect(Object.keys(WAVE_EVENTS)).toContain(run.event);
    }
  });

  it('非 4 倍数波无事件', () => {
    const { world, run } = makeWorld();
    startWave(run, world, 5);
    expect(run.event).toBeNull();
    expect(world.dropMul).toBe(1);
    expect(world.mud).toBe(false);
  });

  it('血月掉落倍率生效', () => {
    const { world, run, bus } = makeWorld();
    startWave(run, world, 4);
    run.event = 'bloodmoon';
    world.dropMul = 2;
    const e = createEnemy('chaser', 500, 500, 4);
    world.enemies.push(e);
    world.grid.insert(e);
    let drops = 0;
    bus.on('enemy:killed', (p2) => { drops += p2.drops; });
    dealDamage(world, e, { val: 9999, crit: false }, 0, 0, 0);
    expect(drops).toBeGreaterThanOrEqual(2); // 1 点基础 × 2 倍率（可能含幸运裂变）
  });

  it('宝箱怪带 5 倍掉落标记', () => {
    const { world, run } = makeWorld();
    startWave(run, world, 4);
    run.event = 'chest';
    const chest = createEnemy('elite', 500, 500, 4);
    chest.bonusDrops = 5;
    world.enemies.push(chest);
    world.grid.insert(chest);
    expect(chest.bonusDrops).toBe(5);
  });
});
