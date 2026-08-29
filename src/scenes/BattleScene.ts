import Phaser from 'phaser';
import { ARENA_H, ARENA_W, WALL } from '../config';
import { buildDecorList, wallPositions } from '../domain/layout';
import { mulberry32 } from '../utils/rng';
import { createWorld } from '../domain/world';
import { createPlayer, clampToArena, gainMaterial, updatePlayer } from '../domain/PlayerSystem';
import { updateBullet } from '../domain/WeaponSystem';
import { updateEnemy } from '../domain/EnemySystem';
import { startWave, sweepWave, updateWave } from '../domain/WaveDirector';
import { createEnemy } from '../domain/entities';
import { PickupSystem } from '../domain/PickupSystem';
import { applyLevelPick, buildLevelupPool, describePick, pickLevelUps } from '../domain/LevelSystem';
import { updateSkills, updateHazards } from '../domain/SkillSystem';
import { ShopSystem, type ShopOffer } from '../domain/ShopSystem';
import { WEAPONS, TIER_NAMES, TIER_COLORS } from '../data/weapons';
import { SKILLS, skillStats } from '../data/skills';
import { InputService } from '../infra/input';
import { AudioService } from '../infra/audio';
import { CHARACTERS, characterStats } from '../data/characters';
import { SaveSystem, type SaveData } from '../domain/SaveSystem';
import { localStorageAdapter } from '../infra/storage';
import type { BulletEntity, EnemyEntity } from '../domain/types';

const SKILL_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(SKILLS).map(([k, d]) => [k, d.icon]));

function memoryStorageFallback(): import('../domain/SaveSystem').StorageLike {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } };
}

/**
 * 战斗场景（P4）：世界装配 + 玩家 + 武器 + 敌人波次 + 掉落拾取 + 升级四选一 + HUD。
 */
export class BattleScene extends Phaser.Scene {
  private input2!: InputService;
  private sfx = new AudioService();
  private playerSprite!: Phaser.GameObjects.Image;
  private enemySprites = new Map<EnemyEntity, Phaser.GameObjects.Image>();
  private bulletSprites = new Map<BulletEntity, Phaser.GameObjects.Image>();
  private pickupSprites = new Map<import('../domain/PickupSystem').PickupEntity, Phaser.GameObjects.Image>();
  private hpText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private hudBars!: Phaser.GameObjects.Graphics;
  private weaponKey = 'pistol';

  // 升级流程
  private pendingLevels = 0;
  private overlayOpen = false;
  private afterLevelUpsCb?: () => void;
  private pickupSystem!: PickupSystem;
  private shop!: ShopSystem;

  // 领域状态（渲染只读）
  private world!: ReturnType<typeof createWorld>['world'];
  private bus!: ReturnType<typeof createWorld>['bus'];
  private run!: ReturnType<typeof createWorld>['run'];
  private saveSystem = new SaveSystem(
    typeof window !== 'undefined' && window.localStorage ? localStorageAdapter() : memoryStorageFallback());
  private saveData?: SaveData;
  private charIdx = 0;
  private paused = false;
  private gameEnded = false;

  constructor() {
    super('Battle');
  }

  init(data: { charIdx?: number; save?: SaveData }): void {
    this.charIdx = data.charIdx ?? 0;
    this.saveData = data.save;
    this.paused = false;
    this.gameEnded = false;
    this.pendingLevels = 0;
    this.overlayOpen = false;
    this.afterLevelUpsCb = undefined;
  }

  create(): void {
    // 地面与边界
    this.add.tileSprite(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 'ground/floor_pattern');
    for (const t of wallPositions()) {
      this.add.image(t.x, t.y, 'ground/wall').setDisplaySize(WALL, WALL);
    }
    const rng = mulberry32(Date.now() >>> 0);
    for (const d of buildDecorList(rng)) {
      this.add.image(d.x, d.y, d.kind).setScale(d.scale).setRotation(d.rotation).setAlpha(0.92);
    }

    // 领域装配：按角色（或存档）初始化
    const char = CHARACTERS[this.saveData ? CHARACTERS.findIndex(c => c.key === this.saveData!.char) : this.charIdx] ?? CHARACTERS[0];
    this.charIdx = CHARACTERS.indexOf(char);
    this.weaponKey = char.start;
    const player = createPlayer(char.key, ARENA_W / 2, ARENA_H / 2, characterStats(char), char.start);
    if (this.saveData) {
      const sv = this.saveData;
      Object.assign(player.stats, sv.stats);
      player.stats.maxHp = sv.stats.maxHp;
      player.hp = Math.min(sv.hp, player.stats.maxHp);
      player.xp = sv.xp; player.level = sv.level; player.money = sv.money;
      player.weapons = sv.weapons.map(w => ({ ...w }));
      player.skills = sv.skills.map(sk => ({ key: sk.key, level: sk.level, timer: 0.5, tick: 0, castAnim: 0 }));
    }
    const bundle = createWorld(player, 1);
    this.world = bundle.world;
    this.bus = bundle.bus;
    this.run = bundle.run;

    // 玩家精灵
    this.playerSprite = this.add.image(player.x, player.y, 'player/' + player.defKey).setScale(2.5);

    // 掉落拾取与商店
    this.pickupSystem = new PickupSystem(this.bus as never);
    this.pickupSystem.attachDrops();
    this.shop = new ShopSystem(() => this.run.wave);

    // 事件 → 表现
    this.bus.on('damage', ({ x, y, val, crit, color }) => {
      if (val === 0) {
        this.spawnFloatText(x, y, '闪避', '#7ee8ff', false);
        return;
      }
      this.spawnFloatText(x, y, String(val), crit ? '#ffd257' : '#ffffff', crit);
    });
    this.bus.on('player:hurt', () => this.cameras.main.shake(120, 0.006));
    this.bus.on('enemy:killed', () => { this.run.kills++; });
    this.bus.on('enemy:split', ({ from, childKey }) => {
      for (let i = 0; i < 2; i++) {
        const child = createEnemy(childKey, from.x + (Math.random() - 0.5) * 30, from.y + (Math.random() - 0.5) * 30, this.run.wave);
        this.world.enemies.push(child);
        this.world.grid.insert(child);
        this.enemySprites.set(child, this.add.image(child.x, child.y, child.def.sprite).setScale((child.r * 2.6) / 16));
      }
    });
    this.bus.on('fx:ring', ({ x, y, r, color, width }) => {
      const ring = this.add.circle(x, y, 8, 0xffffff, 0)
        .setStrokeStyle(width ?? 3, Phaser.Display.Color.HexStringToColor(color).color, 0.9).setDepth(85);
      this.tweens.add({ targets: ring, radius: r, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
    });
    this.bus.on('fx:bolt', ({ x1, y1, x2, y2, color }) => {
      const g = this.add.graphics().setDepth(85);
      g.lineStyle(3, Phaser.Display.Color.HexStringToColor(color).color, 1);
      g.beginPath();
      g.moveTo(x1, y1);
      const segs = 6, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      for (let i = 1; i < segs; i++) {
        const t = i / segs, off = (Math.random() - 0.5) * 20;
        g.lineTo(x1 + dx * t - (dy / len) * off, y1 + dy * t + (dx / len) * off);
      }
      g.lineTo(x2, y2);
      g.strokePath();
      this.time.delayedCall(180, () => g.destroy());
    });
    this.bus.on('fx:arc', ({ x, y, ang, arc, r, color }) => {
      const g = this.add.graphics().setDepth(85);
      g.lineStyle(7, Phaser.Display.Color.HexStringToColor(color).color, 0.9);
      g.beginPath();
      g.arc(x, y, r * 0.9, ang - arc / 2, ang + arc / 2);
      g.strokePath();
      this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
    });
    this.bus.on('fx:boom', ({ x, y, r, color }) => {
      const ring = this.add.circle(x, y, 10, Phaser.Display.Color.HexStringToColor(color).color, 0.6).setDepth(80);
      this.tweens.add({ targets: ring, radius: r, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    });

    this.input2 = new InputService(this);

    // 音效订阅（M 静音）
    this.input.keyboard?.on('keydown-M', () => this.sfx.toggleMute());
    this.input.keyboard?.on('keydown', () => { this.sfx.init(); this.sfx.resume(); });
    this.bus.on('damage', () => this.sfx.hit());
    this.bus.on('enemy:killed', () => this.sfx.kill());
    this.bus.on('player:hurt', () => this.sfx.hurt());
    this.bus.on('player:shield', () => this.sfx.heart());
    this.bus.on('weapon:fired', ({ kind }) => {
      if (kind === 'shotgun') this.sfx.shotgun();
      else if (kind === 'beam') this.sfx.laser();
      else if (kind === 'melee') this.sfx.melee();
      else if (kind === 'aura') this.sfx.aura();
      else this.sfx.shoot();
    });
    this.bus.on('fx:boom', () => this.sfx.boom());

    // HUD
    this.hudBars = this.add.graphics().setScrollFactor(0).setDepth(150);
    this.hpText = this.add.text(16, 8, '', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(151);
    this.weaponText = this.add.text(16, 52, '', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#c9b896',
    }).setScrollFactor(0).setDepth(151);
    this.bannerText = this.add.text(this.scale.width / 2, 180, '', {
      fontFamily: 'sans-serif', fontSize: '40px', color: '#f2e3c3', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setAlpha(0).setDepth(160);

    // Esc 暂停
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());

    // 数字键切换武器（验证用）
    const weaponKeys = ['pistol', 'smg', 'shotgun', 'sniper', 'knife', 'boomerang', 'club', 'laser', 'aura', 'flamer'];
    const keyNames = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO'];
    weaponKeys.forEach((key, idx) => {
      this.input.keyboard?.on(`keydown-${keyNames[idx]}`, () => this.switchWeapon(key));
    });
    this.switchWeapon('pistol');

    // 摄像机
    this.cameras.main.setBounds(0, 0, ARENA_W, ARENA_H);
    this.cameras.main.startFollow(this.playerSprite, true, 0.12, 0.12);

    this.startWave(1);
  }

  private saveProgress(): void {
    const p = this.world.player;
    this.saveSystem.save({
      char: p.defKey, wave: this.run.wave, hp: Math.ceil(p.hp), xp: p.xp,
      level: p.level, money: p.money, stats: p.stats,
      weapons: p.weapons.map(w => ({ key: w.key, tier: w.tier, timer: 0, aim: 0, recoil: 0 })),
      skills: p.skills.map(sk => ({ key: sk.key, level: sk.level })),
      kills: this.run.kills, elapsed: this.run.elapsed, time: Date.now(),
    });
  }

  private togglePause(): void {
    if (this.gameEnded || this.overlayOpen) return;
    this.paused = !this.paused;
    if (this.paused) {
      const p = this.world.player;
      const cx = this.scale.width / 2, cy = this.scale.height / 2;
      const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(210);
      layer.setName('pauseLayer');
      layer.add(this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.75));
      layer.add(this.add.text(cx, cy - 160, '暂停', { fontFamily: 'sans-serif', fontSize: '34px', color: '#f2e3c3', fontStyle: 'bold' }).setOrigin(0.5));
      layer.add(this.add.text(cx, cy - 20,
        `生命 ${Math.ceil(p.hp)}/${Math.round(p.stats.maxHp)}   伤害 ${Math.round(p.stats.dmg * 100)}%   攻速 ${Math.round(p.stats.aspd * 100)}%\n` +
        `移速 ${Math.round(p.stats.speed * 100)}%   暴击 ${Math.round(p.stats.crit * 100)}%   护甲 ${p.stats.armor}   闪避 ${Math.round(p.stats.dodge * 100)}%`,
        { fontFamily: 'sans-serif', fontSize: '15px', color: '#e8e0d0', align: 'center', lineSpacing: 8 }).setOrigin(0.5));
      const resume = this.add.container(cx - 110, cy + 120);
      resume.add(this.add.rectangle(0, 0, 180, 48, 0x7a4a1e).setStrokeStyle(3, 0x3d2410));
      resume.add(this.add.text(0, 0, '继续战斗', { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffe9c4', fontStyle: 'bold' }).setOrigin(0.5));
      (resume.list[0] as Phaser.GameObjects.Rectangle).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.togglePause());
      const quit = this.add.container(cx + 110, cy + 120);
      quit.add(this.add.rectangle(0, 0, 160, 48, 0x2a251d).setStrokeStyle(3, 0x55503f));
      quit.add(this.add.text(0, 0, '放弃本局', { fontFamily: 'sans-serif', fontSize: '16px', color: '#e8e0d0' }).setOrigin(0.5));
      (quit.list[0] as Phaser.GameObjects.Rectangle).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.endGame(false));
      layer.add([resume, quit]);
    } else {
      this.children?.getByName('pauseLayer')?.destroy();
      const layer = this.children.getByName('pauseLayer');
      layer?.destroy();
    }
  }

  private endGame(win: boolean): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    if (win) this.sfx.win(); else this.sfx.lose();
    this.saveSystem.saveBest(win, this.run.wave, this.run.kills);
    this.saveSystem.clear();
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(220);
    layer.add(this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.85));
    layer.add(this.add.text(cx, cy - 140, win ? '通关！地牢之王' : '你倒在了地牢深处', {
      fontFamily: 'sans-serif', fontSize: '40px', color: win ? '#ffd257' : '#ff6b5e', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5));
    layer.add(this.add.text(cx, cy - 40,
      `到达波次  第 ${this.run.wave} / 12 波\n等级  Lv.${this.world.player.level}\n击杀数  ${this.run.kills}\n存活  ${Math.floor(this.run.elapsed / 60)} 分 ${Math.floor(this.run.elapsed % 60)} 秒`,
      { fontFamily: 'sans-serif', fontSize: '16px', color: '#e8e0d0', align: 'center', lineSpacing: 10 }).setOrigin(0.5));
    const again = this.add.container(cx, cy + 130);
    again.add(this.add.rectangle(0, 0, 240, 54, 0x7a4a1e).setStrokeStyle(3, 0x3d2410));
    again.add(this.add.text(0, 0, '再来一局', { fontFamily: 'sans-serif', fontSize: '18px', color: '#ffe9c4', fontStyle: 'bold' }).setOrigin(0.5));
    (again.list[0] as Phaser.GameObjects.Rectangle).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('Menu'));
    layer.add(again);
  }

  private startWave(w: number): void {
    this.sfx.init(); this.sfx.resume(); this.sfx.waveStart();
    startWave(this.run, this.world, w);
    this.saveProgress();
    this.bannerText.setText(`第 ${w} / 12 波${w === 12 ? ' · 最终决战' : ''}`);
    this.bannerText.setAlpha(1);
    this.tweens.add({ targets: this.bannerText, alpha: 0, duration: 1800, delay: 700 });
  }

  private switchWeapon(key: string): void {
    this.weaponKey = key;
    this.world.player.weapons = [{ key, tier: 4, timer: 0.2, aim: 0, recoil: 0 }];
    this.weaponText.setText(`武器 [1-0]: ${key}`);
  }

  private spawnFloatText(x: number, y: number, val: string, color: string, crit: boolean): void {
    const t = this.add.text(x, y, val, {
      fontFamily: 'sans-serif',
      fontSize: `${crit ? 22 : 15}px`,
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(90);
    this.tweens.add({
      targets: t,
      y: y - (crit ? 48 : 34),
      alpha: 0,
      duration: crit ? 900 : 600,
      onComplete: () => t.destroy(),
    });
  }

  // ---------- 升级流程 ----------
  private showLevelUp(): void {
    this.overlayOpen = true;
    const picks = pickLevelUps(buildLevelupPool(this.world.player), 4);
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
    layer.add(this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.72));
    layer.add(this.add.text(cx, cy - 210, '升级 · 选择一项成长', {
      fontFamily: 'sans-serif', fontSize: '30px', color: '#f2e3c3', fontStyle: 'bold',
    }).setOrigin(0.5));

    const cardW = 210, gap = 24;
    picks.forEach((pick, i) => {
      const info = describePick(pick);
      const x = cx + (i - (picks.length - 1) / 2) * (cardW + gap);
      const card = this.add.container(x, cy);
      const bg = this.add.rectangle(0, 0, cardW, 260, 0x2a2117)
        .setStrokeStyle(3, Phaser.Display.Color.HexStringToColor(info.color).color);
      const icon = this.add.image(0, -62, info.icon).setScale(1.6);
      const title = this.add.text(0, 8, info.title, {
        fontFamily: 'sans-serif', fontSize: '17px', color: '#ffffff', fontStyle: 'bold', align: 'center',
        wordWrap: { width: cardW - 20 },
      }).setOrigin(0.5, 0);
      const desc = this.add.text(0, 62, info.desc, {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#b3a88d', align: 'center',
        wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5, 0);
      const tag = this.add.text(0, -128, info.tag, {
        fontFamily: 'sans-serif', fontSize: '12px', color: info.color,
        backgroundColor: '#00000055', padding: { x: 8, y: 3 },
      }).setOrigin(0.5);
      card.add([bg, icon, title, desc, tag]);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x3a3120));
      bg.on('pointerout', () => bg.setFillStyle(0x2a2117));
      bg.on('pointerdown', () => {
        applyLevelPick(this.world.player, pick);
        this.sfx.buy();
        this.pendingLevels--;
        layer.destroy();
        if (this.pendingLevels > 0) {
          this.showLevelUp();
        } else {
          this.overlayOpen = false;
          const cb = this.afterLevelUpsCb;
          this.afterLevelUpsCb = undefined;
          cb?.();
        }
      });
      layer.add(card);
    });
  }

  private afterLevelUps(cb: () => void): void {
    if (this.pendingLevels > 0) {
      this.afterLevelUpsCb = cb;
      this.showLevelUp();
    } else {
      cb();
    }
  }

  // ---------- 商店 ----------
  private shopLayer?: Phaser.GameObjects.Container;

  private openShop(): void {
    this.overlayOpen = true;
    this.shop.open();
    this.buildShopUi();
  }

  private buildShopUi(): void {
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    this.shopLayer?.destroy();
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(210);
    this.shopLayer = layer;
    const p = this.world.player;
    layer.add(this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.78));
    layer.add(this.add.text(cx, cy - 250, '地牢商人 · 补给时间', {
      fontFamily: 'sans-serif', fontSize: '30px', color: '#f2e3c3', fontStyle: 'bold',
    }).setOrigin(0.5));
    const moneyText = this.add.text(cx + 300, cy - 250, `金币 ${p.money}`, {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#ffd257', fontStyle: 'bold',
    }).setOrigin(0.5);
    layer.add(moneyText);

    const refresh = (): void => {
      this.buildShopUi();
    };

    const cardW = 200, gap = 20;
    this.shop.offers.forEach((o, idx) => {
      const x = cx + (idx - 1.5) * (cardW + gap);
      layer.add(this.shopCard(o, x, cy - 40, () => {
        const res = this.shop.buy(p, idx);
        if (res === 'ok') { this.weaponText.setText(`武器: ${p.weapons.map(w => w.key + w.tier).join(', ')}`); refresh(); }
        else if (res === 'weapons-full') { this.bannerText.setText('武器栏已满').setAlpha(1); this.time.delayedCall(800, () => this.bannerText.setAlpha(0)); }
        else { moneyText.setColor('#ff6b5e'); this.time.delayedCall(300, () => moneyText.setColor('#ffd257')); }
      }, () => { this.shop.toggleLock(idx); refresh(); }));
    });

    // 治疗泉水
    const healCost = this.shop.healCost();
    const heal = this.add.container(cx, cy + 140);
    heal.add(this.add.rectangle(0, 0, cardW, 110, 0x2a2117).setStrokeStyle(3, 0xff6b5e));
    heal.add(this.add.image(-56, 0, 'pickup/heart').setScale(1.4));
    heal.add(this.add.text(10, -26, '治疗泉水', { fontFamily: 'sans-serif', fontSize: '16px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
    heal.add(this.add.text(10, 0, '回复 40% 最大生命', { fontFamily: 'sans-serif', fontSize: '12px', color: '#b3a88d' }).setOrigin(0.5));
    heal.add(this.add.text(10, 30, `金币 ${healCost}`, { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffd257', fontStyle: 'bold' }).setOrigin(0.5));
    const healBg = heal.list[0] as Phaser.GameObjects.Rectangle;
    healBg.setInteractive({ useHandCursor: true });
    healBg.on('pointerdown', () => {
      const res = this.shop.buyHeal(p);
      if (res === 'ok') refresh();
      else if (res === 'no-money') { moneyText.setColor('#ff6b5e'); this.time.delayedCall(300, () => moneyText.setColor('#ffd257')); }
    });
    layer.add(heal);

    // 重抽
    const rerollBtn = this.add.container(cx - 180, cy + 240);
    rerollBtn.add(this.add.rectangle(0, 0, 190, 52, 0x7a4a1e).setStrokeStyle(3, 0x3d2410));
    rerollBtn.add(this.add.text(0, 0, `重抽 · ${this.shop.rerollCost()} 金`, {
      fontFamily: 'sans-serif', fontSize: '17px', color: '#ffe9c4', fontStyle: 'bold',
    }).setOrigin(0.5));
    const rr = rerollBtn.list[0] as Phaser.GameObjects.Rectangle;
    rr.setInteractive({ useHandCursor: true });
    rr.on('pointerdown', () => {
      if (p.money >= this.shop.rerollCost()) { p.money -= this.shop.rerollCost(); this.shop.reroll(); refresh(); }
      else { moneyText.setColor('#ff6b5e'); this.time.delayedCall(300, () => moneyText.setColor('#ffd257')); }
    });
    layer.add(rerollBtn);

    // 下一波
    const nextBtn = this.add.container(cx + 180, cy + 240);
    nextBtn.add(this.add.rectangle(0, 0, 240, 52, 0x7a4a1e).setStrokeStyle(3, 0x3d2410));
    nextBtn.add(this.add.text(0, 0, `出发 → 第 ${this.run.wave + 1} 波`, {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#ffe9c4', fontStyle: 'bold',
    }).setOrigin(0.5));
    const nb = nextBtn.list[0] as Phaser.GameObjects.Rectangle;
    nb.setInteractive({ useHandCursor: true });
    nb.on('pointerdown', () => {
      this.shopLayer?.destroy();
      this.shopLayer = undefined;
      this.overlayOpen = false;
      this.startWave(this.run.wave + 1);
    });
    layer.add(nextBtn);
  }

  private shopCard(o: ShopOffer, x: number, y: number, onBuy: () => void, onLock: () => void): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);
    const color = o.kind === 'weapon'
      ? TIER_COLORS[o.tier! - 1]
      : '#5ad06e';
    const bg = this.add.rectangle(0, 0, 200, 230, 0x2a2117).setStrokeStyle(3, Phaser.Display.Color.HexStringToColor(color).color);
    card.add(bg);
    if (o.kind === 'weapon') {
      const def = WEAPONS[o.weaponKey!];
      card.add(this.add.text(0, -92, `武器 · ${TIER_NAMES[o.tier! - 1]}`, {
        fontFamily: 'sans-serif', fontSize: '11px', color,
      }).setOrigin(0.5));
      card.add(this.add.image(0, -48, def.icon).setScale(1.8));
      card.add(this.add.text(0, 6, def.name, {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5));
      card.add(this.add.text(0, 34, `伤害 ${Math.round(o.tier! * 0 + def.dmg * (1 + 0.55 * (o.tier! - 1)))} · 冷却 ${(def.cd * Math.pow(0.94, o.tier! - 1)).toFixed(2)}s`, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#b3a88d',
      }).setOrigin(0.5));
      card.add(this.add.text(0, 60, def.desc, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#b3a88d', align: 'center',
        wordWrap: { width: 180 },
      }).setOrigin(0.5, 0));
    } else {
      card.add(this.add.text(0, -92, '道具', { fontFamily: 'sans-serif', fontSize: '11px', color }).setOrigin(0.5));
      card.add(this.add.image(0, -48, o.item!.icon).setScale(1.8));
      card.add(this.add.text(0, 6, o.item!.n, {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5));
      card.add(this.add.text(0, 34, o.item!.d, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#b3a88d', align: 'center',
        wordWrap: { width: 180 },
      }).setOrigin(0.5, 0));
    }
    card.add(this.add.text(0, 100, `金币 ${o.price}`, {
      fontFamily: 'sans-serif', fontSize: '14px', color: o.sold ? '#666' : '#ffd257', fontStyle: 'bold',
    }).setOrigin(0.5));

    if (o.sold) bg.setFillStyle(0x1a160f);
    else {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x3a3120));
      bg.on('pointerout', () => bg.setFillStyle(0x2a2117));
      bg.on('pointerdown', onBuy);
      // 锁定标签
      const lock = this.add.text(o.locked ? 62 : 78, -108, o.locked ? '已锁' : '锁定', {
        fontFamily: 'sans-serif', fontSize: '11px', color: o.locked ? '#ffd257' : '#a89d84',
        backgroundColor: '#2a251d', padding: { x: 6, y: 2 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      lock.on('pointerdown', (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: { stopPropagation?: () => void }) => {
        event.stopPropagation?.();
        onLock();
      });
      card.add(lock);
      if (o.locked) card.add(this.add.text(0, -112, '', {}));
    }
    return card;
  }

  // ---------- 波末流程 ----------
  private endWaveFlow(): void {
    sweepWave(this.run, this.world);
    this.pickupSystem.magnetAll();
    this.time.delayedCall(450, () => {
      this.pickupSystem.absorbAll(
        () => { if (gainMaterial(this.world.player)) this.pendingLevels++; },
        () => {
          const p = this.world.player;
          p.hp = Math.min(p.stats.maxHp, p.hp + Math.round(p.stats.maxHp * 0.25));
        },
      );
      this.afterLevelUps(() => {
        if (this.run.wave >= 12) {
          this.endGame(true);
        } else {
          this.openShop();
        }
      });
    });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.033, deltaMs / 1000);
    const p = this.world.player;
    this.run.elapsed += dt;

    // 升级界面 / 暂停 / 结算时世界暂停
    if (this.overlayOpen || this.paused || this.gameEnded) {
      if (this.world.player.hp <= 0) this.endGame(false);
      return;
    }
    if (this.world.player.hp <= 0) { this.endGame(false); return; }

    // 移动 + 钳制
    updatePlayer(this.world, dt, this.input2.moveIntent());
    clampToArena(p, { w: ARENA_W, h: ARENA_H, wall: WALL });

    // 技能自动施放 + 火圈结算
    updateSkills(this.world, dt);
    updateHazards(this.world, dt);
    this.renderHazards();

    // 波次刷怪与倒计时
    updateWave(this.run, this.world, dt);
    if (this.run.timeLeft <= 0 && !this.run.sweeping) this.endWaveFlow();

    // 敌人 AI
    for (const e of this.world.enemies) {
      updateEnemy(this.world, e, dt);
      const sprite = this.enemySprites.get(e);
      if (sprite) {
        sprite.setPosition(e.x, e.y);
        if (e.flash > 0) sprite.setTintFill();
        else sprite.clearTint();
      }
    }

    // 掉落拾取
    this.pickupSystem.update(p, dt,
      () => { this.sfx.pickup(); if (gainMaterial(p)) { this.pendingLevels++; this.sfx.levelup(); this.showLevelUp(); } },
      () => {
        p.hp = Math.min(p.stats.maxHp, p.hp + Math.round(p.stats.maxHp * 0.25));
        this.spawnFloatText(p.x, p.y - 30, '+25%', '#8ee05a', false);
      this.sfx.heart();
      },
    );

    // 子弹
    for (const b of this.world.bullets) {
      updateBullet(this.world, b, dt);
      let sprite = this.bulletSprites.get(b);
      if (!sprite) {
        sprite = this.add.image(b.x, b.y, 'weapon/' + this.weaponKey).setScale(b.boom ? 1.1 : 0.7);
        sprite.setTint(Phaser.Display.Color.HexStringToColor(b.color).color);
        this.bulletSprites.set(b, sprite);
      }
      sprite.setPosition(b.x, b.y).setRotation(b.spin);
    }
    for (const [b, sprite] of this.bulletSprites) {
      if (b.life <= 0) { sprite.destroy(); this.bulletSprites.delete(b); }
    }
    this.world.bullets = this.world.bullets.filter(b => b.life > 0);

    // 敌人精灵清理
    for (const [e, sprite] of this.enemySprites) {
      if (e.dead) { sprite.destroy(); this.enemySprites.delete(e); }
    }

    // 玩家精灵
    this.playerSprite.setPosition(p.x, p.y);
    if (p.hurtFlash > 0) this.playerSprite.setTint(0xff8a7a);
    else this.playerSprite.clearTint();

    this.syncPickupSprites();
    this.drawHud();
    this.refreshSkillHud();
    this.drawJoystick();
  }

  private joyGfx!: Phaser.GameObjects.Graphics;
  private drawJoystick(): void {
    const st = this.input2.joystickState();
    if (!st.active) return;
    if (!this.joyGfx) this.joyGfx = this.add.graphics().setScrollFactor(0).setDepth(140);
    this.joyGfx.clear();
    this.joyGfx.lineStyle(2, 0xffffff, 0.3);
    this.joyGfx.strokeCircle(st.bx, st.by, 56);
    this.joyGfx.fillStyle(0xffffff, 0.5);
    this.joyGfx.fillCircle(st.bx + st.dx * 56, st.by + st.dy * 56, 22);
  }

  /** 火圈：每帧重绘危险区域 */
  private hazardGfx!: Phaser.GameObjects.Graphics;
  private renderHazards(): void {
    if (!this.hazardGfx) this.hazardGfx = this.add.graphics().setDepth(30);
    this.hazardGfx.clear();
    for (const h of this.world.hazards) {
      const a = Math.max(0, h.ttl / h.maxTtl);
      this.hazardGfx.fillStyle(0xff7a1e, 0.22 + a * 0.25);
      this.hazardGfx.fillCircle(h.x, h.y, h.r);
      this.hazardGfx.fillStyle(0xffb057, 0.25);
      this.hazardGfx.fillCircle(h.x, h.y, h.r * (0.5 + 0.12 * Math.sin(this.time.now / 90)));
    }
  }

  /** 技能槽 HUD：图标 + 等级角标 + 冷却条（集合变化才重建） */
  private _skillSig = '';
  private skillIconLayer!: Phaser.GameObjects.Container;
  private skillIcons: Phaser.GameObjects.Image[] = [];
  private skillCdBars: Phaser.GameObjects.Rectangle[] = [];
  private refreshSkillHud(): void {
    const p = this.world.player;
    if (!this.skillIconLayer) {
      this.skillIconLayer = this.add.container(0, 0).setScrollFactor(0).setDepth(151);
    }
    const sig = p.skills.map(s => s.key + ':' + s.level).join(',');
    if (sig !== this._skillSig) {
      this._skillSig = sig;
      this.skillIconLayer.removeAll(true);
      this.skillIcons = [];
      this.skillCdBars = [];
      p.skills.forEach(s => {
        const icon = this.add.image(0, 0, SKILL_ICONS[s.key]).setScale(1.1);
        const cd = this.add.rectangle(0, 16, 36, 5, 0x2b7fc9).setOrigin(0, 0.5);
        const lv = this.add.text(20, -18, String(s.level), {
          fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 2,
        });
        this.skillIconLayer.add([icon, cd, lv]);
        this.skillIcons.push(icon);
        this.skillCdBars.push(cd);
      });
    }
    this.skillIcons.forEach((icon, i) => {
      icon.setPosition(this.scale.width - 40 - i * 48, this.scale.height - 40);
    });
    this.skillCdBars.forEach((bar, i) => {
      const s = p.skills[i];
      if (!s) return;
      const st = skillStats(s.key, s.level);
      const pct = st.cd > 0 ? Phaser.Math.Clamp(s.timer / st.cd, 0, 1) : 0;
      bar.width = 36 * pct;
      bar.setPosition(this.scale.width - 58 - i * 48 + 36 * (1 - pct), this.scale.height - 40);
    });
  }

  private syncPickupSprites(): void {
    const alive = new Set(this.pickupSystem.pickups);
    for (const pk of alive) {
      let sprite = this.pickupSprites.get(pk);
      if (!sprite) {
        sprite = this.add.image(pk.x, pk.y, pk.type === 'heart' ? 'pickup/heart' : 'pickup/material');
        this.pickupSprites.set(pk, sprite);
      }
      sprite.setPosition(pk.x, pk.y);
      sprite.setRotation(pk.t * 2);
    }
    for (const [pk, sprite] of this.pickupSprites) {
      if (!alive.has(pk)) { sprite.destroy(); this.pickupSprites.delete(pk); }
    }
  }

  private drawHud(): void {
    const p = this.world.player;
    const g = this.hudBars;
    g.clear();
    g.fillStyle(0x241f16, 0.9).fillRect(14, 10, 304, 22);
    const hpPct = Phaser.Math.Clamp(p.hp / p.stats.maxHp, 0, 1);
    g.fillStyle(0x4f9e33, 1).fillRect(16, 12, 300 * hpPct, 18);
    g.fillStyle(0x241f16, 0.9).fillRect(14, 36, 304, 10);
    const xpPct = Phaser.Math.Clamp(p.xp / (3 + p.level * 2.2 + p.level * p.level * 0.35), 0, 1);
    g.fillStyle(0x2b7fc9, 1).fillRect(16, 38, 300 * xpPct, 6);
    this.hpText.setText(
      `HP ${Math.ceil(p.hp)}/${Math.round(p.stats.maxHp)}   Lv.${p.level}   ` +
      `金钱 ${p.money}   击杀 ${this.run.kills}   第 ${this.run.wave}/12 波 ${Math.ceil(Math.max(0, this.run.timeLeft))}s`);
  }
}
