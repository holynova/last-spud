// ============ 素材加载器 ============
// 所有素材来自 Kenney（CC0）：tiny-dungeon / micro-roguelike / ui-pack-rpg-expansion
const Assets = {
  images: new Map(),

  keys: [
    'player/adventurer', 'player/berserker', 'player/knight', 'player/apprentice',
    'enemy/chaser', 'enemy/runner', 'enemy/spitter', 'enemy/boomling',
    'enemy/brute', 'enemy/splitter', 'enemy/splitling', 'enemy/elite', 'enemy/boss',
    'weapon/pistol', 'weapon/smg', 'weapon/shotgun', 'weapon/sniper',
    'weapon/knife', 'weapon/boomerang', 'weapon/club', 'weapon/laser',
    'weapon/aura', 'weapon/flamer',
    'item/hp_potion', 'item/regen_potion', 'item/rage_potion', 'item/swift_potion',
    'item/shield_item', 'item/energy_core', 'item/hawk_badge', 'item/executioner',
    'item/magnet_ring', 'item/falcon_eye', 'item/lucky_charm', 'item/giant_belt',
    'item/venom', 'item/demon_pact',
    'up/vit', 'up/blade', 'up/swift', 'up/wind', 'up/shell', 'up/instinct',
    'up/lethal', 'up/cruel', 'up/regen', 'up/magnet', 'up/eagle', 'up/lucky',
    'up/berserk', 'up/steel',
    'skill/shockwave', 'skill/chain', 'skill/firefield', 'skill/barrier',
    'skill/frenzy', 'skill/thorns',
    'pickup/material', 'pickup/heart',
    'ground/floor_pattern', 'ground/wall',
    'decor/rock', 'decor/crate', 'decor/barrel', 'decor/anvil', 'decor/bones',
    'ui/panel', 'ui/panel_inset', 'ui/panel_brown', 'ui/button', 'ui/button_hover',
  ],

  load() {
    const jobs = this.keys.map(key => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { this.images.set(key, img); resolve(); };
      img.onerror = () => { console.warn('素材加载失败:', key); resolve(); };
      img.src = `assets/${key}.png`;
    }));
    return Promise.all(jobs);
  },

  img(key) { return this.images.get(key) || null; },
};
