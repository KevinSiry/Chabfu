/**
 * Craft, ressources de fin de run et recyclage (GDD sections 7 et 8).
 * Les objets vivent dans l'`Inventory` de `equipment.ts` ; ressources, éclats et maîtrise vivent dans `CraftingState`.
 * Fonctions pures : chaque opération renvoie de nouveaux états, sans modifier les anciens.
 */
import { getItem } from './data/items.js';
import { getRecipe, type Recipe } from './data/recipes.js';
import { dungeonResources } from './data/resources.js';
import { addItems, RARITY_ORDER, removeItems, SLOTS, type Inventory, type ItemInstance, type LootDrop } from './equipment.js';
import { dropRate, seededRandom, type Rarity } from './loot.js';
import type { Action, RunConfig } from './types.js';

export interface CraftingState {
  /** Ressources par id. */
  resources: Record<string, number>;
  /** Éclats par tranche : ils restent propres à leur tranche. */
  shards: Record<number, number>;
  /** Exemplaires recyclés par objet (maîtrise d'objet). */
  recycled: Record<string, number>;
  /** Recyclage automatique des objets reçus strictement en dessous de cette rareté (null : désactivé). */
  autoRecycleBelow: Rarity | null;
}

export function createCraftingState(): CraftingState {
  return { resources: {}, shards: {}, recycled: {}, autoRecycleBelow: null };
}

// ---------------------------------------------------------------------------
// Ressources de fin de run
// ---------------------------------------------------------------------------

/** Graine reproductible d'un run (hash FNV-1a de la config et des actions) : le serveur peut refaire le tirage. */
export function runSeed(config: RunConfig, actions: Action[]): number {
  const text = JSON.stringify({ d: config.dungeonId, n: config.difficulty, k: config.deck, a: actions });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Ressources gagnées en terminant un donjon à une difficulté donnée.
 * Quantité moyenne = dropRate(baseRate, réf., difficulté) : partie entière garantie, partie décimale tirée au sort.
 */
export function rollResourceDrops(dungeonId: string, difficulty: number, seed: number): Record<string, number> {
  const rand = seededRandom(seed);
  const out: Record<string, number> = {};
  for (const r of dungeonResources(dungeonId)) {
    const expected = dropRate(r.baseRate, r.refDifficulty, difficulty);
    const qty = Math.floor(expected) + (rand() < expected - Math.floor(expected) ? 1 : 0);
    if (qty > 0) out[r.id] = qty;
  }
  return out;
}

export function addResources(state: CraftingState, gains: Record<string, number>): CraftingState {
  const resources = { ...state.resources };
  for (const [id, n] of Object.entries(gains)) resources[id] = (resources[id] ?? 0) + n;
  return { ...state, resources };
}

// ---------------------------------------------------------------------------
// Craft
// ---------------------------------------------------------------------------

/** Ce qui manque pour une recette (rien si le craft est possible). */
export function missingForRecipe(state: CraftingState, recipe: Recipe): { resources: Record<string, number>; shards: number } {
  const resources: Record<string, number> = {};
  for (const [id, n] of Object.entries(recipe.resources)) {
    const have = state.resources[id] ?? 0;
    if (have < n) resources[id] = n - have;
  }
  const shards = Math.max(0, recipe.shards - (state.shards[recipe.tranche] ?? 0));
  return { resources, shards };
}

export function canCraft(state: CraftingState, recipe: Recipe): boolean {
  const m = missingForRecipe(state, recipe);
  return m.shards === 0 && Object.keys(m.resources).length === 0;
}

/** Fabrique l'objet d'une recette. Sa rareté est celle de la recette, fixée pour toujours. */
export function craft(
  inventory: Inventory,
  state: CraftingState,
  recipeId: string,
): { inventory: Inventory; crafting: CraftingState; item: ItemInstance } {
  const recipe = getRecipe(recipeId);
  if (!canCraft(state, recipe)) throw new Error(`Ingrédients insuffisants pour ${recipeId}`);
  const resources = { ...state.resources };
  for (const [id, n] of Object.entries(recipe.resources)) resources[id] -= n;
  const shards = { ...state.shards };
  if (recipe.shards > 0) shards[recipe.tranche] -= recipe.shards;
  const { inventory: next, added } = addItems(inventory, [{ itemId: recipe.itemId, rarity: recipe.rarity }]);
  return { inventory: next, crafting: { ...state, resources, shards }, item: added[0] };
}

// ---------------------------------------------------------------------------
// Recyclage en éclats et maîtrise d'objet
// ---------------------------------------------------------------------------

/** Éclats rendus par le recyclage d'un objet, selon sa rareté. */
export const SHARDS_BY_RARITY: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 5, mythic: 12, legendary: 30 };

/** Exemplaires recyclés nécessaires pour chaque palier de maîtrise (bonus de farm uniquement, jamais de puissance). */
export const MASTERY_THRESHOLDS = [3, 10, 25, 50];

export function masteryLevel(recycledCount: number): number {
  return MASTERY_THRESHOLDS.filter((t) => recycledCount >= t).length;
}

/** L'objet est-il porté dans un loadout, quelle que soit la tranche ? */
export function isEquipped(inventory: Inventory, uid: string): boolean {
  return Object.values(inventory.loadouts).some((l) => SLOTS.some((s) => l[s.id] === uid));
}

export interface RecycleResult {
  inventory: Inventory;
  crafting: CraftingState;
  /** Éclats gagnés par tranche. */
  shardsGained: Record<number, number>;
  recycled: ItemInstance[];
}

/**
 * Détruit des objets contre des éclats de leur tranche.
 * Les objets équipés et les uid inconnus sont ignorés : on ne détruit jamais ce que le joueur porte.
 */
export function recycleItems(inventory: Inventory, state: CraftingState, uids: string[]): RecycleResult {
  const wanted = new Set(uids);
  const recycled = inventory.items.filter((it) => wanted.has(it.uid) && !isEquipped(inventory, it.uid));
  const shards = { ...state.shards };
  const counts = { ...state.recycled };
  const shardsGained: Record<number, number> = {};
  for (const it of recycled) {
    const tranche = getItem(it.itemId).tranche;
    const n = SHARDS_BY_RARITY[it.rarity];
    shards[tranche] = (shards[tranche] ?? 0) + n;
    shardsGained[tranche] = (shardsGained[tranche] ?? 0) + n;
    counts[it.itemId] = (counts[it.itemId] ?? 0) + 1;
  }
  return {
    inventory: removeItems(inventory, recycled.map((it) => it.uid)),
    crafting: { ...state, shards, recycled: counts },
    shardsGained,
    recycled,
  };
}

export function setAutoRecycle(state: CraftingState, below: Rarity | null): CraftingState {
  return { ...state, autoRecycleBelow: below };
}

/** Faut-il recycler d'office un objet reçu de cette rareté ? */
export function shouldAutoRecycle(state: CraftingState, rarity: Rarity): boolean {
  return state.autoRecycleBelow !== null && RARITY_ORDER.indexOf(rarity) < RARITY_ORDER.indexOf(state.autoRecycleBelow);
}

/**
 * Ajoute le butin d'un run à l'inventaire. Les objets sous la rareté de recyclage automatique
 * sont recyclés aussitôt en éclats.
 */
export function receiveLoot(inventory: Inventory, state: CraftingState, drops: LootDrop[]): RecycleResult & { kept: ItemInstance[] } {
  const { inventory: withNew, added } = addItems(inventory, drops);
  const toRecycle = added.filter((it) => shouldAutoRecycle(state, it.rarity)).map((it) => it.uid);
  const res = recycleItems(withNew, state, toRecycle);
  const gone = new Set(toRecycle);
  return { ...res, kept: added.filter((it) => !gone.has(it.uid)) };
}
