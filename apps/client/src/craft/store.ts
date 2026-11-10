import {
  createCraftingState,
  getDungeon,
  receiveLoot,
  rollBossLoot,
  rollResourceDrops,
  runSeed,
  addResources,
  addRunes,
  rollRuneDrops,
  type RuneKey,
  type Action,
  type CraftingState,
  type ItemInstance,
  type RunConfig,
} from '@chabfu/engine';
import { getInventory, setInventory } from '../stuff/store';

/** Sauvegarde locale des ressources, éclats, maîtrises et du réglage de recyclage automatique. */
const CRAFTING_KEY = 'chabfu.crafting.v1';

function load(): CraftingState {
  try {
    const raw = localStorage.getItem(CRAFTING_KEY);
    return raw ? { ...createCraftingState(), ...(JSON.parse(raw) as CraftingState) } : createCraftingState();
  } catch {
    return createCraftingState();
  }
}

let crafting = load();

export function getCrafting(): CraftingState {
  return crafting;
}

export function setCrafting(next: CraftingState): void {
  crafting = next;
  try {
    localStorage.setItem(CRAFTING_KEY, JSON.stringify(crafting));
  } catch {
    /* stockage indisponible : l'état vit le temps de la session */
  }
}

export interface RunRewards {
  /** Objets gardés dans le sac. */
  kept: ItemInstance[];
  /** Objets recyclés d'office (rareté sous le seuil choisi). */
  autoRecycled: ItemInstance[];
  shardsGained: Record<number, number>;
  resources: Record<string, number>;
  /** Runes trouvées sur le boss. */
  runes: RuneKey[];
  trancheId: number;
}

/**
 * Récompenses d'une victoire validée : butin du boss (avec recyclage automatique) et ressources du donjon.
 * Les ressources sont tirées avec la graine du run : le serveur pourra refaire exactement le même tirage.
 */
export function grantRunRewards(config: RunConfig, actions: Action[]): RunRewards {
  const trancheId = getDungeon(config.dungeonId).tranche;
  const drops = rollBossLoot(config.dungeonId, config.difficulty, Math.floor(Math.random() * 2 ** 32));
  const res = receiveLoot(getInventory(), crafting, drops);
  const seed = runSeed(config, actions);
  const resources = rollResourceDrops(config.dungeonId, config.difficulty, seed);
  const runes = rollRuneDrops(config.difficulty, seed);
  setInventory(res.inventory);
  setCrafting(addRunes(addResources(res.crafting, resources), runes));
  return { kept: res.kept, autoRecycled: res.recycled, shardsGained: res.shardsGained, resources, runes, trancheId };
}
