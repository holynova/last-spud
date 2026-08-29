import { SpatialGrid } from './SpatialGrid';
import { EventBus } from './EventBus';
import type { EnemyEntity, GameEvents, PlayerEntity, World } from './types';

// ============ 世界装配：领域系统共享的运行时容器 ============

export interface RunState {
  wave: number;
  timeLeft: number;
  kills: number;
  elapsed: number;
  dmgMul: number;
  sweeping: boolean;
  spawnT: number;
  combo: number;
  comboT: number;
}

export interface WorldBundle {
  world: World;
  bus: EventBus<GameEvents>;
  run: RunState;
}

export function createWorld(player: PlayerEntity, wave = 1): WorldBundle {
  const bus = new EventBus<GameEvents>();
  const run: RunState = {
    wave,
    timeLeft: 0,
    kills: 0,
    elapsed: 0,
    dmgMul: 1,
    sweeping: false,
    spawnT: 0,
    combo: 0,
    comboT: 0,
  };
  const world: World = {
    player,
    enemies: [],
    bullets: [],
    hazards: [],
    minions: [],
    grid: new SpatialGrid<EnemyEntity>(96),
    wave,
    dmgMul: 1,
    emit: (event, payload) => bus.emit(event, payload as never),
  };
  return { world, bus, run };
}
