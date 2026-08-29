import Phaser from 'phaser';
import { ARENA_H, ARENA_W, WALL } from '../config';
import { buildDecorList, wallPositions } from '../domain/layout';
import { mulberry32 } from '../utils/rng';
import { createWorld } from '../domain/world';
import { createPlayer, clampToArena, updatePlayer } from '../domain/PlayerSystem';
import { updateBullet } from '../domain/WeaponSystem';
import { hurtPlayer } from '../domain/DamageSystem';
import { createEnemy } from '../domain/entities';
import { InputService } from '../infra/input';
import type { BulletEntity, EnemyEntity } from '../domain/types';

/**
 * 战斗场景（P2）：世界装配 + 玩家移动 + 武器开火 + 伤害飘字 + 受击闪白。
 * 数字键 1-0 切换武器供验证。敌人 AI 与波次导演由 P3 接入。
 */
export class BattleScene extends Phaser.Scene {
  private input2!: InputService;
  private playerSprite!: Phaser.GameObjects.Image;
  private enemySprites = new Map<EnemyEntity, Phaser.GameObjects.Image>();
  private bulletSprites = new Map<BulletEntity, Phaser.GameObjects.Image>();
  private spawnTimer = 0;
  private hpText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private weaponKey = 'pistol';

  // 领域状态（渲染只读）
  private world!: ReturnType<typeof createWorld>['world'];
  private bus!: ReturnType<typeof createWorld>['bus'];

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

    // 玩家精灵
    this.playerSprite = this.add.image(player.x, player.y, 'player/' + player.defKey).setScale(2.5);

    // 事件 → 表现
    this.bus.on('damage', ({ x, y, val, crit, color }) => {
      if (val === 0) {
        this.spawnFloatText(x, y, '闪避', '#7ee8ff', false);
        return;
      }
      this.spawnFloatText(x, y, String(val), crit ? '#ffd257' : '#ffffff', crit);
    });
    this.bus.on('player:hurt', () => this.cameras.main.shake(120, 0.006));

    this.input2 = new InputService(this);

    // HUD 雏形
    this.hpText = this.add.text(16, 12, '', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#8ee05a', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(100);
    this.weaponText = this.add.text(16, 40, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#c9b896',
    }).setScrollFactor(0).setDepth(100);

    // 数字键切换武器（验证用，P6 商店接管后移除）
    const weaponKeys = ['pistol', 'smg', 'shotgun', 'sniper', 'knife', 'boomerang', 'club', 'laser', 'aura', 'flamer'];
    weaponKeys.forEach((key, idx) => {
      this.input.keyboard?.on(`keydown-${idx + 1 === 10 ? 'ZERO' : 'ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE'.split(' ')[idx]}`,
        () => this.switchWeapon(key));
    });
    this.switchWeapon('pistol');

    // 摄像机
    this.cameras.main.setBounds(0, 0, ARENA_W, ARENA_H);
    this.cameras.main.startFollow(this.playerSprite, true, 0.12, 0.12);
  }

  private switchWeapon(key: string): void {
    this.weaponKey = key;
    const p = this.world.player;
    p.weapons = [{ key, tier: 4, timer: 0.2, aim: 0, recoil: 0 }]; // 满阶便于验证
    this.weaponText.setText(`武器 [1-0]: ${key}`);
  }

  /** 投放一只靠近玩家的靶敌（P3 由波次导演替换） */
  private spawnDummy(): void {
    const p = this.world.player;
    const ang = Math.random() * Math.PI * 2;
    const dist = 360 + Math.random() * 160;
    const e = createEnemy(Math.random() < 0.75 ? 'chaser' : 'runner',
      Phaser.Math.Clamp(p.x + Math.cos(ang) * dist, WALL + 30, ARENA_W - WALL - 30),
      Phaser.Math.Clamp(p.y + Math.sin(ang) * dist, WALL + 30, ARENA_H - WALL - 30), 1);
    this.world.enemies.push(e);
    this.world.grid.insert(e);
    this.enemySprites.set(e, this.add.image(e.x, e.y, e.def.sprite).setScale((e.r * 2.6) / 16));
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

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.033, deltaMs / 1000);
    const p = this.world.player;

    // 移动 + 钳制
    updatePlayer(this.world, dt, this.input2.moveIntent());
    clampToArena(p, { w: ARENA_W, h: ARENA_H, wall: WALL });

    // 靶敌投放（上限 20，P3 由波次导演替换）
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.world.enemies.length < 20) {
      this.spawnTimer = 1.0;
      this.spawnDummy();
    }

    // 敌人表现更新（P3 接 AI；此处仅击退衰减 + 闪白 + 接触伤害）
    for (const e of this.world.enemies) {
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.touchCd = Math.max(0, e.touchCd - dt);
      e.kx *= Math.pow(0.0025, dt);
      e.ky *= Math.pow(0.0025, dt);
      e.x = Phaser.Math.Clamp(e.x + e.kx * dt, e.r, ARENA_W - e.r);
      e.y = Phaser.Math.Clamp(e.y + e.ky * dt, e.r, ARENA_H - e.r);
      if (e.touchCd <= 0) {
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < (e.r + p.r) * (e.r + p.r)) {
          e.touchCd = 0.9;
          hurtPlayer(this.world, Math.round(e.dmg * this.world.dmgMul));
        }
      }
      const sprite = this.enemySprites.get(e);
      if (sprite) {
        sprite.setPosition(e.x, e.y);
        if (e.flash > 0) sprite.setTintFill();
        else sprite.clearTint();
      }
    }

    // 子弹（领域更新 + 精灵同步）
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
      if (b.life <= 0) {
        sprite.destroy();
        this.bulletSprites.delete(b);
      }
    }
    this.world.bullets = this.world.bullets.filter(b => b.life > 0);

    // 清理死亡敌人的精灵
    for (const [e, sprite] of this.enemySprites) {
      if (e.dead) {
        sprite.destroy();
        this.enemySprites.delete(e);
      }
    }

    // 玩家精灵同步与受击红闪
    this.playerSprite.setPosition(p.x, p.y);
    if (p.hurtFlash > 0) this.playerSprite.setTint(0xff8a7a);
    else this.playerSprite.clearTint();

    // HUD
    this.hpText.setText(`HP ${Math.ceil(p.hp)}/${Math.round(p.stats.maxHp)}   等级 ${p.level}   金钱 ${p.money}   击杀?`);
  }
}
