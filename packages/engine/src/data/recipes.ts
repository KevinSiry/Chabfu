/**
 * Recettes de craft (GDD section 8, « Obtention »).
 * Chaque recette produit un objet d'une rareté fixe, de Commune à Mythique.
 * Les recettes de haute rareté demandent les ressources des paliers de difficulté correspondants.
 */
import type { Rarity } from '../loot.js';
import { BOSS_DROP_TABLES, getItem, type ItemDef } from './items.js';
import { dungeonResources, type ResourceDef, type ResourceTier } from './resources.js';

/** Objets craftables : tous les objets d'un donjon (ceux de la table de son boss), fabriqués avec ses ressources. */
export interface CraftableItem {
  item: ItemDef;
  dungeonId: string;
}

export const CRAFTABLE_ITEMS: CraftableItem[] = Object.entries(BOSS_DROP_TABLES).flatMap(([dungeonId, table]) =>
  table.map((e) => ({ item: getItem(e.itemId), dungeonId })),
);

export type CraftRarity = Exclude<Rarity, 'legendary'>;
export const CRAFT_RARITIES: CraftRarity[] = ['common', 'uncommon', 'rare', 'mythic'];

export interface Recipe {
  id: string;
  itemId: string;
  /** Donjon dont les ressources servent à la recette. */
  dungeonId: string;
  tranche: number;
  rarity: CraftRarity;
  resources: Record<string, number>;
  /** Éclats de la tranche de l'objet. */
  shards: number;
}

/**
 * Coût par rareté, exprimé en paliers de ressources du donjon :
 * [palier, rang de la ressource dans le palier, quantité].
 */
const COSTS: Record<CraftRarity, { parts: [ResourceTier, number, number][]; shards: number }> = {
  common: { parts: [['common', 0, 5]], shards: 0 },
  uncommon: { parts: [['common', 0, 8], ['common', 1, 4]], shards: 3 },
  rare: { parts: [['common', 0, 6], ['common', 1, 6], ['rare', 0, 4]], shards: 10 },
  mythic: { parts: [['rare', 0, 6], ['mythic', 0, 4]], shards: 30 },
};

function pick(res: ResourceDef[], tier: ResourceTier, rank: number): ResourceDef | undefined {
  const ofTier = res.filter((r) => r.tier === tier);
  return ofTier[Math.min(rank, ofTier.length - 1)];
}

function buildRecipes(): Recipe[] {
  const out: Recipe[] = [];
  for (const { item, dungeonId } of CRAFTABLE_ITEMS) {
    const res = dungeonResources(dungeonId);
    for (const rarity of CRAFT_RARITIES) {
      const cost = COSTS[rarity];
      const resources: Record<string, number> = {};
      let ok = true;
      for (const [tier, rank, qty] of cost.parts) {
        const r = pick(res, tier, rank);
        if (!r) {
          ok = false;
          break;
        }
        resources[r.id] = (resources[r.id] ?? 0) + qty;
      }
      if (ok) out.push({ id: `${item.id}:${rarity}`, itemId: item.id, dungeonId, tranche: item.tranche, rarity, resources, shards: cost.shards });
    }
  }
  return out;
}

export const RECIPES: Recipe[] = buildRecipes();

const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: string): Recipe {
  const r = RECIPE_BY_ID.get(id);
  if (!r) throw new Error(`Recette inconnue : ${id}`);
  return r;
}

export function recipesForTranche(tranche: number): Recipe[] {
  return RECIPES.filter((r) => r.tranche === tranche);
}
