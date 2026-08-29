import type { EnemyEntity, World } from '../../src/domain/types';
import { createEnemy } from '../../src/domain/entities';

/** 测试辅助：向世界投放一只敌人并插入网格 */
export function spawnTestEnemy(world: World, key: string, x: number, y: number, wave = 1): EnemyEntity {
  const e = createEnemy(key, x, y, wave);
  world.enemies.push(e);
  world.grid.insert(e);
  return e;
}
