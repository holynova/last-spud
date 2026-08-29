// ============ 游戏主体 ============

const Game = {
  state: 'menu',   // menu | playing | levelup | shop | pause | over | win
  wave: 1,
  timeLeft: 0,
  kills: 0,
  elapsed: 0,
  player: null,
  enemies: [],
  bullets: [],
  pickups: [],
  hazards: [],
  particles: [],
  grid: new SpatialGrid(96), // 空间网格（每帧重建）
  _q1: [],
  _q2: [],
  texts: [],
  fx: [],
  decor: [],
  shake: 0,
  dmgMul: 1,
  spawnT: 0,
  pendingLevels: 0,
  bannerT: 0,
  camera: { x: 0, y: 0 },
  view: { w: 0, h: 0 },
  selectedChar: 0,
  rerolls: 0,
  shopOffers: [],
  healUsed: false,

  // ---------- 开新局 ----------
  startRun(charIdx) {
    this.selectedChar = charIdx;
    this.player = new Player(CHARACTERS[charIdx]);
    this.wave = 1;
    this.kills = 0;
    this.elapsed = 0;
    this.pendingLevels = 0;
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.hazards = [];
    this.particles = [];
    this.texts = [];
    this.fx = [];
    this.shake = 0;
    this.buildDecor();
    UI.showMenu(false);
    UI.showHud(true);
    this.startWave(1);
  },

  buildDecor() {
    // 装饰物：Kenney 地牢杂件（箱子/木桶/铁砧/碎石），少量且半透明以免与敌人混淆
    const kinds = ['decor/rock', 'decor/crate', 'decor/barrel', 'decor/anvil'];
    this.decor = [];
    for (let i = 0; i < 26; i++) {
      this.decor.push({
        x: rand(90, ARENA_W - 90), y: rand(90, ARENA_H - 90),
        kind: choice(kinds),
        s: rand(1.8, 3.4),
        rot: rand(-0.25, 0.25),
      });
    }
  },

  // ---------- 波次 ----------
  startWave(w) {
    this.wave = w;
    this.state = 'playing';
    this.timeLeft = waveDuration(w);
    this.dmgMul = waveDmgMul(w);
    this.spawnT = 0.8;
    this.rerolls = 0;
    this.sweeping = false;
    this.enemies = [];
    this.bullets = [];
    this.hazards = [];
    this.pickups = [];
    // 最终波：只刷 Boss
    if (w === TOTAL_WAVES) {
      const bx = clamp(this.player.x + 420, 80, ARENA_W - 80);
      const by = clamp(this.player.y, 80, ARENA_H - 80);
      this.enemies.push(new Enemy('boss', bx, by, w));
    }
    UI.hideAll();
    UI.showHud(true);
    UI.banner('第 ' + w + ' 波' + (w === TOTAL_WAVES ? ' · 最终决战！' : ''));
    Sfx.waveStart();
    this.saveProgress();
  },

  // ---------- 进度存档（每波自动保存 / 可从当前波继续） ----------
  saveProgress() {
    try {
      const p = this.player;
      if (!p) return;
      localStorage.setItem('lastspud_save', JSON.stringify({
        char: p.def.key, wave: this.wave,
        hp: Math.ceil(p.hp), xp: p.xp, level: p.level, money: p.money,
        stats: p.stats,
        weapons: p.weapons.map(w => ({ key: w.key, tier: w.tier })),
        skills: p.skills.map(s => ({ key: s.key, level: s.level })),
        kills: this.kills, elapsed: this.elapsed,
        time: Date.now(),
      }));
    } catch (e) { /* 存储不可用时静默跳过 */ }
  },
  loadProgress() {
    try {
      const s = JSON.parse(localStorage.getItem('lastspud_save') || 'null');
      if (s && s.wave >= 1 && s.wave <= TOTAL_WAVES && s.char) return s;
    } catch (e) {}
    return null;
  },
  clearProgress() {
    try { localStorage.removeItem('lastspud_save'); } catch (e) {}
  },
  continueRun() {
    const s = this.loadProgress();
    if (!s) return;
    const idx = CHARACTERS.findIndex(c => c.key === s.char);
    this.player = new Player(CHARACTERS[idx >= 0 ? idx : 0]);
    const p = this.player;
    Object.assign(p.stats, s.stats);
    p.stats.maxHp = s.stats.maxHp; // 防御：确保覆盖
    p.hp = Math.min(s.hp, p.stats.maxHp);
    p.xp = s.xp; p.level = s.level; p.money = s.money;
    p.weapons = s.weapons.map(w => ({ key: w.key, tier: w.tier, timer: 0.2, aim: 0, recoil: 0 }));
    p.skills = (s.skills || []).map(sk => ({ key: sk.key, level: sk.level, timer: 0.5 }));
    this.kills = s.kills || 0;
    this.elapsed = s.elapsed || 0;
    this.buildDecor();
    UI.showMenu(false);
    UI.showHud(true);
    this.startWave(s.wave);
  },

  endWave() {
    this.sweeping = true;
    // 场上敌人全部消灭，材料自动吸收
    for (const e of this.enemies) {
      for (let i = 0; i < e.def.xp; i++) {
        this.pickups.push(new Pickup(e.x + rand(-10, 10), e.y + rand(-10, 10), 'material'));
      }
      e.dead = true;
    }
    this.enemies = [];
    this.bullets = [];
    // 波末回复：3 + 再生*3
    const p = this.player;
    const heal = Math.round(3 + p.stats.regen * 3);
    if (heal > 0 && p.hp < p.stats.maxHp) {
      p.hp = Math.min(p.stats.maxHp, p.hp + heal);
      this.texts.push(new DamageText(p.x, p.y - 26, '+' + heal, false, '#8ee05a'));
    }
    for (const pk of this.pickups) pk.magnet = true; // 材料飞向玩家
    setTimeout(() => this.absorbAndOpenShop(), 450);
  },

  absorbAndOpenShop() {
    // 玩家已死亡/结算时不再弹商店（防止"复活"进商店的竞态）
    if (this.state === 'over' || this.state === 'win') return;
    // 立刻吸收全部剩余材料（可能触发多次升级）
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.type === 'material') { if (p.gainMaterial(1)) this.pendingLevels++; }
      else { p.hp = Math.min(p.stats.maxHp, p.hp + Math.round(p.stats.maxHp * 0.25)); }
    }
    this.pickups = [];
    if (this.wave >= TOTAL_WAVES) { this.onWin(); return; }
    this.shopPending = true;
    if (this.pendingLevels > 0) {
      this.showLevelUp();
    } else {
      this.openShop();
    }
  },

  openShop() {
    this.state = 'shop';
    this.healUsed = false; // 治疗泉水每波商店限购一次
    this.shopOffers = this.rollShop();
    UI.showShop();
  },

  nextWave() {
    this.startWave(this.wave + 1);
  },

  // ---------- 事件 ----------
  onLevelUp() {
    this.pendingLevels++;
    if (this.state === 'playing') this.showLevelUp();
  },
  showLevelUp() {
    this.state = 'levelup';
    Sfx.levelup();
    UI.showLevelUp();
  },
  chooseUpgrade(u) {
    if (u.kind === 'skill-new') {
      this.player.skills.push({ key: u.key, level: 1, timer: 0.5 });
    } else if (u.kind === 'skill-up') {
      const s = this.player.skills.find(x => x.key === u.key);
      if (s) s.level = Math.min(SKILL_MAX_LEVEL, s.level + 1);
    } else {
      u.f(this.player);
    }
    this.pendingLevels--;
    Sfx.buy();
    if (this.pendingLevels > 0) {
      UI.showLevelUp();
      return;
    }
    if (this.shopPending) {
      this.shopPending = false;
      this.openShop();
      return;
    }
    this.state = 'playing';
    UI.hideAll();
    UI.showHud(true);
  },

  // ---------- 暂停 ----------
  togglePause() {
    if (this.state === 'playing') {
      this.state = 'pause';
      UI.showPause();
    } else if (this.state === 'pause') {
      this.state = 'playing';
      UI.hidePause();
    }
  },

  onPlayerDeath() {
    this.state = 'over';
    Sfx.lose();
    this.clearProgress();
    this.saveBest(false);
    UI.showGameOver(false);
  },
  onWin() {
    this.state = 'win';
    Sfx.win();
    this.clearProgress();
    this.saveBest(true);
    UI.showGameOver(true);
  },
  saveBest(win) {
    try {
      const prev = JSON.parse(localStorage.getItem('lastspud_best') || 'null');
      const rec = { wave: this.wave, kills: this.kills, win: win || (prev && prev.win) };
      if (!prev || this.wave > prev.wave || (this.wave === prev.wave && win)) {
        localStorage.setItem('lastspud_best', JSON.stringify(rec));
      }
    } catch (e) {}
  },

  // ---------- 商店 ----------
  rollSingleOffer() {
    const w = this.wave;
    if (Math.random() < 0.42) {
      // 武器
      const key = choice(Object.keys(WEAPONS));
      const r = Math.random();
      let tier = 1;
      const p2 = clamp(0.1 + w * 0.04, 0, 0.55);
      const p3 = w >= 5 ? clamp((w - 4) * 0.06, 0, 0.3) : 0;
      const p4 = w >= 9 ? clamp((w - 8) * 0.05, 0, 0.2) : 0;
      if (r < p4) tier = 4;
      else if (r < p4 + p3) tier = 3;
      else if (r < p4 + p3 + p2) tier = 2;
      return {
        kind: 'weapon', key, tier,
        price: Math.round((22 + w * 3) * (1 + 0.55 * (tier - 1))),
        sold: false, locked: false,
      };
    }
    const it = choice(ITEMS);
    return {
      kind: 'item', item: it,
      price: Math.round(ITEM_PRICE * (1 + w * 0.05) * rand(0.9, 1.15)),
      sold: false, locked: false,
    };
  },
  rollShop() {
    const offers = [];
    for (let i = 0; i < 4; i++) offers.push(this.rollSingleOffer());
    return offers;
  },
  rerollCost() { return Math.round(4 + this.wave * 1.5 + this.rerolls * 3); },
  toggleLock(idx) {
    const o = this.shopOffers[idx];
    if (!o || o.sold) return;
    o.locked = !o.locked;
    Sfx.pickup();
    UI.refreshShop();
  },
  buyOffer(idx) {
    const p = this.player;
    const o = this.shopOffers[idx];
    if (!o || o.sold) return;
    if (p.money < o.price) { Sfx.error(); UI.flashMoney(); return; }

    if (o.kind === 'item') {
      p.money -= o.price;
      o.item.f(p);
      o.sold = true;
      Sfx.buy();
    } else {
      // 武器：同名同阶 → 合成升阶；否则新购
      const same = p.weapons.find(x => x.key === o.key && x.tier === o.tier);
      if (same) {
        p.money -= o.price;
        same.tier++;
        same.timer = 0.2;
        Sfx.buy();
        o.sold = true;
      } else if (p.weapons.length < MAX_WEAPONS) {
        p.money -= o.price;
        p.weapons.push({ key: o.key, tier: o.tier, timer: 0.2, aim: 0, recoil: 0 });
        Sfx.buy();
        o.sold = true;
      } else {
        Sfx.error();
        UI.toastMoney('武器栏已满（6 把）');
        return;
      }
    }
    UI.refreshShop();
    UI.refreshHud();
  },
  buyHeal() {
    const p = this.player;
    const cost = Math.round(8 + this.wave * 1.5);
    if (this.healUsed) { Sfx.error(); return; }
    if (p.money < cost) { Sfx.error(); UI.flashMoney(); return; }
    if (p.hp >= p.stats.maxHp) { Sfx.error(); return; }
    p.money -= cost;
    this.healUsed = true;
    const heal = Math.round(p.stats.maxHp * 0.4);
    p.hp = Math.min(p.stats.maxHp, p.hp + heal);
    this.texts.push(new DamageText(p.x, p.y - 26, '+' + heal, false, '#8ee05a'));
    Sfx.heart();
    UI.refreshShop();
    UI.refreshHud();
  },
  healCost() { return Math.round(8 + this.wave * 1.5); },
  doReroll() {
    const cost = this.rerollCost();
    if (this.player.money < cost) { Sfx.error(); UI.flashMoney(); return; }
    this.player.money -= cost;
    this.rerolls++;
    // 锁定的商品保留原位，其余重新生成
    this.shopOffers = this.shopOffers.map(o =>
      (o && o.locked && !o.sold) ? o : this.rollSingleOffer());
    Sfx.buy();
    UI.refreshShop();
    UI.refreshHud();
  },

  // ---------- 刷怪 ----------
  spawnTick(dt) {
    if (this.wave === TOTAL_WAVES) return; // Boss 波不刷小怪
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = spawnInterval(this.wave);
    const n = spawnPerTick(this.wave);
    for (let i = 0; i < n; i++) {
      if (this.enemies.length > 230) return;
      const key = weightedPick(spawnTable(this.wave)).k;
      this.spawnAtEdge(key);
    }
    // 精英
    if (this.wave >= 5 && Math.random() < 0.035 + this.wave * 0.004) {
      this.spawnAtEdge('elite');
    }
  },
  spawnAtEdge(key) {
    const p = this.player;
    let x, y;
    for (let tries = 0; tries < 8; tries++) {
      const side = irand(0, 3);
      const m = 40;
      if (side === 0) { x = rand(0, ARENA_W); y = m; }
      else if (side === 1) { x = rand(0, ARENA_W); y = ARENA_H - m; }
      else if (side === 2) { x = m; y = rand(0, ARENA_H); }
      else { x = ARENA_W - m; y = rand(0, ARENA_H); }
      if (dist2(x, y, p.x, p.y) > 380 * 380) break;
    }
    this.enemies.push(new Enemy(key, x, y, this.wave));
  },

  // ---------- 更新 ----------
  update(dt) {
    const p = this.player;
    this.elapsed += dt;
    this.timeLeft -= dt;

    // 每帧重建空间网格（网格存引用，查询到的是实时坐标）
    this.grid.clear();
    const es = this.enemies;
    for (const e of es) this.grid.insert(e);

    p.update(dt, this);
    if (!this.sweeping) this.spawnTick(dt);

    // 敌人（含基于网格的分离，取代 O(n²) 全对比）
    for (const e of es) e.update(dt, this);
    for (const a of es) {
      const near = this.grid.query(a.x, a.y, a.r + 54, this._q1);
      for (let i = 0; i < near.length; i++) {
        const b = near[i];
        if (b === a) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = (a.r + b.r) * 0.9;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / d * 0.25;
          const px = dx * push, py = dy * push;
          a.x -= px; a.y -= py;
          b.x += px; b.y += py;
        }
      }
    }
    this.enemies = es.filter(e => !e.dead);

    // 子弹
    for (const b of this.bullets) b.update(dt, this);
    this.bullets = this.bullets.filter(b => b.life > 0);

    // 危险区域（烈火结界等）
    for (const h of this.hazards) {
      h.ttl -= dt;
      h.tick = (h.tick || 0) + dt;
      if (h.tick >= 0.4) {
        h.tick = 0;
        const near = this.grid.query(h.x, h.y, h.r + 54, this._q2);
        for (let i = 0; i < near.length; i++) {
          const e = near[i];
          if (e.dead) continue;
          if (dist2(h.x, h.y, e.x, e.y) < (h.r + e.r) * (h.r + e.r)) {
            dealDamage(this, e, { val: h.dps * 0.4, crit: false }, 0, h.x, h.y, true);
          }
        }
      }
    }
    this.hazards = this.hazards.filter(h => h.ttl > 0);

    // 掉落
    for (const pk of this.pickups) pk.update(dt, this);
    this.pickups = this.pickups.filter(pk => !pk.collected);

    // 粒子 / 飘字 / 特效
    for (const pt of this.particles) pt.update(dt);
    this.particles = this.particles.filter(pt => pt.life > 0);
    for (const t of this.texts) t.update(dt);
    this.texts = this.texts.filter(t => t.life > 0);
    for (const f of this.fx) f.ttl -= dt;
    this.fx = this.fx.filter(f => f.ttl > 0);

    this.shake = Math.max(0, this.shake - dt * 30);

    // 波次倒计时
    if (this.timeLeft <= 0 && !this.sweeping) {
      this.timeLeft = 0;
      this.endWave();
    }

    UI.refreshHud();
  },

  spawnParticles(x, y, n, color, power = 1) {
    if (this.particles.length > 400) return; // 上限防极端场景卡顿
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, color, 3 * power, 0.45));
  },

  // ---------- 渲染 ----------
  render(ctx) {
    const { w: vw, h: vh } = this.view;
    ctx.save();
    ctx.fillStyle = '#2b2620';
    ctx.fillRect(0, 0, vw, vh);

    if (!this.player) { ctx.restore(); return; }
    const p = this.player;

    // 摄像机（含震屏）
    const shx = this.shake ? rand(-this.shake, this.shake) : 0;
    const shy = this.shake ? rand(-this.shake, this.shake) : 0;
    let cx = p.x - vw / 2 + shx;
    let cy = p.y - vh / 2 + shy;
    cx = clamp(cx, 0, Math.max(0, ARENA_W - vw));
    cy = clamp(cy, 0, Math.max(0, ARENA_H - vh));
    this.camera.x = cx; this.camera.y = cy;
    ctx.translate(-cx, -cy);

    this.drawArena(ctx);
    this.drawHazards(ctx);
    this.drawPickups(ctx);
    for (const f of this.fx) this.drawFx(ctx, f);
    for (const e of this.enemies) this.drawEnemy(ctx, e);
    this.drawPlayer(ctx, p);
    this.drawBullets(ctx);

    for (const pt of this.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 飘字
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = (t.crit ? '900 22px' : '800 15px') + ' sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.val, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.val, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // 场景外的触屏摇杆（屏幕空间）
    if (typeof TouchInput !== 'undefined' && TouchInput.active) {
      const t = TouchInput;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.bx, t.by, 56, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath();
      ctx.arc(t.bx + t.dx * 56, t.by + t.dy * 56, 22, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  },

  drawArena(ctx) {
    // 地面：预拼好的沙石地砖图案
    const floorImg = Assets.img('ground/floor_pattern');
    if (floorImg) {
      const pattern = this.floorPattern && this.floorPattern.img === floorImg
        ? this.floorPattern.pat
        : ctx.createPattern(floorImg, 'repeat');
      this.floorPattern = { img: floorImg, pat: pattern };
      ctx.fillStyle = pattern;
    } else {
      ctx.fillStyle = '#3a3126';
    }
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    // 边界墙：沿四边平铺石墙图块
    const wallImg = Assets.img('ground/wall');
    if (wallImg) {
      const S = 48; // 16px 墙砖放大 3 倍
      for (let x = 0; x < ARENA_W; x += S) {
        ctx.drawImage(wallImg, x, 0, S, S);
        ctx.drawImage(wallImg, x, ARENA_H - S, S, S);
      }
      for (let y = S; y < ARENA_H - S; y += S) {
        ctx.drawImage(wallImg, 0, y, S, S);
        ctx.drawImage(wallImg, ARENA_W - S, y, S, S);
      }
    } else {
      ctx.strokeStyle = '#4a4232';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, ARENA_W - 8, ARENA_H - 8);
    }

    // 装饰杂件
    for (const d of this.decor) {
      const img = Assets.img(d.kind);
      if (!img) continue;
      const s = 16 * d.s;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.globalAlpha = 0.92;
      // 落地阴影
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(2, s * 0.32, s * 0.42, s * 0.16, 0, 0, TAU);
      ctx.fill();
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  drawPickups(ctx) {
    for (const pk of this.pickups) {
      const key = pk.type === 'material' ? 'pickup/material' : 'pickup/heart';
      const img = Assets.img(key);
      const bob = Math.sin(pk.t * 5) * 2;
      if (img) {
        const s = pk.type === 'heart' ? 26 : 20;
        ctx.drawImage(img, pk.x - s / 2, pk.y - s / 2 + bob, s, s);
      } else {
        ctx.fillStyle = pk.type === 'material' ? '#6ee06e' : '#ff6b5e';
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, pk.r, 0, TAU);
        ctx.fill();
      }
    }
  },

  drawPlayer(ctx, p) {
    const bob = p.walkT ? Math.sin(p.walkT) * 2 : 0;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 17 - bob, 14, 5, 0, 0, TAU);
    ctx.fill();
    // 无敌闪烁
    if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    // 角色精灵（32px 高清放大，Kenney 原图 16px）
    const sprite = Assets.img(p.def.sprite);
    if (sprite) {
      const S = 40;
      if (p.frenzyT > 0) ctx.filter = 'sepia(0.6) saturate(2.4) hue-rotate(-30deg)';
      ctx.drawImage(sprite, -S / 2, -S / 2 + 2, S, S);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = p.hurtFlash > 0 ? '#ff8a7a' : '#c98d4b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 19, 0, 0, TAU);
      ctx.fill();
    }
    // 受击红闪（覆盖半透明红圈）
    if (p.hurtFlash > 0) {
      ctx.globalAlpha = p.hurtFlash * 2;
      ctx.fillStyle = '#ff6b5e';
      ctx.beginPath();
      ctx.arc(0, 2, 18, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 圣盾
    if (p.shield > 0) {
      const a = 0.35 + (p.shieldFlash > 0 ? p.shieldFlash : 0) * 0.8;
      ctx.strokeStyle = `rgba(255,233,163,${a})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 26 + Math.sin(this.elapsed * 6) * 2, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // 武器挂点（绕身旋转，开火时指向目标并后坐）
    p.weapons.forEach((w, i) => {
      const s = weaponStats(w.key, w.tier);
      const n = p.weapons.length;
      const a = (i / n) * TAU + this.elapsed * 0.4;
      const orbit = 27;
      const wx = p.x + Math.cos(a) * orbit;
      const wy = p.y + Math.sin(a) * orbit;
      const img = Assets.img(s.icon);
      const rec = (w.recoil || 0) * 5;
      ctx.save();
      ctx.translate(wx + Math.cos(w.aim || 0) * -rec, wy + Math.sin(w.aim || 0) * -rec);
      if (s.kind !== 'aura') ctx.rotate((w.aim || 0) + Math.PI / 4); // 图标为斜置武器，转到指向
      const S = 18;
      if (img) {
        ctx.drawImage(img, -S / 2, -S / 2, S, S);
      } else {
        ctx.fillStyle = s.color;
        ctx.fillRect(-6, -4, 12, 8);
      }
      ctx.restore();
    });
  },

  drawEnemy(ctx, e) {
    const def = e.def;
    ctx.save();
    ctx.translate(e.x, e.y);
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, e.r * 0.85, e.r * 0.8, e.r * 0.3, 0, 0, TAU);
    ctx.fill();

    const S = e.r * 2.6; // 精灵尺寸略大于碰撞半径
    const sprite = Assets.img(def.sprite);
    if (sprite) {
      const wob = def.shape === 'blob' ? 1 + Math.sin(e.t * 6) * 0.06 : 1;
      if (e.flash > 0) ctx.filter = 'brightness(2.6) saturate(0.3)';
      ctx.drawImage(sprite, -S / 2 * wob, -S / 2 * wob, S * wob, S * wob);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : (e.color || '#7ec850');
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
    }

    // 精英光环 / Boss 冠
    if (def.elite) {
      ctx.strokeStyle = 'rgba(255,120,200,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 6 + Math.sin(e.t * 5) * 2, 0, TAU);
      ctx.stroke();
    }
    if (def.boss) {
      ctx.fillStyle = '#ffd257';
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.7, -e.r - 2);
      ctx.lineTo(-e.r * 0.35, -e.r - 16);
      ctx.lineTo(0, -e.r - 2);
      ctx.lineTo(e.r * 0.35, -e.r - 16);
      ctx.lineTo(e.r * 0.7, -e.r - 2);
      ctx.closePath();
      ctx.fill();
    }

    // 受击白闪兜底（无 filter 环境下仍可见）
    if (e.flash > 0 && !sprite) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Boss 血条
    if (def.boss) {
      const w = 90, h = 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 26, w, h);
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(e.x - w / 2 + 1, e.y - e.r - 25, (w - 2) * clamp(e.hp / e.maxHp, 0, 1), h - 2);
    }
  },

  drawBullets(ctx) {
    for (const b of this.bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.boom) {
        ctx.rotate(b.spin);
        ctx.fillStyle = b.color;
        ctx.strokeStyle = 'rgba(0,0,0,.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-9, -4, 18, 8, 4);
        ctx.fill(); ctx.stroke();
      } else if (!b.fromPlayer) {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(0, 0, b.r * 0.45, 0, TAU);
        ctx.fill();
      } else {
        // 拖尾
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, b.r * 1.6, b.r * 0.8, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  drawHazards(ctx) {
    for (const h of this.hazards) {
      const a = clamp(h.ttl / h.maxTtl, 0, 1);
      const pulse = 1 + Math.sin(this.elapsed * 10) * 0.04;
      ctx.save();
      ctx.globalAlpha = 0.25 + a * 0.3;
      const grad = ctx.createRadialGradient(h.x, h.y, h.r * 0.2, h.x, h.y, h.r * pulse);
      grad.addColorStop(0, 'rgba(255,180,60,0.9)');
      grad.addColorStop(0.7, 'rgba(255,110,30,0.55)');
      grad.addColorStop(1, 'rgba(200,60,10,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * pulse, 0, TAU);
      ctx.fill();
      // 火舌粒子
      if (Math.random() < 0.4) {
        this.particles.push(new Particle(
          h.x + rand(-h.r, h.r) * 0.8, h.y + rand(-h.r, h.r) * 0.8,
          choice(['#ffb057', '#ff6b2e', '#ffd257']), 3.5, 0.4));
      }
      ctx.restore();
    }
  },

  drawFx(ctx, f) {
    const a = clamp(f.ttl / f.maxTtl, 0, 1);
    ctx.save();
    ctx.globalAlpha = a * 0.8;
    if (f.type === 'beam') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 5 * a + 1;
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (f.type === 'arc') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1.15 - a * 0.15), f.ang - f.arc / 2, f.ang + f.arc / 2);
      ctx.stroke();
    } else if (f.type === 'bolt') {
      // 闪电：主干 + 随机锯齿
      const segs = 6;
      const dx = f.x2 - f.x1, dy = f.y2 - f.y1;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const off = rand(-10, 10);
        ctx.lineTo(f.x1 + dx * t - dy / Math.hypot(dx, dy) * off,
                   f.y1 + dy * t + dx / Math.hypot(dx, dy) * off);
      }
      ctx.lineTo(f.x2, f.y2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (f.type === 'ring') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.width || 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1.15 - a * 0.15), 0, TAU);
      ctx.stroke();
    } else if (f.type === 'boom') {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1 - a * 0.3), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 0.4 * a, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};
