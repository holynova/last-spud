import Phaser from 'phaser';
import { CHARACTERS } from '../data/characters';
import { SaveSystem, memoryStorage } from '../domain/SaveSystem';
import { localStorageAdapter } from '../infra/storage';

/** 主菜单：标题 / 角色选择 / 继续上局 / 最佳纪录 */
export class MenuScene extends Phaser.Scene {
  private selected = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private startBtn!: Phaser.GameObjects.Container;
  private saveSystem = new SaveSystem(
    typeof window !== 'undefined' && window.localStorage ? localStorageAdapter() : memoryStorage(),
  );

  constructor() {
    super('Menu');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.add.rectangle(cx, this.scale.height / 2, this.scale.width, this.scale.height, 0x1b1410);
    this.add.text(cx, 90, '地牢幸存者', {
      fontFamily: 'sans-serif', fontSize: '56px', color: '#f2e3c3', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.add.text(cx, 140, 'DUNGEON SURVIVORS · 深入地牢 12 波', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#8f866f',
    }).setOrigin(0.5);
    this.add.text(cx, 186, 'WASD / 方向键移动，武器与技能自动施放。升级时习得并强化主动技能，波次之间购买装备，活过第 12 波！', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#a89d84',
    }).setOrigin(0.5);

    // 角色卡（含局外解锁）
    const meta = this.saveSystem.loadMeta();
    this.cards = [];
    CHARACTERS.forEach((c, i) => {
      const x = cx + (i - 2.5) * 152;
      const locked = (c.unlockKills ?? 0) > meta.totalKills;
      const card = this.add.container(x, 320);
      const bg = this.add.rectangle(0, 0, 140, 240, 0x2a2117)
        .setStrokeStyle(3, (!locked && i === this.selected) ? 0xffd257 : 0x55503f);
      const face = this.add.image(0, -66, c.sprite).setScale(locked ? 2 : 2.3);
      face.setAlpha(locked ? 0.35 : 1);
      const name = this.add.text(0, 14, c.name, {
        fontFamily: 'sans-serif', fontSize: '16px', color: locked ? '#8f866f' : '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const desc = this.add.text(0, 42, locked ? `累计击杀 ${c.unlockKills} 解锁（当前 ${meta.totalKills}）` : c.desc, {
        fontFamily: 'sans-serif', fontSize: '10px', color: locked ? '#8f866f' : '#a89d84', align: 'center',
        wordWrap: { width: 124 }, lineSpacing: 4,
      }).setOrigin(0.5, 0);
      card.add([bg, face, name, desc]);
      if (!locked) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(0x362d1e));
        bg.on('pointerout', () => bg.setFillStyle(0x2a2117));
        bg.on('pointerdown', () => {
          this.selected = i;
          for (let j = 0; j < this.cards.length; j++) {
            const b = this.cards[j].list[0] as Phaser.GameObjects.Rectangle;
            b.setStrokeStyle(3, j === i ? 0xffd257 : 0x55503f);
          }
          (this.startBtn.list[1] as Phaser.GameObjects.Text).setColor('#ffe9c4');
        });
      } else {
        card.add(this.add.text(0, -104, '未解锁', {
          fontFamily: 'sans-serif', fontSize: '11px', color: '#ffd257',
          backgroundColor: '#00000088', padding: { x: 6, y: 2 },
        }).setOrigin(0.5));
      }
      this.cards.push(card);
    });

    // 开始按钮
    this.startBtn = this.add.container(cx, 505);
    const btnBg = this.add.rectangle(0, 0, 300, 54, 0x7a4a1e).setStrokeStyle(3, 0x3d2410);
    const btnText = this.add.text(0, 0, '选择一名英雄，开始求生！', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#ffe9c4', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.startBtn.add([btnBg, btnText]);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => {
      this.scene.start('Battle', { charIdx: this.selected });
    });

    // 继续上局
    const save = this.saveSystem.load();
    if (save && save.wave > 1) {
      const cont = this.add.container(cx, 575);
      cont.add(this.add.rectangle(0, 0, 320, 44, 0x2a251d).setStrokeStyle(2, 0x55503f));
      cont.add(this.add.text(0, 0, `继续上局 · 第 ${save.wave} 波 · ${save.kills} 击杀`, {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#e8dcb8',
      }).setOrigin(0.5));
      const bg = cont.list[0] as Phaser.GameObjects.Rectangle;
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        this.scene.start('Battle', { save });
      });
    }

    // 图鉴入口
    const codex = this.add.container(cx + 300, 575);
    codex.add(this.add.rectangle(0, 0, 150, 44, 0x2a251d).setStrokeStyle(2, 0x55503f));
    codex.add(this.add.text(0, 0, '图鉴', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#e8dcb8',
    }).setOrigin(0.5));
    (codex.list[0] as Phaser.GameObjects.Rectangle).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('Codex'));

    // 最佳纪录
    const best = this.saveSystem.loadBest();
    this.add.text(cx, 640, best
      ? `最佳纪录：${best.win ? '通关' : '第 ' + best.wave + ' 波'} · 击杀 ${best.kills}`
      : '尚无纪录，从第 1 波开始', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#8f866f',
    }).setOrigin(0.5);
  }
}
