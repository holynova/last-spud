import { dist2 } from '../utils/math';
import { hurtPlayer } from './DamageSystem';
import type { EnemyEntity, World } from './types';

// ============ 敌人系统：AI 行为 / 接触伤害 / 状态衰减 ============

/** 敌人帧更新：根据 def 行为分支（追击 / 风筝远程 / Boss） */
export function updateEnemy(world: World, e: EnemyEntity, dt: number): void {
  const p = world.player;
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.touchCd = Math.max(0, e.touchCd - dt);
  e.slowT = Math.max(0, e.slowT - dt);
  const slowMul = (e.slowT > 0 ? 0.65 : 1) * (world.mud ? 0.7 : 1);

  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  let vx = 0, vy = 0;

  if (e.def.ranged && !e.def.boss) {
    // 风筝远程：保持距离 + 环绕 + 射击
    const keep = e.def.keep ?? 260;
    if (d > keep + 30) { vx = dx / d; vy = dy / d; }
    else if (d < keep - 50) { vx = -dx / d; vy = -dy / d; }
    else { vx = -dy / d * 0.6; vy = dx / d * 0.6; }
    e.shootT -= dt;
    if (e.shootT <= 0 && d < keep + 120) {
      e.shootT = e.def.shootCd ?? 2.4;
      shootAt(world, e, dx / d, dy / d, e.dmg, (e.def.pspd ?? 250) as number, 6, 3, '#d98cff');
    }
  } else if (e.def.boss) {
    // Boss：逼近 + 环形弹幕 + 周期冲锋
    vx = dx / d; vy = dy / d;
    e.shootT -= dt;
    if (e.shootT <= 0) {
      e.shootT = e.def.shootCd ?? 1.7;
      const n = 12, base = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * Math.PI * 2;
        shootAt(world, e, Math.cos(a), Math.sin(a), e.dmg * 0.5, e.def.pspd ?? 220, 7, 3.5, '#e37fff');
      }
    }
    e.dashT -= dt;
    if (e.dashT <= 0) { e.dashT = e.def.dashCd ?? 6; e.dashing = 0.55; }
    if (e.dashing > 0) {
      e.dashing -= dt;
      vx *= 3.2; vy *= 3.2;
    }
  } else {
    vx = dx / d; vy = dy / d;
  }

  e.x += vx * e.speed * slowMul * dt + e.kx * dt;
  e.y += vy * e.speed * slowMul * dt + e.ky * dt;
  e.kx *= Math.pow(0.0025, dt);
  e.ky *= Math.pow(0.0025, dt);

  // 接触伤害（每次接触 0.9s 冷却）
  if (e.touchCd <= 0 && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) {
    e.touchCd = 0.9;
    hurtPlayer(world, Math.round(e.dmg * world.dmgMul));
    if (e.vampiric) e.hp = Math.min(e.maxHp, e.hp + 8);
    const back = Math.atan2(e.y - p.y, e.x - p.x);
    e.kx += Math.cos(back) * 180;
    e.ky += Math.sin(back) * 180;
  }
}

function shootAt(
  world: World, e: EnemyEntity, nx: number, ny: number,
  dmg: number, speed: number, r: number, life: number, color: string,
): void {
  world.bullets.push({
    x: e.x, y: e.y,
    vx: nx * speed, vy: ny * speed,
    r, dmg, crit: false, pierce: 0, kb: 0, life, color,
    fromPlayer: false, t: 0, spin: 0,
    boom: false, boomDist: 0, boomMax: 0, boomSpeed: 0, returning: false,
    hitMap: null, hitSet: null,
  });
}
