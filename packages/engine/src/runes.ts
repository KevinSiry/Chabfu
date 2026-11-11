/**
 * Runes (GDD section 8) : stock, sertissage, extraction, fusion, bris des doublons et runes du boss.
 * Fonctions pures : chaque opération renvoie de nouveaux états.
 * Le stock de runes vit dans `CraftingState.runes` (clé « type:niveau » → quantité).
 */
import { getItem } from './data/items.js';
import { getResource } from './data/resources.js';
import {
  RUNES,
  RUNE_DROPS,
  RUNE_EXTRACT_COST,
  RUNE_FUSION,
  RUNE_GRADES,
  parseRuneKey,
  runeExists,
  runeKey,
  type RuneGrade,
  type RuneKey,
  type RuneType,
} from './data/runes.js';
import type { CraftingState } from './crafting.js';
import { isEquipped, recycleCount } from './crafting.js';
import { findItem, itemRunes, removeItems, type Inventory, type ItemInstance } from './equipment.js';
import { dropRate, seededRandom, type Rarity } from './loot.js';

export function runeStock(state: CraftingState, key: RuneKey): number {
  return state.runes?.[key] ?? 0;
}

export function addRunes(state: CraftingState, keys: RuneKey[]): CraftingState {
  const runes = { ...(state.runes ?? {}) };
  for (const k of keys) runes[k] = (runes[k] ?? 0) + 1;
  return { ...state, runes };
}

function takeRune(state: CraftingState, key: RuneKey, n = 1): CraftingState {
  const have = runeStock(state, key);
  if (have < n) throw new Error(`Pas assez de runes ${key}`);
  const runes = { ...(state.runes ?? {}) };
  runes[key] = have - n;
  if (!runes[key]) delete runes[key];
  return { ...state, runes };
}

function replaceItem(inv: Inventory, item: ItemInstance): Inventory {
  return { ...inv, items: inv.items.map((i) => (i.uid === item.uid ? item : i)) };
}

// ---------------------------------------------------------------------------
// Sertissage
// ---------------------------------------------------------------------------

/** Peut-on sertir cette rune dans cet emplacement ? Renvoie la raison du refus, ou null. */
export function socketError(inv: Inventory, state: CraftingState, uid: string, slot: number, key: RuneKey): string | null {
  const item = findItem(inv, uid);
  if (!item) return 'Objet introuvable.';
  const runes = itemRunes(item);
  if (slot < 0 || slot >= runes.length) return 'Cet objet n’a pas cet emplacement.';
  if (runeStock(state, key) < 1) return 'Vous n’avez pas cette rune.';
  const { type, def } = parseRuneKey(key);
  if (def.unique && runes.some((k, i) => i !== slot && k?.startsWith(`${type}:`))) return `${def.name} : une seule par objet.`;
  return null;
}

/**
 * Sertit une rune du stock dans un emplacement. Le sertissage est gratuit ;
 * une rune déjà présente dans l'emplacement est détruite (renvoyée dans `destroyed`).
 */
export function socketRune(
  inv: Inventory,
  state: CraftingState,
  uid: string,
  slot: number,
  key: RuneKey,
): { inventory: Inventory; crafting: CraftingState; destroyed: RuneKey | null } {
  const err = socketError(inv, state, uid, slot, key);
  if (err) throw new Error(err);
  const item = findItem(inv, uid)!;
  const runes = itemRunes(item);
  const destroyed = runes[slot];
  runes[slot] = key;
  return { inventory: replaceItem(inv, { ...item, runes }), crafting: takeRune(state, key), destroyed };
}

/** Éclats nécessaires pour extraire la rune d'un emplacement. */
export function extractCost(key: RuneKey): number {
  return RUNE_EXTRACT_COST[parseRuneKey(key).grade];
}

/**
 * Retire la rune d'un emplacement. `extract` : on paie des éclats de la tranche de l'objet et la rune revient
 * dans le stock ; sinon elle est détruite.
 */
export function unsocketRune(inv: Inventory, state: CraftingState, uid: string, slot: number, extract: boolean): { inventory: Inventory; crafting: CraftingState } {
  const item = findItem(inv, uid);
  if (!item) throw new Error(`Objet introuvable : ${uid}`);
  const runes = itemRunes(item);
  const key = runes[slot];
  if (!key) throw new Error('Emplacement vide.');
  let crafting = state;
  if (extract) {
    const tranche = getItem(item.itemId).tranche;
    const cost = extractCost(key);
    const have = state.shards[tranche] ?? 0;
    if (have < cost) throw new Error(`Il faut ${cost} éclats pour extraire cette rune.`);
    crafting = addRunes({ ...state, shards: { ...state.shards, [tranche]: have - cost } }, [key]);
  }
  runes[slot] = null;
  return { inventory: replaceItem(inv, { ...item, runes }), crafting };
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

export interface FusionCost {
  from: RuneKey;
  to: RuneKey;
  count: number;
  shards: number;
  tranche: number;
  /** Ressources de palier possibles (n'importe quel donjon de la tranche) et quantité demandée. */
  tier: 'mythic' | 'ultimate';
  resources: number;
}

/** Coût pour fusionner vers `type` au niveau `to` (Taillée ou Parfaite), ou null si ce n'est pas possible. */
export function fusionCost(type: RuneType, to: RuneGrade, tranche = 1): FusionCost | null {
  if (to === 'brute') return null;
  const below = RUNE_GRADES[RUNE_GRADES.indexOf(to) - 1];
  if (!runeExists(type, to) || !runeExists(type, below)) return null;
  const f = RUNE_FUSION[to];
  return { from: runeKey(type, below), to: runeKey(type, to), count: f.count, shards: f.shards, tranche, tier: f.tier, resources: f.resources };
}

/** Ressources de palier du joueur utilisables pour une fusion, la plus abondante d'abord. */
export function fusionResourceOptions(state: CraftingState, cost: FusionCost): { id: string; have: number }[] {
  return Object.entries(state.resources)
    .filter(([id, n]) => n > 0 && getResource(id).tier === cost.tier)
    .map(([id, have]) => ({ id, have }))
    .sort((a, b) => b.have - a.have);
}

/** Ce qui manque pour une fusion (tout à 0 : possible). */
export function fusionMissing(state: CraftingState, cost: FusionCost): { runes: number; shards: number; resources: number } {
  const bestRes = fusionResourceOptions(state, cost)[0]?.have ?? 0;
  return {
    runes: Math.max(0, cost.count - runeStock(state, cost.from)),
    shards: Math.max(0, cost.shards - (state.shards[cost.tranche] ?? 0)),
    resources: Math.max(0, cost.resources - bestRes),
  };
}

export function canFuse(state: CraftingState, cost: FusionCost): boolean {
  const m = fusionMissing(state, cost);
  return m.runes === 0 && m.shards === 0 && m.resources === 0;
}

/** Fusionne 3 runes en une du niveau au-dessus. La ressource de palier utilisée est la plus abondante (ou celle donnée). */
export function fuseRunes(state: CraftingState, type: RuneType, to: RuneGrade, tranche = 1, resourceId?: string): CraftingState {
  const cost = fusionCost(type, to, tranche);
  if (!cost) throw new Error(`Fusion impossible vers ${type}:${to}`);
  if (!canFuse(state, cost)) throw new Error('Ingrédients insuffisants pour la fusion.');
  const resId = resourceId ?? fusionResourceOptions(state, cost)[0].id;
  if ((state.resources[resId] ?? 0) < cost.resources || getResource(resId).tier !== cost.tier) throw new Error('Ressource de palier invalide.');
  let next = takeRune(state, cost.from, cost.count);
  next = {
    ...next,
    shards: { ...next.shards, [tranche]: (next.shards[tranche] ?? 0) - cost.shards },
    resources: { ...next.resources, [resId]: next.resources[resId] - cost.resources },
  };
  return addRunes(next, [cost.to]);
}

// ---------------------------------------------------------------------------
// Briser les doublons
// ---------------------------------------------------------------------------

/** Niveau de la rune obtenue en brisant un objet de cette rareté (null : l'objet ne peut pas être brisé). */
export const BREAK_GRADE: Record<Rarity, RuneGrade | null> = { common: null, uncommon: null, rare: 'brute', mythic: 'taillee', legendary: 'parfaite' };

/**
 * Type de rune lié à un objet, d'après sa stat principale (stats en Mythique) :
 * la maîtrise la plus forte, sinon Sève si les PV dominent, sinon Rempart.
 */
export function runeAffinity(itemId: string): RuneType {
  const s = getItem(itemId).stats;
  const masteries = Object.entries(s.masteries ?? {}).filter(([e]) => e !== 'neutral') as [string, number][];
  const order = ['fire', 'water', 'earth', 'air'];
  masteries.sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
  const topMastery = masteries[0]?.[1] ?? 0;
  const resSum = Object.values(s.resistances ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const hp = s.hp ?? 0;
  // Repère : 1 % de maîtrise ≈ 3 PV ≈ 1,5 % de résistance totale.
  if (topMastery * 3 >= hp && topMastery * 1.5 >= resSum && topMastery > 0) {
    const byEl: Record<string, RuneType> = { fire: 'braise', water: 'maree', earth: 'racine', air: 'rafale' };
    return byEl[masteries[0][0]];
  }
  return hp >= resSum * 2 ? 'seve' : 'rempart';
}

/** Rune obtenue en brisant cet objet, ou null s'il est trop peu rare. */
export function breakResult(item: Pick<ItemInstance, 'itemId' | 'rarity'>): RuneKey | null {
  const grade = BREAK_GRADE[item.rarity];
  return grade ? runeKey(runeAffinity(item.itemId), grade) : null;
}

export function canBreak(inv: Inventory, item: ItemInstance): boolean {
  return breakResult(item) !== null && !isEquipped(inv, item.uid);
}

/**
 * Brise des objets Rares ou mieux : chacun donne une rune liée à sa stat principale, mais aucun éclat.
 * Les runes serties sur l'objet sont détruites. Compte pour la maîtrise d'objet, comme le recyclage.
 * Les objets équipés, trop peu rares ou inconnus sont ignorés.
 */
export function breakItems(inv: Inventory, state: CraftingState, uids: string[]): { inventory: Inventory; crafting: CraftingState; gained: RuneKey[]; broken: ItemInstance[] } {
  const wanted = new Set(uids);
  const broken = inv.items.filter((it) => wanted.has(it.uid) && canBreak(inv, it));
  const gained = broken.map((it) => breakResult(it)!);
  const crafting = recycleCount(addRunes(state, gained), broken);
  return { inventory: removeItems(inv, broken.map((it) => it.uid)), crafting, gained, broken };
}

// ---------------------------------------------------------------------------
// Runes du boss
// ---------------------------------------------------------------------------

/**
 * Runes trouvées en battant le boss : une chance par niveau (voir RUNE_DROPS), type tiré selon `dropWeight`
 * parmi les types qui existent à ce niveau. `bonus` : bonus des défis réussis (0,2 = chances ×1,2). Même graine => mêmes runes.
 */
export function rollRuneDrops(difficulty: number, seed: number, bonus = 0): RuneKey[] {
  const rng = seededRandom((seed ^ 0x5eed7e11) >>> 0);
  const out: RuneKey[] = [];
  for (const grade of RUNE_GRADES) {
    const d = RUNE_DROPS[grade];
    const rate = Math.min(1, dropRate(d.baseRate, d.refDifficulty, difficulty) * (1 + bonus));
    if (rate <= 0 || rng() >= rate) continue;
    const pool = RUNES.filter((r) => r.values[grade] !== null && r.dropWeight > 0);
    const total = pool.reduce((s, r) => s + r.dropWeight, 0);
    let x = rng() * total;
    const pick = pool.find((r) => (x -= r.dropWeight) < 0) ?? pool[pool.length - 1];
    out.push(runeKey(pick.type, grade));
  }
  return out;
}

/** Chance d'obtenir une rune de chaque niveau sur une victoire (pour l'affichage). */
export function runeDropChances(difficulty: number): Record<RuneGrade, number> {
  return Object.fromEntries(RUNE_GRADES.map((g) => [g, Math.min(1, dropRate(RUNE_DROPS[g].baseRate, RUNE_DROPS[g].refDifficulty, difficulty))])) as Record<RuneGrade, number>;
}

/** Libellé lisible d'une rune : « Rune de Braise Taillée ». */
export function runeLabel(key: RuneKey): string {
  const { def, grade } = parseRuneKey(key);
  return `${def.name} ${({ brute: 'Brute', taillee: 'Taillée', parfaite: 'Parfaite' } as const)[grade]}`;
}

const EFFECT_TEXT: Record<string, (v: number) => string> = {
  fire: (v) => `+${v} % Maîtrise Feu`,
  water: (v) => `+${v} % Maîtrise Eau`,
  earth: (v) => `+${v} % Maîtrise Terre`,
  air: (v) => `+${v} % Maîtrise Air`,
  hp: (v) => `+${v} PV`,
  resistanceAll: (v) => `+${v} % Résistance (4 éléments)`,
  damage: (v) => `+${v} Dommages`,
  range: (v) => `+${v} Portée`,
  none: () => 'Sans effet (la Concentration a été retirée)',
};

/** Effet lisible d'une rune : « +2 % Maîtrise Feu ». */
export function runeEffectText(key: RuneKey): string {
  const { def, value } = parseRuneKey(key);
  const e = def.effect;
  return EFFECT_TEXT[e.stat === 'mastery' ? e.element : e.stat](value);
}
