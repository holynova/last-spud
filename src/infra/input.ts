import Phaser from 'phaser';

/** 输入服务：键盘 WASD/方向键（P9 加虚拟摇杆），输出归一化移动意图 */
export class InputService {
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private joy = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
  private radius = 56;
  private deadzone = 8;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      for (const code of ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT']) {
        this.keys[code] = kb.addKey(code);
      }
    }
    // 虚拟摇杆：任意触点拖动
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.joy = { active: true, id: p.id, bx: p.x, by: p.y, dx: 0, dy: 0 };
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.joy.active || p.id !== this.joy.id) return;
      let dx = p.x - this.joy.bx, dy = p.y - this.joy.by;
      const len = Math.hypot(dx, dy);
      if (len < this.deadzone) { this.joy.dx = 0; this.joy.dy = 0; return; }
      const k = Math.min(1, len / this.radius) / len;
      this.joy.dx = dx * k; this.joy.dy = dy * k;
    });
    const end = (p: Phaser.Input.Pointer) => {
      if (p.id === this.joy.id) { this.joy = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 }; }
    };
    scene.input.on('pointerup', end);
    scene.input.on('pointerupoutside', end);
  }

  /** 归一化移动意图：键盘优先，其次摇杆 */
  moveIntent(): { mx: number; my: number } {
    let mx = 0, my = 0;
    if (this.keys.W?.isDown || this.keys.UP?.isDown) my -= 1;
    if (this.keys.S?.isDown || this.keys.DOWN?.isDown) my += 1;
    if (this.keys.A?.isDown || this.keys.LEFT?.isDown) mx -= 1;
    if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) mx += 1;
    if (!mx && !my && this.joy.active) return { mx: this.joy.dx, my: this.joy.dy };
    return { mx, my };
  }

  /** 摇杆可视化数据（渲染层绘制基点与推杆位置） */
  joystickState(): { active: boolean; bx: number; by: number; dx: number; dy: number } {
    return { ...this.joy };
  }
}
