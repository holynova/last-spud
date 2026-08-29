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
import { InputService } from '../infra/input';
import type { BulletEntity, EnemyEntity } from '../domain/types';

/**
 * 战斗场景（P4）：世界装配 + 玩家 + 武器 + 敌人波次 + 掉落拾取 + 升级四选一 + HUD。
 */
export class BattleScene extends Phaser.Scene {
  private input2!: InputService;
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

  // 领域状态（渲染只读）
  private world!: ReturnType<typeof createWorld>['world'];
  private bus!: ReturnType<typeof createWorld>['bus'];
  private run!: ReturnType<typeof createWorld>['run'];

  constructor() {
    super('Battle');
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

    // 领域装配
    const stats = {
      maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
      crit: 0.05, critMult: 2, armor: 0, dodge: 0.03, pickup: 90, luck: 0,
    };
    const player = createPlayer('adventurer', ARENA_W / 2, ARENA_H / 2, stats, this.weaponKey);
    const bundle = createWorld(player, 1);
    this.world = bundle.world;
    this.bus = bundle.bus;
    this.run = bundle.run;

    // 玩家精灵
    this.playerSprite = this.add.image(player.x, player.y, 'player/' + player.defKey).setScale(2.5);

    // 掉落拾取
    this.pickupSystem = new PickupSystem(this.bus as never);
    this.pickupSystem.attachDrops();

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
    this.bus.on('fx:boom', ({ x, y, r, color }) => {
      const ring = this.add.circle(x, y, 10, Phaser.Display.Color.HexStringToColor(color).color, 0.6).setDepth(80);
      this.tweens.add({ targets: ring, radius: r, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    });

    this.input2 = new InputService(this);

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

  private startWave(w: number): void {
    startWave(this.run, this.world, w);
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
          this.bannerText.setText('通关！').setAlpha(1).setDepth(200);
        } else {
          this.startWave(this.run.wave + 1);
        }
      });
    });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.033, deltaMs / 1000);
    const p = this.world.player;
    this.run.elapsed += dt;

    // 升级界面打开时世界暂停
    if (this.overlayOpen) return;

    // 移动 + 钳制
    updatePlayer(this.world, dt, this.input2.moveIntent());
    clampToArena(p, { w: ARENA_W, h: ARENA_H, wall: WALL });

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
      () => { if (gainMaterial(p)) { this.pendingLevels++; this.showLevelUp(); } },
      () => {
        p.hp = Math.min(p.stats.maxHp, p.hp + Math.round(p.stats.maxHp * 0.25));
        this.spawnFloatText(p.x, p.y - 30, '+25%', '#8ee05a', false);
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
