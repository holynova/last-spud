// ============ 技能系统：施放逻辑 ============
// 技能由玩家自动施放（无手动按键），升级提升伤害/冷却/持续等
const _sq = []; // 网格查询复用缓冲

// 更新玩家所有技能的冷却与自动施放
function updateSkills(g, p, dt) {
  // 狂化 buff 计时
  if (p.frenzyT > 0) p.frenzyT = Math.max(0, p.frenzyT - dt);
  // 圣盾视觉计时（护盾值本身见 p.shield）
  for (const s of p.skills) {
    s.timer -= dt;
    const def = SKILLS[s.key];
    if (s.key === 'thorns') { castThorns(g, p, s, dt); continue; }
    if (s.timer <= 0) {
      const st = skillStats(s.key, s.level);
      if (castSkill(g, p, s.key, st)) {
        s.timer = st.cd;
        s.castAnim = 0.3;
      } else {
        s.timer = 0.2; // 没有目标，稍后重试
      }
    }
    s.castAnim = Math.max(0, (s.castAnim || 0) - dt);
  }
}

function castSkill(g, p, key, st) {
  switch (key) {
    case 'shockwave': return castShockwave(g, p, st);
    case 'chain':     return castChain(g, p, st);
    case 'firefield': return castFirefield(g, p, st);
    case 'barrier':   return castBarrier(g, p, st);
    case 'frenzy':    return castFrenzy(g, p, st);
  }
  return false;
}

// 冲击波：瞬间伤害+击退周围所有敌人，扩散环特效
function castShockwave(g, p, st) {
  g.fx.push({ type: 'ring', x: p.x, y: p.y, r: st.range, ttl: 0.35, maxTtl: 0.35, color: '#ffd257', width: 6 });
  g.fx.push({ type: 'ring', x: p.x, y: p.y, r: st.range * 0.6, ttl: 0.28, maxTtl: 0.28, color: '#fff2c9', width: 3 });
  let hit = false;
  const near = g.grid.query(p.x, p.y, st.range + 54, _sq);
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (e.dead) continue;
    if (dist2(p.x, p.y, e.x, e.y) < (st.range + e.r) * (st.range + e.r)) {
      dealDamage(g, e, { val: st.dmg * p.stats.dmg, crit: false }, 260, p.x, p.y);
      hit = true;
    }
  }
  g.shake = Math.max(g.shake, 5);
  Sfx.boom();
  return hit || g.enemies.length > 0;
}

// 闪电链：雷击最近敌人并连锁跳跃
function castChain(g, p, st) {
  let cur = findTarget(g, p, st.range);
  if (!cur) return false;

  const struck = new Set();
  let fromX = p.x, fromY = p.y;
  for (let i = 0; i < st.jumps && cur; i++) {
    struck.add(cur);
    g.fx.push({ type: 'bolt', x1: fromX, y1: fromY, x2: cur.x, y2: cur.y, ttl: 0.22, maxTtl: 0.22, color: '#7ee8ff' });
    dealDamage(g, cur, { val: st.dmg * p.stats.dmg * (i === 0 ? 1 : 0.8), crit: false }, 40, fromX, fromY);
    fromX = cur.x; fromY = cur.y;
    // 下一个跳跃目标：距上一个 220 内未被击中
    let next = null, nd = 220 * 220;
    const near = g.grid.query(fromX, fromY, 220 + 54, _sq);
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (e.dead || struck.has(e)) continue;
      const d = dist2(fromX, fromY, e.x, e.y);
      if (d < nd) { nd = d; next = e; }
    }
    cur = next;
  }
  Sfx.laser();
  return true;
}

// 烈火结界：脚下生成持续伤害区域
function castFirefield(g, p, st) {
  g.hazards.push({
    x: p.x, y: p.y, r: st.range,
    dps: st.dmg * p.stats.dmg, ttl: st.duration, maxTtl: st.duration,
    tick: 0, kind: 'fire',
  });
  Sfx.tone('sawtooth', 180, 80, 0.3, 0.2);
  return true;
}

// 圣盾术：叠加护盾（有上限）
function castBarrier(g, p, st) {
  if (p.shield >= st.shield * 2) return false; // 满层不浪费
  p.shield = Math.min(st.shield * 2, p.shield + st.shield);
  p.shieldFlash = 0.5;
  g.texts.push(new DamageText(p.x, p.y - 30, '圣盾!', false, '#ffe9a3'));
  Sfx.tone('sine', 660, 990, 0.2, 0.2);
  return true;
}

// 狂化：短时间攻速/移速提升
function castFrenzy(g, p, st) {
  p.frenzyT = st.duration;
  p.frenzyAspd = st.aspdBuff;
  g.texts.push(new DamageText(p.x, p.y - 30, '狂化!', false, '#ff6b5e'));
  Sfx.tone('sawtooth', 150, 400, 0.3, 0.25);
  return true;
}

// 荆棘领域：被动光环，持续伤害+减速（每 0.4s 结算一次）
function castThorns(g, p, s, dt) {
  const st = skillStats('thorns', s.level);
  const r = st.range;
  s.tick = (s.tick || 0) + dt;
  // 视觉环（低频刷新）
  if (!g.fx.some(f => f.type === 'ring' && f.thorns)) {
    g.fx.push({ type: 'ring', x: p.x, y: p.y, r, ttl: 0.5, maxTtl: 0.5, color: 'rgba(142,224,90,0.5)', width: 2, thorns: true });
  }
  if (s.tick < 0.4) return;
  s.tick = 0;
  const near = g.grid.query(p.x, p.y, r + 54, _sq);
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (e.dead) continue;
    if (dist2(p.x, p.y, e.x, e.y) < (r + e.r) * (r + e.r)) {
      dealDamage(g, e, { val: st.dmg * p.stats.dmg * 0.4, crit: false }, 0, p.x, p.y, true);
      e.slowT = 0.6; // 减速 0.6s
    }
  }
}
