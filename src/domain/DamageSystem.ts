import { GRID_MARGIN, SpatialGrid } from './SpatialGrid';
import type { EnemyEntity, GameEvents, PlayerEntity, RolledDamage } from './types';
import { dist2 } from '../utils/math';
import type { Rng } from '../utils/rng';

// ============ 伤害系统：结算 / 击杀 / 玩家受伤 ============
// 领域层不发声音、不建对象表现：一切副作用通过事件交给表现层。

export interface DamageWorld {
  player: PlayerEntity;
  enemies: EnemyEntity[];
  grid: SpatialGrid<EnemyEntity>;
  dmgMul: number;
  dropMul?: number;
  damageBy?: Record<string, number>;
  emit<E extends keyof GameEvents>(event: E, payload: GameEvents[E]): void;
}

/** 按玩家属性掷一次伤害 */
export function rollDamage(p: PlayerEntity, base: number, critForce?: boolean, rng: Rng = Math.random): RolledDamage {
  const crit = critForce ?? rng() < p.stats.crit;
  return { val: base * p.stats.dmg * (crit ? p.stats.critMult : 1), crit };
}

/** 对敌人结算伤害：击退/闪白/飘字事件/死亡（silent 用于 DoT） */
export function dealDamage(
  g: DamageWorld, e: EnemyEntity, rolled: RolledDamage,
  kb: number, fromX: number, fromY: number, silent = false, rng: Rng = Math.random, src?: string,
): void {
  if (e.dead) return;
  if (src && g.damageBy) g.damageBy[src] = (g.damageBy[src] ?? 0) + Math.max(1, Math.round(rolled.val));
  const dmg = Math.max(1, Math.round(rolled.val * (e.dmgTakenMul ?? 1)));
  e.hp -= dmg;
  e.flash = 0.1;
  const ang = Math.atan2(e.y - fromY, e.x - fromX);
  e.kx += Math.cos(ang) * kb;
  e.ky += Math.sin(ang) * kb;
  if (!silent) {
    g.emit('damage', { x: e.x, y: e.y - e.r - 6, val: dmg, crit: rolled.crit });
  }
  if (e.hp <= 0) killEnemy(g, e, rng);
}

/** 击杀：掉落事件 + 分裂事件 + 自爆连锁 */
export function killEnemy(g: DamageWorld, e: EnemyEntity, rng: Rng = Math.random): void {
  if (e.dead) return;
  e.dead = true;

  const luck = g.player.stats.luck;
  const extra = rng() < Math.min(0.5, 0.2 + luck * 0.06) ? 1 : 0;
  g.emit('enemy:killed', { enemy: e, drops: (e.def.xp + extra) * (e.bonusDrops ?? 1) * (g.dropMul ?? 1) });

  if (e.def.splitInto) {
    for (let i = 0; i < (e.def.splitCount ?? 2); i++) {
      g.emit('enemy:split', { from: e, childKey: e.def.splitInto });
    }
  }
  if (e.def.explode) {
    const boomR = e.def.boomR ?? 80;
    g.emit('fx:boom', { x: e.x, y: e.y, r: boomR, color: '#ff9530' });
    g.emit('shake', { force: 6 });
    const p = g.player;
    if (dist2(p.x, p.y, e.x, e.y) < (boomR + p.r) * (boomR + p.r)) {
      hurtPlayer(g, Math.round((e.def.boomDmg ?? 20) * g.dmgMul));
    }
    const near = g.grid.query(e.x, e.y, boomR + GRID_MARGIN, []);
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o !== e && !o.dead && dist2(o.x, o.y, e.x, e.y) < boomR * boomR) {
        o.hp -= 15;
        o.flash = 0.1;
        if (o.hp <= 0) killEnemy(g, o, rng);
      }
    }
  }
}

/** 玩家受伤：闪避 / 护甲 / 圣盾优先抵挡 / 无敌帧 */
export function hurtPlayer(g: DamageWorld, amount: number, rng: () => number = Math.random): void {
  const p = g.player;
  if (p.invuln > 0 || p.hp <= 0) return;
  if (rng() < Math.min(0.6, p.stats.dodge)) {
    g.emit('damage', { x: p.x, y: p.y - 24, val: 0, crit: false, color: '#7ee8ff' });
    g.emit('player:dodged', {});
    p.invuln = 0.25;
    return;
  }
  const reduction = Math.min(0.75, p.stats.armor / (p.stats.armor + 12));
  let dmg = Math.max(1, Math.round(amount * (1 - reduction)));
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
    g.emit('player:shield', { val: absorbed });
  }
  if (dmg <= 0) { p.invuln = 0.25; return; }
  p.hp -= dmg;
  p.hurtFlash = 0.25;
  p.invuln = 0.55;
  g.emit('player:hurt', { val: dmg });
}
