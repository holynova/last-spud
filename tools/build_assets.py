#!/usr/bin/env python3
"""从 Kenney CC0 素材包挑选图块，组装 last-spud/assets/。
运行：python3 tools/build_assets.py
"""
import os, shutil
from PIL import Image

KENNEY = '/tmp/kenney'
TINY = f'{KENNEY}/tiny-dungeon/Tiles'
MICRO = f'{KENNEY}/micro-roguelike/Tiles/Colored'
UI = f'{KENNEY}/ui-pack-rpg-expansion/PNG'
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')

def tile(src, idx):
    return os.path.join(src, f'tile_{idx:04d}.png')

# 语义名 -> 源图块
MAPPING = {
    # 玩家角色
    'player/adventurer':  (TINY, 98),
    'player/berserker':   (TINY, 88),
    'player/knight':      (TINY, 96),
    'player/apprentice':  (TINY, 84),
    # 敌人
    'enemy/chaser':       (TINY, 109),
    'enemy/runner':       (TINY, 120),
    'enemy/spitter':      (TINY, 122),
    'enemy/boomling':     (TINY, 110),
    'enemy/brute':        (TINY, 121),
    'enemy/splitter':     (TINY, 108),
    'enemy/splitling':    (TINY, 108),
    'enemy/elite':        (TINY, 111),
    'enemy/boss':         (TINY, 124),
    # 武器图标
    'weapon/pistol':      (TINY, 125),
    'weapon/smg':         (TINY, 126),
    'weapon/shotgun':     (TINY, 119),
    'weapon/sniper':      (TINY, 105),
    'weapon/knife':       (TINY, 103),
    'weapon/boomerang':   (TINY, 118),
    'weapon/club':        (TINY, 117),
    'weapon/laser':       (TINY, 128),
    'weapon/aura':        (TINY, 129),
    'weapon/flamer':      (TINY, 127),
    # 商店道具图标
    'item/hp_potion':     (TINY, 113),
    'item/regen_potion':  (TINY, 114),
    'item/rage_potion':   (TINY, 115),
    'item/swift_potion':  (TINY, 116),
    'item/shield_item':   (TINY, 102),
    'item/energy_core':   (MICRO, 88),
    'item/hawk_badge':    (MICRO, 131),
    'item/executioner':   (MICRO, 71),
    'item/magnet_ring':   (MICRO, 130),
    'item/falcon_eye':    (MICRO, 128),
    'item/lucky_charm':   (TINY, 101),
    'item/giant_belt':    (MICRO, 56),
    'item/venom':         (MICRO, 20),
    'item/demon_pact':    (MICRO, 110),
    # 升级词条图标
    'up/vit':             (MICRO, 102),
    'up/blade':           (TINY, 104),
    'up/swift':           (MICRO, 133),
    'up/wind':            (MICRO, 115),
    'up/shell':           (MICRO, 103),
    'up/instinct':        (MICRO, 129),
    'up/lethal':          (TINY, 103),
    'up/cruel':           (MICRO, 71),
    'up/regen':           (TINY, 114),
    'up/magnet':          (MICRO, 130),
    'up/eagle':           (MICRO, 128),
    'up/lucky':           (TINY, 101),
    'up/berserk':         (MICRO, 110),
    'up/steel':           (TINY, 102),
    # 技能图标
    'skill/shockwave':    (MICRO, 131),
    'skill/chain':        (MICRO, 134),
    'skill/firefield':    (MICRO, 136),
    'skill/barrier':      (MICRO, 104),
    'skill/frenzy':       (MICRO, 137),
    'skill/thorns':       (MICRO, 84),
    # 掉落物
    'pickup/material':    (MICRO, 87),
    'pickup/heart':       (MICRO, 102),
    # 地面与装饰
    'ground/floor_a':     (TINY, 51),
    'ground/floor_b':     (TINY, 52),
    'ground/floor_c':     (TINY, 53),
    'ground/wall':        (TINY, 58),
    'decor/rock':         (TINY, 49),
    'decor/crate':        (TINY, 65),
    'decor/barrel':       (TINY, 66),
    'decor/anvil':        (TINY, 74),
    'decor/bones':        (TINY, 25),
}

# UI 面板（羊皮纸，供 border-image 使用）
UI_FILES = {
    'ui/panel':        'panel_beige.png',
    'ui/panel_inset':  'panelInset_brown.png',
    'ui/panel_brown':  'panel_brown.png',
    'ui/button':       'buttonLong_brown.png',
    'ui/button_hover': 'buttonLong_beige.png',
}

def main():
    for sub in ['player', 'enemy', 'weapon', 'item', 'up', 'skill', 'pickup',
                'ground', 'decor', 'ui']:
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    for name, (src, idx) in MAPPING.items():
        dst = os.path.join(OUT, name + '.png')
        shutil.copyfile(tile(src, idx), dst)
    for name, f in UI_FILES.items():
        shutil.copyfile(os.path.join(UI, f), os.path.join(OUT, name + '.png'))

    # 预生成地面图案（2x2 拼接满铺），运行时直接 createPattern
    a = Image.open(tile(TINY, 51)).convert('RGBA')
    b = Image.open(tile(TINY, 52)).convert('RGBA')
    c = Image.open(tile(TINY, 53)).convert('RGBA')
    d = Image.open(tile(TINY, 50)).convert('RGBA')
    pattern = Image.new('RGBA', (32, 32))
    pattern.paste(a, (0, 0)); pattern.paste(b, (16, 0))
    pattern.paste(c, (0, 16)); pattern.paste(d, (16, 16))
    pattern = pattern.resize((128, 128), Image.NEAREST)
    pattern.save(os.path.join(OUT, 'ground/floor_pattern.png'))

    n = len(MAPPING) + len(UI_FILES) + 1
    print(f'OK: {n} assets -> {os.path.abspath(OUT)}')

if __name__ == '__main__':
    main()
