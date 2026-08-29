import Phaser from 'phaser';
import { ENEMIES } from '../data/enemies';
import { WEAPONS } from '../data/weapons';
import { SKILLS } from '../data/skills';

/** 图鉴场景：敌人 / 武器 / 技能一览（数据驱动，双栏静态布局） */
export class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.add.rectangle(cx, this.scale.height / 2, this.scale.width, this.scale.height, 0x1b1410);
    this.add.text(cx, 40, '图鉴', {
      fontFamily: 'sans-serif', fontSize: '36px', color: '#f2e3c3', fontStyle: 'bold',
    }).setOrigin(0.5);

    const colW = this.scale.width / 2;
    let y = 110;

    this.add.text(cx / 2, y, '— 敌人 —', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#c9b896', fontStyle: 'bold',
    }).setOrigin(0.5);
    y += 40;
    for (const [key, def] of Object.entries(ENEMIES)) {
      this.add.image(cx / 2 - 130, y + 14, def.sprite).setScale(1.4);
      this.add.text(cx / 2 - 105, y, `${def.name}${def.boss ? '（Boss）' : def.elite ? '（精英）' : ''}`, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      });
      this.add.text(cx / 2 - 105, y + 20, `生命 ${def.hp} · 伤害 ${def.dmg} · 速度 ${def.speed}${def.explode ? ' · 自爆' : ''}${def.ranged ? ' · 远程' : ''}${def.splitInto ? ' · 分裂' : ''}`, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#a89d84',
      });
      y += 44;
      void key;
    }

    y = 110;
    this.add.text(cx + colW / 2, y, '— 武器 —', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#c9b896', fontStyle: 'bold',
    }).setOrigin(0.5);
    y += 40;
    for (const def of Object.values(WEAPONS)) {
      this.add.image(cx + colW / 2 - 130, y + 12, def.icon).setScale(1.3);
      this.add.text(cx + colW / 2 - 105, y, `${def.name}  ${def.tags?.length ? '[' + def.tags.join('/') + ']' : ''}`, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      });
      this.add.text(cx + colW / 2 - 105, y + 20, `伤害 ${def.dmg} · 冷却 ${def.cd}s · ${def.desc}`, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#a89d84',
        wordWrap: { width: colW - 160 },
      });
      y += 44;
    }

    // 技能简表
    y = Math.max(y, 620);
    let x = 80;
    this.add.text(x, y, '— 技能 —', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#c9b896', fontStyle: 'bold',
    });
    x += 100;
    for (const def of Object.values(SKILLS)) {
      this.add.image(x, y + 10, def.icon).setScale(1.2);
      this.add.text(x + 24, y, def.name, {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      });
      x += 150;
    }

    // 返回
    const back = this.add.container(cx, this.scale.height - 50);
    back.add(this.add.rectangle(0, 0, 180, 46, 0x2a251d).setStrokeStyle(2, 0x55503f));
    back.add(this.add.text(0, 0, '返回主菜单', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#e8e0d0',
    }).setOrigin(0.5));
    (back.list[0] as Phaser.GameObjects.Rectangle).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('Menu'));
  }
}
