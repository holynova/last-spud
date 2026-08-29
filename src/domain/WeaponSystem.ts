import { TAU, dist2, pointSegDist2, rand } from '../utils/math';
import { weaponStats } from '../data/weapons';
import { GRID_MARGIN } from './SpatialGrid';
import { dealDamage, hurtPlayer, rollDamage } from './DamageSystem';
import type { BulletEntity, PlayerEntity, World } from './types';

// ============ 武器开火系统 ============
import type { EnemyEntity } from './types';
const _wq: EnemyEntity[] = []; // 网格查询复用缓冲（顺序使用，不嵌套）

export function createBullet(fields: Partial<BulletEntity> & Pick<BulletEntity, 'x' | 'y' | 'vx' | 'vy' | 'dmg'>): BulletEntity {
  return {
    r: 4.5, crit: false, pierce: 0, kb: 60, life: 1, color: '#fff',
    fromPlayer: true, t: 0, spin: rand(0, TAU),
    boom: false, boomDist: 0, boomMax: 0, boomSpeed: 0, returning: false,
    hitMap: null, hitSet: null,
    ...fields,
  } as BulletEntity;
}

/** 找最近的、在射程内的敌人 */
export function findTarget(world: World, p: PlayerEntity, range: number): typeof world.enemies[number] | null {
  const near = world.grid.query(p.x, p.y, range, _wq);
  let best = null, bestD = range * range;
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (e.dead) continue;
    const d = dist2(p.x, p.y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** 流派协同倍率（1 + 玩家对应标签加成） */
function synergyMul(p: PlayerEntity, s: { tags?: string[] }): number {
  let m = 1;
  for (const tag of s.tags ?? []) m += p.synergies[tag] ?? 0;
  return m;
}

/** 召唤小精灵（至多 2 个存活） */
function summonMinion(world: World, p: PlayerEntity, st: { dmg: number; range: number }): void {
  if (world.minions.length >= 2) return;
  const a = Math.random() * Math.PI * 2;
  world.minions.push({
    x: p.x + Math.cos(a) * 50, y: p.y + Math.sin(a) * 50,
    life: 8, shootT: 0.4,
    dmg: st.dmg * synergyMul(p, { tags: ['electric'] }),
    range: st.range,
  });
}

/** 小精灵帧更新：追踪玩家 + 射击最近敌人 */
export function updateMinions(world: World, dt: number): void {
  const p = world.player;
  for (const m of world.minions) {
    m.life -= dt;
    m.shootT -= dt;
    const a = Math.atan2(m.y - p.y, m.x - p.x);
    m.x += (p.x + Math.cos(a) * 55 - m.x) * Math.min(1, dt * 4);
    m.y += (p.y + Math.sin(a) * 55 - m.y) * Math.min(1, dt * 4);
    if (m.shootT <= 0) {
      const target = findTargetFrom(world, m.x, m.y, m.range);
      if (target) {
        m.shootT = 0.8;
        const ang = Math.atan2(target.y - m.y, target.x - m.x);
        world.bullets.push(createBullet({
          x: m.x, y: m.y,
          vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520,
          dmg: m.dmg, pierce: 0, kb: 40, life: 1.2, r: 4, color: '#8ee05a',
        }));
      }
    }
  }
  world.minions = world.minions.filter(m => m.life > 0);
}

function findTargetFrom(world: World, x: number, y: number, range: number) {
  const near = world.grid.query(x, y, range, _wq);
  let best = null, bestD = range * range;
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (e.dead) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** 尝试开火：命中目标返回 true 并重置冷却，否则 false（稍后重试） */
export function tryFire(world: World, p: PlayerEntity, w: { key: string; tier: number; timer: number; aim: number; recoil: number }): boolean {
  const s = weaponStats(w.key, w.tier as 1);
  const range = s.range * p.stats.range;

  const syn = synergyMul(p, s);

  if (s.kind === 'aura') {
    const reach2 = range * range;
    const near = world.grid.query(p.x, p.y, range + GRID_MARGIN, _wq);
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (e.dead) continue;
      if (dist2(p.x, p.y, e.x, e.y) < reach2 + e.r * e.r) {
        dealDamage(world, e, rollDamage(p, s.dmg * syn), s.kb ?? 60, p.x, p.y, false, Math.random, '武器·' + s.name);
      }
    }
    world.emit('fx:ring', { x: p.x, y: p.y, r: range, color: s.color });
    world.emit('weapon:fired', { key: s.key, kind: s.kind, x: p.x, y: p.y, ang: 0 });
    return true;
  }

  const target = findTarget(world, p, range);
  if (!target) return false;

  const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
  w.aim = baseAng;
  w.recoil = 1;

  switch (s.kind) {
    case 'gun':
    case 'shotgun':
    case 'throw': {
      const n = s.count ?? 1;
      const spread = s.spread ?? 0;
      for (let i = 0; i < n; i++) {
        const ang = baseAng + (n > 1 ? (i / (n - 1) - 0.5) * spread : rand(-spread, spread));
        const crit = Math.random() < p.stats.crit;
        const rolled = rollDamage(p, s.dmg * syn, crit);
        world.bullets.push(createBullet({
          srcKey: s.key,
          x: p.x + Math.cos(ang) * 18, y: p.y + Math.sin(ang) * 18,
          vx: Math.cos(ang) * (s.pspd ?? 500), vy: Math.sin(ang) * (s.pspd ?? 500),
          dmg: rolled.val, crit,
          pierce: s.pierce ?? 0, kb: s.kb ?? 60,
          life: s.life ?? (s.range / (s.pspd ?? 500)) * 1.15,
          r: s.kind === 'throw' ? 6 : 4.5, color: s.color,
        }));
      }
      break;
    }
    case 'boomerang': {
      const crit = Math.random() < p.stats.crit;
      world.bullets.push(createBullet({
        x: p.x, y: p.y,
        vx: Math.cos(baseAng) * (s.pspd ?? 440), vy: Math.sin(baseAng) * (s.pspd ?? 440),
        dmg: rollDamage(p, s.dmg * syn, crit).val, crit,
        pierce: 99, kb: s.kb ?? 90, life: 6, r: 9, color: s.color,
        boom: true, boomDist: 0, boomMax: range, boomSpeed: s.pspd ?? 440,
      }));
      break;
    }
    case 'summon': {
      summonMinion(world, p, s);
      break;
    }
    case 'melee': {
      const arc = s.arc ?? 2;
      const near = world.grid.query(p.x, p.y, range + GRID_MARGIN, _wq);
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > range + e.r) continue;
        let da = Math.atan2(e.y - p.y, e.x - p.x) - baseAng;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) <= arc / 2) {
          dealDamage(world, e, rollDamage(p, s.dmg * syn), s.kb ?? 100, p.x, p.y, false, Math.random, '武器·' + s.name);
        }
      }
      world.emit('fx:arc', { x: p.x, y: p.y, ang: baseAng, arc, r: range, color: s.color });
      world.emit('shake', { force: 3 });
      break;
    }
    case 'beam': {
      const x2 = p.x + Math.cos(baseAng) * range, y2 = p.y + Math.sin(baseAng) * range;
      const near = world.grid.query(p.x, p.y, range + GRID_MARGIN, _wq);
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead) continue;
        if (pointSegDist2(e.x, e.y, p.x, p.y, x2, y2) < (e.r + 4) * (e.r + 4)) {
          dealDamage(world, e, rollDamage(p, s.dmg * syn), 40, p.x, p.y, false, Math.random, '武器·' + s.name);
        }
      }
      world.emit('fx:bolt', { x1: p.x, y1: p.y, x2, y2, color: s.color });
      break;
    }
  }
  world.emit('weapon:fired', { key: s.key, kind: s.kind, x: p.x, y: p.y, ang: baseAng });
  return true;
}

/** 子弹更新：移动、回旋镖折返、碰撞结算 */
export function updateBullet(world: World, b: BulletEntity, dt: number): void {
  b.t += dt;
  b.life -= dt;
  b.spin += dt * 12;
  const p = world.player;

  if (b.boom) {
    if (!b.returning) {
      b.boomDist += Math.hypot(b.vx, b.vy) * dt;
      if (b.boomDist >= b.boomMax) b.returning = true;
    } else {
      const dx = p.x - b.x, dy = p.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.vx = dx / d * b.boomSpeed;
      b.vy = dy / d * b.boomSpeed;
      if (d < 20) { b.life = 0; return; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
  } else {
    b.x += b.vx * dt; b.y += b.vy * dt;
  }

  if (b.fromPlayer) {
    const near = world.grid.query(b.x, b.y, b.r + GRID_MARGIN, _wq);
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (e.dead) continue;
      if (dist2(b.x, b.y, e.x, e.y) >= (e.r + b.r) * (e.r + b.r)) continue;
      if (b.boom) {
        const last = b.hitMap?.get(e) ?? -1;
        if (b.t - last < 0.5) continue;
        b.hitMap?.set(e, b.t);
      } else if (b.hitSet && b.hitSet.has(e)) {
        continue;
      } else {
        (b.hitSet ??= new Set()).add(e);
      }
      dealDamage(world, e, { val: b.dmg, crit: b.crit }, b.kb, b.x - b.vx, b.y - b.vy, false, Math.random, b.srcKey);
      if (!b.boom) {
        b.pierce--;
        if (b.pierce < 0) { b.life = 0; break; }
      }
    }
  } else {
    if (dist2(b.x, b.y, p.x, p.y) < (p.r + b.r) * (p.r + b.r)) {
      hurtPlayer(world, Math.round(b.dmg));
      b.life = 0;
    }
  }
}
