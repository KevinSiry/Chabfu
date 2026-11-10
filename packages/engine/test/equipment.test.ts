import { describe, expect, it } from 'vitest';
import {
  BOSS_DROP_TABLES,
  ITEMS,
  LEGENDARY_MIN_DIFFICULTY,
  SLOTS,
  addItems,
  compareWithEquipped,
  createInventory,
  createRun,
  equipItem,
  equipmentBonus,
  equippedSlotOf,
  getPlayer,
  itemStats,
  rarityChances,
  removeItems,
  replayRun,
  rollBossLoot,
  unequipSlot,
  verifyRun,
  type RunConfig,
} from '../src/index.js';

const DECK = ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'];

describe('objets et raretés', () => {
  it('couvre les 9 emplacements, dont 2 anneaux', () => {
    expect(SLOTS).toHaveLength(9);
    expect(SLOTS.filter((s) => s.kind === 'anneau')).toHaveLength(2);
    for (const kind of new Set(SLOTS.map((s) => s.kind))) expect(ITEMS.some((i) => i.kind === kind && i.tranche === 1)).toBe(true);
  });

  it('applique la puissance de la rareté aux caractéristiques', () => {
    expect(itemStats('plastron_ecorce', 'common').hp).toBe(25);
    expect(itemStats('plastron_ecorce', 'rare').hp).toBe(30);
    expect(itemStats('plastron_ecorce', 'legendary').hp).toBe(38); // 37,5 arrondi
    expect(itemStats('arc_racineux', 'mythic').masteries.fire).toBe(12); // 9 × 1,35 = 12,15
  });

  it('chaque objet des tables de drop existe', () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    for (const table of Object.values(BOSS_DROP_TABLES)) for (const e of table) expect(ids.has(e.itemId)).toBe(true);
  });
});

describe('butin du boss', () => {
  it('est reproductible avec la même graine et jamais vide', () => {
    for (let seed = 0; seed < 200; seed++) {
      const a = rollBossLoot('bosquet_des_ronces', 3, seed);
      expect(a.length).toBeGreaterThan(0);
      expect(rollBossLoot('bosquet_des_ronces', 3, seed)).toEqual(a);
    }
  });

  it('ne donne de Légendaire qu’à partir de la difficulté 6, et rarement', () => {
    expect(rarityChances(LEGENDARY_MIN_DIFFICULTY - 1).legendary).toBe(0);
    expect(rarityChances(LEGENDARY_MIN_DIFFICULTY).legendary).toBeGreaterThan(0);
    expect(rarityChances(10).legendary).toBeLessThan(0.01);
    for (let seed = 0; seed < 2000; seed++) {
      expect(rollBossLoot('bosquet_des_ronces', 5, seed).some((d) => d.rarity === 'legendary')).toBe(false);
    }
  });

  it('la difficulté augmente le nombre de drops et la part de raretés hautes', () => {
    const stats = (difficulty: number) => {
      let count = 0;
      let high = 0;
      for (let seed = 0; seed < 3000; seed++) {
        const drops = rollBossLoot('bosquet_des_ronces', difficulty, seed);
        count += drops.length;
        high += drops.filter((d) => d.rarity === 'rare' || d.rarity === 'mythic' || d.rarity === 'legendary').length;
      }
      return { perRun: count / 3000, highShare: high / count };
    };
    const d1 = stats(1);
    const d8 = stats(8);
    expect(d8.perRun).toBeGreaterThan(d1.perRun * 1.5);
    expect(d8.highShare).toBeGreaterThan(d1.highShare * 1.5);
  });

  it('l’Anneau du Gardien (référence 3) ne tombe pas en difficulté 1', () => {
    for (let seed = 0; seed < 2000; seed++) {
      expect(rollBossLoot('bosquet_des_ronces', 1, seed).some((d) => d.itemId === 'anneau_gardien')).toBe(false);
    }
  });
});

describe('inventaire et loadout', () => {
  const base = addItems(createInventory(), [
    { itemId: 'anneau_ronce', rarity: 'common' },
    { itemId: 'anneau_ronce', rarity: 'rare' },
    { itemId: 'anneau_gardien', rarity: 'common' },
    { itemId: 'plastron_ecorce', rarity: 'mythic' },
  ]).inventory;

  it('remplit les deux anneaux puis remplace le premier', () => {
    let inv = equipItem(base, 1, 'i1');
    inv = equipItem(inv, 1, 'i2');
    expect(equippedSlotOf(inv, 1, 'i1')).toBe('anneau1');
    expect(equippedSlotOf(inv, 1, 'i2')).toBe('anneau2');
    inv = equipItem(inv, 1, 'i3');
    expect(equippedSlotOf(inv, 1, 'i3')).toBe('anneau1');
    expect(equippedSlotOf(inv, 1, 'i1')).toBeUndefined();
  });

  it('refuse un mauvais emplacement ou une autre tranche', () => {
    expect(() => equipItem(base, 1, 'i4', 'coiffe')).toThrow();
    expect(() => equipItem(base, 2, 'i4')).toThrow();
  });

  it('additionne les bonus, compare et nettoie au retrait', () => {
    let inv = equipItem(base, 1, 'i4');
    expect(equipmentBonus(inv, 1).hp).toBe(34);
    expect(compareWithEquipped(inv, 1, 'i2').masteries.fire).toBe(6);
    inv = unequipSlot(inv, 1, 'plastron');
    expect(equipmentBonus(inv, 1).hp).toBe(0);
    inv = removeItems(equipItem(inv, 1, 'i4'), ['i4']);
    expect(inv.items).toHaveLength(3);
    expect(inv.loadouts[1].plastron).toBeUndefined();
  });
});

describe('équipement en combat', () => {
  it('applique PV, PA, PM et maîtrises, et le replay reste valide', () => {
    const inv = equipItem(equipItem(base(), 1, 'i1'), 1, 'i2');
    const equipment = equipmentBonus(inv, 1);
    const config: RunConfig = { dungeonId: 'bosquet_des_ronces', difficulty: 1, deck: DECK, equipment };
    const run = createRun(config);
    const p = getPlayer(run);
    expect(p.maxHp).toBe(150 + 34 + 5);
    expect(run.player.masteries.fire).toBe(6);
    const after = replayRun(config, [{ type: 'endTurn' }]);
    expect(after.turn).toBeGreaterThan(run.turn);
    expect(verifyRun(config, [], 0).valid).toBe(false);
  });

  function base() {
    return addItems(createInventory(), [
      { itemId: 'plastron_ecorce', rarity: 'mythic' },
      { itemId: 'anneau_ronce', rarity: 'rare' },
    ]).inventory;
  }
});
