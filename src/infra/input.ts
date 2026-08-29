import Phaser from 'phaser';

/** 输入服务：键盘 WASD/方向键（P9 加虚拟摇杆），输出归一化移动意图 */
export class InputService {
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      for (const code of ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT']) {
        this.keys[code] = kb.addKey(code);
      }
    }
  }

  /** 归一化移动意图（未按键时为零向量） */
  moveIntent(): { mx: number; my: number } {
    let mx = 0, my = 0;
    if (this.keys.W?.isDown || this.keys.UP?.isDown) my -= 1;
    if (this.keys.S?.isDown || this.keys.DOWN?.isDown) my += 1;
    if (this.keys.A?.isDown || this.keys.LEFT?.isDown) mx -= 1;
    if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) mx += 1;
    return { mx, my };
  }
}
