import {
  addItems,
  createInventory,
  equipmentBonus,
  getDungeon,
  rollBossLoot,
  type Inventory,
  type ItemInstance,
  type RunConfig,
} from '@chabfu/engine';

/** Sauvegarde locale de l'inventaire et des loadouts, séparée de la sauvegarde des scores. */
const INVENTORY_KEY = 'chabfu.inventory.v1';

function load(): Inventory {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) return createInventory();
    const parsed = JSON.parse(raw) as Inventory;
    return { ...createInventory(), ...parsed };
  } catch {
    return createInventory();
  }
}

let inventory = load();

export function getInventory(): Inventory {
  return inventory;
}

export function setInventory(next: Inventory): void {
  inventory = next;
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
  } catch {
    /* stockage indisponible : l'inventaire vit le temps de la session */
  }
}

/** Ajoute au run les bonus de l'équipement porté sur la tranche du donjon. */
export function withEquipment(config: RunConfig): RunConfig {
  const tranche = getDungeon(config.dungeonId).tranche;
  return { ...config, equipment: equipmentBonus(inventory, tranche) };
}

/**
 * Tire le butin du boss après une victoire validée et l'ajoute à l'inventaire.
 * Le tirage se fait hors combat : le combat, lui, reste sans aléatoire.
 */
export function grantBossLoot(config: RunConfig): ItemInstance[] {
  const seed = Math.floor(Math.random() * 2 ** 32);
  const drops = rollBossLoot(config.dungeonId, config.difficulty, seed);
  const { inventory: next, added } = addItems(inventory, drops);
  setInventory(next);
  return added;
}
