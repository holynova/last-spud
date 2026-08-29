import Phaser from 'phaser';
import { ARENA_H, ARENA_W, WALL } from '../config';
import { buildDecorList, wallPositions } from '../domain/layout';
import { mulberry32 } from '../utils/rng';

/**
 * 战斗场景（P1）：地面 / 边界墙 / 装饰物 / 摄像机跟随与钳制。
 * 占位英雄精灵用于验证摄像机跟随，P2 替换为正式玩家实体。
 */
export class BattleScene extends Phaser.Scene {
  private dummy!: Phaser.GameObjects.Image;

  constructor() {
    super('Battle');
  }

  create(): void {
    // 地面
    this.add.tileSprite(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 'ground/floor_pattern');

    // 边界墙
    for (const t of wallPositions()) {
      this.add.image(t.x, t.y, 'ground/wall').setDisplaySize(WALL, WALL);
    }

    // 装饰物（每局确定性随机布局）
    const rng = mulberry32(Date.now() >>> 0);
    for (const d of buildDecorList(rng)) {
      const img = this.add.image(d.x, d.y, d.kind);
      img.setScale(d.scale);
      img.setRotation(d.rotation);
      img.setAlpha(0.92);
    }

    // 占位英雄：验证摄像机跟随（P2 由正式玩家实体替换）
    this.dummy = this.add.image(ARENA_W / 2, ARENA_H / 2, 'player/adventurer').setScale(2.5);

    // 摄像机：边界钳制 + 平滑跟随
    this.cameras.main.setBounds(0, 0, ARENA_W, ARENA_H);
    this.cameras.main.startFollow(this.dummy, true, 0.12, 0.12);

    // WASD 移动占位英雄（P2 移入玩家实体与输入服务）
    this.input.keyboard?.on('keydown', () => undefined);
  }

  update(_time: number, deltaMs: number): void {
    const speed = 235 * (deltaMs / 1000);
    const kb = this.input.keyboard;
    if (!kb) return;
    const up = kb.addKey('W'), down = kb.addKey('S'), left = kb.addKey('A'), right = kb.addKey('D');
    let dx = 0, dy = 0;
    if (up.isDown) dy -= 1;
    if (down.isDown) dy += 1;
    if (left.isDown) dx -= 1;
    if (right.isDown) dx += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      this.dummy.x = Phaser.Math.Clamp(this.dummy.x + (dx / len) * speed, WALL + 16, ARENA_W - WALL - 16);
      this.dummy.y = Phaser.Math.Clamp(this.dummy.y + (dy / len) * speed, WALL + 16, ARENA_H - WALL - 16);
    }
  }
}
