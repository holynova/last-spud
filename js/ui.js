// ============ DOM UI ============

const UI = {
  el(id) { return document.getElementById(id); },

  init() {
    // 角色选择
    const list = this.el('char-list');
    CHARACTERS.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'char-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `选择英雄：${c.name}`);
      card.innerHTML = `<div class="face"><img class="char-img" src="assets/${c.sprite}.png" alt="${c.name}"></div><h3>${c.name}</h3><p>${c.desc}</p>`;
      card.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); card.click(); } };
      card.onclick = () => {
        list.querySelectorAll('.char-card').forEach(x => x.classList.remove('selected'));
        card.classList.add('selected');
        Game.selectedChar = i;
        const btn = this.el('btn-start');
        btn.disabled = false;
        btn.textContent = `选择 ${c.name}，开始求生！`;
        Sfx.pickup();
      };
      list.appendChild(card);
    });
    this.el('btn-start').onclick = () => {
      Sfx.init(); Sfx.resume();
      Game.startRun(Game.selectedChar);
    };
    this.el('btn-continue').onclick = () => {
      Sfx.init(); Sfx.resume();
      Game.continueRun();
    };
    this.el('btn-reroll').onclick = () => Game.doReroll();
    this.el('btn-nextwave').onclick = () => { Game.nextWave(); };
    this.el('btn-resume').onclick = () => Game.togglePause();
    this.el('btn-quit').onclick = () => {
      const btn = this.el('btn-quit');
      if (!this._quitArmed) {
        // 不可逆操作：先武装确认，点第二次才真正放弃
        this._quitArmed = true;
        btn.textContent = '确认放弃？进度将清除';
        btn.classList.add('danger-arm');
        return;
      }
      this._quitArmed = false;
      btn.textContent = '放弃本局';
      btn.classList.remove('danger-arm');
      Game.state = 'over';
      Game.clearProgress();
      Game.saveBest(false);
      UI.showGameOver(false);
    };
    this.el('btn-again').onclick = () => { this.showMenu(true); };
    this.refreshBest();
  },

  refreshBest() {
    try {
      const rec = JSON.parse(localStorage.getItem('lastspud_best') || 'null');
      this.el('best-record').textContent = rec
        ? `最佳纪录：${rec.win ? '通关' : '第 ' + rec.wave + ' 波'}，击杀 ${rec.kills}`
        : '尚无纪录，从第 1 波开始';
    } catch (e) {}
  },

  showMenu(show) {
    this.el('overlay-menu').classList.toggle('hidden', !show);
    if (show) {
      this.refreshBest();
      this.showHud(false);
      this.hideAll();
      this.el('overlay-menu').classList.remove('hidden');
      // 有未完成的存档时显示「继续」按钮
      const save = Game.loadProgress();
      const btn = this.el('btn-continue');
      if (save && save.wave > 1) {
        btn.textContent = `继续上局，第 ${save.wave} 波，${save.kills || 0} 击杀`;
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    }
  },

  showHud(show) { this.el('hud').classList.toggle('hidden', !show); },

  hideAll() {
    ['overlay-levelup', 'overlay-shop', 'overlay-pause', 'overlay-over']
      .forEach(id => this.el(id).classList.add('hidden'));
  },

  // ---------- HUD ----------
  refreshHud() {
    const p = Game.player;
    if (!p) return;
    this.el('hud-wave').textContent = `第 ${Game.wave} / ${TOTAL_WAVES} 波`;
    const money = String(p.money);
    if (this._money !== money) {
      this._money = money;
      this.el('hud-money-num').textContent = money;
    }
    this.el('hud-level').textContent = `Lv.${p.level}`;

    const hpPct = Math.round(clamp(p.hp / p.stats.maxHp * 100, 0, 100));
    if (this._hpPct !== hpPct) {
      this._hpPct = hpPct;
      this.el('hud-hpbar').style.width = hpPct + '%';
      this.el('hud-hptext').textContent = `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`;
    }

    const xpPct = Math.round(clamp(p.xp / p.xpNext() * 100, 0, 100));
    if (this._xpPct !== xpPct) {
      this._xpPct = xpPct;
      this.el('hud-xpbar').style.width = xpPct + '%';
    }

    const timer = Math.ceil(Game.timeLeft);
    if (this._timer !== timer) {
      this._timer = timer;
      const el = this.el('hud-timer');
      el.textContent = timer;
      el.classList.toggle('danger', Game.timeLeft < 6);
    }

    // 武器槽：集合变化才重建
    const ws = this.el('hud-weapons');
    const sig = p.weapons.map(w => w.key + w.tier).join(',');
    if (sig !== this._wsig) {
      this._wsig = sig;
      ws.innerHTML = p.weapons.map(w => {
        const d = WEAPONS[w.key];
        return `<div class="wslot" title="${d.name}">${this.iconImg(d.icon, 'wslot-img')}<span class="tstars" style="color:${TIER_COLORS[w.tier - 1]}">${'★'.repeat(w.tier)}</span></div>`;
      }).join('');
    }

    // 技能槽：集合变化才重建 DOM，冷却每帧只写遮罩高度
    this.refreshSkillSlots(p);
  },

  refreshSkillSlots(p) {
    const sk = this.el('hud-skills');
    if (!sk) return;
    const sig = p.skills.map(s => s.key + ':' + s.level).join(',');
    if (sig !== this._sksig) {
      this._sksig = sig;
      sk.innerHTML = p.skills.map(s => {
        const def = SKILLS[s.key];
        return `<div class="sslot" title="${def.name} Lv.${s.level}">
          ${this.iconImg(def.icon, 'wslot-img')}
          <span class="slv">${s.level}</span>
          <div class="scd" style="height:0%"></div>
        </div>`;
      }).join('');
      this._scdEls = Array.from(sk.querySelectorAll('.scd'));
      this._scdPct = this._scdEls.map(() => -1);
    }
    if (!this._scdEls) return;
    for (let i = 0; i < p.skills.length; i++) {
      const s = p.skills[i];
      const st = skillStats(s.key, s.level);
      const pct = st.cd > 0 ? Math.round(clamp(s.timer / st.cd, 0, 1) * 100) : 0;
      if (pct !== this._scdPct[i]) {
        this._scdPct[i] = pct;
        this._scdEls[i].style.height = pct + '%';
      }
    }
  },

  banner(text) {
    const b = this.el('banner');
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  },

  // ---------- 升级 ----------
  // 升级池 = 属性词条 + 新技能 + 已有技能升级
  levelupPool() {
    const p = Game.player;
    const pool = UPGRADES.map(u => ({ ...u, kind: 'stat' }));
    for (const key in SKILLS) {
      const def = SKILLS[key];
      const owned = p.skills.find(s => s.key === key);
      if (owned) {
        if (owned.level < SKILL_MAX_LEVEL) {
          pool.push({
            kind: 'skill-up', key, w: 8,
            n: `${def.name} Lv.${owned.level} → ${owned.level + 1}`,
            icon: def.icon, color: def.color,
            d: def.levelDesc(owned.level + 1),
          });
        }
      } else if (p.skills.length < MAX_SKILLS) {
        pool.push({
          kind: 'skill-new', key, w: 7,
          n: `新技能：${def.name}`,
          icon: def.icon, color: def.color,
          d: def.desc,
        });
      }
    }
    return pool;
  },

  iconImg(key, cls = 'cicon-img') {
    return `<img class="${cls}" src="assets/${key}.png" alt="" onerror="this.style.display='none'">`;
  },

  showLevelUp() {
    Game.state = 'levelup';
    this.hideAll();
    this.showHud(true);
    const list = this.el('levelup-list');
    list.innerHTML = '';
    const picks = weightedDistinct(this.levelupPool(), 4);
    picks.forEach(u => {
      const card = document.createElement('div');
      card.className = 'pick-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); card.click(); } };
      let rc = '#4aa3ff', tag = '属性强化';
      if (u.kind === 'skill-new') { rc = u.color || '#c86bff'; tag = '新技能'; }
      else if (u.kind === 'skill-up') { rc = u.color || '#ffd257'; tag = '技能升级'; }
      card.style.setProperty('--rc', rc);
      card.innerHTML = `
        <div class="ctag">${tag}</div>
        ${this.iconImg(u.icon)}
        <h3>${u.n}</h3>
        <div class="cdesc">${u.d}</div>`;
      card.onclick = () => Game.chooseUpgrade(u);
      list.appendChild(card);
    });
    this.el('overlay-levelup').classList.remove('hidden');
  },

  // ---------- 商店 ----------
  showShop() {
    this.hideAll();
    this.showHud(true);
    this.refreshShop();
    this.el('overlay-shop').classList.remove('hidden');
  },

  refreshShop() {
    const p = Game.player;
    this.el('shop-money').textContent = p.money;
    this.el('reroll-cost').textContent = Game.rerollCost();

    const list = this.el('shop-list');
    list.innerHTML = '';
    Game.shopOffers.forEach((o, idx) => {
      const card = document.createElement('div');
      card.className = 'pick-card' + (o.locked ? ' locked' : '');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); card.click(); } };
      if (o.kind === 'weapon') {
        const d = WEAPONS[o.key];
        const s = weaponStats(o.key, o.tier);
        card.style.setProperty('--rc', TIER_COLORS[o.tier - 1]);
        const merge = p.weapons.some(w => w.key === o.key && w.tier === o.tier);
        const full = !merge && p.weapons.length >= MAX_WEAPONS;
        card.innerHTML = `
          <div class="ctag">武器：${TIER_NAMES[o.tier - 1]}${merge ? '，可合成↑' : ''}</div>
          ${this.iconImg(d.icon)}
          <h3>${d.name}</h3>
          <div class="cdesc">伤害 ${Math.round(s.dmg)}，冷却 ${s.cd.toFixed(2)} 秒<br>${d.desc}</div>
          <div class="cprice"><img class="coin" src="assets/pickup/material.png" alt=""> ${o.price}</div>`;
        if (o.sold) card.classList.add('sold');
        if (full) { card.classList.add('disabled'); card.onclick = () => { Sfx.error(); this.toastMoney('武器栏已满'); }; }
        else if (!o.sold) card.onclick = () => Game.buyOffer(idx);
      } else {
        card.style.setProperty('--rc', '#5ad06e');
        card.innerHTML = `
          <div class="ctag">道具</div>
          ${this.iconImg(o.item.icon)}
          <h3>${o.item.n}</h3>
          <div class="cdesc">${o.item.d}</div>
          <div class="cprice"><img class="coin" src="assets/pickup/material.png" alt=""> ${o.price}</div>`;
        if (o.sold) card.classList.add('sold');
        else card.onclick = () => Game.buyOffer(idx);
      }
      // 锁定按钮（已售出的不需要）
      if (!o.sold) {
        const lock = document.createElement('div');
        lock.className = 'lock-btn' + (o.locked ? ' on' : '');
        lock.textContent = o.locked ? '已锁' : '锁定';
        lock.title = o.locked ? '解锁（重抽时会刷新）' : '锁定（重抽时保留）';
        lock.onclick = (ev) => { ev.stopPropagation(); Game.toggleLock(idx); };
        card.appendChild(lock);
      }
      list.appendChild(card);
    });

    // 面包回血
    const healCost = Game.healCost();
    const bread = document.createElement('div');
    bread.className = 'pick-card';
    bread.tabIndex = 0;
    bread.setAttribute('role', 'button');
    bread.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); bread.click(); } };
    bread.style.setProperty('--rc', '#ff6b5e');
    if (Game.healUsed || p.hp >= p.stats.maxHp) bread.classList.add('disabled');
    bread.innerHTML = `
      <div class="ctag">补给</div>
      ${this.iconImg('pickup/heart')}
      <h3>治疗泉水</h3>
      <div class="cdesc">立刻回复 40% 最大生命<br>${Game.healUsed ? '（本波已喝过）' : ''}</div>
      <div class="cprice"><img class="coin" src="assets/pickup/material.png" alt=""> ${healCost}</div>`;
    bread.onclick = () => Game.buyHeal();
    list.appendChild(bread);
  },

  // ---------- 暂停 ----------
  showPause() {
    this._quitArmed = false;
    const quitBtn = this.el('btn-quit');
    quitBtn.textContent = '放弃本局';
    quitBtn.classList.remove('danger-arm');
    const p = Game.player;
    const grid = this.el('pause-stats');
    const skillRows = p.skills.length
      ? `<div class="skill-title">主动技能</div>` + p.skills.map(s => {
          const def = SKILLS[s.key];
          return `<div class="row skill-row">${this.iconImg(def.icon, 'row-img')}<span>${def.name} Lv.${s.level}</span><b>${def.levelDesc(s.level)}</b></div>`;
        }).join('')
      : '';
    grid.innerHTML = statRows(p) + skillRows;
    this.el('overlay-pause').classList.remove('hidden');
  },
  hidePause() { this.el('overlay-pause').classList.add('hidden'); },

  // ---------- 结算 ----------
  showGameOver(win) {
    this.hideAll();
    this.showHud(false);
    const p = Game.player;
    this.el('over-title').textContent = win ? '通关！地牢之王' : '你倒在了地牢深处';
    this.el('over-stats').innerHTML = `
      <div class="row"><span>到达波次</span><b>第 ${Game.wave} / ${TOTAL_WAVES} 波${win ? '，通关！' : ''}</b></div>
      <div class="row"><span>等级</span><b>Lv.${p.level}</b></div>
      <div class="row"><span>击杀数</span><b>${Game.kills}</b></div>
      <div class="row"><span>存活时间</span><b>${Math.floor(Game.elapsed / 60)}分${Math.floor(Game.elapsed % 60)}秒</b></div>
    `;
    this.el('btn-again').textContent = '再战一局';
    this.el('overlay-over').classList.remove('hidden');
  },

  // ---------- 小提示 ----------
  toastMoney(msg) {
    let t = this.el('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      this.el('app').appendChild(t);
    }
    t.textContent = msg;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  },
  flashMoney() {
    const m = this.el('hud-money') || this.el('shop-money');
    if (!m) return;
    m.style.transition = 'none';
    m.style.color = '#ff6b5e';
    setTimeout(() => { m.style.transition = 'color .5s'; m.style.color = ''; }, 120);
    Sfx.error();
  },
};

// ---------- 辅助 ----------
function weightedDistinct(pool, n) {
  const picks = [];
  const avail = pool.slice();
  while (picks.length < n && avail.length) {
    const u = weightedPick(avail);
    picks.push(u);
    avail.splice(avail.indexOf(u), 1);
  }
  return picks;
}

function statRows(p) {
  const s = p.stats;
  const reduction = Math.min(0.75, s.armor / (s.armor + 12)) * 100;
  const row = (icon, label, val) =>
    `<div class="row"><span>${UI.iconImg(icon, 'row-img')}${label}</span><b>${val}</b></div>`;
  return [
    row('up/vit', '生命', `${Math.ceil(p.hp)}/${Math.round(s.maxHp)}`),
    row('up/regen', '再生', `每 5 秒 +${s.regen.toFixed(1)}`),
    row('up/wind', '移速', `${Math.round(s.speed * 100)}%`),
    row('up/blade', '伤害', `${Math.round(s.dmg * 100)}%`),
    row('up/swift', '攻速', `${Math.round(s.aspd * 100)}%`),
    row('up/eagle', '射程', `${Math.round(s.range * 100)}%`),
    row('up/lethal', '暴击', `${Math.round(s.crit * 100)}%`),
    row('up/cruel', '暴伤', `${Math.round(s.critMult * 100)}%`),
    row('item/shield_item', '减伤', `${reduction.toFixed(0)}%`),
    row('up/instinct', '闪避', `${Math.round(Math.min(0.6, s.dodge) * 100)}%`),
    row('up/magnet', '拾取范围', `${Math.round(s.pickup)}`),
    row('up/lucky', '幸运', `${s.luck}`),
  ].join('');
}
