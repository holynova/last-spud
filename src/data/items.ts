import type { Stats } from '../domain/types';

// ============ 升级词条（属性强化部分） ============

export interface UpgradeDef {
  n: string;
  icon: string;
  d: string;
  w: number;
  f: (p: { stats: Stats; hp: number }) => void;
}

export const UPGRADES: UpgradeDef[] = [
  { n: '厚皮',   icon: 'up/vit',      d: '最大生命 +6',           w: 10, f: p => { p.stats.maxHp += 6; p.hp += 6; } },
  { n: '利刃',   icon: 'up/blade',    d: '伤害 +8%',              w: 10, f: p => { p.stats.dmg += 0.08; } },
  { n: '快手',   icon: 'up/swift',    d: '攻击速度 +8%',           w: 10, f: p => { p.stats.aspd += 0.08; } },
  { n: '疾风',   icon: 'up/wind',     d: '移动速度 +6%',           w: 8,  f: p => { p.stats.speed += 0.06; } },
  { n: '硬壳',   icon: 'up/shell',    d: '护甲 +1',               w: 7,  f: p => { p.stats.armor += 1; } },
  { n: '直觉',   icon: 'up/instinct', d: '闪避 +4%',               w: 7,  f: p => { p.stats.dodge += 0.04; } },
  { n: '致命',   icon: 'up/lethal',   d: '暴击率 +5%',             w: 8,  f: p => { p.stats.crit += 0.05; } },
  { n: '狠辣',   icon: 'up/cruel',    d: '暴击伤害 +25%',          w: 6,  f: p => { p.stats.critMult += 0.25; } },
  { n: '再生',   icon: 'up/regen',    d: '每5秒回复 +1 生命',      w: 7,  f: p => { p.stats.regen += 1; } },
  { n: '磁化',   icon: 'up/magnet',   d: '拾取范围 +30',           w: 5,  f: p => { p.stats.pickup += 30; } },
  { n: '鹰眼',   icon: 'up/eagle',    d: '武器射程 +10%',          w: 5,  f: p => { p.stats.range += 0.1; } },
  { n: '幸运星', icon: 'up/lucky',    d: '幸运 +1（更多掉落）',    w: 4,  f: p => { p.stats.luck += 1; } },
  { n: '狂暴',   icon: 'up/berserk',  d: '伤害 +14%，最大生命 -3', w: 3,  f: p => { p.stats.dmg += 0.14; p.stats.maxHp -= 3; p.hp = Math.min(p.hp, p.stats.maxHp); } },
  { n: '钢铁之躯', icon: 'up/steel',  d: '最大生命 +12，护甲 +1',  w: 3,  f: p => { p.stats.maxHp += 12; p.hp += 12; p.stats.armor += 1; } },
];

// ============ 商店被动道具 ============

export interface ItemDef {
  n: string;
  icon: string;
  d: string;
  f: (p: { stats: Stats; hp: number }) => void;
}

export const ITEMS: ItemDef[] = [
  { n: '生命药剂', icon: 'item/hp_potion',    d: '最大生命 +6',           f: p => { p.stats.maxHp += 6; p.hp += 6; } },
  { n: '再生药剂', icon: 'item/regen_potion', d: '每5秒回复 +1.5 生命',    f: p => { p.stats.regen += 1.5; } },
  { n: '狂暴药剂', icon: 'item/rage_potion',  d: '伤害 +12%',             f: p => { p.stats.dmg += 0.12; } },
  { n: '迅捷药剂', icon: 'item/swift_potion', d: '移动速度 +9%',           f: p => { p.stats.speed += 0.09; } },
  { n: '铁盾',     icon: 'item/shield_item',  d: '护甲 +2',               f: p => { p.stats.armor += 2; } },
  { n: '能量核心', icon: 'item/energy_core',  d: '攻击速度 +12%',          f: p => { p.stats.aspd += 0.12; } },
  { n: '鹰眼徽章', icon: 'item/hawk_badge',   d: '暴击率 +7%',             f: p => { p.stats.crit += 0.07; } },
  { n: '处决战刃', icon: 'item/executioner',  d: '暴击伤害 +30%',          f: p => { p.stats.critMult += 0.3; } },
  { n: '磁石戒指', icon: 'item/magnet_ring',  d: '拾取范围 +50',           f: p => { p.stats.pickup += 50; } },
  { n: '猎鹰之眼', icon: 'item/falcon_eye',   d: '武器射程 +12%',          f: p => { p.stats.range += 0.12; } },
  { n: '幸运护符', icon: 'item/lucky_charm',  d: '幸运 +2（更多掉落）',     f: p => { p.stats.luck += 2; } },
  { n: '巨人腰带', icon: 'item/giant_belt',   d: '最大生命 +14，移速 -4%',  f: p => { p.stats.maxHp += 14; p.hp += 14; p.stats.speed -= 0.04; } },
  { n: '毒液瓶',   icon: 'item/venom',        d: '伤害 +6%，射程 +8%',     f: p => { p.stats.dmg += 0.06; p.stats.range += 0.08; } },
  { n: '恶魔契约', icon: 'item/demon_pact',   d: '伤害 +20%，最大生命 -5',  f: p => { p.stats.dmg += 0.2; p.stats.maxHp -= 5; p.hp = Math.min(p.hp, p.stats.maxHp); } },
];
