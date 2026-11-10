/**
 * Stuff (GDD section 8) : objets, raretés, inventaire, loadout par tranche et tirage du butin du boss.
 * Tout est pur. Le tirage du butin se fait hors combat avec une graine, pour pouvoir être refait côté serveur.
 */
import { getItem, getBossDropTable, type ItemDef, type ItemKind, type ItemStats } from './data/items.js';
import { RARITIES, dropRate, seededRandom, type Rarity } from './loot.js';
import type { Element } from './types.js';
import { getRune, parseRuneKey, type RuneKey } from './data/runes.js';

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
  /** Runes serties, un élément par emplacement (null : emplacement vide). Absent : aucune rune. */
  runes?: (RuneKey | null)[];
}

export interface LootDrop {
  itemId: string;
  rarity: Rarity;
}

/**
 * Bonus totaux de l'équipement, injectés dans `RunConfig.equipment`.
 * Les champs ajoutés après coup (resistances, damage, range, concentration) sont optionnels pour le combat :
 * un bonus écrit à la main sans eux reste valide et vaut 0.
 */
export interface EquipmentBonus {
  hp: number;
  pa: number;
  pm: number;
  masteries: Record<Element, number>;
  resistances: Record<Element, number>;
  damage: number;
  range: number;
  concentration: number;
}

/** Bonus accepté par `RunConfig.equipment` : les stats ajoutées après coup peuvent manquer (elles valent 0). */
export type EquipmentConfig = Pick<EquipmentBonus, 'hp' | 'pa' | 'pm' | 'masteries'> &
  Partial<Omit<EquipmentBonus, 'hp' | 'pa' | 'pm' | 'masteries' | 'resistances'>> & { resistances?: Partial<Record<Element, number>> };

/** Plafond des résistances élémentaires, en %. */
export const MAX_RESISTANCE = 50;

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
const zeroElements = (): Record<Element, number> => ({ fire: 0, water: 0, earth: 0, air: 0, neutral: 0 });

/** Stats scalaires de l'équipement, dans l'ordre d'affichage. */
const SCALAR_KEYS = ['hp', 'pa', 'pm', 'damage', 'range', 'concentration'] as const;
type ScalarKey = (typeof SCALAR_KEYS)[number];

export function emptyBonus(): EquipmentBonus {
  return { hp: 0, pa: 0, pm: 0, masteries: zeroElements(), resistances: zeroElements(), damage: 0, range: 0, concentration: 0 };
}

/** Complète un bonus partiel (ancien format, bonus écrit à la main) avec des zéros. */
export function normalizeBonus(b: EquipmentConfig | Partial<EquipmentBonus> | undefined): EquipmentBonus {
  const r = emptyBonus();
  if (!b) return r;
  for (const k of SCALAR_KEYS) r[k] = b[k] ?? 0;
  for (const e of STAT_ELEMENTS) {
    r.masteries[e] = b.masteries?.[e] ?? 0;
    r.resistances[e] = b.resistances?.[e] ?? 0;
  }
  return r;
}

/** Caractéristiques d'un objet dans une rareté donnée. */
export function itemStats(itemId: string, rarity: Rarity): EquipmentBonus {
  const s = getItem(itemId).stats;
  const power = RARITIES[rarity].power;
  const scaled = (v: number | undefined) => Math.round((v ?? 0) * power);
  const b = emptyBonus();
  b.hp = scaled(s.hp);
  b.damage = scaled(s.damage);
  b.pa = scaled(s.pa);
  b.pm = scaled(s.pm);
  b.range = scaled(s.range);
  b.concentration = scaled(s.concentration);
  for (const e of STAT_ELEMENTS) {
    b.masteries[e] = scaled(s.masteries?.[e]);
    b.resistances[e] = scaled(s.resistances?.[e]);
  }
  return b;
}

function combine(a: EquipmentConfig, b: EquipmentConfig, sign: 1 | -1): EquipmentBonus {
  const x = normalizeBonus(a);
  const y = normalizeBonus(b);
  const r = emptyBonus();
  for (const k of SCALAR_KEYS) r[k] = x[k] + sign * y[k];
  for (const e of STAT_ELEMENTS) {
    r.masteries[e] = x.masteries[e] + sign * y.masteries[e];
    r.resistances[e] = x.resistances[e] + sign * y.resistances[e];
  }
  return r;
}

export function addBonus(a: EquipmentConfig, b: EquipmentConfig): EquipmentBonus {
  return combine(a, b, 1);
}

export function subBonus(a: EquipmentConfig, b: EquipmentConfig): EquipmentBonus {
  return combine(a, b, -1);
}

/** Une ligne de stat, structurée pour l'affichage (infobulle, comparaison, fiche). */
export interface StatLine {
  /** Clé stable : 'hp', 'pa', 'mastery.fire', 'resistance.water'… */
  key: string;
  /** Famille, pour l'icône et la couleur. */
  stat: ScalarKey | 'mastery' | 'resistance';
  element?: Element;
  value: number;
  /** Libellé sans la valeur : « PV », « Maîtrise Feu », « Résistance Eau »… */
  label: string;
  /** Suffixe d'unité : '' ou ' %'. */
  unit: string;
}

const SCALAR_LABEL: Record<ScalarKey, string> = {
  hp: 'PV',
  pa: 'PA',
  pm: 'PM',
  damage: 'Dommages',
  range: 'Portée',
  concentration: 'Concentration par salle',
};

/** Lignes non nulles d'un bonus, dans un ordre stable. */
export function statLines(bonus: EquipmentConfig, labels: Record<Element, string>): StatLine[] {
  const b = normalizeBonus(bonus);
  const out: StatLine[] = [];
  const push = (key: ScalarKey) => {
    if (b[key]) out.push({ key, stat: key, value: b[key], label: SCALAR_LABEL[key], unit: '' });
  };
  push('hp');
  push('pa');
  push('pm');
  for (const e of STAT_ELEMENTS)
    if (b.masteries[e]) out.push({ key: `mastery.${e}`, stat: 'mastery', element: e, value: b.masteries[e], label: `Maîtrise ${labels[e]}`, unit: ' %' });
  push('damage');
  push('range');
  push('concentration');
  for (const e of STAT_ELEMENTS)
    if (b.resistances[e]) out.push({ key: `resistance.${e}`, stat: 'resistance', element: e, value: b.resistances[e], label: `Résistance ${labels[e]}`, unit: ' %' });
  return out;
}

export function formatStatLine(l: StatLine, signed = true): string {
  const v = signed && l.value > 0 ? `+${l.value}` : `${l.value}`;
  return `${v}${l.unit} ${l.label}`;
}

/** Lignes lisibles d'un bonus (« +12 PV », « +6 % Maîtrise Feu »…), pour l'affichage. */
export function describeBonus(b: EquipmentConfig, labels: Record<Element, string>, signed = true): string[] {
  return statLines(b, labels).map((l) => formatStatLine(l, signed));
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

// ---------------------------------------------------------------------------
// Runes serties
// ---------------------------------------------------------------------------

/** Nombre d'emplacements de runes d'un objet (selon sa rareté). */
export function runeSlotCount(item: Pick<ItemInstance, 'rarity'>): number {
  return RARITIES[item.rarity].runeSlots;
}

/** Runes serties d'un objet, une case par emplacement (null : vide). */
export function itemRunes(item: ItemInstance): (RuneKey | null)[] {
  const n = runeSlotCount(item);
  return Array.from({ length: n }, (_, i) => item.runes?.[i] ?? null);
}

/** Bonus d'une liste de runes. */
export function runesBonus(keys: (RuneKey | null | undefined)[]): EquipmentBonus {
  const b = emptyBonus();
  for (const k of keys) {
    if (!k) continue;
    const { def, value } = parseRuneKey(k);
    const e = def.effect;
    if (e.stat === 'mastery') b.masteries[e.element] += value;
    else if (e.stat === 'resistanceAll') for (const el of ['fire', 'water', 'earth', 'air'] as const) b.resistances[el] += value;
    else b[e.stat] += value;
  }
  return b;
}

/** Caractéristiques d'un objet précis : stats de sa rareté et runes serties. */
export function instanceStats(item: ItemInstance): EquipmentBonus {
  return addBonus(itemStats(item.itemId, item.rarity), runesBonus(itemRunes(item)));
}

/**
 * Runes qui comptent sur l'équipement porté : une rune « unique » (Mire, Focus) ne compte qu'une fois,
 * les exemplaires en trop sont ignorés.
 */
export function activeLoadoutRunes(items: ItemInstance[]): { active: RuneKey[]; ignored: RuneKey[] } {
  const seen = new Set<string>();
  const active: RuneKey[] = [];
  const ignored: RuneKey[] = [];
  for (const it of items)
    for (const k of itemRunes(it)) {
      if (!k) continue;
      const type = k.split(':')[0];
      if (getRune(parseRuneKey(k).type).unique) {
        if (seen.has(type)) {
          ignored.push(k);
          continue;
        }
        seen.add(type);
      }
      active.push(k);
    }
  return { active, ignored };
}

/** Somme des caractéristiques du loadout d'une tranche (objets et runes serties). */
export function equipmentBonus(inv: Inventory, trancheId: number): EquipmentBonus {
  const items = equippedItems(inv, trancheId).map((e) => e.item);
  const base = items.reduce((acc, item) => addBonus(acc, itemStats(item.itemId, item.rarity)), emptyBonus());
  return addBonus(base, runesBonus(activeLoadoutRunes(items).active));
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
    uncommon: 22 * (1 + 0.12 * d),
    rare: 6 * (1 + 0.22 * d),
    mythic: 1 * (1 + 0.35 * d),
    legendary: difficulty >= LEGENDARY_MIN_DIFFICULTY ? 0.15 * (1 + 0.5 * (difficulty - LEGENDARY_MIN_DIFFICULTY)) : 0,
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
