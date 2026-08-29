import Phaser from 'phaser';
import { ARENA_H, ARENA_W, WALL, assetUrl } from '../config';

/**
 * 战斗场景（P0 占位版）：验证地面 / 边界墙 / 摄像机边界与像素缩放。
 * P1 起逐步替换为真实的资源加载、装饰物与实体渲染。
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  preload(): void {
    this.load.image('ground.pattern', assetUrl('ground/floor_pattern'));
    this.load.image('ground.wall', assetUrl('ground/wall'));
  }

  create(): void {
    // 地面：整片世界铺一块 TileSprite
    this.add.tileSprite(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 'ground.pattern');

    // 边界墙：四边平铺 48px 墙砖
    const wall = this.add.image(0, 0, 'ground.wall').setVisible(false);
    const w = wall.width * 3;
    wall.destroy();
    for (let x = 0; x < ARENA_W; x += w) {
      this.add.image(x + w / 2, WALL / 2, 'ground.wall').setDisplaySize(w, w);
      this.add.image(x + w / 2, ARENA_H - WALL / 2, 'ground.wall').setDisplaySize(w, w);
    }
    for (let y = WALL; y < ARENA_H - WALL; y += w) {
      this.add.image(WALL / 2, y + w / 2, 'ground.wall').setDisplaySize(w, w);
      this.add.image(ARENA_W - WALL / 2, y + w / 2, 'ground.wall').setDisplaySize(w, w);
    }

    // 摄像机：跟随目标（P2 加入玩家后绑定），先对准世界中心并钳制在世界范围内
    this.cameras.main.setBounds(0, 0, ARENA_W, ARENA_H);
    this.cameras.main.centerOn(ARENA_W / 2, ARENA_H / 2);

    this.add.text(ARENA_W / 2, 120, '地牢幸存者 · Phaser 4 重构版', {
      fontFamily: 'sans-serif', fontSize: '42px', color: '#f2e3c3',
    }).setOrigin(0.5).setScrollFactor(0.5);
  }
}
