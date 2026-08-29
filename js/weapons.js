// ============ 武器开火逻辑 ============
// 网格查询复用缓冲（单线程，各处顺序使用不嵌套即可）
const _wq = [];
const GRID_MARGIN = 54; // 敌人最大半径(Boss 50) + 余量

// 找最近的、在射程内的敌人；返回 enemy 或 null
function findTarget(g, p, range) {
  const near = g.grid.query(p.x, p.y, range, _wq);
  let best = null, bestD = range * range;
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (e.dead) continue;
    const d = dist2(p.x, p.y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// 尝试开火：成功返回 true（重置冷却），否则 false
function tryFire(g, p, w) {
  const s = weaponStats(w.key, w.tier);
  const range = s.range * p.stats.range;

  if (s.kind === 'aura') {
    // 电圈：无需目标，周期性伤害周身
    let hitAny = false;
    const reach2 = range * range;
    const near = g.grid.query(p.x, p.y, range + GRID_MARGIN, _wq);
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (e.dead) continue;
      if (dist2(p.x, p.y, e.x, e.y) < reach2 + e.r * e.r) {
        dealDamage(g, e, rollDamage(p, s.dmg), s.kb || 60, p.x, p.y);
        hitAny = true;
      }
    }
    g.fx.push({ type: 'ring', x: p.x, y: p.y, r: range, ttl: 0.25, maxTtl: 0.25, color: s.color });
    if (hitAny) Sfx.aura(); else Sfx.tone('sine', 700, 900, 0.05, 0.05);
    return true;
  }

  const target = findTarget(g, p, range);
  if (!target) return false;

  const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
  w.aim = baseAng;
  w.recoil = 1;

  switch (s.kind) {
    case 'gun':
    case 'shotgun':
    case 'throw': {
      const n = s.count || 1;
      const spread = s.spread || 0;
      for (let i = 0; i < n; i++) {
        const ang = baseAng + (n > 1 ? (i / (n - 1) - 0.5) * spread : rand(-spread, spread));
        const crit = Math.random() < p.stats.crit;
        const rolled = rollDamage(p, s.dmg, crit);
        g.bullets.push(new Bullet({
          x: p.x + Math.cos(ang) * 18, y: p.y + Math.sin(ang) * 18,
          vx: Math.cos(ang) * s.pspd, vy: Math.sin(ang) * s.pspd,
          dmg: rolled.val, crit,
          pierce: s.pierce || 0, kb: s.kb || 60,
          life: s.life || (s.range / s.pspd) * 1.15,
          r: s.kind === 'throw' ? 6 : 4.5, color: s.color,
          fromPlayer: true,
        }));
      }
      if (s.kind === 'shotgun') Sfx.shotgun();
      else if (s.key === 'flamer') Sfx.tone('square', 200, 120, 0.05, 0.04);
      else Sfx.shoot();
      break;
    }
    case 'boomerang': {
      const crit = Math.random() < p.stats.crit;
      g.bullets.push(new Bullet({
        x: p.x, y: p.y,
        vx: Math.cos(baseAng) * s.pspd, vy: Math.sin(baseAng) * s.pspd,
        dmg: rollDamage(p, s.dmg, crit).val, crit,
        pierce: 99, kb: s.kb, life: 6, r: 9, color: s.color,
        fromPlayer: true, boom: true, boomDist: 0, boomMax: range,
        boomSpeed: s.pspd, hitMap: new Map(),
      }));
      Sfx.shoot();
      break;
    }
    case 'melee': {
      // 扇形横扫
      const arc = s.arc;
      const near = g.grid.query(p.x, p.y, range + GRID_MARGIN, _wq);
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > range + e.r) continue;
        let da = Math.atan2(e.y - p.y, e.x - p.x) - baseAng;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) <= arc / 2) {
          dealDamage(g, e, rollDamage(p, s.dmg), s.kb, p.x, p.y);
        }
      }
      g.fx.push({ type: 'arc', x: p.x, y: p.y, ang: baseAng, arc, r: range, ttl: 0.18, maxTtl: 0.18, color: s.color });
      Sfx.melee();
      g.shake = Math.max(g.shake, 3);
      break;
    }
    case 'beam': {
      const ang = baseAng;
      const x2 = p.x + Math.cos(ang) * range, y2 = p.y + Math.sin(ang) * range;
      const near = g.grid.query(p.x, p.y, range + GRID_MARGIN, _wq);
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead) continue;
        if (pointSegDist2(e.x, e.y, p.x, p.y, x2, y2) < (e.r + 4) * (e.r + 4)) {
          dealDamage(g, e, rollDamage(p, s.dmg), 40, p.x, p.y);
        }
      }
      g.fx.push({ type: 'beam', x1: p.x, y1: p.y, x2, y2, ttl: 0.15, maxTtl: 0.15, color: s.color });
      Sfx.laser();
      break;
    }
  }
  return true;
}

// 按玩家属性滚动一次伤害（含暴击）
function rollDamage(p, base, critForce) {
  const crit = critForce !== undefined ? critForce : Math.random() < p.stats.crit;
  let d = base * p.stats.dmg * (crit ? p.stats.critMult : 1);
  return { val: d, crit };
}

// 对敌人造成伤害并处理击退/飘字/死亡；silent 用于 DoT 类伤害
function dealDamage(g, e, rolled, kb, fromX, fromY, silent) {
  const dmg = Math.max(1, Math.round(rolled.val));
  e.hp -= dmg;
  e.flash = 0.1;
  const ang = Math.atan2(e.y - fromY, e.x - fromX);
  e.kx += Math.cos(ang) * kb;
  e.ky += Math.sin(ang) * kb;
  if (!silent) {
    if (g.texts.length < 80) g.texts.push(new DamageText(e.x, e.y - e.r - 6, dmg, rolled.crit));
    g.spawnParticles(e.x, e.y, rolled.crit ? 8 : 4, e.color);
    Sfx.hit();
  }
  if (e.hp <= 0) killEnemy(g, e);
}

function killEnemy(g, e) {
  if (e.dead) return;
  e.dead = true;
  g.kills++;
  Sfx.kill();
  g.spawnParticles(e.x, e.y, e.def.boss ? 40 : (e.def.elite ? 22 : 10), e.color, 1.6);
  if (e.def.boss || e.def.elite) g.shake = Math.max(g.shake, e.def.boss ? 18 : 8);

  // 掉落材料（幸运增加额外掉落概率）
  const luck = g.player.stats.luck;
  let n = e.def.xp + (Math.random() < Math.min(0.5, 0.2 + luck * 0.06) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    g.pickups.push(new Pickup(e.x + rand(-14, 14), e.y + rand(-14, 14), 'material'));
  }
  // 概率掉治疗包
  const heartChance = 0.025 + luck * 0.01 + (e.def.elite ? 0.5 : 0) + (e.def.boss ? 1 : 0);
  if (Math.random() < heartChance) {
    g.pickups.push(new Pickup(e.x, e.y, 'heart'));
  }
  // 分裂
  if (e.def.splitInto) {
    for (let i = 0; i < e.def.splitCount; i++) {
      const child = new Enemy(e.def.splitInto, e.x + rand(-16, 16), e.y + rand(-16, 16), g.wave);
      g.enemies.push(child);
    }
  }
  // 爆炸（可能连锁，用局部数组避免递归复用缓冲）
  if (e.def.explode) {
    g.fx.push({ type: 'boom', x: e.x, y: e.y, r: e.def.boomR, ttl: 0.3, maxTtl: 0.3, color: '#ff9530' });
    Sfx.boom();
    const p = g.player;
    if (dist2(p.x, p.y, e.x, e.y) < (e.def.boomR + p.r) * (e.def.boomR + p.r)) {
      p.takeDamage(Math.round(e.def.boomDmg * g.dmgMul), g);
    }
    const near = g.grid.query(e.x, e.y, e.def.boomR + GRID_MARGIN, []);
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o !== e && !o.dead && dist2(o.x, o.y, e.x, e.y) < e.def.boomR * e.def.boomR) {
        o.hp -= 15; o.flash = 0.1;
        if (o.hp <= 0) killEnemy(g, o);
      }
    }
    g.shake = Math.max(g.shake, 6);
  }
}
