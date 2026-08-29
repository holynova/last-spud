// ============ 实体类 ============
const _bq = []; // 子弹碰撞网格查询缓冲

// ---------- 玩家 ----------
class Player {
  constructor(charDef) {
    this.def = charDef;
    this.x = ARENA_W / 2;
    this.y = ARENA_H / 2;
    this.r = 16;
    this.faceAng = 0;
    this.hurtFlash = 0;
    this.invuln = 0;
    this.walkT = 0;

    this.stats = {
      maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
      crit: 0.05, critMult: 2, armor: 0, dodge: 0.03, pickup: 90, luck: 0,
    };
    // 应用角色修正
    for (const [k, v] of Object.entries(charDef.mod || {})) this.stats[k] += v;
    this.hp = this.stats.maxHp;

    this.weapons = [ { key: charDef.start, tier: 1, timer: rand(0, 0.3), aim: 0, recoil: 0 } ];
    // 技能（主动，自动施放）
    this.skills = [];
    // 经济与成长
    this.xp = 0;
    this.level = 1;
    this.money = 0;
    // 技能状态
    this.shield = 0;
    this.shieldFlash = 0;
    this.frenzyT = 0;
    this.frenzyAspd = 0;
  }

  xpNext() { return Math.floor(3 + this.level * 2.2 + this.level * this.level * 0.35); }

  gainMaterial(n = 1) {
    this.xp += n;
    this.money += n;
    if (this.xp >= this.xpNext()) {
      this.xp -= this.xpNext();
      this.level++;
      return true; // 通知 game 弹出升级
    }
    return false;
  }

  takeDamage(amount, g) {
    if (this.invuln > 0 || this.hp <= 0) return;
    if (Math.random() < Math.min(0.6, this.stats.dodge)) {
      g.texts.push(new DamageText(this.x, this.y - 24, '闪避', false, '#7ee8ff'));
      this.invuln = 0.25;
      return;
    }
    const reduction = Math.min(0.75, this.stats.armor / (this.stats.armor + 12));
    let dmg = Math.max(1, Math.round(amount * (1 - reduction)));
    // 圣盾优先抵挡
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      g.texts.push(new DamageText(this.x, this.y - 34, '盾-' + absorbed, false, '#ffe9a3'));
    }
    if (dmg <= 0) { this.invuln = 0.25; return; }
    this.hp -= dmg;
    this.hurtFlash = 0.25;
    this.invuln = 0.55;
    g.shake = Math.max(g.shake, 7);
    g.texts.push(new DamageText(this.x, this.y - 26, '-' + dmg, false, '#ff6b5e'));
    g.spawnParticles(this.x, this.y, 8, '#ff6b5e');
    Sfx.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      g.onPlayerDeath();
    }
  }

  update(dt, g) {
    const st = this.stats;
    // 狂化加成
    const frenzySpeed = this.frenzyT > 0 ? 0.25 : 0;
    const frenzyAspd = this.frenzyT > 0 ? this.frenzyAspd : 0;
    // 移动：键盘优先，其次触屏摇杆
    let mx = 0, my = 0;
    if (Input.has('KeyW') || Input.has('ArrowUp')) my -= 1;
    if (Input.has('KeyS') || Input.has('ArrowDown')) my += 1;
    if (Input.has('KeyA') || Input.has('ArrowLeft')) mx -= 1;
    if (Input.has('KeyD') || Input.has('ArrowRight')) mx += 1;
    if (!mx && !my && typeof TouchInput !== 'undefined' && TouchInput.active) {
      mx = TouchInput.dx; my = TouchInput.dy;
    }
    if (mx || my) {
      const len = Math.hypot(mx, my);
      const sp = 235 * st.speed * (1 + frenzySpeed);
      this.x += (mx / len) * sp * dt;
      this.y += (my / len) * sp * dt;
      this.faceAng = Math.atan2(my, mx);
      this.walkT += dt * 10;
    } else {
      this.walkT = 0;
    }
    this.x = clamp(this.x, this.r, ARENA_W - this.r);
    this.y = clamp(this.y, this.r, ARENA_H - this.r);

    // 回复
    if (st.regen > 0 && this.hp < st.maxHp) {
      this.hp = Math.min(st.maxHp, this.hp + (st.regen / 5) * dt);
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.shieldFlash = Math.max(0, this.shieldFlash - dt);

    // 武器开火
    for (const w of this.weapons) {
      w.timer -= dt;
      w.recoil = Math.max(0, (w.recoil || 0) - dt * 6);
      if (w.timer <= 0) {
        if (tryFire(g, this, w)) {
          const s = weaponStats(w.key, w.tier);
          w.timer = s.cd / (st.aspd * (1 + frenzyAspd));
        } else {
          w.timer = 0.08; // 没有目标时稍后再试
        }
      }
    }

    // 技能冷却与自动施放
    updateSkills(g, this, dt);
  }
}

// ---------- 敌人 ----------
class Enemy {
  constructor(key, x, y, wave) {
    this.key = key;
    this.def = ENEMIES[key];
    this.x = x; this.y = y;
    this.r = this.def.r;
    this.color = this.def.color || '#c98d4b'; // 掉落粒子颜色兜底
    this.flash = 0;
    this.kx = 0; this.ky = 0;          // 击退速度
    this.slowT = 0;                    // 减速剩余时间
    this.touchCd = 0;
    this.shootT = this.def.shootCd ? rand(this.def.shootCd * 0.5, this.def.shootCd) : 0;
    this.dashT = this.def.dashCd ? this.def.dashCd * 0.7 : 0;
    this.dashing = 0;
    this.dead = false;
    this.t = rand(0, 10);

    const hpMul = waveHpMul(wave), dmgMul = waveDmgMul(wave);
    this.maxHp = Math.round(this.def.hp * hpMul);
    this.hp = this.maxHp;
    this.dmg = this.def.dmg * dmgMul;
    this.speed = this.def.speed * (1 + Math.min(0.5, (wave - 1) * 0.025));
  }

  update(dt, g) {
    const p = g.player;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.touchCd = Math.max(0, this.touchCd - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    const slowMul = this.slowT > 0 ? 0.65 : 1;

    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    let vx = 0, vy = 0;

    if (this.def.ranged && !this.def.boss) {
      // 保持距离的风筝型
      const keep = this.def.keep;
      if (d > keep + 30) { vx = dx / d; vy = dy / d; }
      else if (d < keep - 50) { vx = -dx / d; vy = -dy / d; }
      else { vx = -dy / d * 0.6; vy = dx / d * 0.6; } // 环绕
      this.shootT -= dt;
      if (this.shootT <= 0 && d < keep + 120) {
        this.shootT = this.def.shootCd;
        g.bullets.push(new Bullet({
          x: this.x, y: this.y,
          vx: dx / d * this.def.pspd, vy: dy / d * this.def.pspd,
          dmg: this.dmg, pierce: 0, kb: 0, life: 3,
          r: 6, color: '#d98cff', fromPlayer: false,
        }));
        Sfx.tone('square', 300, 180, 0.1, 0.08);
      }
    } else if (this.def.boss) {
      // Boss：缓慢逼近 + 环形弹幕 + 冲锋
      vx = dx / d; vy = dy / d;
      this.shootT -= dt;
      if (this.shootT <= 0) {
        this.shootT = this.def.shootCd;
        const n = 12, base = rand(0, TAU);
        for (let i = 0; i < n; i++) {
          const a = base + i / n * TAU;
          g.bullets.push(new Bullet({
            x: this.x, y: this.y,
            vx: Math.cos(a) * this.def.pspd, vy: Math.sin(a) * this.def.pspd,
            dmg: this.dmg * 0.5, pierce: 0, kb: 0, life: 3.5,
            r: 7, color: '#e37fff', fromPlayer: false,
          }));
        }
        Sfx.tone('sawtooth', 200, 100, 0.2, 0.2);
      }
      this.dashT -= dt;
      if (this.dashT <= 0) { this.dashT = this.def.dashCd; this.dashing = 0.55; Sfx.tone('sawtooth', 150, 400, 0.3, 0.2); }
      if (this.dashing > 0) {
        this.dashing -= dt;
        vx *= 3.2; vy *= 3.2;
      }
    } else {
      vx = dx / d; vy = dy / d;
    }

    // 移动 + 击退衰减
    this.x += vx * this.speed * slowMul * dt + this.kx * dt;
    this.y += vy * this.speed * slowMul * dt + this.ky * dt;
    this.kx *= Math.pow(0.0025, dt);
    this.ky *= Math.pow(0.0025, dt);
    this.x = clamp(this.x, this.r, ARENA_W - this.r);
    this.y = clamp(this.y, this.r, ARENA_H - this.r);

    // 碰撞玩家
    if (this.touchCd <= 0 && dist2(this.x, this.y, p.x, p.y) < (this.r + p.r) * (this.r + p.r)) {
      this.touchCd = 0.9;
      p.takeDamage(Math.round(this.dmg), g);
      const a = Math.atan2(this.y - p.y, this.x - p.x);
      this.kx += Math.cos(a) * 180;
      this.ky += Math.sin(a) * 180;
    }
  }
}

// ---------- 子弹 ----------
class Bullet {
  constructor(o) {
    Object.assign(this, o);
    this.t = 0;
    this.spin = rand(0, TAU);
  }

  update(dt, g) {
    this.t += dt;
    this.life -= dt;
    if (this.boom) {
      // 回旋镖：飞到最远后折返（恒定速度，严禁逐帧放大——会产生指数级坐标溢出）
      const p = g.player;
      if (!this.returning) {
        this.boomDist += Math.hypot(this.vx, this.vy) * dt;
        if (this.boomDist >= this.boomMax) this.returning = true;
      } else {
        const dx = p.x - this.x, dy = p.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = dx / d * this.boomSpeed;
        this.vy = dy / d * this.boomSpeed;
        if (d < 20) { this.life = 0; return; }
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      // 保险：子弹不允许飞出场地外围（防止任何速度异常把坐标推成 Infinity）
      this.x = clamp(this.x, -80, ARENA_W + 80);
      this.y = clamp(this.y, -80, ARENA_H + 80);
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    this.spin += dt * 12;

    if (this.fromPlayer) {
      // 网格查询周边敌人做精确碰撞（余量覆盖最大敌人半径）
      const near = g.grid.query(this.x, this.y, this.r + 54, _bq);
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead) continue;
        if (dist2(this.x, this.y, e.x, e.y) >= (e.r + this.r) * (e.r + this.r)) continue;
        if (this.boom) {
          const last = this.hitMap.get(e) || -1;
          if (this.t - last < 0.5) continue;
          this.hitMap.set(e, this.t);
        } else if (this.hitSet && this.hitSet.has(e)) {
          continue;
        } else {
          (this.hitSet = this.hitSet || new Set()).add(e);
        }
        dealDamage(g, e, { val: this.dmg, crit: this.crit }, this.kb, this.x - this.vx, this.y - this.vy);
        if (!this.boom) {
          this.pierce--;
          if (this.pierce < 0) { this.life = 0; break; }
        }
      }
    } else {
      const p = g.player;
      if (dist2(this.x, this.y, p.x, p.y) < (p.r + this.r) * (p.r + this.r)) {
        p.takeDamage(Math.round(this.dmg), g);
        this.life = 0;
      }
    }
  }
}

// ---------- 掉落物 ----------
class Pickup {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type; // material | heart
    this.r = type === 'heart' ? 11 : 7;
    this.t = rand(0, TAU);
    this.vx = rand(-40, 40); this.vy = rand(-40, 40);
    this.magnet = false;
  }

  update(dt, g) {
    this.t += dt;
    const p = g.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (!this.magnet && d < p.stats.pickup) this.magnet = true;
    if (this.magnet) {
      const sp = clamp(600 - d, 260, 620);
      this.x += (p.x - this.x) / d * sp * dt;
      this.y += (p.y - this.y) / d * sp * dt;
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= 0.92; this.vy *= 0.92;
    }
    if (d < p.r + this.r + 4) {
      this.collected = true;
      if (this.type === 'material') {
        if (p.gainMaterial(1)) g.onLevelUp();
        Sfx.pickup();
      } else {
        const heal = Math.round(p.stats.maxHp * 0.25);
        p.hp = Math.min(p.stats.maxHp, p.hp + heal);
        g.texts.push(new DamageText(p.x, p.y - 26, '+' + heal, false, '#8ee05a'));
        Sfx.heart();
      }
    }
  }
}

// ---------- 粒子 / 飘字 ----------
class Particle {
  constructor(x, y, color, size = 3, life = 0.5) {
    this.x = x; this.y = y;
    const a = rand(0, TAU), sp = rand(40, 240);
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    this.color = color; this.size = size * rand(0.6, 1.4);
    this.life = life * rand(0.7, 1.3); this.maxLife = this.life;
  }
  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 0.94; this.vy *= 0.94;
  }
}

class DamageText {
  constructor(x, y, val, crit, color) {
    this.x = x + rand(-8, 8); this.y = y;
    this.val = val;
    this.crit = crit;
    this.color = color || (crit ? '#ffd257' : '#ffffff');
    this.life = crit ? 0.9 : 0.6;
    this.maxLife = this.life;
    this.vy = -55;
  }
  update(dt) {
    this.life -= dt;
    this.y += this.vy * dt;
    this.vy *= 0.92;
  }
}
