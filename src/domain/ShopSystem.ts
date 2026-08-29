import { ITEMS, type ItemDef } from '../data/items';
import { WEAPONS, type WeaponTier } from '../data/weapons';
import type { PlayerEntity } from './types';
import type { Rng } from '../utils/rng';

// ============ 商店系统：商品生成 / 购买 / 合成 / 重抽 / 锁定 / 治疗 ============

export const MAX_WEAPONS = 6;
const ITEM_PRICE = 14;

export interface ShopOffer {
  kind: 'weapon' | 'item';
  weaponKey?: string;
  tier?: WeaponTier;
  item?: ItemDef;
  price: number;
  sold: boolean;
  locked: boolean;
}

export type BuyResult = 'ok' | 'no-money' | 'weapons-full';

export class ShopSystem {
  offers: ShopOffer[] = [];
  rerolls = 0;
  healUsed = false;

  constructor(private wave: () => number) {}

  private rollOffer(rng: Rng): ShopOffer {
    const w = this.wave();
    if (rng() < 0.42) {
      const keys = Object.keys(WEAPONS);
      const weaponKey = keys[Math.floor(rng() * keys.length)];
      const r = rng();
      const p2 = Math.min(0.55, 0.1 + w * 0.04);
      const p3 = w >= 5 ? Math.min(0.3, (w - 4) * 0.06) : 0;
      const p4 = w >= 9 ? Math.min(0.2, (w - 8) * 0.05) : 0;
      let tier: WeaponTier = 1;
      if (r < p4) tier = 4;
      else if (r < p4 + p3) tier = 3;
      else if (r < p4 + p3 + p2) tier = 2;
      return {
        kind: 'weapon', weaponKey, tier,
        price: Math.round((22 + w * 3) * (1 + 0.55 * (tier - 1))),
        sold: false, locked: false,
      };
    }
    const item = ITEMS[Math.floor(rng() * ITEMS.length)];
    return {
      kind: 'item', item,
      price: Math.round(ITEM_PRICE * (1 + w * 0.05) * (0.9 + rng() * 0.25)),
      sold: false, locked: false,
    };
  }

  rerollCost(): number {
    return Math.round(4 + this.wave() * 1.5 + this.rerolls * 3);
  }

  healCost(): number {
    return Math.round(8 + this.wave() * 1.5);
  }

  /** 开新店（每波一次），重抽计数与治疗重置 */
  open(rng: Rng = Math.random): void {
    this.rerolls = 0;
    this.healUsed = false;
    this.offers = [];
    for (let i = 0; i < 4; i++) this.offers.push(this.rollOffer(rng));
  }

  /** 重抽：锁定的原位保留，其余重新生成 */
  reroll(rng: Rng = Math.random): void {
    this.rerolls++;
    this.offers = this.offers.map(o =>
      (o.locked && !o.sold) ? o : this.rollOffer(rng));
  }

  canBuyWeapon(p: PlayerEntity, o: ShopOffer): boolean {
    if (o.kind !== 'weapon') return true;
    const merge = p.weapons.some(x => x.key === o.weaponKey && x.tier === o.tier);
    return merge || p.weapons.length < MAX_WEAPONS;
  }

  /** 购买：扣钱、应用效果；武器同名同阶合成升阶 */
  buy(p: PlayerEntity, idx: number): BuyResult {
    const o = this.offers[idx];
    if (!o || o.sold) return 'no-money';
    if (p.money < o.price) return 'no-money';
    if (o.kind === 'weapon') {
      const same = p.weapons.find(x => x.key === o.weaponKey && x.tier === o.tier);
      if (same) {
        same.tier = Math.min(4, same.tier + 1) as WeaponTier;
        same.timer = 0.2;
      } else {
        if (p.weapons.length >= MAX_WEAPONS) return 'weapons-full';
        p.weapons.push({ key: o.weaponKey!, tier: o.tier!, timer: 0.2, aim: 0, recoil: 0 });
      }
    } else {
      o.item!.f({ stats: p.stats, hp: p.hp, synergies: p.synergies });
      p.hp = Math.min(p.hp, p.stats.maxHp);
    }
    p.money -= o.price;
    o.sold = true;
    o.locked = false;
    return 'ok';
  }

  toggleLock(idx: number): void {
    const o = this.offers[idx];
    if (o && !o.sold) o.locked = !o.locked;
  }

  /** 治疗泉水：每波限购一次，回 40% */
  buyHeal(p: PlayerEntity): 'ok' | 'used' | 'no-money' | 'full-hp' {
    if (this.healUsed) return 'used';
    if (p.hp >= p.stats.maxHp) return 'full-hp';
    const cost = this.healCost();
    if (p.money < cost) return 'no-money';
    p.money -= cost;
    p.hp = Math.min(p.stats.maxHp, p.hp + Math.round(p.stats.maxHp * 0.4));
    this.healUsed = true;
    return 'ok';
  }
}
