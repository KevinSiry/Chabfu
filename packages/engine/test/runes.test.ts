import { describe, expect, it } from 'vitest';
import {
  ALL_RUNE_KEYS,
  ITEMS,
  RUNE_FUSION,
  RESOURCES,
  addItems,
  addResources,
  addRunes,
  breakItems,
  breakResult,
  canFuse,
  createCraftingState,
  createInventory,
  normalizeRuneSave,
  equipItem,
  equipmentBonus,
  fuseRunes,
  fusionCost,
  instanceStats,
  itemStats,
  rollRuneDrops,
  runeAffinity,
  runeStock,
  socketError,
  socketRune,
  unsocketRune,
  type CraftingState,
  type Inventory,
} from '../src/index.js';

function setup(rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'legendary' = 'mythic'): { inv: Inventory; st: CraftingState; uid: string } {
  const { inventory, added } = addItems(createInventory(), [{ itemId: 'arc_racineux', rarity }]);
  const st = addRunes({ ...createCraftingState(), shards: { 1: 100 } }, ['braise:parfaite', 'braise:parfaite', 'seve:brute', 'mire:parfaite', 'mire:parfaite']);
  return { inv: inventory, st, uid: added[0].uid };
}

describe('runes', () => {
  it('liste des runes : Pointe sans Brute, Mire et Focus en Parfaite seulement', () => {
    expect(ALL_RUNE_KEYS).toContain('pointe:taillee');
    expect(ALL_RUNE_KEYS).not.toContain('pointe:brute');
    expect(ALL_RUNE_KEYS.filter((k) => k.startsWith('mire:'))).toEqual(['mire:parfaite']);
  });

  it('sertir ajoute la stat à l’objet et la retire du stock', () => {
    const { inv, st, uid } = setup();
    const r = socketRune(inv, st, uid, 0, 'braise:parfaite');
    expect(runeStock(r.crafting, 'braise:parfaite')).toBe(1);
    const item = r.inventory.items[0];
    expect(instanceStats(item).masteries.fire).toBe(itemStats('arc_racineux', 'mythic').masteries.fire + 3);
    const worn = equipItem(r.inventory, 1, uid);
    expect(equipmentBonus(worn, 1).masteries.fire).toBe(itemStats('arc_racineux', 'mythic').masteries.fire + 3);
  });

  it('emplacements selon la rareté : aucun en Commune', () => {
    const c = setup('common');
    expect(socketError(c.inv, c.st, c.uid, 0, 'braise:parfaite')).not.toBeNull();
    const m = setup('mythic');
    expect(socketError(m.inv, m.st, m.uid, 1, 'braise:parfaite')).toBeNull();
    expect(socketError(m.inv, m.st, m.uid, 2, 'braise:parfaite')).not.toBeNull();
  });

  it('remplacer détruit l’ancienne rune ; une seule Mire par objet', () => {
    const { inv, st, uid } = setup();
    const a = socketRune(inv, st, uid, 0, 'seve:brute');
    const b = socketRune(a.inventory, a.crafting, uid, 0, 'braise:parfaite');
    expect(b.destroyed).toBe('seve:brute');
    expect(runeStock(b.crafting, 'seve:brute')).toBe(0);
    const c = socketRune(b.inventory, b.crafting, uid, 1, 'mire:parfaite');
    expect(socketError(c.inventory, c.crafting, uid, 0, 'mire:parfaite')).toMatch(/une seule/);
  });

  it('une Mire ne compte qu’une fois sur tout l’équipement', () => {
    const { inventory, added } = addItems(createInventory(), [
      { itemId: 'arc_racineux', rarity: 'mythic' },
      { itemId: 'coiffe_lierre', rarity: 'mythic' },
    ]);
    let st = addRunes(createCraftingState(), ['mire:parfaite', 'mire:parfaite']);
    let inv = inventory;
    for (const it of added) {
      const r = socketRune(inv, st, it.uid, 0, 'mire:parfaite');
      inv = equipItem(r.inventory, 1, it.uid);
      st = r.crafting;
    }
    expect(equipmentBonus(inv, 1).range).toBe(itemStats('arc_racineux', 'mythic').range + itemStats('coiffe_lierre', 'mythic').range + 1);
  });

  it('extraire coûte des éclats et rend la rune ; retirer sans payer la détruit', () => {
    const { inv, st, uid } = setup();
    const a = socketRune(inv, st, uid, 0, 'braise:parfaite');
    const ex = unsocketRune(a.inventory, a.crafting, uid, 0, true);
    expect(ex.crafting.shards[1]).toBe(60);
    expect(runeStock(ex.crafting, 'braise:parfaite')).toBe(2);
    const gone = unsocketRune(a.inventory, a.crafting, uid, 0, false);
    expect(runeStock(gone.crafting, 'braise:parfaite')).toBe(1);
    expect(gone.inventory.items[0].runes).toEqual([null, null]);
  });

  it('fusion : 3 runes + éclats + ressource de palier donnent le niveau au-dessus', () => {
    const mythicRes = RESOURCES.find((r) => r.tier === 'mythic')!;
    let st = addRunes({ ...createCraftingState(), shards: { 1: 25 } }, ['braise:brute', 'braise:brute', 'braise:brute']);
    const cost = fusionCost('braise', 'taillee')!;
    expect(canFuse(st, cost)).toBe(false);
    st = addResources(st, { [mythicRes.id]: 2 });
    expect(canFuse(st, cost)).toBe(true);
    const next = fuseRunes(st, 'braise', 'taillee');
    expect(runeStock(next, 'braise:brute')).toBe(0);
    expect(runeStock(next, 'braise:taillee')).toBe(1);
    expect(next.shards[1]).toBe(25 - RUNE_FUSION.taillee.shards);
    expect(next.resources[mythicRes.id]).toBe(2 - RUNE_FUSION.taillee.resources);
    expect(fusionCost('mire', 'parfaite')).toBeNull();
    expect(fusionCost('pointe', 'taillee')).toBeNull();
  });

  it('briser : Rare ou mieux seulement, donne une rune de la stat principale, pas d’éclats', () => {
    expect(breakResult({ itemId: 'arc_racineux', rarity: 'uncommon' })).toBeNull();
    expect(breakResult({ itemId: 'arc_racineux', rarity: 'rare' })).toBe('braise:brute');
    expect(breakResult({ itemId: 'plastron_ecorce', rarity: 'legendary' })).toBe('seve:parfaite');
    const { inventory, added } = addItems(createInventory(), [
      { itemId: 'arc_roseau', rarity: 'mythic' },
      { itemId: 'arc_roseau', rarity: 'common' },
      { itemId: 'arc_racineux', rarity: 'rare' },
    ]);
    const worn = equipItem(inventory, 1, added[2].uid);
    const r = breakItems(worn, createCraftingState(), added.map((a) => a.uid));
    expect(r.gained).toEqual(['rafale:taillee']);
    expect(r.inventory.items).toHaveLength(2);
    expect(r.crafting.shards[1] ?? 0).toBe(0);
    expect(r.crafting.recycled.arc_roseau).toBe(1);
  });

  it('les anciennes runes de Focus deviennent des runes d’Horizon', () => {
    const { inventory } = addItems(createInventory(), [{ itemId: 'arc_racineux', rarity: 'mythic' }]);
    const inv = { ...inventory, items: [{ ...inventory.items[0], runes: ['focus:parfaite' as never, null] }] };
    const st = { ...createCraftingState(), runes: { 'focus:parfaite': 2, 'braise:brute': 1 } };
    const n = normalizeRuneSave(st, inv);
    expect(n.crafting.runes).toEqual({ 'horizon:parfaite': 2, 'braise:brute': 1 });
    expect(n.inventory.items[0].runes).toEqual(['horizon:parfaite', null]);
    expect(instanceStats(n.inventory.items[0]).horizon).toBe(1);
  });

  it('chaque objet a une rune liée qui existe en Brute', () => {
    for (const it of ITEMS) expect(['braise', 'maree', 'racine', 'rafale', 'seve', 'rempart']).toContain(runeAffinity(it.id));
  });

  it('runes du boss : rien sous la D3, rares et reproductibles', () => {
    for (let s = 0; s < 200; s++) expect(rollRuneDrops(2, s)).toEqual([]);
    expect(rollRuneDrops(8, 42)).toEqual(rollRuneDrops(8, 42));
    let n = 0;
    for (let s = 0; s < 5000; s++) n += rollRuneDrops(5, s).length;
    expect(n / 5000).toBeGreaterThan(0.04);
    expect(n / 5000).toBeLessThan(0.12);
    let parfaite = 0;
    for (let s = 0; s < 5000; s++) parfaite += rollRuneDrops(7, s).filter((k) => k.endsWith(':parfaite')).length;
    expect(parfaite / 5000).toBeLessThan(0.01);
  });
});
