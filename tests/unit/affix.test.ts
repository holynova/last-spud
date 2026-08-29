import { describe, expect, it } from 'vitest';
import { createEnemy, ELITE_AFFIXES } from '../../src/domain/entities';
import { createWorld } from '../../src/domain/world';
import { createPlayer } from '../../src/domain/PlayerSystem';
import { dealDamage, hurtPlayer } from '../../src/domain/DamageSystem';
import { spawnTestEnemy } from './helpers';
import { updateEnemy } from '../../src/domain/EnemySystem';

describe('精英词缀', () => {
  it('词缀池含三种且不重复', () => {
    expect(ELITE_AFFIXES.map(a => a.key)).toEqual(['swift', 'stony', 'vampiric']);
  });

  it('迅捷 +40% 移速', () => {
    const swift = createEnemy('chaser', 0, 0, 1, ELITE_AFFIXES[0]);
    const normal = createEnemy('chaser', 0, 0, 1);
    expect(swift.speed).toBeCloseTo(normal.speed * 1.4);
    expect(swift.affixName).toBe('迅捷');
  });

  it('石肤受伤减半', () => {
    const { world } = makeWorld();
    const stony = spawnTestEnemy(world, 'chaser', 1100, 650);
    stony.dmgTakenMul = 0.5;
    dealDamage(world, stony, { val: 20, crit: false }, 0, 0, 0);
    expect(stony.maxHp - stony.hp).toBe(10);
  });

  it('吸血：接触命中后回复生命', () => {
    const { world } = makeWorld();
    const vamp = spawnTestEnemy(world, 'chaser', 1010, 650);
    vamp.vampiric = true;
    vamp.hp = 5;
    world.player.invuln = 0;
    world.player.stats.dodge = -1;
    world.player.stats.armor = -1e9;
    updateEnemy(world, vamp, 0.016);
    expect(vamp.hp).toBe(13); // 5 + 8
  });
});

function makeWorld() {
  const p = createPlayer('adventurer', 1000, 650, {
    maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
    crit: 0, critMult: 2, armor: 0, dodge: 0, pickup: 90, luck: 0,
  }, 'pistol');
  return createWorld(p, 1);
}
