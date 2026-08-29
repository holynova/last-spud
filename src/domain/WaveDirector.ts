import { ARENA_H, ARENA_W, TOTAL_WAVES, WALL } from '../config';
import { spawnInterval, spawnPerTick, waveDuration, eliteChance } from '../data/waves';
import { spawnTable } from '../data/enemies';
import { weightedPick } from '../utils/math';
import { createEnemy } from './entities';
import type { RunState } from './world';
import type { World } from './types';

// ============ 波次导演：刷怪节奏 / 精英 / 最终波 / 收波清场 ============

export function startWave(run: RunState, world: World, wave: number): void {
  run.wave = wave;
  run.timeLeft = waveDuration(wave);
  run.dmgMul = 1 + 0.10 * (wave - 1);
  run.sweeping = false;
  world.enemies = [];
  world.bullets = [];
  world.wave = wave;
  // 最终波：只放 Boss
  if (wave >= TOTAL_WAVES) {
    const p = world.player;
    world.enemies.push(createEnemy('boss',
      Math.min(ARENA_W - WALL - 80, p.x + 420),
      Math.max(WALL + 80, Math.min(ARENA_H - WALL - 80, p.y)), wave));
  }
}

function spawnAtEdge(world: World, key: string, wave: number): void {
  const p = world.player;
  let x = 0, y = 0;
  for (let tries = 0; tries < 8; tries++) {
    const side = Math.floor(Math.random() * 4);
    const m = 40;
    if (side === 0) { x = Math.random() * ARENA_W; y = m; }
    else if (side === 1) { x = Math.random() * ARENA_W; y = ARENA_H - m; }
    else if (side === 2) { x = m; y = Math.random() * ARENA_H; }
    else { x = ARENA_W - m; y = Math.random() * ARENA_H; }
    const dx = x - p.x, dy = y - p.y;
    if (dx * dx + dy * dy > 380 * 380) break;
  }
  const e = createEnemy(key, x, y, wave);
  world.enemies.push(e);
  world.grid.insert(e);
}

/** 波内刷怪节拍；Boss 波不刷小怪。返回是否刷了怪（供测试断言） */
export function updateWave(run: RunState, world: World, dt: number): boolean {
  if (run.sweeping || run.wave >= TOTAL_WAVES) return false;
  run.timeLeft -= dt;
  run.spawnT = (run.spawnT ?? 0) - dt;
  if (run.spawnT > 0) return false;
  run.spawnT = spawnInterval(run.wave);
  let spawned = false;
  for (let i = 0; i < spawnPerTick(run.wave) && world.enemies.length < 230; i++) {
    spawnAtEdge(world, weightedPick(spawnTable(run.wave)).k, run.wave);
    spawned = true;
  }
  if (Math.random() < eliteChance(run.wave)) {
    spawnAtEdge(world, 'elite', run.wave);
    spawned = true;
  }
  return spawned;
}

/** 收波清场：全敌死亡并按掉落数发材料事件，弹幕清空 */
export function sweepWave(run: RunState, world: World): void {
  run.sweeping = true;
  for (const e of world.enemies) {
    if (e.dead) continue;
    e.dead = true;
    world.emit('enemy:killed', { enemy: e, drops: e.def.xp });
  }
  world.enemies = [];
  world.bullets = [];
}
