import Phaser from 'phaser';
import { assetUrl } from '../config';
import { TEXTURE_KEYS } from '../data/textures';

/** 资源加载场景：进度条 + 全量纹理 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const w = this.scale.width;
    const bar = this.add.rectangle(w / 2, this.scale.height / 2, 10, 14, 0xffd257).setOrigin(0.5);
    this.load.on('progress', (v: number) => {
      bar.width = Math.max(10, (this.scale.width - 200) * v);
    });
    for (const key of TEXTURE_KEYS) {
      this.load.image(key, assetUrl(key));
    }
  }

  create(): void {
    this.scene.start('Menu');
  }
}
