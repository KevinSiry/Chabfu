/**
 * Stuff (GDD section 8) : objets, raretés, inventaire, loadout par tranche et tirage du butin du boss.
 * Tout est pur. Le tirage du butin se fait hors combat avec une graine, pour pouvoir être refait côté serveur.
 */
import { getItem, getBossDropTable, type ItemDef, type ItemKind, type ItemStats } from './data/items.js';
import { RARITIES, dropRate, seededRandom, type Rarity } from './loot.js';
import type { Element } from './types.js';

export type SlotId = 'arc' | 'carquois' | 'coiffe' | 'cape' | 'plastron' | 'bottes' | 'amulette' | 'anneau1' | 'anneau2';

export const SLOTS: { id: SlotId; label: string; kind: ItemKind }[] = [
  { id: 'arc', label: 'Arc', kind: 'arc' },
  { id: 'carquois', label: 'Carquois', kind: 'carquois' },
  { id: 'coiffe', label: 'Coiffe', kind: 'coiffe' },
  { id: 'cape', label: 'Cape', kind: 'cape' },
  { id: 'plastron', label: 'Plastron', kind: 'plastron' },
  { id: 'bottes', label: 'Bottes', kind: 'bottes' },
  { id: 'amulette', label: 'Amulette', kind: 'amulette' },
  { id: 'anneau1', label: 'Anneau 1', kind: 'anneau' },
  { id: 'anneau2', label: 'Anneau 2', kind: 'anneau' },
];

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'mythic', 'legendary'];

/** Difficulté minimale pour qu'un drop puisse être Légendaire. */
export const LEGENDARY_MIN_DIFFICULTY = 6;

export interface ItemInstance {
  uid: string;
  itemId: string;
  rarity: Rarity;
}

export interface LootDrop {
  itemId: string;
  rarity: Rarity;
}

/** Bonus totaux de l'équipement, injectés dans `RunConfig.equipment`. */
export interface EquipmentBonus {
  hp: number;
  pa: number;
  pm: number;
  masteries: Record<Element, number>;
}

export type Loadout = Partial<Record<SlotId, string>>;

export interface Inventory {
  items: ItemInstance[];
  /** Un loadout par tranche (clé = numéro de tranche). */
  loadouts: Record<number, Loadout>;
  nextId: number;
}

// ---------------------------------------------------------------------------
// Caractéristiques
// ---------------------------------------------------------------------------

const STAT_ELEMENTS: Element[] = ['fire', 'water', 'earth', 'air', 'neutral'];

export function emptyBonus(): EquipmentBonus {
  return { hp: 0, pa: 0, pm: 0, masteries: { fire: 0, water: 0, earth: 0, air: 0, neutral: 0 } };
}

/** Caractéristiques d'un objet dans une rareté donnée. */
export function itemStats(itemId: string, rarity: Rarity): EquipmentBonus {
  const def = getItem(itemId);
  const power = RARITIES[rarity].power;
  const b = emptyBonus();
  b.hp = Math.round((def.stats.hp ?? 0) * power);
  b.pa = def.stats.pa ?? 0;
  b.pm = def.stats.pm ?? 0;
  for (const e of STAT_ELEMENTS) b.masteries[e] = Math.round((def.stats.masteries?.[e] ?? 0) * power);
  return b;
}

export function addBonus(a: EquipmentBonus, b: EquipmentBonus): EquipmentBonus {
  const r = emptyBonus();
  r.hp = a.hp + b.hp;
  r.pa = a.pa + b.pa;
  r.pm = a.pm + b.pm;
  for (const e of STAT_ELEMENTS) r.masteries[e] = a.masteries[e] + b.masteries[e];
  return r;
}

export function subBonus(a: EquipmentBonus, b: EquipmentBonus): EquipmentBonus {
  const neg = emptyBonus();
  neg.hp = -b.hp;
  neg.pa = -b.pa;
  neg.pm = -b.pm;
  for (const e of STAT_ELEMENTS) neg.masteries[e] = -b.masteries[e];
  return addBonus(a, neg);
}

/** Lignes lisibles d'un bonus (« +12 PV », « +6 % Feu »…), pour l'affichage. */
export function describeBonus(b: EquipmentBonus, labels: Record<Element, string>, signed = true): string[] {
  const fmt = (v: number) => (signed && v > 0 ? `+${v}` : `${v}`);
  const lines: string[] = [];
  if (b.hp) lines.push(`${fmt(b.hp)} PV`);
  if (b.pa) lines.push(`${fmt(b.pa)} PA`);
  if (b.pm) lines.push(`${fmt(b.pm)} PM`);
  for (const e of STAT_ELEMENTS) if (b.masteries[e]) lines.push(`${fmt(b.masteries[e])} % ${labels[e]}`);
  return lines;
}

// ---------------------------------------------------------------------------
// Inventaire et loadouts
// ---------------------------------------------------------------------------

export function createInventory(): Inventory {
  return { items: [], loadouts: {}, nextId: 1 };
}

export function addItems(inv: Inventory, drops: LootDrop[]): { inventory: Inventory; added: ItemInstance[] } {
  let nextId = inv.nextId;
  const added = drops.map((d) => ({ uid: `i${nextId++}`, itemId: d.itemId, rarity: d.rarity }));
  return { inventory: { ...inv, items: [...inv.items, ...added], nextId }, added };
}

export function slotsForKind(kind: ItemKind): SlotId[] {
  return SLOTS.filter((s) => s.kind === kind).map((s) => s.id);
}

export function findItem(inv: Inventory, uid: string): ItemInstance | undefined {
  return inv.items.find((i) => i.uid === uid);
}

export function getLoadout(inv: Inventory, trancheId: number): Loadout {
  return inv.loadouts[trancheId] ?? {};
}

/** Emplacement où se trouve l'objet dans le loadout de la tranche, ou undefined. */
export function equippedSlotOf(inv: Inventory, trancheId: number, uid: string): SlotId | undefined {
  const l = getLoadout(inv, trancheId);
  return SLOTS.find((s) => l[s.id] === uid)?.id;
}

/**
 * Équipe un objet. Sans emplacement précisé, prend le premier emplacement libre de sa famille
 * (sinon le premier). L'objet doit appartenir à la tranche du loadout.
 */
export function equipItem(inv: Inventory, trancheId: number, uid: string, slot?: SlotId): Inventory {
  const item = findItem(inv, uid);
  if (!item) throw new Error(`Objet absent de l’inventaire : ${uid}`);
  const def = getItem(item.itemId);
  if (def.tranche !== trancheId) throw new Error(`${def.name} appartient à la tranche T${def.tranche}.`);
  const allowed = slotsForKind(def.kind);
  const current = { ...getLoadout(inv, trancheId) };
  for (const s of SLOTS) if (current[s.id] === uid) delete current[s.id];
  const target = slot ?? allowed.find((s) => !current[s]) ?? allowed[0];
  if (!allowed.includes(target)) throw new Error(`${def.name} ne va pas dans l’emplacement ${target}.`);
  current[target] = uid;
  return { ...inv, loadouts: { ...inv.loadouts, [trancheId]: current } };
}

export function unequipSlot(inv: Inventory, trancheId: number, slot: SlotId): Inventory {
  const current = { ...getLoadout(inv, trancheId) };
  delete current[slot];
  return { ...inv, loadouts: { ...inv.loadouts, [trancheId]: current } };
}

/** Retire des objets de l'inventaire (et de tous les loadouts). Utile au recyclage. */
export function removeItems(inv: Inventory, uids: string[]): Inventory {
  const gone = new Set(uids);
  const loadouts: Record<number, Loadout> = {};
  for (const [t, l] of Object.entries(inv.loadouts)) {
    const copy: Loadout = {};
    for (const s of SLOTS) if (l[s.id] && !gone.has(l[s.id]!)) copy[s.id] = l[s.id];
    loadouts[Number(t)] = copy;
  }
  return { ...inv, items: inv.items.filter((i) => !gone.has(i.uid)), loadouts };
}

export function equippedItems(inv: Inventory, trancheId: number): { slot: SlotId; item: ItemInstance }[] {
  const l = getLoadout(inv, trancheId);
  const out: { slot: SlotId; item: ItemInstance }[] = [];
  for (const s of SLOTS) {
    const item = l[s.id] ? findItem(inv, l[s.id]!) : undefined;
    if (item) out.push({ slot: s.id, item });
  }
  return out;
}

/** Somme des caractéristiques du loadout d'une tranche. */
export function equipmentBonus(inv: Inventory, trancheId: number): EquipmentBonus {
  return equippedItems(inv, trancheId).reduce((acc, { item }) => addBonus(acc, itemStats(item.itemId, item.rarity)), emptyBonus());
}

/** Écart de caractéristiques si l'on équipait cet objet (à la place de ce qu'il remplacerait). */
export function compareWithEquipped(inv: Inventory, trancheId: number, uid: string): EquipmentBonus {
  const before = equipmentBonus(inv, trancheId);
  if (equippedSlotOf(inv, trancheId, uid)) return emptyBonus();
  const after = equipmentBonus(equipItem(inv, trancheId, uid), trancheId);
  return subBonus(after, before);
}

/** Tri d'affichage : rareté décroissante, puis emplacement, puis nom. */
export function sortItems(items: ItemInstance[]): ItemInstance[] {
  const slotIndex = (k: ItemKind) => SLOTS.findIndex((s) => s.kind === k);
  return [...items].sort((a, b) => {
    const da = getItem(a.itemId);
    const db = getItem(b.itemId);
    return (
      RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) ||
      slotIndex(da.kind) - slotIndex(db.kind) ||
      da.name.localeCompare(db.name)
    );
  });
}

// ---------------------------------------------------------------------------
// Butin du boss
// ---------------------------------------------------------------------------

/**
 * Poids des raretés pour un drop à une difficulté donnée. La difficulté augmente la part des raretés hautes ;
 * la Légendaire n'existe qu'à partir de LEGENDARY_MIN_DIFFICULTY et reste sous 1 %.
 */
export function rarityWeights(difficulty: number): Record<Rarity, number> {
  const d = difficulty - 1;
  return {
    common: 60,
    uncommon: 25 * (1 + 0.15 * d),
    rare: 10 * (1 + 0.25 * d),
    mythic: 4 * (1 + 0.35 * d),
    legendary: difficulty >= LEGENDARY_MIN_DIFFICULTY ? 0.5 * (1 + 0.5 * (difficulty - LEGENDARY_MIN_DIFFICULTY)) : 0,
  };
}

/** Probabilités normalisées (somme = 1), pour l'affichage. */
export function rarityChances(difficulty: number): Record<Rarity, number> {
  const w = rarityWeights(difficulty);
  const total = RARITY_ORDER.reduce((s, r) => s + w[r], 0);
  return Object.fromEntries(RARITY_ORDER.map((r) => [r, w[r] / total])) as Record<Rarity, number>;
}

export function rollRarity(rng: () => number, difficulty: number): Rarity {
  const w = rarityWeights(difficulty);
  const total = RARITY_ORDER.reduce((s, r) => s + w[r], 0);
  let x = rng() * total;
  for (const r of RARITY_ORDER) {
    x -= w[r];
    if (x < 0) return r;
  }
  return 'common';
}

/**
 * Butin du boss d'un donjon gagné. Chaque objet de la table est tiré avec `dropRate` (branché sur la difficulté),
 * puis sa rareté est tirée. Un objet au moins est garanti pour qu'aucune victoire ne reparte les mains vides.
 * Même graine => même butin.
 */
export function rollBossLoot(dungeonId: string, difficulty: number, seed: number): LootDrop[] {
  const rng = seededRandom(seed);
  const table = getBossDropTable(dungeonId)
    .map((e) => ({ ...e, rate: Math.min(1, dropRate(e.baseRate, e.refDifficulty, difficulty)) }))
    .filter((e) => e.rate > 0);
  const drops: LootDrop[] = [];
  for (const e of table) {
    if (rng() < e.rate) drops.push({ itemId: e.itemId, rarity: rollRarity(rng, difficulty) });
  }
  if (drops.length === 0 && table.length > 0) {
    const total = table.reduce((s, e) => s + e.rate, 0);
    let x = rng() * total;
    const pick = table.find((e) => (x -= e.rate) < 0) ?? table[table.length - 1];
    drops.push({ itemId: pick.itemId, rarity: rollRarity(rng, difficulty) });
  }
  return drops;
}

/** Taux de drop effectifs de la table du boss à une difficulté (pour l'affichage). */
export function bossDropRates(dungeonId: string, difficulty: number): { item: ItemDef; rate: number }[] {
  return getBossDropTable(dungeonId).map((e) => ({ item: getItem(e.itemId), rate: Math.min(1, dropRate(e.baseRate, e.refDifficulty, difficulty)) }));
}

export type { ItemDef, ItemKind, ItemStats };
