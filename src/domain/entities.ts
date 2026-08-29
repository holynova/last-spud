import { ENEMIES } from '../data/enemies';
import { waveHpMul } from '../data/waves';
import type { EnemyEntity } from './types';

/** 敌人工厂：按波次成长曲线实例化（领域层统一入口，场景与测试共用） */
export function createEnemy(key: string, x: number, y: number, wave = 1): EnemyEntity {
  const def = ENEMIES[key];
  if (!def) throw new Error('未知敌人: ' + key);
  const hpMul = waveHpMul(wave);
  const e: EnemyEntity = {
    key, def, x, y, r: def.r,
    color: def.color ?? '#9aa4ad',
    hp: Math.round(def.hp * hpMul),
    maxHp: Math.round(def.hp * hpMul),
    dmg: def.dmg,
    speed: def.speed * (1 + Math.min(0.5, (wave - 1) * 0.025)),
    flash: 0, kx: 0, ky: 0, slowT: 0, touchCd: 0,
    shootT: 0, dashT: 0, dashing: 0, dead: false, t: 0,
  };
  return e;
}
