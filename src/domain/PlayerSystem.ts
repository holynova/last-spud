import { clamp } from '../utils/math';
import { weaponStats } from '../data/weapons';
import { tryFire } from './WeaponSystem';
import type { PlayerEntity, Vec2 } from './types';
import type { World } from './types';

// ============ 玩家系统：移动 / 回复 / 武器驱动 / 状态衰减 ============

export function createPlayer(defKey: string, x: number, y: number, stats: PlayerEntity['stats'], startWeapon: string): PlayerEntity {
  const p: PlayerEntity = {
    defKey, x, y, r: 16,
    hp: stats.maxHp,
    faceAng: 0, walkT: 0,
    hurtFlash: 0, invuln: 0,
    stats,
    weapons: [{ key: startWeapon, tier: 1, timer: 0.2, aim: 0, recoil: 0 }],
    skills: [],
    xp: 0, level: 1, money: 0,
    shield: 0, shieldFlash: 0,
    frenzyT: 0, frenzyAspd: 0,
  };
  return p;
}

/** 经验需求曲线：3 + 2.2L + 0.35L² */
export function xpNext(level: number): number {
  return Math.floor(3 + level * 2.2 + level * level * 0.35);
}

/** 获得材料 = 经验 + 金钱；跨级返回 true（可能一次只升一级，多余经验保留） */
export function gainMaterial(p: PlayerEntity): boolean {
  p.xp += 1;
  p.money += 1;
  if (p.xp >= xpNext(p.level)) {
    p.xp -= xpNext(p.level);
    p.level++;
    return true;
  }
  return false;
}

export interface MoveIntent { mx: number; my: number }

/** 玩家帧更新：移动 / 回复 / 状态衰减 / 武器自动开火 */
export function updatePlayer(world: World, dt: number, intent: MoveIntent): void {
  const p = world.player;
  const st = p.stats;
  const frenzySpeed = p.frenzyT > 0 ? 0.25 : 0;
  const frenzyAspd = p.frenzyT > 0 ? p.frenzyAspd : 0;

  if (intent.mx || intent.my) {
    const len = Math.hypot(intent.mx, intent.my);
    const sp = 235 * st.speed * (1 + frenzySpeed);
    p.x += (intent.mx / len) * sp * dt;
    p.y += (intent.my / len) * sp * dt;
    p.faceAng = Math.atan2(intent.my, intent.mx);
    p.walkT += dt * 10;
  } else {
    p.walkT = 0;
  }
  if (st.regen > 0 && p.hp < st.maxHp) {
    p.hp = Math.min(st.maxHp, p.hp + (st.regen / 5) * dt);
  }
  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.shieldFlash = Math.max(0, p.shieldFlash - dt);
  if (p.frenzyT > 0) p.frenzyT = Math.max(0, p.frenzyT - dt);

  for (const w of p.weapons) {
    w.timer -= dt;
    w.recoil = Math.max(0, w.recoil - dt * 6);
    if (w.timer <= 0) {
      if (tryFire(world, p, w)) {
        w.timer = weaponStats(w.key, w.tier as 1).cd / (st.aspd * (1 + frenzyAspd));
      } else {
        w.timer = 0.08;
      }
    }
  }
}

/** 场地边界钳制（世界尺寸由调用方提供） */
export function clampToArena(p: PlayerEntity, arena: { w: number; h: number; wall: number }): void {
  const m = arena.wall + p.r;
  p.x = clamp(p.x, m, arena.w - m);
  p.y = clamp(p.y, m, arena.h - m);
}

export type { Vec2 };
