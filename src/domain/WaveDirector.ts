import { ARENA_H, ARENA_W, TOTAL_WAVES, WALL } from '../config';
import { spawnInterval, spawnPerTick, waveDuration, eliteChance } from '../data/waves';
import { spawnTable } from '../data/enemies';
import { weightedPick } from '../utils/math';
import { createEnemy, ELITE_AFFIXES } from './entities';
import type { RunState } from './world';
import type { World } from './types';

// ============ 波次导演：刷怪节奏 / 精英 / 最终波 / 收波清场 ============

export const WAVE_EVENTS = {
  chest: '事件：宝箱怪！',
  bloodmoon: '事件：血月！敌人翻倍，掉落翻倍',
  mud: '事件：泥沼！所有人减速',
} as const;
export type WaveEventKey = keyof typeof WAVE_EVENTS;

export function startWave(run: RunState, world: World, wave: number): void {
  run.wave = wave;
  run.timeLeft = waveDuration(wave);
  run.dmgMul = 1 + 0.10 * (wave - 1);
  run.sweeping = false;
  world.enemies = [];
  world.bullets = [];
  world.wave = wave;

  // 特性：事件波次（每 4 波随机事件，最终波除外）
  run.event = null;
  world.dropMul = 1;
  world.mud = false;
  if (wave % 4 === 0 && wave < TOTAL_WAVES) {
    const keys = Object.keys(WAVE_EVENTS) as WaveEventKey[];
    const event = keys[Math.floor(Math.random() * keys.length)];
    run.event = event;
    if (event === 'bloodmoon') world.dropMul = 2;
    if (event === 'mud') world.mud = true;
  }

  // 最终波：只放 Boss
  if (wave >= TOTAL_WAVES) {
    const p = world.player;
    world.enemies.push(createEnemy('boss',
      Math.min(ARENA_W - WALL - 80, p.x + 420),
      Math.max(WALL + 80, Math.min(ARENA_H - WALL - 80, p.y)), wave));
    return;
  }
  // 事件波：宝箱怪（精英 + 5 倍掉落）
  if (run.event === 'chest') {
    const chest = createEnemy('elite', ARENA_W / 2, ARENA_H / 2, wave);
    chest.bonusDrops = 5;
    world.enemies.push(chest);
    world.grid.insert(chest);
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
  const isElite = key === 'elite';
  const affix = isElite && Math.random() < 0.6
    ? ELITE_AFFIXES[Math.floor(Math.random() * ELITE_AFFIXES.length)]
    : undefined;
  const e = createEnemy(key, x, y, wave, affix);
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
  const per = spawnPerTick(run.wave) * (world.dropMul > 1 ? 2 : 1); // 血月：刷怪翻倍
  for (let i = 0; i < per && world.enemies.length < 230; i++) {
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
