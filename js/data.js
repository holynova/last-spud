// ============ 游戏数值配置 ============

const ARENA_W = 2000, ARENA_H = 1300;
const MAX_WEAPONS = 6;
const MAX_SKILLS = 3;
const SKILL_MAX_LEVEL = 5;
const TOTAL_WAVES = 12;

// ---------- 武器 ----------
// kind: gun 单发 | shotgun 散射 | throw 投掷穿透 | boomerang 回旋
//       melee 近战扇形 | beam 激光直线 | aura 周身电圈
// icon: assets 下的图标键（无 emoji，全部走 Kenney 像素图标）
const WEAPONS = {
  pistol: {
    name: '橡木魔杖', icon: 'weapon/pistol', kind: 'gun', color: '#c9a86a',
    dmg: 13, cd: 0.85, range: 330, pspd: 560, count: 1, pierce: 0, kb: 90,
    desc: '学徒的起手魔杖，射速稳定',
  },
  smg: {
    name: '毒藤魔杖', icon: 'weapon/smg', kind: 'gun', color: '#8fd86e',
    dmg: 5, cd: 0.2, range: 280, pspd: 620, count: 1, pierce: 0, kb: 30, spread: 0.14,
    desc: '射速极快的毒刺连发',
  },
  shotgun: {
    name: '碎石战斧', icon: 'weapon/shotgun', kind: 'shotgun', color: '#c9b06a',
    dmg: 8, cd: 1.35, range: 240, pspd: 500, count: 5, spread: 0.5, pierce: 0, kb: 160, life: 0.55,
    desc: '近身一击崩出 5 枚碎石',
  },
  sniper: {
    name: '符文长剑', icon: 'weapon/sniper', kind: 'gun', color: '#e8e6ff',
    dmg: 42, cd: 2.0, range: 540, pspd: 1000, count: 1, pierce: 3, kb: 240,
    desc: '射出贯穿 3 人的符文剑气',
  },
  knife: {
    name: '飞刀', icon: 'weapon/knife', kind: 'throw', color: '#d8f0ff',
    dmg: 15, cd: 0.62, range: 310, pspd: 600, count: 1, pierce: 2, kb: 70, spread: 0.05,
    desc: '掷出并穿透 2 个敌人',
  },
  boomerang: {
    name: '回旋飞斧', icon: 'weapon/boomerang', kind: 'boomerang', color: '#c9f06e',
    dmg: 11, cd: 1.5, range: 350, pspd: 440, pierce: 99, kb: 90,
    desc: '掷出后飞回手中，两段伤害',
  },
  club: {
    name: '战锤', icon: 'weapon/club', kind: 'melee', color: '#e8b04b',
    dmg: 26, cd: 1.05, range: 105, arc: 2.4, kb: 320,
    desc: '扇形横扫，击退效果极强',
  },
  laser: {
    name: '冰霜射线', icon: 'weapon/laser', kind: 'beam', color: '#7ec8ff',
    dmg: 17, cd: 1.15, range: 400,
    desc: '贯穿一条直线上的所有敌人',
  },
  aura: {
    name: '风暴图腾', icon: 'weapon/aura', kind: 'aura', color: '#c88fff',
    dmg: 7, cd: 1.0, range: 125,
    desc: '周期电击周身所有敌人',
  },
  flamer: {
    name: '喷火魔杖', icon: 'weapon/flamer', kind: 'gun', color: '#ff9530',
    dmg: 3.5, cd: 0.07, range: 190, pspd: 300, count: 1, pierce: 1, kb: 20, spread: 0.4, life: 0.55,
    desc: '短程火焰喷射，弹幕成片',
  },
};

const TIER_NAMES = ['普通', '精良', '稀有', '史诗'];
const TIER_COLORS = ['#9aa4ad', '#5ad06e', '#4aa3ff', '#c86bff'];
function weaponStats(key, tier) {
  const d = WEAPONS[key];
  const m = 1 + 0.55 * (tier - 1);            // 伤害成长
  const c = Math.pow(0.94, tier - 1);          // 冷却缩减
  return {
    ...d,
    key, tier,
    dmg: d.dmg * m,
    cd: d.cd * c,
    range: d.range * (1 + 0.07 * (tier - 1)),
  };
}

// ---------- 技能（主动，自动施放） ----------
// 每个技能：baseDmg/cd 随等级成长，maxLv 5
const SKILLS = {
  shockwave: {
    name: '震荡波', icon: 'skill/shockwave', color: '#ffd257',
    desc: '向四周释放冲击波，伤害并击退所有敌人',
    baseDmg: 16, baseCd: 4.5, baseRange: 210,
    perLv: { dmg: 0.5, cd: -0.12, range: 22 },
    levelDesc: lv => `伤害 ${Math.round(16 * (1 + 0.5 * (lv - 1)))} · 半径 ${210 + 22 * (lv - 1)} · 冷却 ${(4.5 - 0.12 * (lv - 1)).toFixed(1)}s`,
  },
  chain: {
    name: '闪电链', icon: 'skill/chain', color: '#7ee8ff',
    desc: '雷击最近的敌人，并在敌人之间连锁跳跃',
    baseDmg: 14, baseCd: 3.2, baseRange: 360, jumps: 3,
    perLv: { dmg: 0.45, jumps: 1 },
    levelDesc: lv => `伤害 ${Math.round(14 * (1 + 0.45 * (lv - 1)))} · 跳跃 ${3 + (lv - 1)} 次 · 冷却 3.2s`,
  },
  firefield: {
    name: '烈火结界', icon: 'skill/firefield', color: '#ff9530',
    desc: '在脚下生成持续燃烧的火圈',
    baseDmg: 10, baseCd: 6.5, baseRange: 110, duration: 3,
    perLv: { dmg: 0.4, range: 12, duration: 0.4 },
    levelDesc: lv => `每秒 ${Math.round(10 * (1 + 0.4 * (lv - 1)))} 伤害 · 半径 ${110 + 12 * (lv - 1)} · 持续 ${(3 + 0.4 * (lv - 1)).toFixed(1)}s`,
  },
  barrier: {
    name: '圣盾术', icon: 'skill/barrier', color: '#ffe9a3',
    desc: '周期获得一层护盾，优先抵挡受到的伤害',
    baseDmg: 0, baseCd: 9, baseRange: 0, shield: 16,
    perLv: { shield: 8, cd: -0.3 },
    levelDesc: lv => `护盾 ${16 + 8 * (lv - 1)} 点 · 冷却 ${(9 - 0.3 * (lv - 1)).toFixed(1)}s`,
  },
  frenzy: {
    name: '狂化', icon: 'skill/frenzy', color: '#ff6b5e',
    desc: '进入狂化状态：攻速与移速大幅提升',
    baseDmg: 0, baseCd: 11, baseRange: 0, duration: 3,
    aspdBuff: 0.35, speedBuff: 0.25,
    perLv: { duration: 0.5, aspd: 0.05 },
    levelDesc: lv => `持续 ${(3 + 0.5 * (lv - 1)).toFixed(1)}s · 攻速 +${Math.round((0.35 + 0.05 * (lv - 1)) * 100)}% · 移速 +25%`,
  },
  thorns: {
    name: '荆棘领域', icon: 'skill/thorns', color: '#8ee05a',
    desc: '周身缠绕荆棘，持续伤害并减速靠近的敌人',
    baseDmg: 6, baseCd: 0, baseRange: 95, slow: 0.35,
    perLv: { dmg: 0.5, range: 10 },
    levelDesc: lv => `每秒 ${Math.round(6 * (1 + 0.5 * (lv - 1)))} 伤害 · 半径 ${95 + 10 * (lv - 1)} · 减速 35%`,
  },
};

function skillStats(key, level) {
  const d = SKILLS[key];
  const lv = level - 1;
  return {
    key, level,
    dmg: d.baseDmg * (1 + (d.perLv.dmg || 0) * lv),
    cd: Math.max(0.5, d.baseCd + (d.perLv.cd || 0) * lv),
    range: d.baseRange + (d.perLv.range || 0) * lv,
    jumps: d.jumps ? d.jumps + (d.perLv.jumps || 0) * lv : 0,
    shield: d.shield ? d.shield + (d.perLv.shield || 0) * lv : 0,
    duration: d.duration ? d.duration + (d.perLv.duration || 0) * lv : 0,
    aspdBuff: d.aspdBuff ? d.aspdBuff + (d.perLv.aspd || 0) * lv : 0,
  };
}

// ---------- 敌人 ----------
const ENEMIES = {
  chaser:   { name: '独眼怪',   hp: 13,   speed: 100, dmg: 6,  r: 15, xp: 1, sprite: 'enemy/chaser' },
  runner:   { name: '疾风蝠',   hp: 8,    speed: 195, dmg: 4,  r: 13, xp: 1, sprite: 'enemy/runner' },
  spitter:  { name: '毒蛛',     hp: 18,   speed: 75,  dmg: 5,  r: 15, xp: 2, color: '#b07ec9', sprite: 'enemy/spitter',
              ranged: true, keep: 270, shootCd: 2.4, pspd: 250 },
  boomling: { name: '爆爆蟹',   hp: 11,   speed: 140, dmg: 5,  r: 14, xp: 1, color: '#e8a33d', sprite: 'enemy/boomling',
              explode: true, boomDmg: 20, boomR: 85 },
  brute:    { name: '怨灵',     hp: 65,   speed: 55,  dmg: 15, r: 24, xp: 4, color: '#c95b5b', sprite: 'enemy/brute' },
  splitter: { name: '分裂史莱姆', hp: 30, speed: 80,  dmg: 8,  r: 19, xp: 2, color: '#59c9a5', sprite: 'enemy/splitter',
              splitInto: 'splitling', splitCount: 2 },
  splitling:{ name: '小史莱姆',  hp: 10,  speed: 120, dmg: 4,  r: 12, xp: 1, color: '#8fe0c9', sprite: 'enemy/splitling' },
  elite:    { name: '血祭司',   hp: 170,  speed: 85,  dmg: 20, r: 26, xp: 12, color: '#e0559c', sprite: 'enemy/elite', elite: true },
  boss:     { name: '鼠王',     hp: 1600, speed: 62,  dmg: 30, r: 50, xp: 60, color: '#8e44ad', sprite: 'enemy/boss',
              boss: true, shootCd: 1.7, pspd: 220, dashCd: 6 },
};

function spawnTable(wave) {
  const t = [{ k: 'chaser', w: 10 }];
  if (wave >= 2) t.push({ k: 'runner', w: 7 });
  if (wave >= 3) t.push({ k: 'spitter', w: 4 });
  if (wave >= 4) t.push({ k: 'boomling', w: 4 });
  if (wave >= 5) t.push({ k: 'brute', w: 3 });
  if (wave >= 6) t.push({ k: 'splitter', w: 3 });
  return t;
}

// ---------- 商店道具（被动） ----------
const ITEMS = [
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
const ITEM_PRICE = 14;

// ---------- 升级词条（属性强化部分） ----------
// 图标 icon 为 assets 键
const UPGRADES = [
  { n: '厚皮',     icon: 'up/vit',      d: '最大生命 +6',           w: 10, f: p => { p.stats.maxHp += 6; p.hp += 6; } },
  { n: '利刃',     icon: 'up/blade',    d: '伤害 +8%',              w: 10, f: p => { p.stats.dmg += 0.08; } },
  { n: '快手',     icon: 'up/swift',    d: '攻击速度 +8%',           w: 10, f: p => { p.stats.aspd += 0.08; } },
  { n: '疾风',     icon: 'up/wind',     d: '移动速度 +6%',           w: 8,  f: p => { p.stats.speed += 0.06; } },
  { n: '硬壳',     icon: 'up/shell',    d: '护甲 +1',               w: 7,  f: p => { p.stats.armor += 1; } },
  { n: '直觉',     icon: 'up/instinct', d: '闪避 +4%',               w: 7,  f: p => { p.stats.dodge += 0.04; } },
  { n: '致命',     icon: 'up/lethal',   d: '暴击率 +5%',             w: 8,  f: p => { p.stats.crit += 0.05; } },
  { n: '狠辣',     icon: 'up/cruel',    d: '暴击伤害 +25%',          w: 6,  f: p => { p.stats.critMult += 0.25; } },
  { n: '再生',     icon: 'up/regen',    d: '每5秒回复 +1 生命',      w: 7,  f: p => { p.stats.regen += 1; } },
  { n: '磁化',     icon: 'up/magnet',   d: '拾取范围 +30',           w: 5,  f: p => { p.stats.pickup += 30; } },
  { n: '鹰眼',     icon: 'up/eagle',    d: '武器射程 +10%',          w: 5,  f: p => { p.stats.range += 0.1; } },
  { n: '幸运星',   icon: 'up/lucky',    d: '幸运 +1（更多掉落）',    w: 4,  f: p => { p.stats.luck += 1; } },
  { n: '狂暴',     icon: 'up/berserk',  d: '伤害 +14%，最大生命 -3', w: 3,  f: p => { p.stats.dmg += 0.14; p.stats.maxHp -= 3; p.hp = Math.min(p.hp, p.stats.maxHp); } },
  { n: '钢铁之躯', icon: 'up/steel',    d: '最大生命 +12，护甲 +1',  w: 3,  f: p => { p.stats.maxHp += 12; p.hp += 12; p.stats.armor += 1; } },
];

// ---------- 角色 ----------
const CHARACTERS = [
  {
    key: 'adventurer', name: '冒险家', sprite: 'player/adventurer',
    desc: '初出茅庐的流浪者，各项属性均衡，起手一把橡木魔杖。',
    start: 'pistol',
    mod: {},
  },
  {
    key: 'berserker', name: '狂战士', sprite: 'player/berserker',
    desc: '攻击速度 +25%，移速 +12%，但最大生命 -12。战锤是最好的朋友。',
    start: 'club',
    mod: { aspd: 0.25, speed: 0.12, maxHp: -12 },
  },
  {
    key: 'knight', name: '铁卫骑士', sprite: 'player/knight',
    desc: '最大生命 +35，护甲 +4，伤害 +10%，但移速 -18%。',
    start: 'club',
    mod: { maxHp: 35, armor: 4, dmg: 0.10, speed: -0.18 },
  },
  {
    key: 'apprentice', name: '小学徒', sprite: 'player/apprentice',
    desc: '暴击率 +15%，闪避 +10%，幸运 +3，最大生命 -8。天生手气好。',
    start: 'boomerang',
    mod: { crit: 0.15, dodge: 0.10, luck: 3, maxHp: -8 },
  },
];

// ---------- 波次参数 ----------
function waveDuration(w) { return 24 + w * 3; }
function waveHpMul(w)    { return 1 + 0.42 * (w - 1) + Math.max(0, w - 8) * 0.25; }
function waveDmgMul(w)   { return 1 + 0.10 * (w - 1); }
function spawnInterval(w){ return clamp(1.25 - w * 0.07, 0.38, 1.25); }
function spawnPerTick(w) { return 1 + Math.floor(w / 4); }
