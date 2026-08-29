import { describe, expect, it } from 'vitest';
import { ShopSystem } from '../../src/domain/ShopSystem';
import { createPlayer } from '../../src/domain/PlayerSystem';

function makeShop(wave = 3) {
  const p = createPlayer('adventurer', 0, 0, {
    maxHp: 60, regen: 0, speed: 1, dmg: 1, aspd: 1, range: 1,
    crit: 0, critMult: 2, armor: 0, dodge: 0, pickup: 90, luck: 0,
  }, 'pistol');
  const shop = new ShopSystem(() => wave);
  return { p, shop };
}

describe('商店商品生成', () => {
  it('open 生成 4 槽商品并重置计数', () => {
    const { shop } = makeShop();
    shop.rerolls = 5;
    shop.healUsed = true;
    shop.open(() => 0.5);
    expect(shop.offers.length).toBe(4);
    expect(shop.rerolls).toBe(0);
    expect(shop.healUsed).toBe(false);
    for (const o of shop.offers) {
      expect(['weapon', 'item']).toContain(o.kind);
      expect(o.sold).toBe(false);
      expect(o.price).toBeGreaterThan(0);
    }
  });

  it('武器价格随波次与阶数上浮', () => {
    const low = new ShopSystem(() => 1);
    const high = new ShopSystem(() => 10);
    low.offers = [{ kind: 'weapon', weaponKey: 'pistol', tier: 1, price: 0, sold: false, locked: false }];
    high.offers = [{ kind: 'weapon', weaponKey: 'pistol', tier: 4, price: 0, sold: false, locked: false }];
    low.open(() => 0.2); high.open(() => 0.2);
    const lp = low.offers.find(o => o.kind === 'weapon')!.price;
    const hp = high.offers.find(o => o.kind === 'weapon')!.price;
    expect(hp).toBeGreaterThan(lp);
  });
});

describe('购买与合成', () => {
  it('买武器入栏并扣钱', () => {
    const { p, shop } = makeShop();
    p.money = 999;
    shop.offers = [{ kind: 'weapon', weaponKey: 'laser', tier: 2, price: 40, sold: false, locked: false }];
    expect(shop.buy(p, 0)).toBe('ok');
    expect(p.weapons.length).toBe(2);
    expect(p.money).toBe(959);
    expect(shop.offers[0].sold).toBe(true);
  });

  it('同名同阶合成升阶（初始手枪 1 阶 + 购 1 阶 → 2 阶）', () => {
    const { p, shop } = makeShop();
    p.money = 999;
    shop.offers = [{ kind: 'weapon', weaponKey: 'pistol', tier: 1, price: 40, sold: false, locked: false }];
    shop.buy(p, 0);
    expect(p.weapons.find(w => w.key === 'pistol')?.tier).toBe(2);
    expect(p.weapons.length).toBe(1); // 合成不新增栏位
  });

  it('钱不够拒绝购买', () => {
    const { p, shop } = makeShop();
    p.money = 1;
    shop.offers = [{ kind: 'item', item: { n: '铁盾', icon: 'item/shield_item', d: '', f: () => {} }, price: 40, sold: false, locked: false }];
    expect(shop.buy(p, 0)).toBe('no-money');
  });

  it('武器栏满且不可合成时拒绝', () => {
    const { p, shop } = makeShop();
    p.money = 999;
    const keys = ['smg', 'shotgun', 'sniper', 'knife', 'boomerang', 'laser'];
    for (const k of keys) {
      p.weapons.push({ key: k, tier: 1, timer: 0, aim: 0, recoil: 0 });
    }
    shop.offers = [{ kind: 'weapon', weaponKey: 'club', tier: 1, price: 40, sold: false, locked: false }];
    expect(shop.canBuyWeapon(p, shop.offers[0])).toBe(false);
    expect(shop.buy(p, 0)).toBe('weapons-full');
    expect(p.weapons.length).toBe(7 - 1 + 0 + 1); // 初始手枪 + 6 = 7? 校验下方精确断言
    expect(p.weapons.length).toBe(7);
  });

  it('道具购买应用效果', () => {
    const { p, shop } = makeShop();
    p.money = 999;
    shop.offers = [{ kind: 'item', item: { n: '铁盾', icon: 'item/shield_item', d: '护甲+2', f: s => { s.stats.armor += 2; } }, price: 20, sold: false, locked: false }];
    shop.buy(p, 0);
    expect(p.stats.armor).toBe(2);
  });
});

describe('重抽与锁定', () => {
  it('锁定的商品原位保留，其余刷新，费用递增', () => {
    const { shop } = makeShop();
    shop.open(() => 0.3);
    shop.toggleLock(0);
    const locked = shop.offers[0];
    const cost0 = shop.rerollCost();
    shop.reroll(() => 0.7);
    expect(shop.offers[0]).toBe(locked);
    expect(shop.rerollCost()).toBeGreaterThan(cost0);
    expect(shop.offers[1].sold).toBe(false);
  });

  it('toggleLock 在已售商品上无效', () => {
    const { shop } = makeShop();
    shop.open();
    shop.offers[0].sold = true;
    shop.toggleLock(0);
    expect(shop.offers[0].locked).toBe(false);
  });
});

describe('治疗泉水', () => {
  it('回血 40% 且限购一次', () => {
    const { p, shop } = makeShop();
    p.money = 999;
    p.hp = 10;
    expect(shop.buyHeal(p)).toBe('ok');
    expect(p.hp).toBe(10 + Math.round(60 * 0.4));
    expect(shop.buyHeal(p)).toBe('used');
  });

  it('满血与差钱拒绝', () => {
    const { p, shop } = makeShop();
    p.money = 0;
    p.hp = 60;
    expect(shop.buyHeal(p)).toBe('full-hp');
    p.hp = 10;
    expect(shop.buyHeal(p)).toBe('no-money');
  });
});
