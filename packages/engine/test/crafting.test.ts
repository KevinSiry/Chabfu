import { describe, expect, it } from 'vitest';
import {
  CRAFTABLE_ITEMS,
  DUNGEONS,
  ITEMS,
  RECIPES,
  RESOURCES,
  RESOURCE_TIERS,
  addResources,
  canCraft,
  craft,
  createCraftingState,
  createInventory,
  equipItem,
  getRecipe,
  masteryLevel,
  receiveLoot,
  recycleItems,
  rollResourceDrops,
  runSeed,
  setAutoRecycle,
  type CraftingState,
} from '../src/index.js';

const D = 'bosquet_des_ronces';

function rich(): CraftingState {
  const all: Record<string, number> = {};
  for (const r of RESOURCES) all[r.id] = 100;
  return { ...addResources(createCraftingState(), all), shards: { 1: 100 } };
}

describe('ressources par donjon', () => {
  it('chaque donjon a des ressources de chaque palier, cohérentes avec leur difficulté de référence', () => {
    for (const d of DUNGEONS) {
      const tiers = new Set(RESOURCES.filter((r) => r.dungeonId === d.id).map((r) => r.tier));
      expect([...tiers].sort()).toEqual(['common', 'mythic', 'rare', 'ultimate']);
    }
    for (const r of RESOURCES) {
      const t = RESOURCE_TIERS[r.tier];
      expect(r.refDifficulty).toBeGreaterThanOrEqual(t.minRef);
      expect(r.refDifficulty).toBeLessThanOrEqual(t.maxRef);
    }
  });

  it('applique la règle de drop : rien sous réf. − 1, garanti au-dessus', () => {
    const d1 = rollResourceDrops(D, 1, 42);
    expect(d1.epine_de_ronceau).toBe(3);
    expect(d1.seve_racineuse).toBeUndefined();
    expect(d1.ecorce_du_gardien).toBeUndefined();
    // Difficulté 4 : la sève (réf. 4) tombe au moins une fois, l'épine tombe davantage (+25 %/palier).
    const d4 = rollResourceDrops(D, 4, 42);
    expect(d4.seve_racineuse).toBeGreaterThanOrEqual(1);
    expect(d4.epine_de_ronceau).toBeGreaterThanOrEqual(5);
    expect(d4.coeur_de_racine).toBeUndefined();
  });

  it('est reproductible à graine égale', () => {
    const seed = runSeed({ dungeonId: D, difficulty: 6, deck: ['a'] }, [{ type: 'endTurn' }]);
    expect(rollResourceDrops(D, 6, seed)).toEqual(rollResourceDrops(D, 6, seed));
    expect(runSeed({ dungeonId: D, difficulty: 6, deck: ['a'] }, [])).not.toBe(seed);
  });
});

describe('craft', () => {
  it('propose une recette par objet du donjon et par rareté, de Commune à Mythique', () => {
    expect(CRAFTABLE_ITEMS.length).toBe(ITEMS.filter((i) => i.tranche === 1).length);
    expect(RECIPES.length).toBe(CRAFTABLE_ITEMS.length * 4);
    expect(RECIPES.some((r) => (r.rarity as string) === 'legendary')).toBe(false);
  });

  it('chaque objet est fabriqué avec les ressources de son propre donjon', () => {
    for (const r of RECIPES) {
      for (const id of Object.keys(r.resources)) expect(RESOURCES.find((x) => x.id === id)!.dungeonId).toBe(r.dungeonId);
    }
    expect(new Set(RECIPES.map((r) => r.dungeonId)).size).toBe(DUNGEONS.length);
  });

  it('les recettes Rare et Mythique demandent les ressources du palier correspondant', () => {
    const tierOf = (id: string) => RESOURCES.find((r) => r.id === id)!.tier;
    expect(Object.keys(getRecipe('arc_racineux:common').resources).map(tierOf)).toEqual(['common']);
    expect(Object.keys(getRecipe('arc_racineux:rare').resources).map(tierOf)).toContain('rare');
    expect(Object.keys(getRecipe('arc_racineux:mythic').resources).map(tierOf)).toContain('mythic');
  });

  it('consomme les ingrédients et produit un objet de rareté fixe', () => {
    const state = rich();
    const recipe = getRecipe('cape_feuilles:rare');
    const res = craft(createInventory(), state, recipe.id);
    expect(res.item).toMatchObject({ itemId: 'cape_feuilles', rarity: 'rare' });
    expect(res.inventory.items).toHaveLength(1);
    for (const [id, n] of Object.entries(recipe.resources)) expect(res.crafting.resources[id]).toBe(100 - n);
    expect(res.crafting.shards[1]).toBe(100 - recipe.shards);
    expect(state.resources.epine_de_ronceau).toBe(100); // l'ancien état n'est pas modifié
  });

  it('refuse un craft sans les ingrédients', () => {
    const state = createCraftingState();
    expect(canCraft(state, getRecipe('arc_racineux:common'))).toBe(false);
    expect(() => craft(createInventory(), state, 'arc_racineux:common')).toThrow();
  });
});

describe('recyclage', () => {
  it('rend des éclats de la tranche selon la rareté et fait progresser la maîtrise', () => {
    let state = rich();
    let inv = createInventory();
    ({ inventory: inv, crafting: state } = craft(inv, state, 'arc_racineux:common'));
    ({ inventory: inv, crafting: state } = craft(inv, state, 'arc_racineux:mythic'));
    const before = state.shards[1];
    const res = recycleItems(inv, state, inv.items.map((i) => i.uid));
    expect(res.shardsGained).toEqual({ 1: 21 });
    expect(res.crafting.shards[1]).toBe(before + 21);
    expect(res.inventory.items).toHaveLength(0);
    expect(res.crafting.recycled.arc_racineux).toBe(2);
  });

  it('ne recycle jamais un objet équipé', () => {
    const { inventory, crafting } = craft(createInventory(), rich(), 'arc_racineux:common');
    const equipped = equipItem(inventory, 1, inventory.items[0].uid);
    const res = recycleItems(equipped, crafting, [inventory.items[0].uid]);
    expect(res.inventory.items).toHaveLength(1);
    expect(res.recycled).toHaveLength(0);
  });

  it('recycle d’office le butin sous la rareté choisie', () => {
    const state = setAutoRecycle(createCraftingState(), 'rare');
    const res = receiveLoot(createInventory(), state, [
      { itemId: 'cape_feuilles', rarity: 'common' },
      { itemId: 'cape_feuilles', rarity: 'uncommon' },
      { itemId: 'cape_feuilles', rarity: 'rare' },
    ]);
    expect(res.kept.map((i) => i.rarity)).toEqual(['rare']);
    expect(res.inventory.items).toHaveLength(1);
    expect(res.crafting.shards[1]).toBe(4);
  });

  it('sans recyclage automatique, garde tout', () => {
    const res = receiveLoot(createInventory(), createCraftingState(), [{ itemId: 'cape_feuilles', rarity: 'common' }]);
    expect(res.inventory.items).toHaveLength(1);
    expect(res.recycled).toHaveLength(0);
  });

  it('paliers de maîtrise', () => {
    expect(masteryLevel(0)).toBe(0);
    expect(masteryLevel(3)).toBe(1);
    expect(masteryLevel(50)).toBe(4);
  });
});
