import { skillStats } from '../data/skills';
import { dist2 } from '../utils/math';
import { dealDamage, rollDamage } from './DamageSystem';
import { findTarget } from './WeaponSystem';
import type { World } from './types';

// ============ 技能系统：自动施放 ============
import type { EnemyEntity } from './types';
const _sq: EnemyEntity[] = [];

/** 技能帧更新：冷却施放 + 荆棘持续伤害 */
export function updateSkills(world: World, dt: number): void {
  const p = world.player;
  if (p.frenzyT > 0) p.frenzyT = Math.max(0, p.frenzyT - dt);

  for (const s of p.skills) {
    s.timer -= dt;
    s.castAnim = Math.max(0, s.castAnim - dt);
    if (s.key === 'thorns') { castThorns(world, s, dt); continue; }
    if (s.timer <= 0) {
      const st = skillStats(s.key, s.level);
      if (castSkill(world, p, s.key, st)) {
        s.timer = st.cd;
        s.castAnim = 0.3;
      } else {
        s.timer = 0.2;
      }
    }
  }
}

function castSkill(world: World, p: World['player'], key: import('../data/skills').SkillKey, st: ReturnType<typeof skillStats>): boolean {
  switch (key) {
    case 'shockwave': return castShockwave(world, p, st);
    case 'chain': return castChain(world, p, st);
    case 'firefield': return castFirefield(world, p, st);
    case 'barrier': return castBarrier(world, p, st);
    case 'frenzy': return castFrenzy(world, p, st);
    default: return false;
  }
}

/** 冲击波：范围伤害 + 击退 */
function castShockwave(world: World, p: World['player'], st: ReturnType<typeof skillStats>): boolean {
  world.emit('fx:ring', { x: p.x, y: p.y, r: st.range, color: '#ffd257', width: 6 });
  world.emit('fx:ring', { x: p.x, y: p.y, r: st.range * 0.6, color: '#fff2c9', width: 3 });
  world.emit('shake', { force: 5 });
  // 觉醒：满级震荡波在原地留下燃烧地带
  if (p.skills.find(s => s.key === 'shockwave')?.level === 5) {
    world.hazards.push({ x: p.x, y: p.y, r: st.range * 0.5, dps: st.dmg * 0.5, ttl: 2, maxTtl: 2, tick: 0 });
  }
  const near = world.grid.query(p.x, p.y, st.range + 54, _sq);
  let hit = false;
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (e.dead) continue;
    if (dist2(p.x, p.y, e.x, e.y) < (st.range + e.r) * (st.range + e.r)) {
      dealDamage(world, e, rollDamage(p, st.dmg, false), 260, p.x, p.y);
      hit = true;
    }
  }
  return hit || world.enemies.length > 0;
}

/** 闪电链：雷击最近敌人并连锁跳跃 */
function castChain(world: World, p: World['player'], st: ReturnType<typeof skillStats>): boolean {
  let cur = findTarget(world, p, st.range);
  if (!cur) return false;
  const struck = new Set<import('./types').EnemyEntity>();
  let fromX = p.x, fromY = p.y;
  for (let i = 0; i < st.jumps && cur; i++) {
    struck.add(cur);
    world.emit('fx:bolt', { x1: fromX, y1: fromY, x2: cur.x, y2: cur.y, color: '#7ee8ff' });
    dealDamage(world, cur, rollDamage(p, st.dmg * (i === 0 ? 1 : 0.8), false), 40, fromX, fromY, false, Math.random, '技能·闪电链');
    // 觉醒：满级闪电链眩晕（深度减速）命中的敌人
    if (p.skills.find(s => s.key === 'chain')?.level === 5) cur.slowT = 1;
    fromX = cur.x; fromY = cur.y;
    let next: import('./types').EnemyEntity | null = null, nd = 220 * 220;
    const near = world.grid.query(fromX, fromY, 220 + 54, _sq);
    for (let j = 0; j < near.length; j++) {
      const e = near[j];
      if (e.dead || struck.has(e)) continue;
      const d = dist2(fromX, fromY, e.x, e.y);
      if (d < nd) { nd = d; next = e; }
    }
    cur = next;
  }
  return true;
}

/** 烈火结界：脚下生成持续伤害区域 */
function castFirefield(world: World, p: World['player'], st: ReturnType<typeof skillStats>): boolean {
  world.hazards.push({
    x: p.x, y: p.y, r: st.range,
    dps: st.dmg * p.stats.dmg,
    ttl: st.duration, maxTtl: st.duration, tick: 0,
    // 觉醒：满级火圈跟随玩家移动
    follow: p.skills.find(s => s.key === 'firefield')?.level === 5,
  });
  return true;
}

/** 圣盾术：叠盾（上限 2 层） */
function castBarrier(world: World, p: World['player'], st: ReturnType<typeof skillStats>): boolean {
  if (p.shield >= st.shield * 2) return false;
  p.shield = Math.min(st.shield * 2, p.shield + st.shield);
  p.shieldFlash = 0.5;
  world.emit('player:shield', { val: st.shield });
  return true;
}

/** 狂化：攻速移速爆发 */
function castFrenzy(world: World, p: World['player'], st: ReturnType<typeof skillStats>): boolean {
  p.frenzyT = st.duration;
  p.frenzyAspd = st.aspdBuff;
  return true;
}

/** 荆棘领域：周身持续伤害 + 减速（0.4s 结拍） */
function castThorns(world: World, s: import('./types').SkillInstance, dt: number): void {
  const st = skillStats('thorns', s.level);
  const r = st.range;
  s.tick += dt;
  if (s.tick < 0.4) return;
  s.tick = 0;
  const near = world.grid.query(world.player.x, world.player.y, r + 54, _sq);
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (e.dead) continue;
    if (dist2(world.player.x, world.player.y, e.x, e.y) < (r + e.r) * (r + e.r)) {
      dealDamage(world, e, rollDamage(world.player, st.dmg * 0.4, false), 0, world.player.x, world.player.y, true, Math.random, '技能·荆棘领域');
      e.slowT = 0.6;
    }
  }
}

/** 危险区域（火圈）帧结算：0.4s 一跳 */
export function updateHazards(world: World, dt: number): void {
  for (const h of world.hazards) {
    h.ttl -= dt;
    h.tick += dt;
    if (h.tick >= 0.4) {
      h.tick = 0;
      if (h.follow) { h.x = world.player.x; h.y = world.player.y; }
      const near = world.grid.query(h.x, h.y, h.r + 54, _sq);
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead) continue;
        if (dist2(h.x, h.y, e.x, e.y) < (h.r + e.r) * (h.r + e.r)) {
          dealDamage(world, e, { val: h.dps * 0.4, crit: false }, 0, h.x, h.y, true, Math.random, '技能·烈火结界');
        }
      }
    }
  }
  world.hazards = world.hazards.filter(h => h.ttl > 0);
}
