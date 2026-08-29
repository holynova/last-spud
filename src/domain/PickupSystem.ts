import { dist2 } from '../utils/math';
import type { EventBus } from './EventBus';
import type { GameEvents } from './types';
import type { PlayerEntity, Vec2 } from './types';

// ============ 掉落拾取系统 ============

export type PickupType = 'material' | 'heart';

export interface PickupEntity extends Vec2 {
  type: PickupType;
  t: number;
  vx: number;
  vy: number;
  magnet: boolean;
  collected: boolean;
}

export function createPickup(x: number, y: number, type: PickupType): PickupEntity {
  return {
    x: x + (Math.random() - 0.5) * 24,
    y: y + (Math.random() - 0.5) * 24,
    type, t: Math.random() * Math.PI * 2,
    vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80,
    magnet: false, collected: false,
  };
}

export class PickupSystem {
  pickups: PickupEntity[] = [];
  private bus: EventBus<GameEvents>;

  constructor(bus: EventBus<GameEvents>) {
    this.bus = bus;
  }

  /** 订阅击杀事件生成掉落（材料 + 概率治疗包） */
  attachDrops(): void {
    this.bus.on('enemy:killed', ({ enemy, drops }) => {
      for (let i = 0; i < drops; i++) {
        this.pickups.push(createPickup(enemy.x, enemy.y, 'material'));
      }
      if (Math.random() < 0.025 + (enemy.def.elite ? 0.5 : 0) + (enemy.def.boss ? 1 : 0)) {
        this.pickups.push(createPickup(enemy.x, enemy.y, 'heart'));
      }
    });
  }

  /** 磁吸 + 拾取；拾取回调由场景接经验/回血 */
  update(player: PlayerEntity, dt: number, onMaterial: () => void, onHeart: () => void): void {
    for (const pk of this.pickups) {
      pk.t += dt;
      const d = Math.hypot(player.x - pk.x, player.y - pk.y) || 1;
      if (!pk.magnet && d < player.stats.pickup) pk.magnet = true;
      if (pk.magnet) {
        const sp = Math.min(620, Math.max(260, 600 - d));
        pk.x += ((player.x - pk.x) / d) * sp * dt;
        pk.y += ((player.y - pk.y) / d) * sp * dt;
      } else {
        pk.x += pk.vx * dt; pk.y += pk.vy * dt;
        pk.vx *= 0.92; pk.vy *= 0.92;
      }
      if (d < player.r + 11) {
        pk.collected = true;
        if (pk.type === 'material') onMaterial();
        else onHeart();
      }
    }
    this.pickups = this.pickups.filter(pk => !pk.collected);
  }

  /** 全部磁吸（收波扫尾） */
  magnetAll(): void {
    for (const pk of this.pickups) pk.magnet = true;
  }

  /** 立即结算剩余掉落（收波吸收） */
  absorbAll(onMaterial: () => void, onHeart: () => void): void {
    for (const pk of this.pickups) {
      if (pk.type === 'material') onMaterial();
      else onHeart();
    }
    this.pickups = [];
  }
}

export const pickupDist = dist2;
