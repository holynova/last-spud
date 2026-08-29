import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';

/** Phaser 游戏入口：场景在此装配，运行时实例挂到 window.__ds 供 E2E 断言 */
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1b1410',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BattleScene],
});

declare global {
  interface Window { __ds?: Phaser.Game }
}
window.__ds = game;

export default game;
