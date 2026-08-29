import { describe, expect, it } from 'vitest';
import { SaveSystem, memoryStorage, type SaveData } from '../../src/domain/SaveSystem';
import { characterStats } from '../../src/data/characters';

describe('存档系统', () => {
  it('保存后可原样恢复', () => {
    const s = new SaveSystem(memoryStorage());
    const data: SaveData = {
      char: 'knight', wave: 5, hp: 42, xp: 3, level: 7, money: 88,
      stats: characterStats({ key: 'knight', name: '', sprite: '', desc: '', start: 'club', mod: { maxHp: 35, armor: 4, dmg: 0.1, speed: -0.18 } }),
      weapons: [{ key: 'club', tier: 3, timer: 0, aim: 0, recoil: 0 }],
      skills: [{ key: 'barrier', level: 2 }],
      kills: 130, elapsed: 421, time: 0,
    };
    s.save(data);
    const loaded = s.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.char).toBe('knight');
    expect(loaded!.wave).toBe(5);
    expect(loaded!.stats.armor).toBeCloseTo(4 + 0);
    expect(loaded!.weapons[0].tier).toBe(3);
    expect(loaded!.skills[0].key).toBe('barrier');
  });

  it('损坏数据返回 null', () => {
    const storage = memoryStorage();
    const s = new SaveSystem(storage);
    storage.setItem('lastspud_save', '{oops');
    expect(s.load()).toBeNull();
    storage.setItem('lastspud_save', '{"wave":0}');
    expect(s.load()).toBeNull();
  });

  it('clear 移除存档', () => {
    const s = new SaveSystem(memoryStorage());
    s.save({ char: 'x', wave: 2, hp: 1, xp: 0, level: 1, money: 0, stats: characterStats({ key: '', name: '', sprite: '', desc: '', start: '', mod: {} }), weapons: [], skills: [], kills: 0, elapsed: 0, time: 0 });
    expect(s.load()).not.toBeNull();
    s.clear();
    expect(s.load()).toBeNull();
  });

  it('最佳纪录只保留更优波次', () => {
    const s = new SaveSystem(memoryStorage());
    s.saveBest(false, 3, 20);
    expect(s.loadBest()).toEqual({ wave: 3, kills: 20, win: false });
    s.saveBest(false, 2, 50);
    expect(s.loadBest()?.wave).toBe(3);
    s.saveBest(false, 6, 90);
    expect(s.loadBest()).toEqual({ wave: 6, kills: 90, win: false });
    s.saveBest(true, 6, 91);
    expect(s.loadBest()?.win).toBe(true);
  });
});
