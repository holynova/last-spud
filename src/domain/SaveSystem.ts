import type { SkillKey } from '../data/skills';
import type { Stats, WeaponInstance } from './types';

// ============ 存档系统：每波自动保存 / 继续 ============

export interface SaveData {
  char: string;
  wave: number;
  hp: number;
  xp: number;
  level: number;
  money: number;
  stats: Stats;
  weapons: WeaponInstance[];
  skills: Array<{ key: SkillKey; level: number }>;
  kills: number;
  elapsed: number;
  time: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'lastspud_save';
export const BEST_KEY = 'lastspud_best';
export const META_KEY = 'lastspud_meta';

export interface MetaData { totalKills: number }

export interface BestRecord { wave: number; kills: number; win: boolean }

/** 内存适配器（测试用） */
export function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
}

export class SaveSystem {
  constructor(private storage: StorageLike) {}

  save(data: SaveData): void {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch { /* 存储不可用时静默 */ }
  }

  load(): SaveData | null {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (typeof data.wave !== 'number' || data.wave < 1 || !data.char) return null;
      return data;
    } catch {
      return null;
    }
  }

  clear(): void {
    try { this.storage.removeItem(SAVE_KEY); } catch { /* 忽略 */ }
  }

  saveBest(win: boolean, wave: number, kills: number): void {
    try {
      const prev = this.loadBest();
      const rec: BestRecord = { wave, kills, win: win || (prev?.win ?? false) };
      if (!prev || wave > prev.wave || (wave === prev.wave && win)) {
        this.storage.setItem(BEST_KEY, JSON.stringify(rec));
      }
    } catch { /* 忽略 */ }
  }

  loadMeta(): MetaData {
    try {
      const raw = this.storage.getItem(META_KEY);
      return raw ? (JSON.parse(raw) as MetaData) : { totalKills: 0 };
    } catch {
      return { totalKills: 0 };
    }
  }

  /** 累计击杀入账（局外解锁用） */
  addMetaKills(kills: number): MetaData {
    const meta = this.loadMeta();
    meta.totalKills += Math.max(0, kills);
    try { this.storage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* 忽略 */ }
    return meta;
  }

  loadBest(): BestRecord | null {
    try {
      const raw = this.storage.getItem(BEST_KEY);
      return raw ? (JSON.parse(raw) as BestRecord) : null;
    } catch {
      return null;
    }
  }
}
