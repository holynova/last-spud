import type { EnemyDef } from '../data/enemies';

// ============ 领域共享类型 ============
// 领域层零 Phaser 依赖：实体只有数据字段，渲染层通过 sprite 引用关联

export interface Vec2 { x: number; y: number }

export interface Stats {
  maxHp: number;
  regen: number;      // 每 5 秒回复
  speed: number;      // 移速倍率
  dmg: number;        // 伤害倍率
  aspd: number;       // 攻速倍率
  range: number;      // 射程倍率
  crit: number;       // 暴击率
  critMult: number;   // 暴击伤害倍率
  armor: number;      // 护甲（减伤 = armor/(armor+12)，上限 75%）
  dodge: number;      // 闪避率（上限 60%）
  pickup: number;     // 拾取半径
  luck: number;       // 幸运（掉落加成）
}

export type Synergies = Record<string, number>;

export interface Minion extends Vec2 {
  life: number; shootT: number; dmg: number; range: number;
}

export interface WeaponInstance {
  key: string;
  tier: number;       // 1~4
  timer: number;      // 冷却剩余
  aim: number;        // 上次瞄准角
  recoil: number;     // 后坐动画 0~1
}

import type { SkillKey } from '../data/skills';

export interface Hazard {
  x: number; y: number; r: number;
  dps: number;
  ttl: number; maxTtl: number;
  tick: number;
  follow?: boolean;   // 觉醒：跟随玩家
}

export interface SkillInstance {
  key: SkillKey;
  level: number;
  timer: number;
  tick: number;       // 荆棘类持续技的结算计时
  castAnim: number;
}

export interface PlayerEntity extends Vec2 {
  synergies: Synergies;
  defKey: string;
  r: number;
  hp: number;
  faceAng: number;
  walkT: number;
  hurtFlash: number;
  invuln: number;
  stats: Stats;
  weapons: WeaponInstance[];
  skills: SkillInstance[];
  xp: number;
  level: number;
  money: number;
  shield: number;
  shieldFlash: number;
  frenzyT: number;
  frenzyAspd: number;
}

export interface EnemyEntity extends Vec2 {
  key: string;
  def: EnemyDef;
  r: number;
  color: string;
  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  flash: number;
  kx: number;         // 击退速度
  ky: number;
  slowT: number;
  touchCd: number;
  shootT: number;
  dashT: number;
  dashing: number;
  dead: boolean;
  t: number;
  bonusDrops?: number;   // 宝箱怪等多倍掉落
  affixName?: string;    // 精英词缀显示名
  dmgTakenMul?: number;  // 石肤：受伤倍率
  vampiric?: boolean;    // 吸血：接触伤害回血
}

export interface BulletEntity extends Vec2 {
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  crit: boolean;
  pierce: number;
  kb: number;
  life: number;
  color: string;
  fromPlayer: boolean;
  t: number;
  spin: number;
  // 回旋镖
  boom: boolean;
  boomDist: number;
  boomMax: number;
  boomSpeed: number;
  returning: boolean;
  hitMap: Map<EnemyEntity, number> | null;
  hitSet: Set<EnemyEntity> | null;
  srcKey?: string;    // 伤害来源（战斗统计）
}

/** 领域系统需要的世界视图（由场景装配提供） */
export interface World {
  player: PlayerEntity;
  enemies: EnemyEntity[];
  bullets: BulletEntity[];
  hazards: Hazard[];
  minions: Minion[];
  dropMul: number;
  mud: boolean;
  damageBy: Record<string, number>;
  emit<E extends keyof GameEvents>(event: E, payload: GameEvents[E]): void;
  grid: import('./SpatialGrid').SpatialGrid<EnemyEntity>;
  wave: number;
  dmgMul: number;
}

export interface GameEvents {
  'damage': { x: number; y: number; val: number; crit: boolean; color?: string };
  'enemy:killed': { enemy: EnemyEntity; drops: number };
  'enemy:split': { from: EnemyEntity; childKey: string };
  'player:hurt': { val: number };
  'player:dodged': Record<string, never>;
  'player:shield': { val: number };
  'weapon:fired': { key: string; kind: string; x: number; y: number; ang: number };
  'fx:ring': { x: number; y: number; r: number; color: string; width?: number };
  'fx:bolt': { x1: number; y1: number; x2: number; y2: number; color: string };
  'fx:arc': { x: number; y: number; ang: number; arc: number; r: number; color: string };
  'fx:boom': { x: number; y: number; r: number; color: string };
  'shake': { force: number };
}

export interface RolledDamage { val: number; crit: boolean }
